package buffer

import (
	"sync"
	"time"
)

// SpanRecord holds the extracted fields from an OTLP span ready for PostgreSQL insertion.
type SpanRecord struct {
	TraceID     string
	SpanID      string
	ParentID    *string // nil for root spans — stored as NULL
	ServiceName string
	Operation   string
	DurationMs  float64
	StartedAt   time.Time
	Attributes  map[string]any
}

// MetricRecord holds the extracted fields from an OTLP metric data point.
type MetricRecord struct {
	ServiceName string
	MetricName  string
	Value       float64
	Unit        string
	RecordedAt  time.Time
}

// Buffer is a thread-safe in-memory accumulator for spans and metrics.
// The receiver goroutine writes into it; the flusher goroutine drains it every 60 seconds.
type Buffer struct {
	mu      sync.Mutex
	spans   []SpanRecord
	metrics []MetricRecord
}

func New() *Buffer {
	return &Buffer{}
}

func (b *Buffer) AddSpan(s SpanRecord) {
	b.mu.Lock()
	b.spans = append(b.spans, s)
	b.mu.Unlock()
}

func (b *Buffer) AddMetric(m MetricRecord) {
	b.mu.Lock()
	b.metrics = append(b.metrics, m)
	b.mu.Unlock()
}

// Drain atomically swaps the internal slices with empty ones and returns the old contents.
// The caller owns the returned slices; the buffer immediately starts collecting fresh data.
func (b *Buffer) Drain() ([]SpanRecord, []MetricRecord) {
	b.mu.Lock()
	defer b.mu.Unlock()
	spans := b.spans
	metrics := b.metrics
	b.spans = nil
	b.metrics = nil
	return spans, metrics
}

// Size returns the current number of buffered spans and metrics without draining.
func (b *Buffer) Size() (int, int) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return len(b.spans), len(b.metrics)
}
