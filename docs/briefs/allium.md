# Allium Integration Brief

**Purpose:** Render the attested wallet set as a unified behavioral profile — holdings,
transactions, and DeFi positions — bounded strictly to each attestation window [t0, t1].

---

## Two Surfaces

### 1. Realtime / Developer REST API

Base URL: `https://api.allium.so`  
Auth: `X-API-KEY: <key>` request header (server-side only, never exposed to client).  
Data freshness: p50 **3–5 seconds** behind chain head.  
Use for: live open-window data (current balances, current positions) and historical
token-by-token balance changes within a time range.

### 2. Explorer SQL (Async Query API)

Endpoint: `POST https://api.allium.so/api/v1/explorer/queries/{query_id}/run-async`  
Snowflake-backed. Submit a saved query → poll status → fetch results.  
Max rows: 250,000 per run.  
Use for: closed-window transaction history with precise `block_timestamp` bounds, any
aggregation across wallets, and data that REST endpoints cannot time-bound server-side.

---

## Profile Components — Exact Endpoints & Tables

### A. Holdings / Token Balances

#### Current (open window)
`POST https://api.allium.so/api/v1/developer/wallet/balances`  
- Request body: array of `{ chain, address }`, up to **100** pairs per call.  
- Returns: per-token `raw_balance`, `block_timestamp`, token metadata with current `price`.  
- Time-window bounding: **none available** — always returns latest. For an open window
  this is correct. **WARNING: do not use for closed windows** (wallet may have moved
  tokens after t1); use historical endpoint or SQL instead.  
- Supported chains (confirmed from MCP): ethereum, base, arbitrum, avalanche, bsc,
  celo, optimism, polygon, solana, unichain, x_layer, hyperevm, near, stellar,
  bitcoin. **worldchain is NOT listed** for this endpoint (see §Chain Coverage).

#### Historical (closed window — balance changes within [t0, t1])
`POST https://api.allium.so/api/v1/developer/wallet/balances/history`  
- Request body: `{ start_timestamp, end_timestamp, addresses[] }` (ISO 8601 UTC).  
  Max **5** addresses per call.  
- Returns: every on-chain balance change event within the window, not a point-in-time
  snapshot. Each item has `block_timestamp` for precise filtering.  
- Time-window bounding: **server-side via `start_timestamp` / `end_timestamp`** — fully
  bounded. Use these to match attestation window exactly.  
- Supported chains (confirmed): ethereum, base, arbitrum, avalanche, blast, celo,
  optimism, polygon, solana, unichain, worldchain, zora, zksync, soneium, bitcoin,
  near, x_layer. **worldchain IS covered here.**  
- Pagination: `limit` (max 5000, default 1000) + opaque `cursor`.

#### Aggregated USD holdings over time (portfolio curve)
`POST https://api.allium.so/api/v1/developer/wallet/holdings/history`  
- Params: `start_timestamp`, `end_timestamp`, `granularity` (15s/1m/5m/1h/1d),
  `addresses[]`, optional `include_token_breakdown`.  
- Time-window bounding: **server-side via `start_timestamp` / `end_timestamp`**.  
- Supported chains (confirmed): ethereum, base, worldchain, arbitrum, avalanche, bsc,
  blast, celo, optimism, polygon, solana, unichain, zora, zksync, soneium, x_layer,
  hyperevm, monad, bitcoin.  
- **NOTE:** Holdings API overview states full chain list is Bitcoin + Solana with "more
  chains coming soon" — the chain support map from `realtime_get_supported_chains`
  shows a wider list. Treat worldchain as UNCONFIRMED for `/holdings/history` until
  verified with a live call.

---

### B. Transactions

#### Realtime endpoint (open window, recent history)
`POST https://api.allium.so/api/v1/developer/wallet/transactions`  
- Request body: array of `{ chain, address }`, up to **20** pairs per call.  
- Returns: enriched transactions with `block_timestamp`, asset transfers, and labeled
  activities (dex_trade, asset_bridge, nft_trade, lp mint/burn, etc.).  
