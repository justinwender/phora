# Ledger DMK + Clear Signing (ERC-7730) Integration Brief

**Project context:** Phora consent-grant flow. When an identity owner grants a verifier
or AI agent access to their history, the consent-grant message is an EIP-712 typed
struct signed on a Ledger Flex with Clear Signing so the human reads the exact scope
before access escalates. Prize targets: Ledger Hardware Integrations track ($5 k,
ETHGlobal Cannes) + Clear Signing (ERC-7730) track ($4 k).

---

## 1. NPM packages (confirmed names and versions, June 2026)

| Package | Role | Latest |
|---|---|---|
| `@ledgerhq/device-management-kit` | Core DMK — device discovery, session, APDU | 1.6.0 |
| `@ledgerhq/device-transport-kit-web-hid` | WebHID browser transport | UNCONFIRMED exact version (actively published; same release cadence as DMK) |
| `@ledgerhq/device-signer-kit-ethereum` | Ethereum app signer (signTypedData, signTransaction, getAddress) | 1.8.0 |
| `@ledgerhq/device-transport-kit-speculos` | Speculos HTTP transport for testing without hardware | 1.2.0 |

Install:
```bash
npm install @ledgerhq/device-management-kit \
            @ledgerhq/device-transport-kit-web-hid \
            @ledgerhq/device-signer-kit-ethereum
```

All three packages are in the `LedgerHQ/device-sdk-ts` monorepo and share a version cycle.
RxJS is a required peer dependency (all operations return Observables).

---

## 2. Ledger DMK skill file — CONFIRMED

Ledger publishes an official AI agent skill set at:

**Repository:** `github.com/LedgerHQ/agent-skills` (also referenced as `LedgerHQ/developer-ai-skills`)

**Install command:**
```bash
npx skills add ledgerhq/agent-skills -s ledger-dmk-implementation dmk-intent-vocabulary dmk-business-logic
```

**Three skill files, exact names:**

| Skill ID | File path in repo | Purpose |
|---|---|---|
| `ledger-dmk-implementation` | `skills/dmk/ledger-dmk-implementation/SKILL.md` | Primary: 5-step gated execution (Init → Session → Device State → App Management → Operation), HITL gates, error classification, timeout bounds |
| `dmk-intent-vocabulary` | `skills/dmk/dmk-intent-vocabulary/SKILL.md` | Maps natural language ("sign a tx", "find my Ledger") to the correct DMK API |
| `dmk-business-logic` | `skills/dmk/dmk-business-logic/SKILL.md` | Conceptual reference: Clear Signing, Secure Channel, sessions, transports, derivation paths |

Supporting reference files inside `ledger-dmk-implementation/`:
- `dmk-sdk-reference.md`
- `dmk-code-patterns.md`
- `dmk-platform-patterns.md`

Load all three skills at session start; `ledger-dmk-implementation` is the one that
drives actual code generation.

---

## 3. ERC-7730 validation CLI — CONFIRMED

**Python package:** `erc7730` (PyPI, requires Python 3.12+)

```bash
pip install erc7730
# or ad-hoc without install:
uvx erc7730 lint registry/**/eip712-*.json
uvx erc7730 format
```

This is a Python CLI, not an npm package. It validates and formats ERC-7730
descriptor files. There is no separate npm validation CLI for ERC-7730 from Ledger.

---

## 4. Minimal Next.js browser integration

DMK is client-only. Never import it in server components, API routes, or middleware.

```typescript
// lib/dmk.ts — client singleton (NOT module-level in React; use a provider)
'use client';
import { DeviceManagementKitBuilder, ConsoleLogger } from "@ledgerhq/device-management-kit";
import { webHidTransportFactory } from "@ledgerhq/device-transport-kit-web-hid";

// Call once, inside a React context provider — NOT at module level
export function buildDmk() {
  return new DeviceManagementKitBuilder()
    .addLogger(new ConsoleLogger())
    .addTransport(webHidTransportFactory)
    .build();
}
```

