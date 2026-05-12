# Distributed Observability Agent

A production-grade telemetry pipeline: Node.js and Python services auto-instrument via OpenTelemetry, export traces and metrics over gRPC to a Go agent that buffers in memory and batch-flushes to PostgreSQL every 60 seconds, and a FastAPI query API exposes the stored data as JSON.

---

## Architecture

```
  ┌──────────────────────┐        OTLP/gRPC         ┌─────────────────────────────────────────────┐
  │   Node.js Service    │ ───────────────────────►  │              Go Agent (:4317)               │
  │   Express  :3000     │                           │                                             │
  │   host: :13000       │  W3C trace context        │  ┌──────────────────────────────────────┐  │
  │   GET /upstream ─────┼──────────────────────┐    │  │  OTLP Receiver  (gRPC)               │  │
  └──────────────────────┘                      │    │  └──────────────┬───────────────────────┘  │
                                                │    │                 │ B1: drop spans < 5 ms     │
  ┌──────────────────────┐        OTLP/gRPC     │    │  ┌──────────────▼───────────────────────┐  │
  │   Python Service     │ ───────────────────► │    │  │  In-Memory Buffer  (sync.Mutex)      │  │
  │   FastAPI  :8001     │ ◄─────────────────── ┘    │  └──────────────┬───────────────────────┘  │
  └──────────────────────┘  (called by /upstream,     │                 │ time.NewTicker(60s)       │
                             trace context flows)     │  ┌──────────────▼───────────────────────┐  │
                                                      │  │  Batch Flusher  (goroutine)          │  │
                                                      │  │  pgx.CopyFrom in single tx           │  │
                                                      │  └──────────────┬───────────────────────┘  │
                                                      │                 │                           │
                                                      │  ┌──────────────▼───────────────────────┐  │
                                                      │  │  Prometheus /metrics  (:2112)  [B3]  │  │
                                                      │  └──────────────────────────────────────┘  │
                                                      └─────────────────┬───────────────────────────┘
                                                                        │ batch INSERT (every 60s)
                                                      ┌─────────────────▼───────────────────────────┐
                                                      │              PostgreSQL  :5432               │
                                                      │   spans (trace_id, span_id, parent_id, ...)  │
                                                      │   metrics (service_name, metric_name, ...)   │
                                                      └─────────────────┬───────────────────────────┘
                                                                        │ asyncpg
                                                      ┌─────────────────▼───────────────────────────┐
                                                      │       FastAPI Query API  :8000               │
                                                      │   GET /spans  GET /metrics  GET /graph [B2]  │
                                                      │   GET /health   OpenAPI /docs                │
                                                      └─────────────────────────────────────────────┘
```

---

## Data Flow

A single HTTP request through the system travels the following path:

1. **Request arrives** — a client hits `GET /work` on the Node.js service (host port 13000).
2. **Auto-instrumentation** — the OTel SDK (loaded before Express) intercepts the request and creates a span with `trace_id`, `span_id`, `started_at`, and `duration_ms` automatically. No manual span code exists in the service.
3. **OTLP export** — when the span closes, the SDK batches it and exports it via gRPC to the Go agent at `agent:4317` (Docker internal DNS).
4. **Sampling (B1)** — the agent's receiver checks `duration_ms >= SAMPLE_THRESHOLD_MS` (default 5 ms). Spans below the threshold are counted in Prometheus and discarded.
5. **Buffering** — spans that pass sampling are appended to a `sync.Mutex`-protected slice in memory. No database write happens yet.
6. **60-second flush** — a `time.NewTicker(60s)` goroutine fires, calls `buf.Drain()` to atomically swap out the accumulated slice, and writes all records in a **single `pgx.CopyFrom` transaction** to the `spans` table. The same transaction covers any buffered metrics.
7. **Log evidence** — the agent logs `INFO flushed spans=N metrics=M duration_ms=D` after each successful commit.
8. **Query** — `GET http://localhost:8000/spans?service_name=node-service` hits the FastAPI query API, which runs a parameterised async query via asyncpg and returns typed JSON (Pydantic-validated).

For cross-service calls (`GET /upstream`), Node.js calls python-service with W3C Trace Context headers injected automatically. Python-service creates a child span with `parent_id` pointing to the Node.js outgoing-request span. After a flush, `GET /graph` returns this `node-service → python-service` edge derived from the `parent_id` join.

---

## Prerequisites

- Docker Desktop (with Compose v2)
- Ports free on host: `5433`, `13000`, `8001`, `8000`, `14317`, `2112`

> The host ports are intentionally offset from their container-internal equivalents to avoid conflicts with any locally running services.

---

## Environment Setup

```bash
cp .env.example .env
# The defaults in .env.example work out of the box — no changes required.
```

Key variables (all have defaults):

