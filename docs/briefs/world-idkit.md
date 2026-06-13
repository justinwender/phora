# World ID / IDKit 4.0 Integration Brief

**Last updated:** 2026-06-12  
**App ID (Phora):** `app_11e8bf4c2d9b3a8ef28e0c805e08c14c`  
**RP ID (Phora):** `rp_4571868f9e535bb7`  
**RP status:** registered (production + staging, on-chain initialized for both)

---

## 1. What IDKit 4.0 Is and What Changed vs 3.x

### Core shift
World ID 4.0 restructures the protocol around two distinct proof types:

| Proof type | Use case | Key identifier |
|---|---|---|
| **Uniqueness proof** | One-time gating per action | `nullifier` (one-time-use replay protection) |
| **Session proof** | Returning-user continuity (4.0 only) | `session_id` (stable) + `session_nullifier` (per-proof replay protection) |

In 3.x, the nullifier served as the stable persistent user identifier. In 4.0, nullifiers are strictly one-time-use constructs; `session_id` is the stable link.

### Breaking changes from 3.x to 4.0
- **Mandatory `rp_context`** on every request: five-field object (`rp_id`, `nonce`, `created_at`, `expires_at`, `signature`). This did not exist in 3.x.
- **Proof format changed**: 3.x used a single hex string; 4.0 uses an array of exactly 5 hex strings.
- **`merkle_root` replaced by `issuer_schema_id`**: integer, internally encoded by the SDK.
- **`expires_at_min`** (absolute UNIX timestamp) replaces `max_age` (relative duration in seconds).
- **Session proofs** are new: `session_nullifier` is a 2-element hex array, no `action` field.
- **`@worldcoin/idkit-standalone` discontinued.** Migrate to `@worldcoin/idkit-core`.
- **Verify endpoint changed**: `POST /api/v4/verify/{rp_id}` (previously versioned differently; legacy endpoint still accepts 3.0 proofs during transition).
- **`App ID` terminology replaced by `RP ID`** in 4.0 contexts (backward-compatible: the verify endpoint accepts `app_...` prefixed IDs too).
- **`signal_hash` now defaults to `"0x0"`** (was `0x00c5d2...` in 3.x legacy proofs).

### Migration timeline
- Through June 1, 2026: upgrade SDKs and register RP.
- June 1, 2026 – March 31, 2027: transition period — both 3.0 and 4.0 proofs accepted.
- April 1, 2027+: 4.0-only enforcement.

---

## 2. API Surface

### Packages

| Package | Install | Purpose |
|---|---|---|
| `@worldcoin/idkit` | `npm i @worldcoin/idkit` | React widget + hooks (main client-side entrypoint) |
| `@worldcoin/idkit-core` | `npm i @worldcoin/idkit-core` | Headless JS/TS; full control over UI and state; non-React |
| `@worldcoin/idkit-server` | UNCONFIRMED: exact npm name not yet pinned; the docs show `import { signRequest } from "@worldcoin/idkit-server"` but the subpath `@worldcoin/idkit-core/signing` is also referenced | Server-side RP signature generation |

**UNCONFIRMED:** Whether `@worldcoin/idkit-server` is a separate published npm package or a re-export of `@worldcoin/idkit-core/signing`. The signatures doc shows both import paths. Verify by checking npm before wiring up the server route.

### Client-side (React)

**Primary widget:** `IDKitRequestWidget`  
**Headless hook:** `useIDKitRequest`  
**Variant (invite-code/iOS cold flow):** `IDKitInviteCodeRequestWidget` / `useIDKitInviteCodeRequest`

