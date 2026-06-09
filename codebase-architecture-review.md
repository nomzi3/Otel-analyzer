# Otel-analyzer: Codebase Architecture Review

> Senior-engineer reverse-engineering pass. Goal: identify bad architecture decisions, duplicate logic, performance bottlenecks, scalability risks, and maintainability issues — then prescribe targeted, non-breaking remediation.

---

## 1. Architecture Breakdown (Current State)

### Data Flow

```
[Instrumented Apps / OTel Collectors]
        │  OTLP gRPC :4317 / HTTP :4318
        ▼
┌──────────────────────────────────┐
│         backend-gateway          │
│  receiver/http.go + grpc.go      │
│  • Parse OTLP proto              │
│  • Extract service.name          │
│  • Count signals (Prometheus)    │
│  • Produce raw proto → Kafka     │
└─────────────┬────────────────────┘
              │  franz-go ProduceSync (keyed by service.name)
              ▼
┌──────────────────────────────────┐
│   Redpanda / Kafka               │
│   otel-logs | otel-metrics       │
│   otel-traces                    │
│   4 partitions, 15 min retention │
└─────────────┬────────────────────┘
              │  franz-go PollFetches (group: otel-ingester)
              ▼
┌──────────────────────────────────┐
│        backend-ingester          │
│  consumer → processor → client   │
│  • Unmarshal pdata proto         │
│  • Extract log patterns (regex)  │
│  • Identify trace roots          │
│  • HTTP POST → backend-api       │
│    (5× exponential backoff)      │
└─────────────┬────────────────────┘
              │  HTTP POST /v1/{logs,metrics,traces}
              ▼
┌──────────────────────────────────┐
│          backend-api             │
│  chi router + ClickHouse driver  │
│  • Validate JSON                 │
│  • Batch insert (async mode)     │
│  • Query with dynamic WHERE      │
│  • RED metrics middleware        │
└─────────────┬────────────────────┘
              │  ClickHouse SQL
              ▼
┌──────────────────────────────────┐
│           ClickHouse             │
│  otel_logs | otel_metrics        │
│  otel_trace_roots | otel_spans   │
│  async_insert=1 (no flush wait)  │
└─────────────┬────────────────────┘
              │  GET /api/v1/...
              ▼
┌──────────────────────────────────┐
│   frontend (nginx :1337)         │
│   Vanilla JS SPA (no framework)  │
│   Hash-based routing             │
│   Global filterState object      │
└──────────────────────────────────┘
```

### Component Inventory

| Service | Language | Entry Point | Ports |
|---|---|---|---|
| backend-gateway | Go 1.22 | `cmd/gateway/main.go` | 4317 (gRPC), 4318 (HTTP), 9090 (prom) |
| backend-ingester | Go 1.22 | `cmd/ingester/main.go` | 9093 (prom) |
| backend-api | Go 1.22 | `cmd/api/main.go` | 8080 (API), 9091 (prom) |
| frontend | Vanilla JS / Nginx | `src/index.html` | 1337 |
| benchmark-generator | Go 1.22 | `cmd/generator/main.go` | — (CLI) |

---

## 2. Bad Architecture Decisions

### A. Ingester posts to API over HTTP instead of writing to ClickHouse directly

**What:** The ingester consumes from Kafka, processes records, then makes HTTP POST calls to backend-api, which in turn inserts into ClickHouse. There is a full network hop + HTTP serialization round-trip on the hot path for every batch.

**Why it's bad:** Adds latency, doubles serialization cost (proto → Go structs → JSON → Go structs → ClickHouse binary), and introduces a fragile dependency — if backend-api is temporarily unavailable, messages must retry via in-memory backoff with no persistence. The ingester already has the correct data in memory and the ClickHouse driver is already a dependency of backend-api.

**Risk:** Under load spikes, the ingester's 5-attempt exponential-backoff retries (max delay ~1.6 s) will eventually exhaust, and the consumer will fall behind its Kafka partition. With 15-minute retention and no dead-letter topic, lagged data is permanently lost.