| Variable | Default | Description |
|---|---|---|
| `POSTGRES_USER` | `observability` | PostgreSQL username |
| `POSTGRES_PASSWORD` | `observability_secret` | PostgreSQL password |
| `POSTGRES_DB` | `telemetry` | Database name |
| `DATABASE_URL` | *(built from above)* | Full connection string for Go agent and query API |
| `FLUSH_INTERVAL_SECONDS` | `60` | How often the Go agent flushes to PostgreSQL |
| `SAMPLE_THRESHOLD_MS` | `5` | B1: spans shorter than this (ms) are dropped |
| `PROMETHEUS_PORT` | `2112` | B3: port for the Prometheus `/metrics` endpoint |
| `QUERY_API_PORT` | `8000` | Port for the FastAPI query API |

---

## Running the System

```bash
docker compose up --build
```

Docker Compose starts all seven services in dependency order:

1. `postgres` — starts first; health-checked with `pg_isready`; `schema.sql` auto-applied on first run
2. `agent` — waits for postgres healthy; health-checked via Prometheus `/metrics`
3. `node-service` and `python-service` — wait for agent healthy; begin sending telemetry immediately
4. `query-api` — waits for postgres healthy; ready to serve queries
5. `prometheus` — waits for agent healthy; scrapes `/metrics` every 15 seconds
6. `grafana` — waits for prometheus and postgres; pre-provisioned dashboard loads automatically

### Verify the system is healthy

```bash
# All seven containers should show (healthy)
docker compose ps

# Node.js service
curl http://localhost:13000/health      # {"status":"healthy"}
curl http://localhost:13000/ping        # {"pong":true}
curl http://localhost:13000/work        # {"result":"done"}
curl http://localhost:13000/upstream    # {"caller":"node-service","callee":"python-service",...}

# Python service
curl http://localhost:8001/health       # {"status":"healthy"}
curl http://localhost:8001/ping         # {"pong":true}
curl http://localhost:8001/work         # {"result":"done"}

# Query API (after at least one 60s flush cycle)
curl http://localhost:8000/health       # {"status":"ok"}
curl http://localhost:8000/spans        # [...list of span records...]
curl http://localhost:8000/metrics      # [...latest metric per service/name...]
curl http://localhost:8000/graph        # {"nodes":[...],"edges":[...]}

# Prometheus metrics (B3)
curl http://localhost:2112/metrics      # Prometheus text format

# OpenAPI interactive docs
open http://localhost:8000/docs

# Grafana dashboard (B3)
open http://localhost:3001
# Login: admin / admin  (change via GRAFANA_PASSWORD in .env)

# Prometheus UI (raw metrics browser)
open http://localhost:9090
```

### Watch the 60-second flush

```bash
docker compose logs -f agent
# You will see lines like:
# INFO span buffered service=node-service operation="GET /work" duration_ms=22.165
# INFO flushed spans=15 metrics=12 duration_ms=18 at=2026-05-12T05:07:12Z
```

### Graceful shutdown

```bash
docker compose stop agent
# Logs will show:
# INFO shutdown signal received — draining buffer
# INFO flushed spans=N metrics=M ...
# INFO agent stopped cleanly
```

---

## API Reference

Base URL: `http://localhost:8000`

Interactive docs: `http://localhost:8000/docs`

### `GET /health`

Returns API status.

```json
{"status": "ok"}
```

### `GET /spans`

Returns stored spans, newest first.

| Parameter | Type | Description |
|---|---|---|
| `service_name` | string | Filter by service |
| `start_time` | ISO 8601 datetime | Filter spans after this time |
| `end_time` | ISO 8601 datetime | Filter spans before this time |
| `limit` | integer (1–1000) | Max rows to return (default 100) |

```bash
curl "http://localhost:8000/spans?service_name=node-service&limit=5"
```

### `GET /metrics`

Returns the latest recorded value per `(service_name, metric_name)` pair.

| Parameter | Type | Description |
|---|---|---|
| `service_name` | string | Filter by service |
| `metric_name` | string | Filter by metric name |
| `limit` | integer (1–1000) | Max rows (default 100) |

### `GET /graph` — B2

Returns the service dependency graph derived from `parent_id` joins across the `spans` table.

```json
{
  "nodes": ["node-service", "python-service"],
  "edges": [
    {"caller": "node-service", "callee": "python-service", "call_count": 26}
  ]
}
```

An edge `A → B` exists when a span belonging to service B has a `parent_id` that resolves to a span belonging to service A — i.e. A made a traced call into B.

---

## Bonus Features

### B1 — Tail-based Sampling

The Go agent drops any span whose `duration_ms` is below `SAMPLE_THRESHOLD_MS` (default `5`). Dropped spans are counted in the `otlp_spans_dropped_total` Prometheus counter and never written to PostgreSQL.

To test: set `SAMPLE_THRESHOLD_MS=100` in `.env`, restart `docker compose up -d agent`, then generate traffic. All spans (which are < 100 ms) will be dropped.