- **No timestamp filter parameters exist on this endpoint.** Returns most-recent
  transactions up to `limit` (max 1000, default 25), paginated by opaque `cursor`.  
- Time-window bounding: **NONE server-side.** Must paginate until `block_timestamp <
  t0` and filter client-side. This is a hard constraint — **all transaction display for
  Phora must enforce the [t0, t1] window by discarding records outside it after
  fetching.** For long closed windows this will be expensive to paginate; use SQL
  instead.  
- Supported chains (confirmed): ethereum, base, worldchain, arbitrum, avalanche, bsc,
  celo, optimism, polygon, solana, unichain, bitcoin, stellar, near, x_layer, hyperevm,
  monad. Also abstract_testnet.

#### Explorer SQL (closed window, bounded, preferred for historical)
Tables (Snowflake): `ethereum.raw.transactions`, `base.raw.transactions`,
`worldchain.raw.transactions` — all confirmed to exist.  
Schema key columns: `FROM_ADDRESS`, `TO_ADDRESS`, `BLOCK_TIMESTAMP` (clustered
partition key — **always include in WHERE clause**), `HASH`, `BLOCK_NUMBER`,
`RECEIPT_STATUS`.  
Time-window bounding: **`WHERE BLOCK_TIMESTAMP >= t0 AND BLOCK_TIMESTAMP < t1`** —
fully server-side, efficient because `BLOCK_TIMESTAMP::date` is the cluster key.  
Multi-wallet: `WHERE FROM_ADDRESS IN (lower(w1), lower(w2), ...)` — fan-out not
required, single query can cover all attested wallets.  
EVM address format: always **lowercase** in Allium tables.  
Async pattern: `POST /api/v1/explorer/queries/{id}/run-async` → poll
`GET /api/v1/explorer/queries/{id}/runs/{run_id}/status` → fetch
`GET /api/v1/explorer/queries/{id}/runs/{run_id}/results`.

---

### C. DeFi Positions with Health Factors

`POST https://api.allium.so/api/v1/developer/wallet/positions`  
- Request body: array of `{ chain, address }`, up to **5** pairs per call.  
- Returns: flat array of typed positions — `LP`, `lending`, `staked`, `regular`,
  `perps`, `vault`.  
- **Health factor is returned natively** on `lending` positions: field
  `health_factor: string | null` (e.g. `"1.85"`). Below 1.0 = liquidatable. Confirmed
  present for Aave V3 and Compound V3. No join or computation required.  
- Lending positions include: `supplies[]`, `borrows[]`, `collateral[]`, each with
  token metadata and USD value. Protocol is labeled (e.g. `"aave_v3"`).  
- LP positions include: `in_range`, `fee_tier`, `unclaimed_fees_usd`.  
- Time-window bounding: **NONE.** This endpoint is always "current state." For closed
  attestation windows (wallet detached), health factor and position data are not
  available historically via this REST endpoint. Historical lending state requires
  Explorer SQL (see tables `base.lending.loans`, `ethereum.lending.loans`,
  `arbitrum.lending.loans`, etc. — confirmed to contain Aave v1/v2/v3 + Compound
  v2/v3 borrow events; health factor reconstruction from SQL requires computing
  collateral/debt ratio from those tables, which is complex).  
- Supported chains (confirmed): ethereum, base, worldchain, arbitrum, avalanche, bsc,
  celo, optimism, polygon, solana, unichain, x_layer, hyperliquid, monad.  
- Pagination: `limit` (max 100, default 25) + `cursor`.

---

## Multi-Wallet Aggregation

| Endpoint | Max addresses per call | Strategy |
|---|---|---|
| `/wallet/balances` (latest) | 100 | Single call covers full attested set |
| `/wallet/balances/history` | 5 | Fan-out by batches of 5; merge in server |
| `/wallet/transactions` | 20 | Fan-out by batches of 20; merge + sort by timestamp |
| `/wallet/positions` | 5 | Fan-out by batches of 5; merge in server |
| `/wallet/holdings/history` | Multiple (no explicit cap seen; schema allows array) | Single call |
| Explorer SQL | Unlimited | `IN (addr1, addr2, ...)` in WHERE clause |

