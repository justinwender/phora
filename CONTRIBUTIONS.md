# Contributions

This file tracks what **Justin Wender** authored directly versus what was delegated to
an AI coding agent (Claude Code) under Justin's direction. It is kept current per the
hackathon's eligibility rules: authorship is transparent, work is committed in granular
logical units (never one large batch), and Justin reviews and commits every change
himself.

## Authorship model

- **Justin** sets direction, makes architectural and product decisions, reviews all
  output, and runs every `git commit` himself.
- **Claude Code** performs delegated research, drafting, and scaffolding as instructed.
- Load-bearing logic (World ID verification, the attestation registry, the consent
  model) is authored to be understood by Justin well enough to explain to judges —
  clarity over cleverness there.

## Log

### Phase 0 — context, plan, scaffold

| Work | Author | Notes |
|---|---|---|
| Project thesis, four-layer architecture, non-goals, prize targets, build order (`CLAUDE.md`) | Justin | Source of truth for the project |
| Six integration briefs (`docs/briefs/`) | Delegated | Researched against live docs + connected MCPs; Justin reviews |
| Build plan (`docs/plan.md`) — data model, contracts, routes, components, feasibility flags | Delegated | Synthesized from the briefs; Justin reviews before the spine is built |
| Next.js scaffold + hardened, provenance-checked dependency install | Delegated | Exact-pinned, supply-chain-verified; Justin reviews and commits |
| README + this file | Delegated | Stubs to be expanded |

_Update this log as work proceeds. Keep entries granular._
