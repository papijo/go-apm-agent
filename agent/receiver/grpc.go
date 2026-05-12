package receiver

import (
	"context"
	"encoding/hex"
	"fmt"
	"log/slog"
	"net"
	"time"

	collectorlogs "go.opentelemetry.io/proto/otlp/collector/logs/v1"
	collectormetrics "go.opentelemetry.io/proto/otlp/collector/metrics/v1"
	collectortrace "go.opentelemetry.io/proto/otlp/collector/trace/v1"
	commonpb "go.opentelemetry.io/proto/otlp/common/v1"
	metricspb "go.opentelemetry.io/proto/otlp/metrics/v1"
	"google.golang.org/grpc"

	"observability-agent/buffer"
	agentprom "observability-agent/prometheus"
	"observability-agent/sampler"
)

// Receiver holds the gRPC server for accepting OTLP data.
type Receiver struct {
	port    string
	buf     *buffer.Buffer
	sampler *sampler.Sampler
	metrics *agentprom.Metrics
	server  *grpc.Server
}

func New(port string, buf *buffer.Buffer, s *sampler.Sampler, m *agentprom.Metrics) *Receiver {
	return &Receiver{port: port, buf: buf, sampler: s, metrics: m}
}

func (r *Receiver) Start() error {
	lis, err := net.Listen("tcp", ":"+r.port)
	if err != nil {
		return fmt.Errorf("listen on :%s: %w", r.port, err)
	}

	r.server = grpc.NewServer()
	collectortrace.RegisterTraceServiceServer(r.server, &traceReceiver{
		buf:     r.buf,
		sampler: r.sampler,
		metrics: r.metrics,
	})
	collectormetrics.RegisterMetricsServiceServer(r.server, &metricsReceiver{
		buf:     r.buf,
		metrics: r.metrics,
	})
	collectorlogs.RegisterLogsServiceServer(r.server, &logsReceiver{})

	slog.Info("OTLP gRPC receiver listening", "port", r.port)
	return r.server.Serve(lis)
}

func (r *Receiver) Stop() {
	if r.server != nil {
		r.server.GracefulStop()
	}
}

// ---------------------------------------------------------------------------
// Trace Service
// ---------------------------------------------------------------------------

type traceReceiver struct {
	collectortrace.UnimplementedTraceServiceServer
	buf     *buffer.Buffer
	sampler *sampler.Sampler
	metrics *agentprom.Metrics
}

func (t *traceReceiver) Export(
	_ context.Context,
	req *collectortrace.ExportTraceServiceRequest,
) (*collectortrace.ExportTraceServiceResponse, error) {
	for _, rs := range req.ResourceSpans {
		serviceName := extractServiceName(rs.GetResource().GetAttributes())

		for _, ss := range rs.ScopeSpans {
			for _, span := range ss.Spans {
				durationMs := float64(span.EndTimeUnixNano-span.StartTimeUnixNano) / 1e6

				t.metrics.SpansReceived.Inc()

				// B1 — drop spans below the sampling threshold
				if !t.sampler.ShouldKeep(durationMs) {
					t.metrics.SpansDropped.Inc()
					slog.Debug("span dropped by sampler",
						"service", serviceName,
						"operation", span.Name,
						"duration_ms", fmt.Sprintf("%.3f", durationMs),
						"threshold_ms", t.sampler.ThresholdMs,
					)
					continue
				}

				traceID := hex.EncodeToString(span.TraceId)
				spanID := hex.EncodeToString(span.SpanId)
				startedAt := time.Unix(0, int64(span.StartTimeUnixNano))

				var parentID *string
				if encoded := hex.EncodeToString(span.ParentSpanId); encoded != "" {
					parentID = &encoded
				}

				t.buf.AddSpan(buffer.SpanRecord{
					TraceID:     traceID,
					SpanID:      spanID,
					ParentID:    parentID,
					ServiceName: serviceName,
					Operation:   span.Name,
					DurationMs:  durationMs,
					StartedAt:   startedAt,
					Attributes:  attrsToMap(span.Attributes),
				})

				slog.Info("span buffered",
					"service", serviceName,
					"operation", span.Name,
					"duration_ms", fmt.Sprintf("%.3f", durationMs),
				)
			}
		}
	}
	return &collectortrace.ExportTraceServiceResponse{}, nil
}