---

## Time-Window Bounding Summary

| Endpoint | Server-side params | Safe for consent model? |
|---|---|---|
| `/wallet/balances` (latest) | None | Open windows only |
| `/wallet/balances/history` | `start_timestamp`, `end_timestamp` | Yes |
| `/wallet/holdings/history` | `start_timestamp`, `end_timestamp` | Yes |
| `/wallet/transactions` | **None** | **No** — must filter client-side; flag risk |
| `/wallet/positions` | **None** | Current state only; closed windows need SQL |
| Explorer SQL `*.raw.transactions` | `BLOCK_TIMESTAMP` WHERE clause | Yes |
| Explorer SQL `*.lending.loans` | `BLOCK_TIMESTAMP` WHERE clause | Yes (with reconstruction) |

**Critical for Phora:** the transactions REST endpoint has no time filter. Every
rendering path must enforce the attestation window [t0, t1] by truncating results.
Prefer Explorer SQL for closed-window transaction history to avoid client-side leakage
risk.

---

## Chain Coverage (Confirmed)

All three chains Phora requires:

| Chain | chain_id param | `/balances` | `/balances/history` | `/transactions` | `/positions` |
|---|---|---|---|---|---|
| Ethereum mainnet | `ethereum` | ✓ | ✓ | ✓ | ✓ |
| Base | `base` | ✓ | ✓ | ✓ | ✓ |
| World Chain (eip155:480) | `worldchain` | NOT listed | ✓ | ✓ | ✓ |

World Chain is absent from the `/wallet/balances` (latest) endpoint chain map. Use
`/wallet/balances/history` or Explorer SQL `worldchain.raw.transactions` for World
Chain balance and tx data. Holdings/positions on worldchain confirmed supported.

---

## Auth, Limits, and Latency

- **Auth:** `X-API-KEY` header only. One key per account. Keep in `.env.local`.  
- **Rate limits:** UNCONFIRMED (not documented in public docs; contact
  support@allium.so for hackathon tier limits). MCP docs mention up to 1K+ RPS for
  enterprise; assume lower for dev keys.  
- **Developer Units (DU):** each REST API call costs DU (multiplied by number of
  addresses in batch):
  - Wallet transactions: 30 DU
  - Wallet balances (latest or history): 30 DU
  - Holdings history: 30 DU
  - Wallet positions: UNCONFIRMED (not listed in compute-units.md — assume ~30 DU)
  - Prices: 20 DU
- **Latency:** Realtime REST: p50 3–5s data freshness; individual API call latency
  UNCONFIRMED but designed for realtime apps (Phantom uses it for millions of users).
- **Explorer SQL latency:** async; simple bounded queries return in seconds, complex
  aggregations may take 30–120s. Poll `run-async` status endpoint.
- **SQL cost:** UNCONFIRMED specific pricing; contact Allium for Explorer credits on
  hackathon tier.
- **Free / hackathon tier:** UNCONFIRMED. Sign up at app.allium.so; contact
  hello@allium.so for hackathon access.

---

## Gotchas

1. **Transactions endpoint has no time filter.** This is the biggest API gap. For the
   consent model to be safe, use Explorer SQL for any closed attestation window.
   Client-side filtering on the REST response is a fallback only.

2. **`/wallet/balances` (latest) does not cover worldchain.** Use
   `/wallet/balances/history` with `start_timestamp` = t0 and `end_timestamp` = now
   for an open World Chain window.

3. **Historical DeFi position state is unavailable via REST.** The `/positions`
   endpoint is current-only. For closed windows, reconstruct from
   `<chain>.lending.loans` SQL tables (Aave/Compound borrow events exist; health
   factor requires computing collateral/debt ratio which Allium does not pre-compute
   in SQL tables). Recommend noting on the profile that "historical position snapshots
   unavailable" for closed windows rather than silently omitting.

