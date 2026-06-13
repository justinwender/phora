# World AgentKit Integration Brief

**Last researched:** 2026-06-12  
**Status:** Pre-build reference. Mark items UNCONFIRMED where noted before cutting code.

---

## 1. What AgentKit Is

AgentKit (announced March 2026) is World's toolkit for issuing AI agents a
cryptographic proof that a unique verified human backs them. It ships two
orthogonal capabilities:

- **x402 payment middleware** — server and client wrappers around the x402
  payment-required protocol that let a resource server challenge an agent for
  payment *or* grant a free trial based on human-backing status.
- **AgentBook registration client** — a CLI + on-chain registry that binds an
  agent wallet address to an anonymous World ID human identifier, enabling
  any server to resolve "is this wallet backed by a verified human?" at request
  time.

### npm packages (confirmed from docs.world.org and GitHub)

| Package | Role |
|---|---|
| `@worldcoin/agentkit` | Core library — `createAgentkitClient`, `createAgentBookVerifier`, `createAgentkitHooks`, `declareAgentkitExtension`, validation helpers |
| `@worldcoin/agentkit-cli` | CLI for AgentBook registration (`npx @worldcoin/agentkit-cli register <address>`) |
| `@worldcoin/agentkit-core` | Internal core; published separately — latest confirmed version **0.2.0** (as of 2026-04-29) |
| `@x402/hono` | Hono server middleware for x402 payment challenges |
| `@x402/core` (sub-path `@x402/core/http`) | HTTP facilitator client |
| `@x402/evm/exact/server` | EVM payment scheme for resource servers |

Install for the Phora agent server:
```
npm install @worldcoin/agentkit @x402/hono
```

Install for the agent client (the entity that *calls* Phora):
```
npm install @worldcoin/agentkit
```

**Note:** Coinbase's x402 reached **v2** (December 2025), which introduced
multi-chain CAIP-2 support, an extensions system, and CAIP-122 wallet-identity
headers. AgentKit builds on x402 v2. If you see older x402 tutorials using v1
APIs they are incompatible — check the Coinbase migration guide before
copy-pasting snippets.

---

## 2. AgentBook

### What it is

AgentBook is an onchain registry on **World Chain mainnet (eip155:480)** that
maps agent wallet addresses → anonymous World ID human identifiers. A server
calls `createAgentBookVerifier` to resolve any incoming agent address to a
human ID at request time; if the address is not in the book, no human-backing
is established and the normal x402 payment path applies.

### Contract address (canonical, World Chain mainnet)

```
0xA23aB2712eA7BBa896930544C7d6636a96b944dA  (eip155:480)
```

Confirmed via the official SDK reference at `docs.world.org/agents/agent-kit/sdk-reference`.

### What registration writes onchain

The CLI command:
```
npx @worldcoin/agentkit-cli register <agent-wallet-address>
```
…opens a QR code; the operator scans it with their World App (which holds the
verified World ID credential). The app issues a World ID proof linking the
agent address to the human, and the CLI submits a transaction to the AgentBook
contract on World Chain.

The transaction records:
- agent wallet address → anonymous humanId (a nullifier hash, not a name)
- timestamp of registration

What comes back to the developer: the agent's **wallet address** (same one used
to sign x402 challenges). There is no separate "agent ID" token — the address
*is* the identifier. Binding this to an ENS subname and ENSIP-26 records means
storing `address` as the primary identifier in the ENS text records.

### Delegated World ID semantics

AgentBook does **not** give the agent a full World ID credential. It proves
*association*: "a verified human vouched for this wallet address." The agent
cannot itself produce World ID ZK proofs; it can only present a signed SIWE
message that a server resolves via AgentBook back to a humanId. For Phora's
purposes this is sufficient — the agent's identity is the wallet address, and
its human-backing is the AgentBook entry.

UNCONFIRMED: whether a single human can register more than one agent address
(e.g., separate agent wallets per app). The docs show one registration example
but do not state a per-human limit.

---

## 3. The x402 Flow

### Protocol overview

x402 uses standard HTTP 402 Payment Required. The full round-trip for an
AgentKit-enhanced endpoint:

```
Agent → GET /resource (no headers)
Server ← 402  { "x402Version": 2, "accepts": [...payment schemes...],
                "extensions": { "agentkit": { ... challenge ... } } }

Agent → GET /resource  X-AGENTKIT: <base64 SIWE payload + signature>
Server verifies: resolves humanId from AgentBook, checks free-trial counter
 ├─ human-backed + free uses remain → 200 OK
 ├─ human-backed + trial exhausted → 402 (normal payment required)
 └─ not in AgentBook              → 402 (normal payment required)

Agent → GET /resource  X-PAYMENT: <x402 payment token>  (if payment required)
Server ← 200 OK
```

### Server-side middleware (Hono + Next.js)

The reference implementation uses Hono, but the AgentKit hooks are
framework-agnostic wrappers. For a Next.js App Router project, wire them into
a Route Handler.

Key server configuration extracted from official docs:

```typescript
import { createAgentkitHooks, createAgentBookVerifier,
         declareAgentkitExtension, agentkitResourceServerExtension }
  from '@worldcoin/agentkit'
import { paymentMiddleware } from '@x402/hono'

// USDC on World Chain mainnet
const USDC_WORLD_CHAIN = '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1'

const agentBook = createAgentBookVerifier()
// resolves against canonical AgentBook at 0xA23aB2712eA7BBa896930544C7d6636a96b944dA

const agentkitHooks = createAgentkitHooks({
  agentBook,
  storage: new InMemoryAgentKitStorage(), // swap for DB in production
  mode: { type: 'free-trial', uses: 3 },  // 3 free requests per humanId
})

// Declare extension on the 402 response
app.use('/api/phora/*', declareAgentkitExtension())
app.use('/api/phora/*', paymentMiddleware({
  facilitatorUrl: 'https://x402.org/facilitator',
  routes: {
    '/api/phora/*': {
      price: '$0.01',
      network: 'eip155:480',           // World Chain
      config: { tokenAddress: USDC_WORLD_CHAIN },
    },
  },
  ...agentkitHooks,
}))
```

**Free-trial gate:** `mode: { type: 'free-trial', uses: 3 }` gives each unique
humanId 3 gratis requests. After that the server issues a 402 requiring USDC
payment. There is no native "N free queries globally then 402" concept — the
counter is per-humanId (per backing human), tracked in `AgentKitStorage`. For
Phora's free-trial gate this is the right primitive: each Phora user's agent
gets N free Allium profile queries per human, then pays.

**Production storage:** `InMemoryAgentKitStorage` is development-only. In
production you must implement `AgentKitStorage`:
- `tryIncrementUsage(endpoint, humanId, limit): Promise<boolean>`
- `hasUsedNonce?(nonce): Promise<boolean>`
- `recordNonce?(nonce): Promise<void>`

A simple KV store (Vercel KV, Redis, or even a D1 database) works. This is
build-it-yourself; AgentKit ships no DB adapter.

### Agent-side client

```typescript
import { createAgentkitClient } from '@worldcoin/agentkit'

const agentkit = createAgentkitClient({
  signer: {
    address: agentWallet.address,
    chainId: 'eip155:8453',   // agent wallet can be on Base or World Chain
    type: 'eip191',           // EOA; use 'eip1271' for smart contract wallets
    signMessage: msg => agentWallet.signMessage(msg),
  },
})

// Drop-in replacement for fetch()
const response = await agentkit.fetch('https://phora.app/api/phora/profile')
```

The client:
1. First tries the AgentKit header (SIWE challenge response).
2. If the server returns 402 (trial exhausted or unregistered), falls back to
   x402 payment with USDC.
3. Retries with the payment token automatically.

### Chain / token for payment settlement

- **World Chain mainnet (eip155:480)** — USDC at
  `0x79A02482A880bCE3F13e09Da970dC34db4CD24d1` (native Circle USDC via CCTP).
- **Base (eip155:8453)** — also supported as a payment chain in the reference
  example. Agent signer's `chainId` does not need to match the payment chain.
- The facilitator handles settlement; developers point at
  `https://x402.org/facilitator` (Coinbase-operated) unless self-hosting.

UNCONFIRMED: whether World Chain USDC at `0x79A02482A880bCE3F13e09Da970dC34db4CD24d1`
is the Circle-native USDC or bridged USDC.e. Circle's CCTP integration for
World Chain is confirmed live as of 2026, making native USDC the more likely
address, but verify against the official Circle/World Chain token list before
hardcoding.

---

## 4. Agent Registration — End to End

