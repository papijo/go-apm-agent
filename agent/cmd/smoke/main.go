// smoke sends a handful of test spans and metrics to the running agent.
// Usage: go run ./cmd/smoke
package main

import (
	"context"
	"fmt"
	"log"
	"time"

	collectormetrics "go.opentelemetry.io/proto/otlp/collector/metrics/v1"
	collectortrace "go.opentelemetry.io/proto/otlp/collector/trace/v1"
	commonpb "go.opentelemetry.io/proto/otlp/common/v1"
	metricspb "go.opentelemetry.io/proto/otlp/metrics/v1"
	resourcepb "go.opentelemetry.io/proto/otlp/resource/v1"
	tracepb "go.opentelemetry.io/proto/otlp/trace/v1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

const agentAddr = "localhost:14317"

func main() {
	conn, err := grpc.NewClient(agentAddr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		log.Fatalf("connect: %v", err)
	}
	defer conn.Close()

	sendSpans(conn)
	sendMetrics(conn)

	fmt.Println("smoke test complete — watch 'docker compose logs agent' for the flush log")
}

func sendSpans(conn *grpc.ClientConn) {
	client := collectortrace.NewTraceServiceClient(conn)

	now := uint64(time.Now().UnixNano())

	req := &collectortrace.ExportTraceServiceRequest{
		ResourceSpans: []*tracepb.ResourceSpans{
			{
				Resource: &resourcepb.Resource{
					Attributes: kv("service.name", "smoke-test"),
				},
				ScopeSpans: []*tracepb.ScopeSpans{
					{
						Spans: []*tracepb.Span{
							{
								TraceId:           bytes16(0x01),
								SpanId:            bytes8(0x01),
								Name:              "GET /smoke",
								StartTimeUnixNano: now - uint64(50*time.Millisecond),
								EndTimeUnixNano:   now,
								Attributes:        kv("http.method", "GET"),
							},
							{
								TraceId:           bytes16(0x01),
								SpanId:            bytes8(0x02),
								ParentSpanId:      bytes8(0x01),
								Name:              "db.query",
								StartTimeUnixNano: now - uint64(20*time.Millisecond),
								EndTimeUnixNano:   now,
								Attributes:        kv("db.statement", "SELECT 1"),
							},
							{
								TraceId:           bytes16(0x02),
								SpanId:            bytes8(0x03),
								Name:              "GET /health",
								StartTimeUnixNano: now - uint64(3*time.Millisecond),
								EndTimeUnixNano:   now,
							},
						},
					},
				},
			},
		},
	}

	if _, err := client.Export(context.Background(), req); err != nil {
		log.Fatalf("export spans: %v", err)
	}
	fmt.Println("sent 3 spans (2 normal, 1 short < 5ms for sampler test)")
}

func sendMetrics(conn *grpc.ClientConn) {
	client := collectormetrics.NewMetricsServiceClient(conn)

	now := uint64(time.Now().UnixNano())

	req := &collectormetrics.ExportMetricsServiceRequest{
		ResourceMetrics: []*metricspb.ResourceMetrics{
			{
				Resource: &resourcepb.Resource{
					Attributes: kv("service.name", "smoke-test"),
				},
				ScopeMetrics: []*metricspb.ScopeMetrics{
					{
						Metrics: []*metricspb.Metric{
							{
								Name: "http.server.request.duration",
								Unit: "ms",
								Data: &metricspb.Metric_Gauge{
									Gauge: &metricspb.Gauge{
										DataPoints: []*metricspb.NumberDataPoint{
											{
												TimeUnixNano: now,
												Value:        &metricspb.NumberDataPoint_AsDouble{AsDouble: 47.3},
											},
										},
									},
								},
							},
							{
								Name: "http.server.active_requests",
								Unit: "1",
								Data: &metricspb.Metric_Gauge{
									Gauge: &metricspb.Gauge{
										DataPoints: []*metricspb.NumberDataPoint{
											{
												TimeUnixNano: now,
												Value:        &metricspb.NumberDataPoint_AsInt{AsInt: 3},
											},
										},
									},
								},
							},
						},
					},
				},
			},
		},
	}

	if _, err := client.Export(context.Background(), req); err != nil {
		log.Fatalf("export metrics: %v", err)
	}
	fmt.Println("sent 2 metrics")
}

func kv(key, value string) []*commonpb.KeyValue {
	return []*commonpb.KeyValue{
		{Key: key, Value: &commonpb.AnyValue{Value: &commonpb.AnyValue_StringValue{StringValue: value}}},
	}
}

func bytes16(b byte) []byte {
	buf := make([]byte, 16)
	buf[15] = b
	return buf
}

func bytes8(b byte) []byte {
	buf := make([]byte, 8)
	buf[7] = b
	return buf
}
