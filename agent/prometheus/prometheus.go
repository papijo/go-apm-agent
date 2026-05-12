// Package agentprom registers and exposes Prometheus metrics for the observability agent (B3).
package agentprom

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

// Metrics holds all Prometheus instruments for the agent.
type Metrics struct {
	SpansReceived   prometheus.Counter
	SpansDropped    prometheus.Counter
	SpansFlushed    prometheus.Counter
	MetricsReceived prometheus.Counter
	FlushDuration   prometheus.Histogram
}

// New registers all metrics with the default Prometheus registry and returns them.
func New() *Metrics {
	return &Metrics{
		SpansReceived: promauto.NewCounter(prometheus.CounterOpts{
			Name: "otlp_spans_received_total",
			Help: "Total number of spans received by the OTLP gRPC receiver.",
		}),
		SpansDropped: promauto.NewCounter(prometheus.CounterOpts{
			Name: "otlp_spans_dropped_total",
			Help: "Total number of spans dropped by the sampler (below threshold duration).",
		}),
		SpansFlushed: promauto.NewCounter(prometheus.CounterOpts{
			Name: "otlp_spans_flushed_total",
			Help: "Total number of spans successfully written to PostgreSQL.",
		}),
		MetricsReceived: promauto.NewCounter(prometheus.CounterOpts{
			Name: "otlp_metrics_received_total",
			Help: "Total number of metric data points received by the OTLP gRPC receiver.",
		}),
		FlushDuration: promauto.NewHistogram(prometheus.HistogramOpts{
			Name:    "otlp_flush_duration_seconds",
			Help:    "Duration of each batch flush operation to PostgreSQL.",
			Buckets: prometheus.DefBuckets,
		}),
	}
}
