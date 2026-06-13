# Phora — Build Plan (Phase 0)

Synthesized from the six integration briefs in `docs/briefs/`. This is the
architecture of record: data model, contracts and chains, API routes, component
structure, and the feasibility flags that decide what we cut under time pressure.
Read the briefs for the exact API surface and reference-check steps per integration.

> **Cut line (from CLAUDE.md):** spine demoable by 7 PM Saturday. The spine is the
> MVP below. The agent slice, Ledger, and the richer Allium/SQL paths are stretch.
> Everything in this plan is tagged **[spine]**, **[stretch]**, or **[optional]**.

---

## 0. The thesis in one line

One human (World ID) → one permanent registry entry → a set of time-scoped,
wallet-signed attestations → surfaced as ENS (soulbound where permanence matters) →
rendered as one consent-gated behavioral profile (Allium). Phora records and
discloses; it computes no score.

The **unforgeable core** is the per-wallet signature over a canonical attestation
statement: anyone can re-verify it without trusting Phora. The **undeletable
surface** is the soulbound ENS subname. The off-chain registry is the fast,
queryable index that ties them together and enforces consent.

---

## 1. Registry data model

Primary store: **Postgres** (Neon or Vercel Postgres — serverless-compatible, since
the Dynamic prize requires a deployed app judges can use). ORM: **Drizzle** for typed
schema + migrations. Local-dev fallback: SQLite via `better-sqlite3` (note: not
Vercel-serverless compatible, local only).

Append-only is enforced in application logic and by convention: attestations and
audit rows are never UPDATEd or DELETEd; corrections are new rows (disputes are
annotations, never deletions — load-bearing for the commitment thesis).

```
identities                         -- the "one human, one entry" anchor
  id                  uuid pk
  world_id_nullifier  numeric(78,0) UNIQUE NOT NULL   -- World ID 4.0 nullifier
  verification_level  text NOT NULL                   -- 'orb' (required for the guarantee)
  dynamic_user_id     text UNIQUE NOT NULL            -- Dynamic JWT `sub`
  ens_name            text                            -- e.g. alice.phora.eth (the mutable label)
  created_at          timestamptz NOT NULL

attestations                       -- append-only; one row per (wallet, window)
  id                  uuid pk
  identity_id         uuid fk -> identities
  wallet_address      text NOT NULL                   -- lowercase (Allium + ENS convention)
  chain_hint          int                             -- informational; EIP-191 sig is chain-agnostic
  window_start        timestamptz NOT NULL
  window_end          timestamptz NULL                -- NULL = open window (still controlled)
  statement           text NOT NULL                   -- canonical signed message (human-readable)
  statement_hash      text NOT NULL                   -- keccak256 of statement
  signature           text NOT NULL                   -- wallet's EIP-191 sig (the unforgeable commitment)
  ens_subname         text                            -- wallet-<addr>.alice.phora.eth
  subname_token_id    text                            -- ERC-721 id on Durin L2 (if soulbound subname minted)
  status              text NOT NULL DEFAULT 'active'  -- 'active' | 'disputed'
  created_at          timestamptz NOT NULL

dispute_annotations                -- never delete an attestation; annotate it
  id                  uuid pk
  attestation_id      uuid fk -> attestations
  reason              text NOT NULL
  disclosed_by_owner  bool NOT NULL                   -- owner-initiated vs flagged
  created_at          timestamptz NOT NULL

consent_grants                     -- scoped, revocable disclosure authorizations
  id                  uuid pk
  identity_id         uuid fk -> identities
  grantee             text NOT NULL                   -- verifier address or agent address/ENS
  grantee_type        text NOT NULL                   -- 'verifier' | 'agent'
  scopes              jsonb NOT NULL                  -- { layers:[], chains:[], windows:[], walletIds:[] }
  granted_at          timestamptz NOT NULL
  expires_at          timestamptz NOT NULL
  eip712_signature    text                            -- Ledger-signed ConsentGrant (clear-signed)
  revoked_at          timestamptz NULL
  status              text NOT NULL DEFAULT 'active'  -- 'active' | 'revoked' | 'expired'

access_log                         -- the who-queried-what audit dashboard
  id                  uuid pk
  identity_id         uuid fk -> identities
  grant_id            uuid fk -> consent_grants NULL
  queried_by          text NOT NULL
  query_type          text NOT NULL                   -- 'profile' | 'transactions' | 'positions' | 'holdings'
  scope_snapshot      jsonb NOT NULL                  -- exactly what was disclosed for this query
  x402_paid           bool NOT NULL DEFAULT false
  x402_tx_hash        text NULL
  created_at          timestamptz NOT NULL

agents                             -- [stretch] human-backed agent registrations
  id                  uuid pk
  identity_id         uuid fk -> identities           -- the human backing this agent
  agent_wallet        text NOT NULL                   -- Dynamic server wallet address
  agentbook_tx_hash   text                            -- World Chain registration tx
  ens_subname         text                            -- agent.alice.phora.eth (ENSIP-26 records)
  free_trial_limit    int NOT NULL DEFAULT 3
  created_at          timestamptz NOT NULL

agent_usage                        -- [stretch] backs the AgentKitStorage interface (survives restarts)
  endpoint            text NOT NULL
  human_id            text NOT NULL                   -- AgentBook-resolved nullifier hash
  used                int NOT NULL DEFAULT 0
  PRIMARY KEY (endpoint, human_id)

used_nonces                        -- [stretch] x402 / AgentKit replay defense
  nonce               text pk
  recorded_at         timestamptz NOT NULL
```