**Critical Next.js rule:** The `dmk-platform-patterns.md` skill file explicitly warns
against a module-level DMK singleton in React; use a context provider (`DmkProvider` +
`useDmk()`) and add `'use client'` to every file that touches DMK, transports, or
signers. WebHID is browser-only — it will throw during SSR if imported without a guard.

**Device discovery and session:**
```typescript
// 1. Trigger device picker (requires user gesture, must be https or localhost)
const { observable: discoverObs } = dmk.startDiscovering();

// 2. Connect to selected device, get sessionId
const sessionId = await new Promise<string>((resolve, reject) => {
  dmk.connect({ device }).subscribe({ next: resolve, error: reject });
});

// 3. Build Ethereum signer
import { SignerEthBuilder } from "@ledgerhq/device-signer-kit-ethereum";
const signerEth = new SignerEthBuilder({
  dmk,
  sessionId,
  originToken: process.env.NEXT_PUBLIC_LEDGER_ORIGIN_TOKEN, // see §6
}).build();
```

**Device states:** `Connected | Locked | Busy | Disconnected`. Check state before every
operation; the DMK's 5-step skill enforces this.

---

## 5. Signing an EIP-712 typed message (the consent grant)

```typescript
const { observable, cancel } = signerEth.signTypedData(
  "44'/60'/0'/0/0",          // derivation path — set as constant, never dynamic
  {
    domain: {
      name: "Phora",
      version: "1",
      chainId: 1,
      verifyingContract: "0x...",
    },
    types: {
      ConsentGrant: [
        { name: "owner",     type: "address" },
        { name: "verifier",  type: "address" },
        { name: "scope",     type: "string"  },
        { name: "expiresAt", type: "uint256" },
        { name: "grantedAt", type: "uint256" },
      ],
    },
    primaryType: "ConsentGrant",
    message: {
      owner:     "0x...",
      verifier:  "0x...",
      scope:     "wallet_history:read",
      expiresAt: 1800000000,
      grantedAt: 1718000000,
    },
  }
);

observable.subscribe({
  next: (state) => {
    if (state.status === DeviceActionStatus.Completed) {
      const { r, s, v } = state.output;
      // reconstruct full sig: "0x" + r + s + v
    }
  },
  error: (err) => { /* user rejection vs transport failure — classify separately */ },
});
```

---

## 6. What the Flex shows — three display levels

| Level | Trigger | What the human sees on device |
|---|---|---|
| **Blind signing** | No ERC-7730 metadata for this domain; blind signing enabled in ETH app | "Sign typed message" + raw EIP-712 domain hash + struct hash. Field names and values are NOT shown. Requires the user to have explicitly enabled blind signing in the Ethereum app settings. |
| **EIP-712 Transparent / Struct display** | No metadata, but ETH app ≥ v1.9.19 and EIP-712 support enabled | "Review message" + each field name and raw value scrolled line by line from the struct (e.g. `owner: 0xabc…`, `scope: wallet_history:read`). Human-readable labels but no custom formatting. |
| **Clear Signing (ERC-7730)** | ERC-7730 metadata file merged into the Ledger registry (or provided via custom context module) | Formatted, labelled fields with human-readable formatters (dates, addresses mapped to ENS names, token amounts with decimals, etc.). The consent screen shows exactly what Phora configured in the metadata descriptor. |

**For the hackathon demo, target level 2 (EIP-712 Transparent) as the floor and level 3 (Clear Signing) as the goal.** Level 2 requires no registry PR and still shows structured fields on the Flex screen — already a meaningful improvement over blind signing. Level 3 is achievable if the registry PR is merged in time or a custom context module is used.

---

## 7. ERC-7730 metadata file for a custom EIP-712 message

File naming convention: `eip712-ConsentGrant.json` inside your entity's subdirectory in the registry.

Minimal structure for Phora's ConsentGrant:

```json
{
  "$schema": "https://raw.githubusercontent.com/LedgerHQ/clear-signing-erc7730-registry/master/specs/erc7730-v2.schema.json",
  "context": {
    "eip712": {
      "schemas": [
        {
          "primaryType": "ConsentGrant",
          "domain": {
            "name": "Phora",
            "version": "1"
          },
          "types": {
            "ConsentGrant": [
              { "name": "owner",     "type": "address" },
              { "name": "verifier",  "type": "address" },
              { "name": "scope",     "type": "string"  },
              { "name": "expiresAt", "type": "uint256" },
              { "name": "grantedAt", "type": "uint256" }
            ]
          }
        }
      ]
    }
  },
  "metadata": {
    "owner": "Phora"
  },
  "display": {
    "formats": {
      "ConsentGrant": {
        "intent": "Grant history access",
        "fields": [
          { "path": "owner",     "label": "Identity owner",  "format": "addressOrName" },
          { "path": "verifier",  "label": "Verifier",        "format": "addressOrName" },
          { "path": "scope",     "label": "Access scope",    "format": "raw"           },
          { "path": "expiresAt", "label": "Access expires",  "format": "date"          },
          { "path": "grantedAt", "label": "Granted at",      "format": "date"          }
        ],
        "required": ["owner", "verifier", "scope", "expiresAt"]
      }
    }
  }
}
```

Available formatters: `raw`, `amount`, `tokenAmount`, `nftName`, `date`, `duration`,
`addressOrName`, `enum`, `unit`. Use `date` for Unix timestamps (renders as
human-readable date on device). Use `addressOrName` to resolve ENS names on the Flex.

**Test file** (`tests/eip712-ConsentGrant.tests.json`): provide a `data` object with
the full EIP-712 typed data object (`types`, `primaryType`, `domain`, `message`) and
an optional `expectedTexts` array showing anticipated signing display strings. The
Python `erc7730` CLI will run these against the descriptor.

---

## 8. Registry path vs. local/custom context module

### Registry path (full Clear Signing)
1. Fork `github.com/LedgerHQ/clear-signing-erc7730-registry`
2. Add `registry/<entity>/eip712-ConsentGrant.json` and `tests/` file
3. Run `uvx erc7730 lint` — must pass
4. Open PR to `ethereum/clear-signing-erc7730-registry`
5. Once merged, Ledger Wallet and DMK's default context module fetch the file automatically

**Timeline risk:** PR review is human-gated. Merges during a hackathon weekend are not
guaranteed. Historically some ETHGlobal participants have had PRs merged in hours
(Ledger monitors hackathon events), but this cannot be relied upon.

### Custom context module (reliable demo path)
The `SignerEthBuilder` accepts `.withContextModule(customContextModule)` instead of
the default module. A custom context module can serve metadata from a local file or
an API you control, bypassing the public registry entirely. This is the recommended
hackathon path:

- Write the ERC-7730 descriptor and validate it locally with `erc7730 lint`
- Serve it from a Next.js API route or static JSON file
- Build a minimal `customContextModule` that returns your descriptor when queried for
  the Phora domain
- Pass it to `SignerEthBuilder` — the Flex will display Clear Signed fields

This approach works with a real Flex on day one, does not require a merged PR, and
satisfies the prize track requirements because the Clear Signing metadata file and
integration exist.

### Developer-preview local tool (visual check before hardware)
`github.com/LedgerHQ/clear-signing-erc7730-developer-tools/tree/master/developer-preview`
is a Node web app: `npm i && npm run dev` → http://localhost:3000. It renders a visual
preview of how a Clear Signed message will appear on device. Use this to verify the
descriptor layout before connecting the Flex. (Note: repo was archived Oct 2024 and is
read-only; the tool may lag ERC-7730 v2 schema changes — UNCONFIRMED current status.)

---

## 9. `originToken` requirement

As of DMK v1.4.0 the `originToken` parameter is **required** for the default context
module. Without it, "Transaction Checks will not be available" — Web3 security checks,
trusted name resolution, and Ledger's backend attestation service are disabled.

- **To obtain:** Ledger partner program enrollment (contact Ledger team). No public
  sandbox token is documented.
- **Hackathon shortcut:** Use `.withContextModule(customContextModule)` instead of the
  default module. A custom context module has no `originToken` requirement. This also
  removes the dependency on Ledger's backend for the demo, making it fully self-contained.