4. **Holdings API overview says "Bitcoin and Solana only."** The `realtime_get_supported_chains`
   map shows worldchain and ethereum in `/wallet/holdings/history`. This discrepancy
   suggests the holdings history endpoint is expanding. Verify with a real call before
   relying on it.

5. **EVM addresses must be lowercase** in SQL `WHERE` clauses (Allium stores them
   lowercase). The REST API accepts mixed case in request bodies but returns lowercase.

6. **Async SQL polling pattern:** `run-async` returns a `run_id` immediately. Poll
   `GET /api/v1/explorer/queries/{id}/runs/{run_id}/status` until status is
   `completed` or `failed`. Then fetch results with pagination (up to 250K rows).
   Build retry/timeout logic into the API route.

7. **Block timestamp clustering:** Snowflake queries on `*.raw.transactions` **must**
   include `WHERE BLOCK_TIMESTAMP >= t0 AND BLOCK_TIMESTAMP < t1` (or
   `::date` variant) to prune partitions. Without it, the query scans 3.5B+ rows.

8. **Data freshness lag:** p50 3–5s for REST; Explorer SQL reflects data at time of
   query submission (also ~5s lag from chain). For open attestation windows, live
   positions and balances are as fresh as the REST endpoints.

---

## Reference-Check Plan

Cheap calls to verify each profile component against the live API. Use a known active
wallet: `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045` (vitalik.eth on Ethereum).

| Component | Call | Expected response shape |
|---|---|---|
| Current holdings | `POST /api/v1/developer/wallet/balances` body: `[{"chain":"ethereum","address":"0xd8da6bf26964af9d7eed9e03e53415d37aa96045"}]` | Array of EVMWalletBalances with ERC-20 balances + block_timestamp |
| Historical balances | `POST /api/v1/developer/wallet/balances/history` body: `{start_timestamp:"2024-01-01T00:00:00Z", end_timestamp:"2024-01-02T00:00:00Z", addresses:[{chain:"ethereum",address:"0xd8da..."}]}` | Array of balance-change events within the 24h window |
| Transactions (time-filter test) | `POST /api/v1/developer/wallet/transactions` body `[{chain:"ethereum",address:"0xd8da..."}]` limit=5, verify `block_timestamp` on each item, confirm no `start_time` param exists | Items with `block_timestamp`, cursor for pagination |
| DeFi positions + health factor | `POST /api/v1/developer/wallet/positions` body: `[{"chain":"ethereum","address":"0xd8da..."}]` or use a known Aave borrower | LendingPosition items with `health_factor` field populated |
| World Chain coverage | `POST /api/v1/developer/wallet/balances/history` with a known WC address, `start_timestamp` = any recent range | Either results or chain-not-supported error (confirms coverage) |
| Explorer SQL transactions | Create query: `SELECT hash, from_address, block_timestamp FROM worldchain.raw.transactions WHERE from_address = '<wc_addr>' AND block_timestamp >= '2024-01-01' LIMIT 10` | Rows with block_timestamp within range |

---

## Summary: Endpoint Map for Phora Profile Layers

| Profile layer | Open window (live wallet) | Closed window (detached wallet) |
|---|---|---|
| Token balances | `POST /wallet/balances` | `POST /wallet/balances/history` [t0,t1] |
| Holdings USD curve | `POST /wallet/holdings/history` [t0,now] | `POST /wallet/holdings/history` [t0,t1] |
| Transactions | `POST /wallet/transactions` + client-side [t0,t1] filter | Explorer SQL `<chain>.raw.transactions WHERE block_timestamp BETWEEN t0 AND t1` |
| DeFi positions + HF | `POST /wallet/positions` (live, no time bound) | No REST equivalent; `<chain>.lending.loans` SQL for borrow events; health factor reconstruction needed |
| Price at a timestamp | `POST /api/v1/developer/prices/at-timestamp` | Same |
