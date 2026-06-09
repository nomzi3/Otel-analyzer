# Otel-analyzer

A self-hosted OpenTelemetry ingestion, storage, and analysis platform. Send OTLP telemetry from any instrumented application or collector and explore logs, metrics, and traces through a dark-mode web UI backed by ClickHouse.

---

## How It Works

```
Instrumented apps / OTel Collectors
           │  OTLP gRPC :4317 / HTTP :4318
           ▼
    ┌─────────────────┐
    │ backend-gateway │  Receives OTLP, counts signals per service,
    │                 │  produces raw proto messages to Redpanda.
    └────────┬────────┘
             │  Kafka topics: otel-logs · otel-metrics · otel-traces
             ▼
    ┌─────────────────┐
    │    Redpanda     │  4 partitions per topic, 15-minute / 1 GB retention.
    └────────┬────────┘
             │
             ▼
    ┌─────────────────┐
    │backend-ingester │  Consumes topics, extracts log patterns (regex),
    │                 │  links trace spans to roots, batch-POSTs to backend-api.
    └────────┬────────┘
             │  HTTP REST
             ▼
    ┌─────────────────┐
    │  backend-api    │  Chi router + ClickHouse driver. GET/POST/DELETE
    │                 │  endpoints. R.E.D. Prometheus metrics per path.
    └────────┬────────┘
             │  SQL
             ▼
    ┌─────────────────┐
    │   ClickHouse    │  Columnar store. Map columns for arbitrary attributes.
    │                 │  Async inserts, MergeTree / ReplacingMergeTree engines.
    └────────┬────────┘
             │  REST queries via backend-api
             ▼
    ┌─────────────────┐
    │ frontend/nginx  │  Vanilla JS SPA served on :1337. Proxies /api/* to
    │                 │  backend-api. Dark-mode, four views: All / Logs /
    └─────────────────┘  Metrics / Traces.

Prometheus scrapes gateway :9090, ingester :9093, api :9091 → Grafana :3000
```

### Signal Processing

**Logs** — The ingester strips UUIDs, IPs, hex strings, and numbers from each log body to produce a normalized `log_pattern`. This lets you group and filter noisy logs by shape rather than by exact message.

**Metrics** — Each data point is stored with its full attribute set (resource attributes + metric attributes). Gauge, Sum, Histogram, ExponentialHistogram, and Summary metric types are all supported.

**Traces** — Spans are written to `otel_spans`. Root spans (those with no parent) are additionally written to `otel_trace_roots`, making trace-list queries fast without scanning all spans.

---

## Services & Ports

| Service | Purpose | Port(s) |
|---|---|---|
| frontend | Web UI (nginx) | **1337** |
| backend-gateway | OTLP receiver | 4317 (gRPC), 4318 (HTTP) |
| backend-api | Query/write REST API | 8080 |
| ClickHouse | Columnar database | 9000 (native), 8123 (HTTP) |
| Redpanda | Kafka-compatible broker | 9092 (broker), 9644 (admin) |
| Prometheus | Metrics store | 9090 |
| Grafana | Dashboards | **3000** |
| gateway (Prometheus metrics) | Internal observability | 9090 |
| api (Prometheus metrics) | Internal observability | 9091 |
| ingester (Prometheus metrics) | Internal observability | 9093 |

---

## Prerequisites

- Docker and Docker Compose v2
- `make`
- `curl` (for `make reset`)

---

## Quick Start

```bash
# 1. Clone and start everything
git clone <repo-url>
cd otel-analyzer
make up

# 2. Wait ~15 seconds for ClickHouse to initialize, then open:
#    Frontend  → http://localhost:1337
#    Grafana   → http://localhost:3000  (admin / admin)

# 3. Generate test telemetry (30 s, all signals, export every 10 s)
make test-telemetry

# 4. Refresh the frontend to see ingested data
```

---

## Makefile Reference

| Command | Description |
|---|---|
| `make up` | Start all services in the background |
| `make down` | Stop and remove all containers |
| `make build` | Force-rebuild all images (no cache) |
| `make status` | Show container health and status |
| `make logs [SERVICE=<name>]` | Follow logs for one service or all |
| `make reset` | Delete all telemetry data (TRUNCATE all tables) |
| `make test-telemetry` | Run the benchmark generator (see options below) |
| `make scale-ingester N=<n>` | Run N ingester replicas (max useful: 4) |

### `make test-telemetry` options

All flags are optional and have defaults.

| Flag | Default | Options |
|---|---|---|
| `DURATION` | `30s` | `10s`, `30s`, `5m`, `10m` |
| `SIGNALS` | `all` | `logs`, `metrics`, `traces`, `all` |
| `INTERVAL` | `10s` | `5s`, `10s`, `15s`, `30s` |

Examples:

```bash
# Quick smoke test — 10 seconds of all signals
make test-telemetry DURATION=10s SIGNALS=all INTERVAL=5s

# Long trace-only load — 10 minutes, export every 30 s
make test-telemetry DURATION=10m SIGNALS=traces INTERVAL=30s

# Logs only, 5 minutes
make test-telemetry DURATION=5m SIGNALS=logs
```

The generator sends from **50 synthetic services** — 25 Kubernetes (with `k8s.*` resource attributes) and 25 VM/server (with `host.*` attributes). Signals are linked: each service's logs contain `traceID` attributes that reference spans generated in the same export tick.

---

## Sending Real Telemetry

Point any OTLP exporter at the gateway:

```yaml
# OpenTelemetry Collector exporter config
exporters:
  otlphttp:
    endpoint: http://localhost:4318
  otlp:
    endpoint: localhost:4317
    tls:
      insecure: true
```

Or configure your SDK directly:

```bash
# Environment variables (most OTel SDKs)
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
```

---

## Web UI

Navigate to **http://localhost:1337**.

### All view
Mixed table of logs, metrics, and traces ordered by timestamp. Color-coded by signal type: amber (log), blue (metric), purple (trace). Use this as a starting point to spot correlated events across signal types.

### Logs view
Columns: timestamp, service name, severity, log pattern, and raw body. Click any row to expand full attributes (resource, scope, log attributes). Filter by service name and severity. The **log pattern** column shows the normalized template — useful for identifying recurring error shapes across many log lines.

### Metrics view
Columns: timestamp, metric name, service name, metric type, value. Click a row to see all metric and resource attributes. Filter by metric name and service name.

### Traces view
Columns: trace ID, service name, root span name, start time, duration, status. Click any trace to open a **span waterfall** showing the full span tree for that trace, with durations and parent-child relationships.

---

## Grafana Dashboards

Open **http://localhost:3000** (admin / admin). Three pre-provisioned dashboards:

### Gateway dashboard
Monitors the OTLP receive path:
- **Spans/sec by service** — rate of spans arriving at the gateway, broken down by `service.name`
- **Logs/sec by service** — log ingest rate per service
- **Datapoints/sec by service** — metric datapoint ingest rate per service

Use this dashboard to verify that telemetry is arriving and to identify which services are the highest-volume producers.

### Ingester dashboard
Monitors the processing path:
- **Logs processed/min by service** — throughput after Kafka consumption and pattern extraction
- **Root traces processed/min by service** — rate of new traces identified
- **Datapoints processed/min by metric / service** — metric write throughput broken down by metric name

Use this dashboard to detect Kafka consumer lag (gateway rate >> ingester rate) or to confirm that all signals are being processed end-to-end.

### API dashboard
Monitors the HTTP query/write API:
- **Request rate by path** — R.E.D. requests/sec for each endpoint (`/v1/logs`, `/v1/metrics`, `/v1/traces`, etc.)
- **Error rate by path** — 5xx responses per endpoint
- **Latency p50 / p95 / p99 by path** — response time percentiles

Use this dashboard to catch slow queries (high p99 on GET endpoints) or write bottlenecks (high error rate on POST endpoints).

---

## Scaling the Ingester

The ingester is stateless — it participates in a Kafka consumer group (`otel-ingester`). Adding replicas increases throughput up to the number of Kafka partitions (4 by default).

```bash
make scale-ingester N=2   # run 2 ingester replicas
make scale-ingester N=4   # max useful replicas with default partition count
make scale-ingester N=1   # back to one
```

Watch the Ingester dashboard in Grafana to confirm Redpanda rebalances partitions across replicas after scaling.

---

## Inspecting Kafka Topics

```bash
# Check partition offsets and consumer lag for all topics
bash kafka-layer/scripts/inspect-topics.sh
```

Zero consumer lag means the ingester is keeping up. Growing lag means the ingester needs more replicas or there is a write bottleneck in the API / ClickHouse layer.

---

## Architecture Notes

- **Write path**: gateway → Redpanda → ingester → backend-api → ClickHouse. Each hop is intentional: Redpanda absorbs ingestion spikes and decouples receivers from the write path.
- **Attribute storage**: all resource, scope, and signal attributes are stored as `Map(String, String)` columns in ClickHouse. No schema migration is needed when new attributes appear.
- **Log patterns**: the ingester uses regex substitution to normalize log bodies. The pattern is stored alongside the raw body so you can filter by either.
- **Trace root detection**: spans with an empty `parentSpanId` are written to `otel_trace_roots` (ReplacingMergeTree). This makes paginated trace lists fast without a full `otel_spans` scan.
- **Ingester failures**: dropped batches (all retries exhausted) are counted in the `ingester_ingest_failures_total` Prometheus metric, labeled by topic.