```
1. Generate server wallet (Dynamic embedded wallet or viem-generated EOA)
   → outputs agentWalletAddress

2. Register in AgentBook:
   npx @worldcoin/agentkit-cli register <agentWalletAddress>
   → opens QR code
   → operator scans with World App (must hold verified World ID)
   → CLI submits tx to AgentBook contract on World Chain (eip155:480)
   → tx records: agentWalletAddress → humanId

3. Identifiers output:
   - agentWalletAddress  (primary — used as ENS subname owner + ENSIP-26 subject)
   - humanId             (anonymous nullifier hash — internal to AgentBook, not
                          exposed in ENS records directly)

4. ENS subname binding:
   Register phora-agent.phora.eth (or agent.<user>.phora.eth) via Durin/ENSv2
   Set text records per ENSIP-26:
     agent.address  = agentWalletAddress
     agent.type     = "agentkit-backed"
     agent.book     = "0xA23aB2712eA7BBa896930544C7d6636a96b944dA"

5. Deploy: server exposes /api/phora/* with x402 + AgentKit middleware.
   Agent calls agentkit.fetch() → gets free-trial quota → then pays per query.
```

---

## 5. Costs and Prerequisites

### World Chain ETH for gas

- AgentBook registration is **gasless by default** — the CLI uses a hosted
  relay on Base mainnet. No World Chain ETH is required for registration itself.
- If the agent wallet sends transactions directly on World Chain (e.g., paying
  USDC via x402), it needs ETH for gas. World Chain gas is very cheap (fractions
  of a cent per simple tx); $2–5 in bridged ETH is more than sufficient for a
  hackathon.
- x402 payment itself requires USDC in the agent wallet (not ETH), since the
  facilitator abstracts gas for the payment settlement.

### Bridging

Official endorsed route: **Across Protocol** (intents-based, integrated at
World Chain mainnet launch).

Path: Ethereum mainnet or Base → World Chain (eip155:480).  
Bridge cost: $3–12 in source-chain gas + ~0.05% relayer fee for the transfer
amount. For hackathon purposes bridge $10–20 USDC + a small ETH amount.

World App itself can also fund World Chain wallets directly for World ID holders.

### Prerequisites checklist

- [ ] Verified World ID (orb-verified) on the operator's World App — required
      to scan QR during AgentBook registration.
- [ ] A funded agent wallet (EOA or Dynamic embedded wallet).
- [ ] USDC on World Chain mainnet for paid x402 requests (post-trial).
- [ ] Persistent storage backend for `AgentKitStorage` (can be in-memory for
      demo, but the free-trial counter resets on server restart).

---

## 6. ETHGlobal Prize Tracks (Cannes 2026, confirmed)

### Track A — Best use of Agent Kit: $8,000 total

| Place | Prize |
|---|---|
| 1st | $4,000 |
| 2nd | $2,500 |
| 3rd | $1,500 |

**Exact requirement (quoted):** "Apps that use AgentKit to ship agentic
experiences where World ID improves safety, fairness, or trust." Submissions
must "integrate World's Agent Kit to meaningfully distinguish human-backed
agents from bots." Projects using only World ID or MiniKit without the Agent
Kit layer are **ineligible**.

**Minimal qualifying build for Phora (Track A):**
- Agent wallet registered in AgentBook (World ID proof linked).
- Server endpoint protected by `createAgentkitHooks` + x402 middleware.
- Agent calls endpoint via `agentkit.fetch()`, demonstrates free-trial bypass
  before falling back to payment.
- The human-backing distinction must be demonstrable (show 402 for an
  unregistered wallet vs. free access for registered one).

### Track B — Best use of World ID 4.0: $8,000 total

**Exact requirement:** Build "products that break without proof of human" using
World ID 4.0 as a real constraint for eligibility, uniqueness, fairness,
reputation, or rate limits. "Proof validation is required and needs to occur in
a web backend or smart contract."

Phora's registry (one World ID → one identity entry) directly satisfies Track B.
Proof validation happens server-side via the World ID verify endpoint.

Both tracks are independently judged; Phora can compete in both.

---

## 7. Gotchas

### Mainnet-only AgentBook

UNCONFIRMED: There is no documented testnet deployment of the AgentBook
contract. The canonical address (`0xA23aB2712eA7BBa896930544C7d6636a96b944dA`)
is on World Chain mainnet (eip155:480) only. Plan accordingly — development
and testing must target mainnet, or you must mock the AgentBook lookup locally
by deploying a throwaway contract or stubbing `createAgentBookVerifier`.

### x402 v2 compatibility

AgentKit requires x402 v2. The v2 spec introduced breaking changes from v1
(CAIP-2 network identifiers, new extensions system). Do not mix v1 x402 libraries.
Check package.json peer dependency on `@x402/core` version before installing.

