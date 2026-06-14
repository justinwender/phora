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

### Step 1 — Auth (Dynamic)

| Work | Author | Notes |
|---|---|---|
| Direction: auth-only first, verify the JWT server-side, reference-check by signing in | Justin | Scoped the unit; reviews + commits |
| Dynamic sign-in wiring + server-side JWT verification (JWKS, RS256) | Delegated | Caught a real bug — token issuer is `app.dynamicauth.com`, not `app.dynamic.xyz`; fixed and verified by signing in |

### Step 2 — Uniqueness (World ID 4.0)

| Work | Author | Notes |
|---|---|---|
| Direction: build the RP-signature route first, strict one-human-one-entry, gate on a real proof + duplicate rejection | Justin | Scoped the unit; decided the live-persist-then-revert approach for the demo action |
| World ID verify route + RP-signature route; nullifier persistence | Delegated | Server-side proof verification; uniqueness enforced at the protocol (replay) and a DB `UNIQUE` constraint |
| Neon Postgres + Drizzle, hardened (provenance-checked) install | Delegated | Justin flagged the supply-chain concern; install pinned + script-free |

### Step 3 — Commitment (the attestation registry)

| Work | Author | Notes |
|---|---|---|
| Direction: schema/migration as its own unit; wallet-signed links, identity-authorized unlink, append-only hash chain, disputes annotate | Justin | Authored the threat-model intent (sever a stolen wallet without its key) |
| Append-only hash-chained event log (`link`/`unlink`/`dispute`), EIP-191 link statements, Postgres append-only trigger, `verifyChain` | Delegated | Reference-checked end to end |

### Step 4 — Addressing (ENS offchain resolver)

| Work | Author | Notes |
|---|---|---|
| Direction: offchain CCIP-Read resolver as a live projection of the registry; consent-gating intrinsic; reference-gate the resolution | Justin | Chose the resolver design over the brief's L2 approach; provided the dev key |
| `PhoraOffchainResolver.sol` (EIP-3668), the signing gateway, deploy + seed/resolve demo scripts | Delegated | Deployed on Sepolia; consent-gating shown (resolve before/after an unlink) |
| Decision to **stop the v1 controller hunt** and defer `phora.eth` registry binding (Sepolia mid-v2-migration) | Justin | Diagnosis confirmed the registrar is unauthorized mid-migration; called the cut |

### Rendering (Allium)

| Work | Author | Notes |
|---|---|---|
| Direction: dossier route + lender view; render all position types; **IP fence** — raw data only, no score/grade/rating | Justin | Set the boundary: raw sums OK, derived scores NOT; `health_factor` is the protocol's own number |
| `/api/dossier` (Allium positions, cursor-following, 429 backoff) + lender dossier UI | Delegated | Reference-checked against two real wallets; renders LP + staking with real data |

### Step 5 — Packaging

| Work | Author | Notes |
|---|---|---|
| README brought current: implementation status + threat model | Delegated | Honest about the ENS v1 deferral and the internal-only hash chain |
| Demo video script (kept local / gitignored) | Delegated | Chaptered recording guide; Justin records |
| This log, brought current | Delegated | Granular per the eligibility rule |

_Update this log as work proceeds. Keep entries granular._