// ---------------------------------------------------------------------------
// Metrics Service
// ---------------------------------------------------------------------------

type metricsReceiver struct {
	collectormetrics.UnimplementedMetricsServiceServer
	buf     *buffer.Buffer
	metrics *agentprom.Metrics
}

func (m *metricsReceiver) Export(
	_ context.Context,
	req *collectormetrics.ExportMetricsServiceRequest,
) (*collectormetrics.ExportMetricsServiceResponse, error) {
	for _, rm := range req.ResourceMetrics {
		serviceName := extractServiceName(rm.GetResource().GetAttributes())

		for _, sm := range rm.ScopeMetrics {
			for _, metric := range sm.Metrics {
				value, unit := extractMetricValue(metric)

				m.metrics.MetricsReceived.Inc()

				m.buf.AddMetric(buffer.MetricRecord{
					ServiceName: serviceName,
					MetricName:  metric.Name,
					Value:       value,
					Unit:        unit,
					RecordedAt:  time.Now().UTC(),
				})

				slog.Info("metric buffered",
					"service", serviceName,
					"metric", metric.Name,
					"value", value,
				)
			}
		}
	}
	return &collectormetrics.ExportMetricsServiceResponse{}, nil
}

// ---------------------------------------------------------------------------
// Logs Service
// ---------------------------------------------------------------------------

type logsReceiver struct {
	collectorlogs.UnimplementedLogsServiceServer
}

func (l *logsReceiver) Export(
	_ context.Context,
	req *collectorlogs.ExportLogsServiceRequest,
) (*collectorlogs.ExportLogsServiceResponse, error) {
	slog.Debug("log batch received", "resource_logs", len(req.ResourceLogs))
	return &collectorlogs.ExportLogsServiceResponse{}, nil
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func extractServiceName(attrs []*commonpb.KeyValue) string {
	for _, kv := range attrs {
		if kv.Key == "service.name" {
			return kv.Value.GetStringValue()
		}
	}
	return "unknown"
}

func attrsToMap(attrs []*commonpb.KeyValue) map[string]any {
	m := make(map[string]any, len(attrs))
	for _, kv := range attrs {
		m[kv.Key] = anyValueToGo(kv.Value)
	}
	return m
}

func anyValueToGo(v *commonpb.AnyValue) any {
	if v == nil {
		return nil
	}
	switch val := v.Value.(type) {
	case *commonpb.AnyValue_StringValue:
		return val.StringValue
	case *commonpb.AnyValue_BoolValue:
		return val.BoolValue
	case *commonpb.AnyValue_IntValue:
		return val.IntValue
	case *commonpb.AnyValue_DoubleValue:
		return val.DoubleValue
	default:
		return fmt.Sprintf("%v", v)
	}
}

func extractMetricValue(metric *metricspb.Metric) (float64, string) {
	switch data := metric.Data.(type) {
	case *metricspb.Metric_Gauge:
		if len(data.Gauge.DataPoints) > 0 {
			return numberDataPointValue(data.Gauge.DataPoints[0]), metric.Unit
		}
	case *metricspb.Metric_Sum:
		if len(data.Sum.DataPoints) > 0 {
			return numberDataPointValue(data.Sum.DataPoints[0]), metric.Unit
		}
	case *metricspb.Metric_Histogram:
		// Store the cumulative sum — total observed value across all data points
		if len(data.Histogram.DataPoints) > 0 {
			return data.Histogram.DataPoints[0].GetSum(), metric.Unit
		}
	}
	return 0, metric.Unit
}

func numberDataPointValue(dp *metricspb.NumberDataPoint) float64 {
	switch v := dp.Value.(type) {
	case *metricspb.NumberDataPoint_AsDouble:
		return v.AsDouble
	case *metricspb.NumberDataPoint_AsInt:
		return float64(v.AsInt)
	}
	return 0
}
