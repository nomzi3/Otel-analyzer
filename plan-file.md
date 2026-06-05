# Otel-analyzer Implementation Checklist

Track progress phase by phase. Check off each step as it is completed.

---

## Phase 1 — Infrastructure Skeleton

- [x] Create `docker-compose.yml` with all services defined (redpanda, clickhouse, backend-gateway, backend-ingester, backend-api, frontend, prometheus, grafana), networks, volumes, and port mappings
- [x] Create `.env` with ports, topic names (otel-logs, otel-metrics, otel-traces), retention values, INGESTER_REPLICAS=1
- [x] Create `Makefile` skeleton with stubbed targets: `up`, `down`, `reset`, `test-telemetry`, `scale-ingester`, `logs`, `status`

---

## Phase 2 — Kafka Layer (Redpanda)

- [x] Wire Redpanda service in docker-compose (broker port 9092, admin port 9644)
- [x] Configure topic auto-creation on startup: `otel-logs`, `otel-metrics`, `otel-traces` — 4 partitions each, retention 15min / 1GB whichever first
- [x] Create `kafka-layer/scripts/inspect-topics.sh` — rpk topic describe for all three topics (partition offsets + consumer lag)

---

## Phase 3 — ClickHouse Database

- [x] Wire ClickHouse service in docker-compose (official image, memory limits)
- [x] Create `backend-database/clickhouse-config.xml` (async_insert=1, memory limits)
- [x] Create `backend-database/init/01_create_logs.sql` — `otel_logs` MergeTree table with Map columns for attributes, materialized `service_name`
- [x] Create `backend-database/init/02_create_metrics.sql` — `otel_metrics` MergeTree table
- [x] Create `backend-database/init/03_create_traces.sql` — `otel_trace_roots` (ReplacingMergeTree) + `otel_spans` (MergeTree)

---

## Phase 4 — Backend API

- [x] Initialize Go module (`backend-api/go.mod`)
- [x] Implement `cmd/api/main.go` — HTTP server startup, ClickHouse connection, graceful shutdown
- [x] Implement `internal/db/clickhouse.go` — connection pool, PrepareBatch for bulk inserts
- [x] Implement `internal/db/logs.go` — insert, query, truncate for otel_logs
- [x] Implement `internal/db/metrics.go` — insert, query, truncate for otel_metrics
- [x] Implement `internal/db/traces.go` — insert, query, truncate for otel_trace_roots + otel_spans
- [x] Implement `internal/handler/health.go` — GET /health
- [x] Implement `internal/handler/logs.go` — POST/GET/DELETE /v1/logs
- [x] Implement `internal/handler/metrics.go` — POST/GET/DELETE /v1/metrics
- [x] Implement `internal/handler/traces.go` — POST/GET/DELETE /v1/traces
- [x] Implement `internal/middleware/red_metrics.go` — R.E.D. per-endpoint middleware (requests_total, request_duration_seconds, requests_in_flight)
- [x] Implement `internal/metrics/metrics.go` — Prometheus registry, expose :9091/metrics
- [x] Write Dockerfile for backend-api

---

## Phase 5 — Backend Gateway

- [x] Initialize Go module (`backend-gateway/go.mod`)
- [x] Implement `internal/metrics/metrics.go` — gateway_spans_received_total, gateway_datapoints_received_total, gateway_logs_received_total (all labeled by service_name); expose :9090/metrics
- [x] Implement `internal/producer/producer.go` — franz-go async Kafka producer with local buffer; non-blocking produce
- [x] Implement `internal/receiver/http.go` — OTLP HTTP receiver on :4318, parse pdata, extract service.name, forward to producer
- [x] Implement `internal/receiver/grpc.go` — OTLP gRPC receiver on :4317, parse pdata, extract service.name, forward to producer
- [x] Implement `cmd/gateway/main.go` — start HTTP + gRPC listeners, Prometheus server, graceful shutdown
- [x] Write Dockerfile for backend-gateway

---

## Phase 6 — Backend Ingester

- [x] Initialize Go module (`backend-ingester/go.mod`)
- [x] Implement `internal/metrics/metrics.go` — ingester_logs_processed_total, ingester_root_traces_processed_total, ingester_datapoints_processed_total; expose :9092/metrics
- [x] Implement `internal/apiclient/client.go` — HTTP client to backend-api with exponential backoff retry
- [x] Implement `internal/processor/logs.go` — regex pattern extraction (strip UUIDs, IPs, numbers, hex); batch POST to backend-api
- [x] Implement `internal/processor/metrics.go` — structure datapoints per (metric_name, attributes); batch POST to backend-api
- [x] Implement `internal/processor/traces.go` — identify root spans, link spans by traceID, batch POST roots + spans to backend-api
- [x] Implement `internal/consumer/consumer.go` — franz-go consumer group (group: otel-ingester) consuming all three topics, dispatch to processors
- [x] Implement `cmd/ingester/main.go` — start consumer, Prometheus server, graceful shutdown
- [x] Write Dockerfile for backend-ingester