Notes:
- `world_id_nullifier` is `UNIQUE` — this column **is** the "one human, one entry,
  ever" guarantee. A second registration with the same nullifier hits the unique
  constraint and is rejected (409). See feasibility flag F9 on 4.0 nullifier
  determinism.
- `signature` + `statement` together are independently verifiable: `ecrecover` over
  the EIP-191 hash of `statement` must equal `wallet_address`. This is what makes
  shown history unforgeable without trusting Phora's DB.
- Consent scoping is the gate for every Allium call. The `access_log` row is written
  on every disclosure and is the audit trail the owner sees.

---

## 2. Contracts and target chains

We author **one** contract (a soulbound Durin registrar — and even that has a
no-contract fallback). Everything else is an already-deployed address we call.

| Component | Address | Chain | We author? |
|---|---|---|---|
| World ID managed RP | `rp_4571868f9e535bb7` (HTTP verify, no contract call) | World infra | No |
| ENS Registry | `0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e` | Sepolia (11155111) | No |
| ENS ETHRegistrarController | `0xfb3cE5D01e0f33f41DbB39035dB9745962F1f968` | Sepolia | No |
| ENS PublicResolver | `0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5` | Sepolia | No |
| ENS NameWrapper (soulbound L1 path) | `0x0635513f179D50A207757E05759CbD106d7dFcE8` | Sepolia | No |
| ENS ReverseRegistrar | `0xA0a1AbcDAe1a2a4A2EF8e9113Ff0e02DD81DC0C6` | Sepolia | No |
| Durin L2RegistryFactory | `0xDddddDdDDD8Aa1f237b4fa0669cb46892346d22d` | Base Sepolia (84532) | No |
| Durin L1Resolver | deployed per parent name | Sepolia | Config only |
| **Soulbound L2Registrar** | **custom (~50 lines Solidity)** | **Base Sepolia** | **Yes [stretch]** |
| AgentBook | `0xA23aB2712eA7BBa896930544C7d6636a96b944dA` | World Chain mainnet (480) | No |
| USDC (x402 settlement) | `0x79A02482A880bCE3F13e09Da970dC34db4CD24d1` | World Chain mainnet (480) | No |

**Chain decisions:**
- **ENS lives on Sepolia using the ENSv1-compatible contracts above**, not ENSv2.
  ENSv2 on Sepolia is a true-alpha moving target with undisclosed addresses (F3). The
  CLAUDE.md "ENSv2 on Sepolia" goal is reframed as: ENSv1 Sepolia contracts +
  Durin-on-L2, which is what actually resolves in ENS-aware clients today.
- **Durin subnames live on Base Sepolia (L2)**, resolved to Sepolia L1 via CCIP-Read.
- **Soulbound**: lead with the **Name Wrapper `CANNOT_TRANSFER` fuse on L1** (no custom
  contract, lowest demo risk) for the "Most Creative — soulbound attestations"
  narrative. The custom soulbound L2Registrar is the more impressive but riskier
  stretch. Pick one; do not block the spine on either.