```tsx
import { IDKitRequestWidget, orbLegacy } from "@worldcoin/idkit";

<IDKitRequestWidget
  open={open}
  onOpenChange={setOpen}
  app_id="app_11e8bf4c2d9b3a8ef28e0c805e08c14c"
  action="register-identity"          // matches action registered in portal
  rp_context={{
    rp_id: "rp_4571868f9e535bb7",
    nonce: rpSig.nonce,
    created_at: rpSig.created_at,     // from signRequest()
    expires_at: rpSig.expires_at,     // TTL 300s default
    signature: rpSig.sig,
  }}
  preset={orbLegacy()}               // Orb-verified humans; see presets below
  allow_legacy_proofs={true}         // accept 3.x proofs during transition window
  environment="production"           // "staging" for simulator testing only
  handleVerify={async (result) => {
    // Called before onSuccess; throw to abort
    const res = await fetch("/api/verify-world-id", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(result),
    });
    if (!res.ok) throw new Error("verification failed");
  }}
  onSuccess={(result) => { /* update UI */ }}
  onError={(code) => { /* handle IDKit error codes */ }}
/>
```

**Available presets** (credential type selectors):
- `orbLegacy()` — Orb-verified; highest assurance; relevant for Phora's "one human" guarantee
- `selfieCheckLegacy()` — Selfie (lower assurance)
- `secureDocumentLegacy()`, `documentLegacy()` — NFC document checks
- UNCONFIRMED: Whether a "4.0-native" preset replaces `orbLegacy()` or if these legacy preset names persist in 4.0 SDK releases.

**Hook return values:** `open()`, `reset()`, `isAwaitingUserConnection`, `isAwaitingUserConfirmation`, `isSuccess`, `isError`, `connectorURI`, `result`, `errorCode`.

### Server-side: RP signature generation

Must happen server-side. Never expose the signing key client-side.

```typescript
// In your Next.js API route (e.g. /api/rp-context)
import { signRequest } from "@worldcoin/idkit-server"; // or "@worldcoin/idkit-core/signing"

const rpSig = signRequest({
  signingKeyHex: process.env.RP_SIGNING_KEY!,  // 0x-prefixed hex private key
  action: "register-identity",
  ttl: 300,  // seconds; default is 300
});
// Returns: { sig, nonce, created_at, expires_at }
// created_at and expires_at are UNIX timestamps
```

The signing algorithm: random nonce → Keccak-256 hash → 49-byte message (without action) or 81-byte message (with action) → EIP-191 prefix → Keccak-256 → ECDSA secp256k1 recoverable sign → 65-byte signature. Use Keccak-256, NOT SHA3-256.

### Server-side: proof verification endpoint

**Base URL:** `https://developer.world.org`  
**Endpoint:** `POST /api/v4/verify/{rp_id}`  
**Our endpoint:** `POST https://developer.world.org/api/v4/verify/rp_4571868f9e535bb7`

Request body (4.0 uniqueness proof — the type Phora uses):
```json
{
  "protocol_version": "4.0",
  "nonce": "<from rp_context>",
  "action": "register-identity",
  "environment": "production",
  "responses": [
    {
      "identifier": "<user identifier string>",
      "issuer_schema_id": 1,
      "nullifier": "<256-bit integer as hex string>",
      "expires_at_min": 1700000000,
      "proof": ["0x...", "0x...", "0x...", "0x...", "0x..."],
      "signal_hash": "0x0"
    }
  ]
}
```

Success response (HTTP 200):
```json
{
  "success": true,
  "action": "register-identity",
  "nullifier": "<256-bit integer>",
  "created_at": "2026-06-12T00:00:00Z",
  "environment": "production",
  "results": [
    {
      "identifier": "...",
      "success": true,
      "nullifier": "..."
    }
  ]
}
```

Error response (HTTP 400/404):
```json
{
  "success": false,
  "code": "all_verifications_failed",
  "detail": "..."
}
```

**Additional endpoints confirmed via Developer Portal MCP:**
- `GET /api/v4/rp-status/rp_4571868f9e535bb7` — RP registration status
- `GET /api/v4/proof-context/rp_4571868f9e535bb7` — UNCONFIRMED: exact usage/shape

---

## 3. Credentials and Configuration

### What you need and where it comes from