- **Security:** Never expose `originToken` in client-side code if you obtain one; load
  from a server-side env var.

---

## 10. Ledger prize track findings (ETHGlobal Cannes, confirmed)

From `ethglobal.com/events/cannes/prizes/ledger` (total pool: $10 k):

**Track 1 — Clear Signing (ERC-7730):** $4 k ($2,500 / $1,500)
> "Make smart contract interactions more transparent by implementing the ERC-7730
> standard." Example projects: create ERC-7730 JSON files for DeFi protocols, develop
> tooling, implement clear signing in hackathon submission, provide feedback.

**Track 2 — Hardware Integrations:** $5 k ($3,000 / $2,000)
> "Integrate Ledger hardware wallet support using our new Device Management Kit." dApp
> integrations, DMK implementation in ethers.js / wagmi / RainbowKit / web3-react /
> Reown AppKit / Web3Auth, or apps for Ledger devices.

**Track 3 — Documentation Improvement:** $1 k

**No dedicated "agentic track" or explicit "human-in-the-loop" track listed for
ETHGlobal Cannes.** The human-in-the-loop framing is Phora's design choice and aligns
with Ledger's "Agents propose. Humans approve. Hardware enforces." Agent Stack
philosophy — lead with that narrative in the submission. The Ledger Agent Stack blog
post (`ledger.com/blog-preview-ledger-agent-stack`) is quotable evidence that Ledger
explicitly endorses HITL-on-device as the canonical agentic security model.

Phora is eligible for **both Track 1 and Track 2 simultaneously** (they count as one
partner submission under ETHGlobal rules where you can apply to multiple tracks from
one partner). Also note the Ledger workshop at ETHGlobal Cannes: Friday July 4 2025,
4:30 PM CEST, Workshop Room 3 — attend to ask about `originToken` access.

---

## 11. Gotchas

**WebHID browser permission**
- Requires `https://` or `http://localhost`. Will not work on plain HTTP. Next.js dev
  server on localhost qualifies; Vercel preview URLs also qualify.
- `startDiscovering()` must be called inside a user gesture handler (button click) —
  cannot be called programmatically on page load. Chrome and Edge only; Firefox and
  Safari do not support WebHID.

**SSR — DMK is client-only**
- Import `@ledgerhq/device-management-kit` and transport/signer packages only inside
  `'use client'` components or dynamic imports with `{ ssr: false }`.
- If Next.js tries to bundle these on the server the build will fail (Node.js has no
  `navigator.hid`).
- Pattern: `const { buildDmk } = await import('../lib/dmk')` inside a `useEffect`, or
  wrap in `dynamic(() => import('./LedgerConsentButton'), { ssr: false })`.

**Device and app firmware**
- Keep the Ledger Flex OS updated (latest as of mid-2025 is >= 1.5.x series).
- Install the Ethereum app from Ledger Manager / Ledger Live. The Ethereum app must be
  open on the device when you call `signTypedData` — the DMK's App Management step
  handles opening it, but the app must be installed first.
