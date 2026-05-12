package flusher

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"observability-agent/buffer"
	agentprom "observability-agent/prometheus"
)

// Flusher drains the buffer on a fixed interval and writes to PostgreSQL in a single batch transaction.
type Flusher struct {
	pool     *pgxpool.Pool
	buf      *buffer.Buffer
	interval time.Duration
	metrics  *agentprom.Metrics
}

func New(pool *pgxpool.Pool, buf *buffer.Buffer, interval time.Duration, m *agentprom.Metrics) *Flusher {
	return &Flusher{pool: pool, buf: buf, interval: interval, metrics: m}
}

// Start blocks until ctx is cancelled, flushing on every tick.
func (f *Flusher) Start(ctx context.Context) {
	ticker := time.NewTicker(f.interval)
	defer ticker.Stop()

	slog.Info("flusher started", "interval", f.interval)

	for {
		select {
		case <-ticker.C:
			f.Flush(ctx)
		case <-ctx.Done():
			return
		}
	}
}

// Flush drains the buffer and commits everything to PostgreSQL in one transaction.
func (f *Flusher) Flush(ctx context.Context) {
	spans, metrics := f.buf.Drain()
	if len(spans) == 0 && len(metrics) == 0 {
		return
	}

	start := time.Now()

	conn, err := f.pool.Acquire(ctx)
	if err != nil {
		slog.Error("flush: failed to acquire db connection", "error", err)
		return
	}
	defer conn.Release()

	tx, err := conn.Begin(ctx)
	if err != nil {
		slog.Error("flush: failed to begin transaction", "error", err)
		return
	}
	defer tx.Rollback(ctx) //nolint:errcheck — no-op if already committed

	if len(spans) > 0 {
		if err := insertSpans(ctx, tx, spans); err != nil {
			slog.Error("flush: failed to insert spans", "error", err)
			return
		}
	}

	if len(metrics) > 0 {
		if err := insertMetrics(ctx, tx, metrics); err != nil {
			slog.Error("flush: failed to insert metrics", "error", err)
			return
		}
	}

	if err := tx.Commit(ctx); err != nil {
		slog.Error("flush: failed to commit transaction", "error", err)
		return
	}

	elapsed := time.Since(start)

	// B3 — update Prometheus counters and histogram
	f.metrics.SpansFlushed.Add(float64(len(spans)))
	f.metrics.FlushDuration.Observe(elapsed.Seconds())

	slog.Info("flushed",
		"spans", len(spans),
		"metrics", len(metrics),
		"duration_ms", elapsed.Milliseconds(),
		"at", time.Now().UTC().Format(time.RFC3339),
	)
}

func insertSpans(ctx context.Context, tx pgx.Tx, spans []buffer.SpanRecord) error {
	cols := []string{"trace_id", "span_id", "parent_id", "service_name", "operation", "duration_ms", "started_at", "attributes"}

	_, err := tx.CopyFrom(ctx,
		pgx.Identifier{"spans"},
		cols,
		pgx.CopyFromSlice(len(spans), func(i int) ([]any, error) {
			s := spans[i]

			attrsJSON, err := json.Marshal(s.Attributes)
			if err != nil {
				attrsJSON = []byte("{}")
			}

			// parentID must be untyped nil (not (*string)(nil)) for pgx to write NULL
			var parentID any
			if s.ParentID != nil {
				parentID = *s.ParentID
			}

			return []any{
				s.TraceID,
				s.SpanID,
				parentID,
				s.ServiceName,
				s.Operation,
				s.DurationMs,
				s.StartedAt,
				json.RawMessage(attrsJSON),
			}, nil
		}),
	)
	return err
}

func insertMetrics(ctx context.Context, tx pgx.Tx, metrics []buffer.MetricRecord) error {
	cols := []string{"service_name", "metric_name", "value", "unit", "recorded_at"}

	_, err := tx.CopyFrom(ctx,
		pgx.Identifier{"metrics"},
		cols,
		pgx.CopyFromSlice(len(metrics), func(i int) ([]any, error) {
			m := metrics[i]
			return []any{m.ServiceName, m.MetricName, m.Value, m.Unit, m.RecordedAt}, nil
		}),
	)
	return err
}