| Credential | Where it lives | Secret? |
|---|---|---|
| `app_id` | Developer Portal → your app → app ID | No (safe client-side) |
| `rp_id` | Developer Portal → app → World ID config → RP ID | No (safe client-side) |
| RP signing key (private key) | Generated once at `configure_world_id` or `rotate_world_id_signing_key` — **portal does not retain it** | **YES — store in `.env.local` as `RP_SIGNING_KEY`** |
| Action string | Defined by you; registered in Developer Portal under the app's actions | No |

### Phora's current state (confirmed via MCP)
- App ID: `app_11e8bf4c2d9b3a8ef28e0c805e08c14c`
- RP ID: `rp_4571868f9e535bb7`
- Signer address: `0xba569038966Ae11a3B0d176D80ffe34f4D36a21E`
- Signer private key: **not recoverable from portal** — must be stored from initial generation. If lost, rotate via `rotate_world_id_signing_key`.
- RP status: registered on both production and staging chains. On-chain initialized for both.
- Actions: none registered yet (`actions_v4: []`). Must create via `create_world_id_action`.
- App sync status: `synced: { production: false, staging: false }` — UNCONFIRMED what "not synced" means operationally; may be a metadata sync lag, not a functional block.

### Action registration
Actions must be registered in the Developer Portal before use. The MCP tool `create_world_id_action` accepts `app_id`, `action` (string slug), `description`, and `environment` (`production` | `staging`).

---

## 4. Enforcing "One Human, One Registry Entry, Ever"

### Nullifier semantics in 4.0

A nullifier is scoped to: **(user, app_id, action)**. Two users completing the same action produce different nullifiers. The same user completing the same action twice produces the same nullifier (in theory — see UNCONFIRMED below).

**UNCONFIRMED:** The 4.0 migration docs state nullifiers are "strictly one-time-use constructs focused on replay prevention" and that `session_id` is the stable identifier. This conflicts with the classic 3.x guarantee that "the same user + app + action always produces the same nullifier." It is unclear whether 4.0 uniqueness-proof nullifiers are deterministic per (user, app, action) or randomized per proof invocation. The verify endpoint error code `nullifier_replayed` implies reuse detection happens server-side, not by nullifier equality. **Confirm this with World docs or by testing before relying on nullifier equality for deduplication.**

### What to store server-side
Per the docs: store consumed nullifiers as 256-bit integers. PostgreSQL: `NUMERIC(78, 0)`. Schema:

```sql
CREATE TABLE used_nullifiers (
  nullifier   NUMERIC(78, 0) PRIMARY KEY,
  action      TEXT NOT NULL,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Enforcement logic:**
1. Receive proof from client.
2. POST to verify endpoint.
3. On 200: check nullifier against `used_nullifiers`. If present → reject duplicate (HTTP 409). If absent → INSERT and proceed with registry creation.
4. On 400 with `nullifier_replayed`: the World backend already rejected it; surface error to user.

**During the 3.x→4.0 transition period** (until March 31, 2027): check and store both v3 and v4 nullifiers if `allow_legacy_proofs: true`.

---

## 5. Gotchas

### Staging vs production
- Set `environment: "staging"` in IDKit + use the staging app credentials to test with the simulator.
- The Phora app has a **single app** registered (not staging, `is_staging: false`). The RP is registered on both chains. UNCONFIRMED whether you need a separate staging app in the portal or whether `environment: "staging"` on the same `app_id` + `rp_id` routes to the staging chain automatically.
- Simulator URL: `https://simulator.worldcoin.org/`

### Simulator vs World App for demos
- For hackathon demos: use `environment: "staging"` + simulator. Do not expect Orb-verified credentials in the simulator — the simulator generates synthetic proofs.
- UNCONFIRMED: what verification level (Orb vs Device) the simulator emulates. The `world_id_4_not_available` error code is terminal — if the simulator doesn't support the requested preset, you will need to fall back to a different preset or the `allow_legacy_proofs` path.