**Remediation:** Have the ingester write directly to ClickHouse using the same batch-insert logic currently in `db/logs.go`, `db/metrics.go`, `db/traces.go`. POST endpoints on backend-api become read-only query endpoints.

---

### B. Gateway uses a single service name per Kafka message (mixed-service batch loss)

**What:** Both HTTP and gRPC receivers extract `firstServiceName` as the Kafka partition key and send the entire batch as one message — even if the OTLP request contains spans from multiple services.

**Where:** `receiver/http.go` lines 76–82, `receiver/grpc.go` Export handlers.

**Why it's bad:** A standards-compliant OTLP batch can contain ResourceSpans from multiple services. The current code attributes the whole batch to the first service in the list. Downstream, all data in that Kafka message will inherit the wrong service partition — potentially causing fan-out issues or mislabeled telemetry.

**Remediation:** Split multi-service batches into one Kafka message per ResourceSpans group, each keyed by its own `service.name`. The OTLP protobuf structure already groups by resource.

---

### C. No dead-letter mechanism for failed ingestions

**What:** When the ingester's API client exhausts all retries, it logs the error and returns — the Kafka record is committed and the data is dropped silently.

**Where:** `consumer/consumer.go` lines 47–50, 64–67, 81–84.

**Why it's bad:** Silent data loss with no operator visibility. There is no alert, no counter increment, no dead-letter topic to replay from.

**Remediation:** At minimum, increment a `ingester_ingest_failures_total` Prometheus counter per topic. Ideally, produce failed records to a `otel-dlq` topic for manual replay.

---

### D. ClickHouse async inserts with no flush confirmation

**What:** ClickHouse connection is configured with `async_insert=1, wait_for_async_insert=0`. Inserts return immediately but data may be buffered in ClickHouse memory for up to the server's `async_insert_max_data_size` or `async_insert_busy_timeout_ms` limits.

**Where:** `backend-api/internal/db/clickhouse.go`.

**Why it's bad:** A ClickHouse restart or OOM-kill between insert acknowledgement and actual write causes silent data loss. The default `async_insert_busy_timeout_ms` is 200 ms, but under low load data can sit in the buffer for much longer.

**Remediation:** For a write-ahead-log safety profile, set `wait_for_async_insert=1`. For maximum throughput with accepted risk, document the trade-off explicitly and add a ClickHouse `system.async_insert_log` dashboard.

---

## 3. Duplicate Logic

### Backend (Go)

| Duplicate | Locations | Impact |
|---|---|---|
| `joinClauses()` | `db/logs.go`, `db/metrics.go`, `db/traces.go` — three identical implementations | Any change must be made in three files |
| `attrsToMap` | `mapFromAttrs` in `processor/logs.go:30`, `resAttrsToMap` in `processor/metrics.go:10` — byte-for-byte identical | Bug or optimization applied to one silently misses the other |
| `serviceNameFromAttrs` (proto variant) | Defined in `receiver/grpc.go:57` instead of `receiver/helpers.go` where the pdata variant lives | Helper functions split across files with no clear ownership |
| `countDataPointsProto` | Defined in `receiver/grpc.go:69` instead of `receiver/helpers.go` | Same as above |

### Frontend (JS)

| Duplicate | Locations | Impact |
|---|---|---|
| Pagination DOM block | `logs.js:111–135`, `metrics.js:110–134`, `traces.js:92–116` | Pagination bug or style change → edit 3 files |
| `escapeHtml()` / `escapeAttr()` | `logs.js:178`, `metrics.js:208`, `traces.js:272` (also private in `utils.js:92`) | Security fix to HTML escaping must be replicated 3× |
| Resource-attribute sort | `logs.js:32–38`, `metrics.js:27–33`, `traces.js:27–33` | Identical `[...items].sort(localeCompare)` block |
| Response normalization | `Array.isArray(data) ? data : (data.X || data.items || data.data || [])` in all four view files | API response shape change → 4 files |
| Field-name fallback chains | `log.service_name \|\| log.service \|\| ''` scattered across all views | Schema change → hunt through every render loop |
| `statusBadge()` | Local to `traces.js:265` — `severityBadge` is in `utils.js` | Inconsistent: one badge type is shared, one isn't |
| `normalizeTs()` | `all.js` + `utils.js:formatTimestamp` — overlapping timestamp parsing | Two implementations with subtle behavioral differences |