- **The agent slice is the only thing touching World Chain mainnet** (AgentBook +
  x402). It is entirely gated behind the Saturday checkpoint (F2).

---

## 3. API routes (App Router route handlers)

All World ID verification, JWT verification, Allium calls, and the RP signing key
stay server-side. The Allium and World signer keys never reach the client.

**Identity & auth [spine]**
- `GET  /api/rp-context` — server signs a World ID 4.0 RP context with `RP_SIGNING_KEY`
  (fresh nonce + TTL per request). Returns `{ rp_id, nonce, created_at, expires_at, signature }`.
- `POST /api/identity/register` — body = IDKit proof result. Verifies the Dynamic JWT
  (`sub`), POSTs the proof to `https://developer.world.org/api/v4/verify/rp_4571868f9e535bb7`,
  checks the nullifier against `identities`/`used_nullifiers`, inserts the identity.
  Rejects duplicates (409).
- `GET  /api/identity/me` — current user's identity + attestations (JWT-gated).

**Attestation [spine]**
- `POST /api/attestations` — body = `{ wallet_address, signature, window_start, window_end? }`.
  Server rebuilds the canonical `statement`, `ecrecover`s the signature, confirms it
  equals `wallet_address`, appends the attestation. Optionally triggers ENS subname mint.
- `POST /api/attestations/:id/dispute` — append a `dispute_annotation` (never deletes).

**Consent & audit [spine for grant/revoke + log; Ledger signing is stretch]**
- `POST /api/consent/grants` — create a grant; stores scopes + optional Ledger EIP-712 sig.
- `POST /api/consent/grants/:id/revoke` — set `revoked_at`/`status`.
- `GET  /api/consent/grants` — list grants for the owner.
- `GET  /api/audit/log` — who-queried-what for the owner.

**Profile (Allium) [spine]**
- `GET  /api/profile/:identity` — the consent-gated unified profile. Resolves the
  caller's persona/grant, intersects requested scope with granted scope **and** with
  attested windows, then calls Allium server-side. Writes an `access_log` row.
  - holdings: `/wallet/balances` (open) · `/wallet/balances/history` (closed, server-bounded by t0/t1)
  - transactions: `/wallet/transactions` + **mandatory** client-side [t0,t1] truncation
    for open windows; **Explorer SQL** `<chain>.raw.transactions WHERE block_timestamp`
    for closed windows (F7 — the REST tx endpoint has no time filter, so SQL is the
    only safe path for closed windows).
  - positions + health factor: `/wallet/positions` (live only; native `health_factor`).
    Closed-window positions are **not** available via REST → display "historical
    positions unavailable for closed windows" rather than wrong data (F7).

**Agent (x402-gated) [stretch]**
- `GET  /api/agent/profile/:identity` — same profile data, wrapped in AgentKit hooks +
  x402 middleware. Free-trial quota per human-backed agent, then `$0.01` USDC on World Chain.
- `POST /api/agent/register` — Dynamic server wallet → AgentBook registration →
  ENS subname + ENSIP-26 records.

**Ledger [stretch]**
- `GET  /api/ledger/erc7730/ConsentGrant` — serves the ERC-7730 descriptor for the
  custom context module (the reliable Clear Signing path; avoids the registry PR and
  the `originToken` requirement).

---

## 4. Component structure — persona switcher as the app shell

The persona switcher is the top-level chrome. A `PersonaContext` holds the current
persona (`owner | lenderA | lenderB | agent`) and, for non-owner personas, the active
consent grant. Every data view reads persona + grant to decide what is visible — this
is how we demo "what each party can and cannot see" from one screen.

