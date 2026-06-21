# Otel-analyzer

> **BEFORE ANY CODE CHANGE — START WITH THE ORCHESTRATOR.**
> Every change (feature, fix, refactor, docs) MUST be initiated by invoking the
> `orchestrator` agent via the Agent tool. Do **not** edit files inline, skip the
> planner, or skip the reviewer's pre-code tests. Direct edits by the main model or
> any non-coder agent are policy violations. If you're about to change a file and no
> orchestrator run is in progress, stop and spawn the orchestrator instead.

## Agent System

| Agent        | Model             | Role                          | Can Edit Source |
|--------------|-------------------|-------------------------------|-----------------|
| orchestrator | claude-opus-4-8   | Coordinates all work          | No              |
| planner      | claude-sonnet-4-6 | Writes phase plans            | No              |
| coder        | claude-sonnet-4-6 | Sole implementer              | Yes             |
| reviewer     | claude-sonnet-4-6 | Writes tests + validates      | No              |

## Workflow

Every request that changes code flows through the orchestrator:

1. **Plan** — orchestrator invokes planner → `.claude/plans/<slug>.md`
2. **Test** — orchestrator invokes reviewer (MODE 1) → test files to `.claude/tests/<phase>/`
3. **Code** — orchestrator invokes coder → implementation until tests pass
4. **Review** — orchestrator invokes reviewer (MODE 2) → `APPROVED` or `BLOCKED`

BLOCKED verdicts are non-overridable. The orchestrator re-tasks the coder with the
reviewer's findings. After 3 consecutive BLOCKED verdicts on the same issue, the
orchestrator halts and surfaces to the user.

## Plans

Location: `.claude/plans/<slug>.md`
Only the planner writes plan files. Naming: `<verb>-<noun>-<context>.md`.

## Tests

Location: `.claude/tests/<phase>/`
Only the reviewer writes pre-code tests. Tests must be runnable but failing before coding begins.

## Project: Otel-analyzer

A self-hosted OpenTelemetry ingestion, storage, and analysis platform. Stack:

- **Backend**: Go — `backend-gateway`, `backend-ingester`, `backend-api` (Chi router)
- **Message broker**: Redpanda (Kafka-compatible), 4 partitions per topic
- **Storage**: ClickHouse — MergeTree / ReplacingMergeTree, Map columns for attributes
- **Frontend**: Vanilla JS SPA served via nginx on `:1337`
- **Observability**: Prometheus (scrape targets: `:9090`, `:9091`, `:9093`) + Grafana `:3000`
- **Runtime**: Docker Compose (`make up`)

Signal flow: OTLP → gateway → Redpanda → ingester → backend-api → ClickHouse → frontend

## OTel Requirements

Every component boundary must have:
- A span with `service.name`, operation name (`<service>.<operation>`), error recording, and correct status codes
- A latency histogram for I/O or business operations (`<service>.<operation>.duration_ms`)
- Structured logs with `trace_id` and `span_id` correlation
- Semantic conventions only — no invented attribute names
- Bounded metric cardinality — no user IDs or high-cardinality values as labels

## Coding Standards

- Surgical changes only — no speculative abstractions
- Validate only at system boundaries (user input, external APIs)
- No comments unless the WHY is non-obvious
- Tests are run with `go test ./...` from the relevant service directory

## Skills

| Skill | Path | Trigger |
|---|---|---|
| opentelemetry-skill v1.4.1 | `.claude/skills/opentelemetry-skill/SKILL.md` | Collector config, pipeline design, instrumentation, sampling, cardinality, security, OTTL, AI agent observability |