### Verification levels (credential types)
- **Orb (Proof of Human / `orbLegacy`)**: highest assurance, biometric iris scan. Required for Phora's one-human guarantee.
- **Selfie Check (`selfieCheckLegacy`)**: lower assurance, no distinct warm path.
- **NFC document (`secureDocumentLegacy`, `documentLegacy`)**: hardware-backed document check.
- UNCONFIRMED: whether all three are available in staging/simulator or only Orb.

### RP signature TTL and nonce hygiene
- Default TTL is 300 seconds. Expired signatures → `rp_signature_expired` error.
- Never reuse a nonce → `duplicate_nonce` error.
- Generate a fresh signature per verification attempt on the server, not once at page load.

### Signing key loss
- The portal generates the signing key once and does not retain it. If the key stored in `.env.local` is lost, use `rotate_world_id_signing_key` to generate a new one. The old signer address (`0xba569...`) becomes invalid and the new address is registered on-chain (takes a few minutes).

### Common verify failures

| Error code | Cause | Fix |
|---|---|---|
| `app_not_migrated` | App created pre-4.0 without RP registration | Run `configure_world_id` in Developer Portal |
| `invalid_rp_signature` | Wrong signing key or stale signature | Verify key matches signer address; regenerate |
| `rp_signature_expired` | Signature TTL exceeded | Generate fresh signature per request |
| `duplicate_nonce` | Nonce reused | Use cryptographically random nonce each time |
| `nullifier_replayed` | Same proof submitted twice | Idempotency check; surface "already registered" |
| `unknown_rp` | RP not registered | Ensure `configure_world_id` completed |
| `world_id_4_not_available` | Device doesn't support 4.0 | Terminal; consider `allow_legacy_proofs: true` |
| `max_verifications_reached` | Action has a cap set in portal | Adjust action settings or handle gracefully |
| `invalid_network` | `environment` mismatch | Match `environment` in IDKit to the app's portal environment |

---

## 6. Track B Prize Requirements

**Source:** ETHGlobal New York 2026 prize page (`ethglobal.com/events/newyork2026/prizes`), confirmed via web fetch.

**Track B (World ID) — $2,500 total ($1,500 / $1,000)**

> "Applications where the product breaks without proof of human."

Example qualifying patterns listed in the brief:
- One-per-human resource access (tickets, grants, allowlists)
- Sybil-resistant voting or quadratic funding
- Human-only marketplaces with anti-spam measures
- Reputation systems gated by personhood

**The single decisive requirement:**

> "Uses World ID 4.0 as a real constraint, with proof validation in a web backend or smart contract."

### What "4.0 as a real constraint" means for Phora

The phrasing "as a real constraint" signals that the judges want World ID to be load-bearing, not decorative. For Phora:

1. **Proof validation must happen server-side** (not just client-side trust): POST to `developer.world.org/api/v4/verify/{rp_id}`, check 200 before allowing registry creation.
2. **Nullifier must be stored and enforced**: the second attempt to register the same human must be rejected — this is the "one human, one registry entry, ever" guarantee. Without this check, the 4.0 integration is cosmetic.
3. **`protocol_version: "4.0"`** must appear in at least some proof responses (i.e., the `allow_legacy_proofs` flag is acceptable for backward compat but 4.0 proofs must be the primary path).
4. **RP signatures** (mandatory in 4.0) distinguish this from a 3.x-compatible integration.

**Track A (AgentKit) — $7,500 total** (also targeted by Phora): requires meaningful AgentKit implementation with a free-trial gate for human-backed agents. Delegated World ID enhances safety/fairness/trust for the agent.

---

## 7. Reference-Check Plan

Concrete sequence to prove the verify flow works end-to-end before building on it:

### Step 1: Create the registration action
Use MCP: `create_world_id_action(app_id="app_11e8bf4c2d9b3a8ef28e0c805e08c14c", action="register-identity", description="One-time registration for Phora identity", environment="staging")`. Confirm it appears in `get_app_config`.

### Step 2: Confirm signing key
The signing key private key must be in `.env.local` as `RP_SIGNING_KEY`. The signer address must match `0xba569038966Ae11a3B0d176D80ffe34f4D36a21E`. If the key was lost, rotate it first.