---

## Phase 7 — Prometheus + Grafana

- [x] Create `prometheus/prometheus.yml` — scrape configs for gateway:9090, ingester:9092, api:9091 at 15s interval; 1h retention
- [x] Wire Prometheus service in docker-compose
- [x] Wire Grafana 13.0.2 service in docker-compose
- [x] Create `grafana/provisioning/datasources/prometheus.yaml`
- [x] Create `grafana/provisioning/dashboards/dashboards.yaml`
- [x] Create `grafana/dashboards/gateway.json` — spans/sec, logs/sec, datapoints/sec by service_name
- [x] Create `grafana/dashboards/ingester.json` — logs/min, root traces/min, datapoints/min by service_name / metric_name
- [x] Create `grafana/dashboards/api.json` — request rate, error rate, p50/p95/p99 latency by path

---

## Phase 8 — Benchmark Generator

- [x] Initialize Go module (`benchmark-generator/go.mod`)
- [x] Implement `internal/services.go` — 50 service definitions (25 k8s with k8s.* resource attrs, 25 vm with host.* resource attrs)
- [x] Implement `internal/traces.go` — 1-5 root spans per service, 10-20 child spans per root; realistic span names + attrs; correct parentSpanId
- [x] Implement `internal/logs.go` — 10-20 logs per service per export; 5-8 pattern templates with injectable values; traceID linking; OTLP-compliant timeUnixNano
- [x] Implement `internal/metrics.go` — 1 datapoint per metric name per export; 20 k8s.* metric names, 10 system.*/process.* metric names; semantic conventions
- [x] Implement `internal/exporter.go` — OTLP HTTP exporters for logs, metrics, traces targeting gateway
- [x] Implement `cmd/generator/main.go` — cobra CLI with --duration (10s/30s/5m/10m), --signals (logs/metrics/traces/all), --interval (5s/10s/15s/30s)
- [x] Write Dockerfile for benchmark-generator

---

## Phase 9 — Frontend

- [x] Create `frontend/package.json` and static asset structure
- [x] Implement `frontend/src/styles/dark.css` — dark theme variables and base styles
- [x] Implement `frontend/src/index.html` — navigation (All / Logs / Metrics / Traces)
- [x] Implement `frontend/src/views/all.js` — paginated mixed telemetry table, color-coded by type (log=amber, metric=blue, trace=purple)
- [x] Implement `frontend/src/views/logs.js` — timestamp, service_name, pattern, body, expandable attributes
- [x] Implement `frontend/src/views/metrics.js` — metric_name, service_name, value, timestamp, attribute set
- [x] Implement `frontend/src/views/traces.js` — trace list with click-through to span waterfall
- [x] Implement `frontend/src/app.js` — fetch() polling, view routing
- [x] Create `frontend/nginx.conf` — proxy /api/* to backend-api; serve static files
- [x] Write multi-stage Dockerfile for frontend (Node.js build → nginx serve)

---

## Phase 10 — Integration + Makefile Finalization

- [x] Fill in Makefile `up` target — `docker-compose up -d` with health-check startup ordering
- [x] Fill in Makefile `down` target — `docker-compose down`
- [x] Fill in Makefile `reset` target — curl DELETE /v1/logs + /v1/metrics + /v1/traces on backend-api
- [x] Fill in Makefile `scale-ingester` target — `docker-compose up --scale backend-ingester=$(N) -d`
- [x] Fill in Makefile `test-telemetry` target — docker run benchmark-generator with DURATION/SIGNALS/INTERVAL args
- [x] Fill in Makefile `logs` target — `docker-compose logs -f $(SERVICE)`
- [x] Fill in Makefile `status` target — `docker-compose ps`
- [x] Add docker-compose `depends_on` with health checks: ClickHouse → Redpanda → gateway + api → ingester → frontend
- [ ] End-to-end smoke test: `make test-telemetry DURATION=10s SIGNALS=all INTERVAL=5s` → data visible in frontend (localhost:1337) and Grafana (localhost:3000)
- [ ] Verify `kafka-layer/scripts/inspect-topics.sh` shows 0 consumer lag after ingestion completes
- [ ] Verify `make reset` clears all tables and frontend shows empty views
- [ ] Verify `make scale-ingester N=2` runs two ingester replicas with Redpanda rebalancing