- EIP-712 transparent signing (struct display without clear signing metadata) requires
  Ethereum app >= 1.9.19. Ensure it is enabled in the ETH app settings ("Sign typed
  messages").

**Blind signing setting**
- "Enable blind signing" in the Ethereum app settings is OFF by default. Without ERC-7730
  metadata and without the transparent signing fallback, the device will reject the
  signTypedData call if blind signing is disabled. This is a gotcha in demos: always
  verify the ETH app settings beforehand, or ensure your metadata path is working.

**RxJS**
- All DMK operations return RxJS Observables. In Next.js this means RxJS must be in
  dependencies, not devDependencies. Be aware of potential bundle-size impact.

**Do not create two DMK instances**
- The `dmk-platform-patterns.md` skill file explicitly warns: do not use a module-level
  singleton in React. Use a context provider. Creating two instances causes them to
  fight over WebHID device ownership.

**Speculos — no Clear Signing metadata**
- `@ledgerhq/device-transport-kit-speculos` connects to the Speculos Docker emulator
  (`docker run --rm -it -p 5000:5000 ghcr.io/ledgerhq/speculos ...`).
- Speculos emulates the Ethereum app but does NOT emulate the Clear Signing metadata
  lookup from the registry. You can test blind/transparent signing flows with Speculos,
  but the full ERC-7730 rendering must be verified on real hardware.
- Usage: `.addTransport(speculosTransportFactory("http://localhost:5000"))`.

---

## 12. Realistic demo path on a hackathon timeline

**Day 1 (hours 0–4): Prove the pipe**
1. Install packages. Add `'use client'` guard and dynamic import.
2. Build DMK with `webHidTransportFactory`. Wire a button that calls `startDiscovering`.
3. Connect Flex over USB. Open Ethereum app on device. Call `getAddress` — confirm the
   Flex prompts address display. This verifies the full transport+signer stack.

**Day 1 (hours 4–8): signTypedData with transparent signing (level 2)**
1. Call `signTypedData` with the `ConsentGrant` struct using `.withContextModule(/* minimal stub */)` 
   or no context module (falls back to transparent signing).
2. Confirm the Flex shows field names and raw values scrolling on screen. Record a video.
   This is a demoable human-in-the-loop consent moment.

**Day 2: Write ERC-7730 descriptor and wire custom context module (level 3)**
1. Write `eip712-ConsentGrant.json` (see §7). Run `uvx erc7730 lint`.
2. Serve it from a Next.js API route: `GET /api/ledger/erc7730/ConsentGrant`.
3. Implement a minimal `customContextModule` that intercepts queries for the Phora
   domain and returns the descriptor.
4. Pass to `SignerEthBuilder(...).withContextModule(...)`.
5. Confirm the Flex shows "Grant history access" with formatted date fields.
6. Open a PR to `ethereum/clear-signing-erc7730-registry` — even if unmerged by judging,
   a submitted PR demonstrates the registry integration path and is standard for prize
   submissions.

**Fallback if hardware issues arise:** Use Speculos for transparent signing (level 2)
demo; judges see struct fields on the emulated screen. Cannot demo Clear Signing labels
on Speculos, so hardware is required for the full level-3 story.

---

## 13. Reference-check plan

Concrete verification steps before calling the integration "done":

- [ ] `npm install` succeeds with no peer-dep errors for all three packages
- [ ] Next.js dev build completes with no SSR import errors (check for `navigator.hid`
      reference in server bundle)
- [ ] Browser opens WebHID device picker (must be https or localhost, Chrome/Edge)
- [ ] Flex connects, `getAddress("44'/60'/0'/0/0")` returns correct address shown on device
- [ ] `signTypedData` with `ConsentGrant` struct: Flex shows at least struct fields (level 2)
- [ ] `erc7730 lint` passes on `eip712-ConsentGrant.json`
- [ ] Custom context module returns descriptor; Flex shows "Grant history access" + formatted
      dates (level 3)
- [ ] Disconnect device: DMK emits `Disconnected` state, UI handles gracefully
- [ ] Run same flow on Speculos for CI: verifies signTypedData call structure without hardware

---

## Sources

- Ledger DMK npm: `@ledgerhq/device-management-kit` (1.6.0), `@ledgerhq/device-signer-kit-ethereum` (1.8.0)
- Agent skills repo: `github.com/LedgerHQ/agent-skills`
- DMK docs: `developers.ledger.com/docs/device-interaction`
- Clear Signing docs: `developers.ledger.com/docs/clear-signing`
- AI tools overview: `developers.ledger.com/docs/ai-tools/overview`
- ERC-7730 registry: `github.com/LedgerHQ/clear-signing-erc7730-registry`
- Developer-preview tool: `github.com/LedgerHQ/clear-signing-erc7730-developer-tools/tree/master/developer-preview`
- Ledger Agent Stack: `ledger.com/blog-preview-ledger-agent-stack`
- ETHGlobal Cannes prizes: `ethglobal.com/events/cannes/prizes/ledger`