---

## 4. Performance Bottlenecks

### P1. No slice pre-allocation in processors
`ProcessLogs`, `ProcessMetrics`, `ProcessTraces` each start with `var rows []T` and call `append` in nested loops. Every capacity doubling allocates a new backing array and triggers a GC copy. Under high-throughput ingestion this is the dominant allocation source.

**Fix:** `rows := make([]types.LogRow, 0, ld.ResourceLogs().Len()*estimatedRecordsPerScope)`

### P2. Unbounded DOM construction in trace span modal
`traces.js renderSpanTree()` creates DOM elements one-by-one recursively for every span. Large traces (hundreds of spans) cause synchronous layout thrashing.

**Fix:** Build into a `DocumentFragment`, then do a single `container.appendChild(fragment)`.

### P3. `ProduceSync` on the hot ingestion path
`producer.go` uses `client.ProduceSync()` — each OTLP request blocks until Kafka acknowledges. Under any network jitter this stalls the HTTP receiver goroutine.

**Fix:** Use `ProduceAsync` with a completion callback that records errors to the Prometheus counter. The OTLP spec does not require durability guarantees from the receiver.

### P4. Regex compiled once — already correct
The five regexes in `processor/logs.go` are package-level `var` compiled once at init. No action needed.

---

## 5. Scalability Risks

### S1. Ingester fan-out creates API hot spot
Every ingester replica POSTs to the same `backend-api` service. With `N` ingester replicas, API ingest write pressure scales linearly. ClickHouse batch inserts become the bottleneck, not the ingester.

**Root cause:** The HTTP indirection. Direct ClickHouse writes per ingester would eliminate this bottleneck and allow each ingester to open its own connection pool.

### S2. Kafka partition count is static at 4
`otel-logs`, `otel-metrics`, `otel-traces` are each created with 4 partitions. Ingester instances beyond 4 will have idle consumers (Kafka assigns at most one consumer per partition per group). Re-partitioning a Kafka topic requires migrating all data.

**Fix:** Plan partition count for 2× your target ingester scale from day one. Alternatively, accept the 4-ingester ceiling explicitly and document it.

### S3. `services` query parameter has no length cap
`parseServices()` in `backend-api/internal/handler/logs.go:122` splits on `,` with no limit. A caller passing thousands of service names constructs a massive `IN (?)` clause in every query.

**Fix:** Add `if len(result) > 100 { return result[:100] }` or return an HTTP 400 for oversized inputs.

### S4. Full-table TRUNCATE for DELETE endpoints
`DELETE /v1/logs`, `/v1/metrics`, `/v1/traces` call `TRUNCATE TABLE` — no selective deletion. A misbehaving client or accidental admin action wipes the entire dataset.

**Fix:** Accept a time-range body (e.g., `{"before": "2024-01-01T00:00:00Z"}`) and use `ALTER TABLE ... DELETE WHERE timestamp < ?` (ClickHouse lightweight delete).

---

## 6. Maintainability Issues

### M1. Handler helpers defined inside `logs.go`
`clampLimit`, `parseServices`, `parseInt` are defined in `handler/logs.go` but used by all four handler files. Any handler that imports the package silently depends on `logs.go` being present.

**Fix:** Move to `handler/helpers.go`.

### M2. No API response contract layer in the frontend
Field name fallback chains (`log.service_name || log.service || ''`) are scattered inside render loops in every view. If the API adds a field or renames one, every view must be audited.

**Fix:** Centralize field mapping in `utils.js`:

```js
export function getServiceName(item) { return item.service_name || item.service || ''; }
```

### M3. Filter state not persisted to URL
`filterState` in `app.js` is in-memory only. Page reload loses all filters; filtered views cannot be shared via link.

**Fix:** Sync filter state to `URLSearchParams` on every change, restore on load.

### M4. Silent JSON encoding errors in all GET handlers
Every GET handler does:

