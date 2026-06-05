# Otel-analyzer

OpenTelemetry analysis tooling. This repo uses a multi-agent architecture where specialized agents each own a distinct responsibility.

## Agent Architecture

Agents live in `agents/`. Each agent has its own markdown file defining its role, constraints, and interaction protocol.

| Agent | File | Role |
|---|---|---|
| Orchestrator | `agents/orchestrator.md` | Entry point — decomposes tasks, launches subagents, synthesizes results |
| Planner | `agents/planner.md` | Feature planning, repo structure, implementation ordering |
| Master Coder | `agents/master-coder.md` | All code implementation |
| Code Reviewer | `agents/code-reviewer.md` | Reviews code quality, correctness, and standards compliance |
| Observability Guru | `agents/observability-guru.md` | OTel/observability authority — consults official sources |

## Workflow

1. User gives a task to the **Orchestrator**.
2. Orchestrator consults the **Planner** for an implementation plan.
3. Orchestrator delegates coding tasks to **Master Coder**.
4. Orchestrator delegates review to **Code Reviewer**.
5. For any OTel-specific questions or decisions, the **Observability Guru** is consulted.

## Skills

| Skill | Path | Trigger |
|---|---|---|
| opentelemetry-skill v1.4.1 | `.claude/skills/opentelemetry-skill/SKILL.md` | Collector config, pipeline design, instrumentation, sampling, cardinality, security, OTTL, AI agent observability |

The skill includes 14 reference documents under `.claude/skills/opentelemetry-skill/references/` that are loaded on demand based on trigger keywords (see `SKILL.md` for the routing table).

Source: [o11y-dev/opentelemetry-skill](https://github.com/o11y-dev/opentelemetry-skill) — Apache-2.0

## Conventions

- No agent that does not have "coder" in its name should write or modify code.
- The Planner and Observability Guru produce written output only (plans, advice, recommendations).
- The Code Reviewer produces written findings only — it never patches files.
- The Orchestrator coordinates but does not implement.