### Facilitator dependency

The `@x402/hono` middleware defaults to pointing at `https://x402.org/facilitator`
(Coinbase-operated). For a hackathon build this is fine. Self-hosting a
facilitator is non-trivial; do not plan for it.

### InMemoryStorage and demo resets

The free-trial counter lives in `InMemoryAgentKitStorage` during development.
Every server restart resets it, making the "3 free then 402" demo unreliable
unless you integrate real persistent storage before the demo. Use a simple
Vercel KV or even a module-level Map that survives the process lifetime.

### SIWE message freshness

`validateAgentkitMessage` enforces expiration on SIWE messages. The client-side
`createAgentkitClient` handles re-signing automatically, but if you call
raw validation helpers you must pass `expirationSeconds` consistently between
server and client.

### World ID operator requirement

Registration requires the **human operator** (Justin) to scan a QR code with
a World App that holds an orb-verified World ID. This is a one-time step per
agent wallet but cannot be automated or skipped for a demo — plan for it
explicitly before the demo.

### Dynamic server wallet integration

`createAgentkitClient` accepts any signer that exposes `signMessage`. Dynamic's
embedded server wallet exposes this interface. Wire them together as:
```typescript
signer: {
  address: dynamicWallet.address,
  chainId: dynamicWallet.chain,
  type: 'eip191',
  signMessage: msg => dynamicWallet.signMessage({ message: msg }),
}
```
UNCONFIRMED: exact Dynamic server wallet API surface — verify against Dynamic
docs before finalizing the adapter.

---

## 8. Reference-Check Plan

Run these steps against World Chain mainnet **before** building the full
integration:

1. **Read AgentBook state (cost: zero)**
   ```typescript
   import { createPublicClient, http } from 'viem'
   import { worldchain } from 'viem/chains'
   // call AgentBook at 0xA23aB2712eA7BBa896930544C7d6636a96b944dA
   // read a known registered address to confirm ABI + RPC connectivity
   ```
   Confirms contract is live and your viem RPC works.

2. **Register a throwaway agent wallet (cost: gasless via relay)**
   ```
   npx @worldcoin/agentkit-cli register <throwaway-eoa-address>
   ```
   Scan QR with World App. Confirm the CLI outputs a tx hash and
   `npx @worldcoin/agentkit-cli status <address>` returns `registered: true`.

3. **Run the example server locally against mainnet AgentBook**
   Clone `github.com/Must-be-Ash/world-x402-agentkit-example`.
   Point `createAgentBookVerifier` at mainnet (default).
   Hit the endpoint with the registered wallet — confirm 200 on first 3 calls,
   402 on the 4th.

4. **Complete one paid x402 request (cost: ~$0.01 in USDC)**
   Fund the throwaway wallet with $0.10 USDC on World Chain via Across.
   Let the 4th request auto-pay. Confirm settlement on worldscan.org.

**Estimated total cost:** < $15 (bridge gas + $0.01–0.05 in test payments).

---

## 9. Phora-Specific Build Notes

- The Phora endpoint to protect: `GET /api/profile/:identity` (the Allium
  unified profile query). This is the natural x402 gate — verifiers pay per
  consent-gated profile lookup.
- Free-trial quota maps to "N free queries per human who backed an agent" which
  is semantically correct: each human-backed agent gets N complimentary profile
  reads, then pays.
- The `humanId` resolved from AgentBook is an anonymous nullifier hash; it
  should NOT be stored in ENS text records. Store `agentWalletAddress` only.
- ENSIP-26 agent records: store `agentWalletAddress`, the AgentBook contract
  address as a verification pointer, and the x402 endpoint URL the agent uses.
  No standard ENSIP-26 field names are established for AgentKit — define custom
  text record keys under a `agentkit.*` namespace.

---

## Sources

- `https://docs.world.org/agents/agent-kit/integrate`
- `https://docs.world.org/agents/agent-kit/sdk-reference`
- `https://docs.world.org/agents/agent-kit/ecosystem.md`
- `https://github.com/worldcoin/agentkit`
- `https://github.com/Must-be-Ash/world-x402-agentkit-example`
- `https://www.agentbook.world/`
- `https://ethglobal.com/events/cannes2026/prizes`
- `https://www.x402.org/writing/x402-v2-launch`
- `https://docs.cdp.coinbase.com/x402/migration-guide`