```go
w.Header().Set("Content-Type", "application/json")
_ = json.NewEncoder(w).Encode(rows)
```

Once `w.Header().Set` is called, the status line is flushed. A subsequent encoding error produces a truncated JSON body with a 200 status — the client cannot distinguish success from failure.

**Fix:** Marshal to `[]byte` first; only write headers on success:

```go
// handler/json.go
func writeJSON(w http.ResponseWriter, v any) {
    buf, err := json.Marshal(v)
    if err != nil {
        http.Error(w, "encoding error: "+err.Error(), http.StatusInternalServerError)
        return
    }
    w.Header().Set("Content-Type", "application/json")
    w.Write(buf)
}
```

---

## 7. Refactoring Strategy

Organized to minimize risk: correctness bugs first, high-impact deduplication second, polish third. Each step is independently compilable/testable.

### Phase 1 — Bug Fixes (Go backend)

**Step 1.1 — Fix silent JSON encoding (C1)**
- Create `backend-api/internal/handler/json.go` with `writeJSON(w, v)`
- Replace all `_ = json.NewEncoder(w).Encode(...)` in `handler/{logs,metrics,traces,services}.go`

**Step 1.2 — Move handler helpers out of logs.go**
- Create `backend-api/internal/handler/helpers.go`
- Move `clampLimit`, `parseServices`, `parseInt` there
- Remove them from `logs.go`

### Phase 2 — Eliminate Backend Duplication

**Step 2.1 — Shared `joinClauses` in db package**
- Create `backend-api/internal/db/query.go` → `func joinClauses([]string) string`
- Remove `joinLogClauses`, `joinClauses`, `joinTraceClauses` from `db/logs.go`, `db/metrics.go`, `db/traces.go`

**Step 2.2 — Shared `attrsToMap` in processor package**
- Create `backend-ingester/internal/processor/attrs.go` → `func attrsToMap(pcommon.Map) map[string]string` with `make(..., attrs.Len())` pre-allocation
- Remove `mapFromAttrs` from `processor/logs.go`, `resAttrsToMap` from `processor/metrics.go`
- Update all call sites

**Step 2.3 — Consolidate gateway helpers**
- Move `serviceNameFromAttrs` and `countDataPointsProto` from `receiver/grpc.go` → `receiver/helpers.go`
- `grpc.go` becomes pure Export-method logic

**Step 2.4 — Slice pre-allocation in processors**
- Add capacity hints to `ProcessLogs`, `ProcessMetrics`, `ProcessTraces`

### Phase 3 — Frontend Deduplication

**Step 3.1 — Expand `utils.js`** (all additions, no removals yet)

```
Export: escapeHtml, escapeAttr
Add:    buildPagination(offset, count, limit, onPrev, onNext)
Add:    sortByResourceAttr(items, attr)
Add:    normalizeResponse(data, primaryKey)
Add:    statusBadge(status)  [moved from traces.js]
Add:    getServiceName(item), getTimestamp(item)
```

**Step 3.2 — Update view files** (consume new utils exports)
- `logs.js`: remove local `escapeHtml`/`escapeAttr`, inline sort, inline normalization, inline pagination; import replacements; add `const PAGE_LIMIT = 100`
- `metrics.js`: same pattern; `const PAGE_LIMIT = 100`
- `traces.js`: same pattern; remove local `statusBadge`; `const PAGE_LIMIT = 50`
- `all.js`: remove `normalizeTs`, use `formatTimestamp` from utils; fix silent fetch failures

### Phase 4 — Structural Improvements (optional, higher risk)

**Step 4.1 — Cap `services` parameter**
Add length guard to `parseServices` in `handler/helpers.go`.

**Step 4.2 — Add `ingester_ingest_failures_total` counter**
Increment per-topic on all-retries-exhausted in `consumer/consumer.go`. Expose in Prometheus. Add to Grafana dashboard.

**Step 4.3 — Gateway async produce**
Switch from `ProduceSync` to `ProduceAsync` with error counter callback in `producer/producer.go`.

---

## 8. Improved Production-Grade Code Samples

### `backend-api/internal/handler/json.go` (new file)