```
app/
  layout.tsx                 -- RootLayout -> Providers
  providers.tsx              -- 'use client': DynamicContextProvider + Wagmi + QueryClient + PersonaProvider
  page.tsx                   -- landing / identity dashboard
  globals.css

  identity/page.tsx          -- [spine] register: Dynamic auth + World ID (WorldIdButton)
  wallets/page.tsx           -- [spine] link wallets, sign attestations, view windows
  profile/[identity]/page.tsx-- [spine] unified Allium profile, filtered by persona+grant
  consent/page.tsx           -- [spine] grant/revoke; [stretch] Ledger consent on Flex
  audit/page.tsx             -- [spine] who-queried-what
  agent/page.tsx             -- [stretch] agent registration, free-trial gate demo, KYA handshake

components/
  shell/PersonaSwitcher.tsx  -- the app-chrome toggle (owner / Lender A / Lender B / agent)
  shell/PersonaBadge.tsx     -- shows active persona + what scope it sees
  world/WorldIdButton.tsx    -- IDKitRequestWidget; calls /api/rp-context then /api/identity/register
  attest/AttestWalletButton.tsx -- requests a signature from a specific linked wallet (Dynamic)
  ledger/LedgerConsentButton.tsx -- dynamic import { ssr:false }; DMK signTypedData(ConsentGrant)
  ens/SubnameCard.tsx        -- attestation subname + text records
  profile/ProfileView.tsx, PositionCard.tsx, TxList.tsx, HoldingsChart.tsx

lib/
  db/                        -- drizzle schema + client
  world/                     -- rp-sign (server), verify (server)
  dynamic/                   -- jwt verify (jose + JWKS)
  ens/                       -- ensjs/viem helpers (register, subname, text records, reverse)
  allium/                    -- REST client + Explorer SQL client + window-bounded query builders
  agentkit/                  -- [stretch] storage adapter (Postgres) + hooks
  ledger/                    -- [stretch] DMK provider, custom context module, erc7730 descriptor
  consent/                   -- EIP-712 ConsentGrant types + scope intersection logic
```

`PersonaContext` boundary: the owner persona sees everything (all attestations, all
windows, the audit log, dispute controls). Lender A / Lender B each see only the
intersection of their consent grant's scope with the attested windows. The agent
persona sees the x402-gated subset and surfaces the free-trial counter. Switching
persona never refetches with elevated privileges — each persona's view is computed
from its own grant server-side, so the switcher is an honest demonstration, not a
client-side mask.

---

## 5. Environment variables (`.env.local`, gitignored)

```
# World ID
NEXT_PUBLIC_WORLD_APP_ID=app_11e8bf4c2d9b3a8ef28e0c805e08c14c
NEXT_PUBLIC_WORLD_RP_ID=rp_4571868f9e535bb7
WORLD_RP_SIGNING_KEY=0x...            # secret; signer addr 0xba569038966Ae11a3B0d176D80ffe34f4D36a21E
# Dynamic
NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID=...
DYNAMIC_API_TOKEN=...                 # secret; server wallet auth (agent slice)
AGENT_WALLET_PASSWORD=...             # secret; encrypts server-wallet key share
# Allium
ALLIUM_API_KEY=...                    # secret; server-side only
# RPC
SEPOLIA_RPC_URL=...
BASE_SEPOLIA_RPC_URL=...
WORLDCHAIN_RPC_URL=...                # agent slice only
# DB
DATABASE_URL=postgres://...
```

---

## 6. Build order mapped to the checkpoint

1. **Spine [must, by 7 PM Sat]:** Dynamic auth → World ID register (server verify +
   nullifier dedup) → attestation registry (wallet-signature linking + windows) → ENS
   name + per-wallet subnames with text records → Allium unified profile. Persona
   switcher as the shell from the start.
2. **Consent & audit [spine]:** grant/revoke with scopes, who-queried-what dashboard,
   dispute flags, persona switcher fully wired.
3. **Agent slice [stretch]:** agent registration (ENS subname + ENSIP-26, delegated
   World ID via AgentKit, Dynamic server wallet), x402 free-trial gate, KYA handshake.
4. **Ledger [stretch]:** ConsentGrant clear-signed on the Flex via a custom context module.
5. **Package:** chaptered video, README (threat model + non-goals), submission.

---

## 7. Feasibility flags (solo, time-boxed)