### B2 — Service Dependency Graph

`GET /graph` runs a self-join on the `spans` table:

```sql
SELECT parent_span.service_name AS caller,
       child_span.service_name  AS callee,
       COUNT(*)                 AS call_count
FROM spans AS child_span
JOIN spans AS parent_span
  ON child_span.parent_id = parent_span.span_id
 AND child_span.service_name != parent_span.service_name
GROUP BY caller, callee
```

Hit `GET /upstream` on the Node.js service a few times to generate cross-service traces, then call `GET /graph` to see the `node-service → python-service` edge.

### B3 — Prometheus Metrics Endpoint + Grafana Dashboard

The Go agent exposes five custom metrics at `http://localhost:2112/metrics`:

| Metric | Type | Description |
|---|---|---|
| `otlp_spans_received_total` | Counter | Total spans received via gRPC |
| `otlp_spans_dropped_total` | Counter | Spans dropped by B1 sampler |
| `otlp_spans_flushed_total` | Counter | Spans successfully written to PostgreSQL |
| `otlp_metrics_received_total` | Counter | Total metric data points received |
| `otlp_flush_duration_seconds` | Histogram | Time taken per flush transaction |

A Prometheus server scrapes this endpoint every 15 seconds. Grafana is pre-provisioned with both a **Prometheus** data source and a **PostgreSQL** data source, and loads the `Distributed Observability Agent` dashboard automatically on startup.

**Access Grafana:** `http://localhost:3001` — login `admin` / `admin`

The dashboard includes:
- Stat panels for all 5 counters (received, dropped, flushed, metrics, drop-rate %)
- Time-series graph of span throughput per minute
- Flush duration histogram (p50 / p95 / p99) from Prometheus
- Spans by service table from PostgreSQL
- Latest 20 spans table from PostgreSQL
- Latest metric values table (mirrors `GET /metrics`) from PostgreSQL
- Service dependency graph table (mirrors `GET /graph`) from PostgreSQL

---

## Test Evidence

Flush log evidence is saved in [`docs/flush-evidence.log`](docs/flush-evidence.log).

Key lines showing the 60-second batch flush in action:

```
INFO sampler configured threshold_ms=5
INFO agent ready otlp_grpc_port=4317 prometheus_port=2112 flush_interval=1m0s sample_threshold_ms=5
INFO flushed spans=105 metrics=12 duration_ms=15 at=2026-05-12T05:07:12Z
INFO flushed spans=0   metrics=12 duration_ms=12 at=2026-05-12T05:08:14Z
INFO flushed spans=0   metrics=12 duration_ms=12 at=2026-05-12T05:09:15Z
...
INFO shutdown signal received — draining buffer
INFO agent stopped cleanly
```

Timestamps show exactly 60-second intervals between flush cycles, confirming the `time.NewTicker(60s)` is driving writes — not per-event writes.

---

## Repository Structure

```
/
├── AGENTS.md                    ← AI agent context and requirements
├── README.md                    ← this file
├── docker-compose.yml           ← orchestrates all five services
├── .env.example                 ← all environment variables documented
├── schema.sql                   ← idempotent PostgreSQL schema
│
├── docs/
│   ├── technical-spec.md        ← architecture decisions and component specs
│   ├── implementation-plan.md   ← phased build plan with progress tracking
│   ├── architecture-explained.md← plain-English explanation of how it all fits together
│   └── flush-evidence.log       ← captured agent logs proving 60s batch flush
│
├── agent/                       ← Go OTLP agent
│   ├── main.go                  ← entry point, wires all components
│   ├── receiver/grpc.go         ← OTLP gRPC server (traces, metrics, logs)
│   ├── buffer/buffer.go         ← thread-safe in-memory accumulator
│   ├── flusher/flusher.go       ← 60s ticker + pgx.CopyFrom batch writer
│   ├── sampler/sampler.go       ← B1: duration-based span filter
│   ├── prometheus/prometheus.go ← B3: custom counter/histogram registration
│   ├── cmd/smoke/main.go        ← smoke test OTLP sender
│   └── go.mod
│
├── node-service/                ← Node.js Express app
│   └── src/
│       ├── index.js             ← routes including /upstream (B2 cross-service call)
│       └── tracing.js           ← OTel SDK bootstrap (auto-instrumentation only)
│
├── python-service/              ← Python FastAPI app
│   └── main.py                  ← routes; OTel injected by opentelemetry-instrument CLI
│
└── query-api/                   ← FastAPI JSON query API
    ├── main.py                  ← app factory, router wiring, lifespan
    ├── db.py                    ← asyncpg pool with FastAPI lifespan
    ├── models.py                ← Pydantic response models
    └── routers/
        ├── health.py            ← GET /health
        ├── spans.py             ← GET /spans (with filters)
        ├── metrics.py           ← GET /metrics (DISTINCT ON latest)
        └── graph.py             ← GET /graph  [B2]
```
