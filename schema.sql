-- =============================================================================
-- Distributed Observability Agent — PostgreSQL Schema
-- Idempotent: safe to run multiple times.
-- =============================================================================

CREATE TABLE IF NOT EXISTS spans (
  id           BIGSERIAL    PRIMARY KEY,
  trace_id     TEXT         NOT NULL,
  span_id      TEXT         NOT NULL,
  parent_id    TEXT,
  service_name TEXT         NOT NULL,
  operation    TEXT         NOT NULL,
  duration_ms  NUMERIC(10,3),
  started_at   TIMESTAMPTZ  NOT NULL,
  attributes   JSONB        DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS metrics (
  id           BIGSERIAL         PRIMARY KEY,
  service_name TEXT              NOT NULL,
  metric_name  TEXT              NOT NULL,
  value        DOUBLE PRECISION  NOT NULL,
  unit         TEXT,
  recorded_at  TIMESTAMPTZ       NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_spans_service_time   ON spans(service_name, started_at);
CREATE INDEX IF NOT EXISTS idx_spans_attributes     ON spans USING GIN(attributes);
CREATE INDEX IF NOT EXISTS idx_metrics_service_time ON metrics(service_name, recorded_at DESC);