**F1 — Which ETHGlobal event? (resolve first.)** The briefs disagree: the Dynamic and
World-ID briefs cite **ETHGlobal New York 2026** (World Track B $2,500; Dynamic "Best
Agentic Build" / "Best Money App" $2,000 each; no "Best Overall"), while the AgentKit
and Ledger briefs cite **ETHGlobal Cannes** (World Track A/B $8,000 each; Ledger Clear
Signing $4k + Hardware $5k). Prize amounts and exact track wording differ by event.
CLAUDE.md names the partners but not the event. **Confirm the event before relying on
any dollar figure or track requirement.** The integration work is the same either way;
only the prize framing changes.

**F2 — World Chain mainnet is the agent slice's hard dependency.** No testnet AgentBook
exists (UNCONFIRMED but undocumented). Registration requires the operator (Justin) to
scan a QR with an **orb-verified World App** and a few dollars of bridged World Chain
ETH/USDC. This cannot be faked or deferred to demo morning. Gate the whole agent slice
behind the spine checkpoint; for local dev, mock `createAgentBookVerifier`.

**F3 — ENSv2 on Sepolia is alpha with undisclosed addresses.** Do not put ENSv2-native
contracts on the demo critical path. Use the ENSv1 Sepolia contracts (Section 2) +
Durin. Reframe the CLAUDE.md "ENSv2" goal accordingly and say so to judges.

**F4 — Soulbound subnames cost either a contract or a wrapping step.** Custom soulbound
L2Registrar (~50 lines, deploy + verify on Base Sepolia, ~2h) **or** Name Wrapper
`CANNOT_TRANSFER` fuse on L1 (no custom contract). Recommend the fuse path for the
spine; treat the custom registrar as a stretch flourish.

**F5 — CCIP-Read gateway reliability for the demo.** Durin subname resolution depends on
a CCIP-Read gateway. A dead gateway = failed live resolution. Mitigate: run the gateway
locally or use Namestone's hosted tier; have a screen-recording fallback.

**F6 — Ledger needs physical hardware for the full story.** Speculos cannot render
ERC-7730 Clear Signing, only transparent (level-2) struct fields. The full level-3
"Grant history access" screen requires a real Flex. The custom context module avoids
the registry-PR and `originToken` blockers, but not the hardware. **Confirm a Flex is
on hand**; otherwise the Ledger demo floor is Speculos transparent signing.

**F7 — Allium time-bounding gaps are a consent-correctness issue, not just convenience.**
The `/wallet/transactions` REST endpoint has **no time filter** — for closed windows we
**must** use Explorer SQL (`<chain>.raw.transactions` with a `BLOCK_TIMESTAMP` clause)
or we risk disclosing activity outside an attested window. Historical DeFi positions /
health factors for closed windows are effectively unavailable via REST; show an explicit
"unavailable for closed windows" state rather than silently omitting or showing live data.

**F8 — Allium hackathon tier / rate limits UNCONFIRMED.** Confirm the API key, Developer
Unit budget, and Explorer SQL credits early (contact hello@allium.so). Run the
reference-check calls in the Allium brief against a known wallet before building on it.

**F9 — World ID 4.0 nullifier determinism UNCONFIRMED.** Unclear whether the same
(user, app, action) always yields the same nullifier in 4.0 or a fresh one per proof.
Mitigation: store consumed nullifiers, enforce the `UNIQUE` constraint, and treat the
server's `nullifier_replayed` error as the authoritative duplicate signal. Verify with a
double-proof test (Step 5 of the World brief) before trusting nullifier equality.

**F10 — Two UNCONFIRMED package names.** (a) World server-side signing import is
`@worldcoin/idkit-server` **or** the `@worldcoin/idkit-core/signing` subpath — check npm
before wiring the RP-context route. (b) The `@x402/*` package names for the AgentKit
middleware need an install-time check. The scaffold install step doubles as this check.

**F11 — ENS CLI (Greg Skril preview tool) NOT identified.** The hard-requirement search
did not confirm a specific gskril npm CLI. Closest finds: `tools.ens.xyz` (v3xlabs web
tool, usable for manual name verification) and `ens-widgets` (gskril npm React
component). **Reported as UNCONFIRMED** — if Justin has the exact name, supply it.

**F12 — Scope realism.** Four layers + agent + Ledger + persona switcher + audit is a lot
for one builder. The plan tags everything spine/stretch/optional precisely so the
Saturday checkpoint has a clean cut line: if the spine slips, we ship a tighter
human-only build that still covers World Track B and the ENS tracks (per CLAUDE.md).