### Step 3: Implement the RP context server route
`GET /api/rp-context` → returns `{ rp_id, nonce, created_at, expires_at, signature }`. Test it independently: call the route and verify the shape is correct before wiring IDKit.

### Step 4: Simulator proof → staging verify

```bash
# After getting a simulated proof from https://simulator.worldcoin.org/
# (set environment: "staging" in IDKit, scan QR with simulator)
# The IDKit handleVerify callback fires with `result`; capture it, then:

curl -X POST https://developer.world.org/api/v4/verify/rp_4571868f9e535bb7 \
  -H "Content-Type: application/json" \
  -d '{
    "protocol_version": "4.0",
    "nonce": "<nonce from rp_context>",
    "action": "register-identity",
    "environment": "staging",
    "responses": [<result.responses from IDKit>]
  }'

# Expected: HTTP 200, body { "success": true, "nullifier": "...", ... }
```

### Step 5: Duplicate-nullifier rejection
Submit the same proof a second time. Expected: HTTP 400, `code: "nullifier_replayed"`. Alternatively, store the nullifier in your DB after step 4 and verify your app-layer check catches it before even calling the verify endpoint.

### Step 6: Expired-signature rejection
Generate a signature with `ttl: 1` (1 second), wait 2 seconds, then attempt verification. Expected: `rp_signature_expired` error code from IDKit or verify endpoint.

### Step 7: RP status check
```bash
curl https://developer.world.org/api/v4/rp-status/rp_4571868f9e535bb7
# Should indicate registered/active for staging
```

### Step 8: Confirm 4.0 proof format
In the `handleVerify` callback, log `result` and verify `proof` is an array of 5 hex strings (not a single string), confirming the 4.0 code path executed rather than a legacy 3.x proof.

---

## 8. Open UNCONFIRMED Items (summary)

1. **`@worldcoin/idkit-server` npm package name**: docs show this import but it may be `@worldcoin/idkit-core/signing`. Check `npm info @worldcoin/idkit-server` before installing.
2. **Nullifier determinism in 4.0**: unclear if the same (user, app, action) triple always produces the same nullifier or if each proof invocation generates a fresh one. Impacts whether `nullifier` equality is a valid deduplication key or whether we must rely purely on the `nullifier_replayed` server error.
3. **`synced: false`** in the MCP RP status: the portal returns `synced: { production: false, staging: false }` for Phora's RP. Likely a metadata sync lag (on-chain is initialized). Confirm it doesn't block verification by attempting a staging prove flow.
4. **Preset availability in staging/simulator**: unclear whether `orbLegacy()` works in the simulator or whether a different preset is required.
5. **`allow_legacy_proofs: true` and Track B eligibility**: judges may scrutinize whether legacy-proof acceptance undermines the "4.0 as a real constraint" claim. Safe strategy: accept legacy proofs during transition but gate the registry flow on a flag marking the proof as 4.0 (`protocol_version === "4.0"` in the verify response) if possible.
6. **`proof-context` endpoint shape**: portal confirms `GET /api/v4/proof-context/rp_4571868f9e535bb7` exists but docs don't fully describe it. May be a polling/status endpoint; UNCONFIRMED if needed for the verify flow.

---

## 9. Quick Reference

```
App ID:        app_11e8bf4c2d9b3a8ef28e0c805e08c14c
RP ID:         rp_4571868f9e535bb7
Signer addr:   0xba569038966Ae11a3B0d176D80ffe34f4D36a21E
Verify URL:    https://developer.world.org/api/v4/verify/rp_4571868f9e535bb7
Status URL:    https://developer.world.org/api/v4/rp-status/rp_4571868f9e535bb7
Simulator:     https://simulator.worldcoin.org/
Client pkg:    @worldcoin/idkit (React) | @worldcoin/idkit-core (headless)
Server pkg:    @worldcoin/idkit-server (UNCONFIRMED exact name)
Env var:       RP_SIGNING_KEY=<0x private key — never commit>
```