```go
package handler

import (
    "encoding/json"
    "net/http"
)

// writeJSON marshals v and writes it as an application/json response.
// It writes headers only after a successful marshal, preventing truncated
// responses when encoding fails after the status line has been flushed.
func writeJSON(w http.ResponseWriter, v any) {
    buf, err := json.Marshal(v)
    if err != nil {
        http.Error(w, "encoding error: "+err.Error(), http.StatusInternalServerError)
        return
    }
    w.Header().Set("Content-Type", "application/json")
    w.Write(buf)
}
```

### `backend-api/internal/db/query.go` (new file)

```go
package db

import "strings"

// joinClauses joins WHERE clause fragments with AND.
func joinClauses(clauses []string) string {
    return strings.Join(clauses, " AND ")
}
```

### `backend-ingester/internal/processor/attrs.go` (new file)

```go
package processor

import "go.opentelemetry.io/collector/pdata/pcommon"

// attrsToMap converts a pcommon.Map into a map[string]string.
// The result is pre-allocated to the source map's length to avoid
// incremental re-allocation on the hot ingestion path.
func attrsToMap(attrs pcommon.Map) map[string]string {
    m := make(map[string]string, attrs.Len())
    attrs.Range(func(k string, v pcommon.Value) bool {
        m[k] = v.AsString()
        return true
    })
    return m
}
```

### `frontend/src/utils.js` additions

```js
// Exported escape functions (remove private copies from each view file)
export function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
export function escapeAttr(str) {
  return String(str).replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

// Pagination component — replaces 3 identical inline blocks
export function buildPagination(offset, itemCount, limit, onPrev, onNext) {
  const pag = document.createElement('div');
  pag.className = 'pagination';
  const prev = document.createElement('button');
  prev.textContent = '← Prev';
  prev.disabled = offset === 0;
  prev.addEventListener('click', onPrev);
  const next = document.createElement('button');
  next.textContent = 'Next →';
  next.disabled = itemCount < limit;
  next.addEventListener('click', onNext);
  const info = document.createElement('span');
  info.className = 'page-info';
  info.textContent = `Showing ${offset + 1}–${offset + itemCount}`;
  pag.append(prev, info, next);
  return pag;
}

// Resource attribute sort — replaces 3 identical inline blocks
export function sortByResourceAttr(items, attr) {
  if (!attr) return items;
  return [...items].sort((a, b) => {
    const va = String((a.resource_attributes || {})[attr] ?? '');
    const vb = String((b.resource_attributes || {})[attr] ?? '');
    return va.localeCompare(vb);
  });
}

// API response normalization — replaces 4+ inline patterns
export function normalizeResponse(data, primaryKey) {
  if (Array.isArray(data)) return data;
  return data[primaryKey] || data.items || data.data || [];
}

// Status badge — moved from traces.js; consistent with severityBadge
export function statusBadge(status) {
  const s = String(status).toUpperCase();
  if (s === 'ERROR' || s === '2') return `<span class="badge badge-error">ERROR</span>`;
  if (s === 'OK'    || s === '1') return `<span class="badge badge-info">OK</span>`;
  return `<span class="badge badge-debug">UNSET</span>`;
}

// Field accessors — replaces scattered fallback chains
export function getServiceName(item) { return item.service_name || item.service || ''; }
export function getTimestamp(item)   { return item.timestamp || item.time_unix_nano || ''; }
```

---

## 9. Verification Checklist

| Check | Command / Action |
|---|---|
| All Go services compile | `go build ./...` in each service directory |
| No new Go dependencies | `go mod tidy` produces no diff |
| Frontend loads all views | `make up` → `http://localhost:1337` → all four tabs render |
| Pagination works end-to-end | Advance past page 1 on Logs, Metrics, Traces |
| API error surfaces correctly | Kill ClickHouse → hit a GET endpoint → expect JSON error body (not 200 with truncated payload) |
| No regressions in signal routing | `make test-telemetry` → Grafana shows ingested logs/metrics/traces |
| `package.json` unchanged | `git diff -- frontend/package.json` is empty |

---

*Review generated: 2026-06-07*
