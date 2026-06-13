# Dynamic Integration Brief

**Purpose:** Three-role integration — (1) primary auth, (2) embedded + external wallets for users, (3) server wallet for the AI agent.
**Prize targets:** Best Agentic Build ($2,000) and Best Money App ($2,000).

---

## 1. npm Packages and Versions (as of June 2026)

### React / Next.js SDK

```
npm i @dynamic-labs/sdk-react-core @dynamic-labs/ethereum viem
```

| Package | Version | Role |
|---|---|---|
| `@dynamic-labs/sdk-react-core` | 4.88.5 | Core provider, hooks, UI widget |
| `@dynamic-labs/ethereum` | 4.88.5 | EVM wallet connectors (`EthereumWalletConnectors`) |
| `@dynamic-labs/wagmi-connector` | 4.88.5 | Optional: bridges Dynamic to Wagmi's `useAccount` etc. |
| `viem` | ^2.45.3 | Peer dependency; included automatically |

Optional add-ons:
- `@dynamic-labs/ethers-v6` — if you prefer Ethers over Viem
- `@dynamic-labs/ethereum-aa` — smart/AA wallet support

### Server Wallet SDK (agent slice)

```
npm i @dynamic-labs-wallet/node-evm
```

| Package | Version | Role |
|---|---|---|
| `@dynamic-labs-wallet/node-evm` | 1.0.38 | Create, sign, and transact from a server-side EVM wallet |
| `@dynamic-labs-wallet/node-svm` | — | Solana equivalent (not needed for Phora) |

---

## 2. Provider Setup in Next.js App Router

Dynamic's SDK is client-only. Wrap the app tree in a client component:

```tsx
// app/providers.tsx
'use client';

import { DynamicContextProvider } from '@dynamic-labs/sdk-react-core';
import { EthereumWalletConnectors } from '@dynamic-labs/ethereum';
// Optional wagmi bridge:
import { DynamicWagmiConnector } from '@dynamic-labs/wagmi-connector';
import { WagmiProvider, createConfig } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http } from 'viem';
import { mainnet, sepolia } from 'viem/chains';

const wagmiConfig = createConfig({
  chains: [mainnet, sepolia],             // declare every chain you'll use
  multiInjectedProviderDiscovery: false,  // REQUIRED: Dynamic handles EIP-6963
  transports: { [mainnet.id]: http(), [sepolia.id]: http() },
});
const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <DynamicContextProvider
      settings={{
        environmentId: process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID!,
        walletConnectors: [EthereumWalletConnectors],
        // Enable multi-wallet linking in the Dynamic dashboard settings too.
      }}
    >
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <DynamicWagmiConnector>
            {children}
          </DynamicWagmiConnector>
        </QueryClientProvider>
      </WagmiProvider>
    </DynamicContextProvider>
  );
}
```

Mount in `app/layout.tsx`:
```tsx
// app/layout.tsx (Server Component)
import { Providers } from './providers';

export default function RootLayout({ children }) {
  return <html><body><Providers>{children}</Providers></body></html>;
}
```

**App Router SSR gotcha:** The Dynamic SDK triggers a known hydration mismatch if it renders during SSR (it reads browser APIs that don't exist on the server). The official fix is the wrapper pattern above — keep everything inside a `'use client'` boundary. If you still see "Hydration failed because initial UI does not match," Dynamic's troubleshooting doc says to additionally `next/dynamic` import the provider with `{ ssr: false }`.

### Environment ID: Sandbox vs Live

Every Dynamic project has two environment IDs (different strings). **Sandbox is free with all features unlocked**, capped at 1,000 users — fine for hackathon. Switch `NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID` to the Live ID before final submission/demo. Do not mix them.

---

## 3. Auth: JWT Verification Server-Side

When a user authenticates, Dynamic issues a signed JWT (RS256). Your Next.js API routes must verify it before trusting any user identity.

### JWT Claims

| Claim | Value |
|---|---|
| `sub` | **The Dynamic user ID** — your canonical user identifier |
| `environment_id` | Your environment ID (validate against yours) |
| `iss` | `app.dynamic.xyz/<environment_id>` |
| `scope` | Space-separated; must include `user:basic` for a fully-authenticated session |
| `verified_credentials` | Array of linked wallet addresses and credential details |
| `exp`, `iat` | Standard expiry/issued-at |

### JWKS Endpoint

```
GET https://app.dynamic.xyz/api/v0/sdk/{environmentId}/.well-known/jwks
```

### Verification Pattern (jose, Edge-compatible)

```typescript
// lib/auth.ts
import { createRemoteJWKSet, jwtVerify } from 'jose';

const JWKS = createRemoteJWKSet(
  new URL(`https://app.dynamic.xyz/api/v0/sdk/${process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID}/.well-known/jwks`)
);

export async function verifyDynamicJwt(token: string) {
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: `app.dynamic.xyz/${process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID}`,
  });
  const scopes = ((payload.scope as string) ?? '').split(' ');
  if (!scopes.includes('user:basic')) throw new Error('Incomplete auth');
  return payload; // payload.sub is the user ID
}
```

### Token Delivery to API Routes

Two modes (set in dashboard):

- **Cookie mode:** Dynamic sets an HttpOnly cookie on same-origin requests; your server reads it automatically. No `Authorization` header needed. Best for App Router server actions.
- **In-app (localStorage) mode:** Client calls `getAuthToken()` from `@dynamic-labs/sdk-react-core` and passes the token as `Authorization: Bearer <token>`. Use this mode when your attestation API routes are called explicitly by client code (Phora's likely pattern).

For API routes:
```typescript
// app/api/attest/route.ts
import { verifyDynamicJwt } from '@/lib/auth';

export async function POST(req: Request) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return new Response('Unauthorized', { status: 401 });
  const payload = await verifyDynamicJwt(token);
  const userId = payload.sub as string; // tie to World ID registry entry
  // ... attestation logic
}
```

---

## 4. Embedded Wallets

### Architecture

Dynamic embedded wallets use **TSS-MPC (Threshold Signature Scheme Multi-Party Computation)**:
- Default: **2-of-2** (user share on device + server share in TEE)
- Optional: **2-of-3** (adds a backup/recovery share)
- The full private key never reconstructs; MPC Relay coordinates signing in a TEE.
- End-user is self-custodial; wallet is exportable.

### Supported Chains for Embedded Wallets

Dynamic embedded wallets natively support **EVM chains** and **SVM (Solana)**. World Chain (chain ID 480) is EVM-compatible (OP Stack), so it should work with `EthereumWalletConnectors`. However, World Chain is not called out as a named first-party chain in Dynamic's current docs.

**UNCONFIRMED:** Whether World Chain (eip155:480) is in Dynamic's preset chain list or must be added as a custom EVM network. Custom EVM networks can be registered via `overrides.evmNetworks` in `DynamicContextProvider settings` using the `EvmNetwork` type. Confirm whether embedded-wallet MPC signing is available for custom (non-preset) EVM chains — the docs hint it is for any EVM chain, but verify this.

Sepolia (chain ID 11155111) is a standard EVM testnet and is expected to be natively supported.

### Signing an EIP-191 Message (Attestation Signature)

```typescript
// In a client component
import { useDynamicContext, useUserWallets } from '@dynamic-labs/sdk-react-core';

function AttestButton({ walletAddress }: { walletAddress: string }) {
  const userWallets = useUserWallets();

  const sign = async () => {
    // Find the specific wallet to sign with (not just primaryWallet)
    const wallet = userWallets.find(w => w.address === walletAddress);
    if (!wallet) throw new Error('Wallet not found');
    const sig = await wallet.signMessage('I attest control of this wallet as of ...');
    // send sig + walletAddress to /api/attest
  };
  return <button onClick={sign}>Attest Wallet</button>;
}
```

### Signing EIP-712 Typed Data

```typescript
// wallet.connector.signTypedData(typedData) — exact method depends on SDK version
// Or via wagmi's useSignTypedData hook (if DynamicWagmiConnector is mounted)
import { useSignTypedData } from 'wagmi';

const { signTypedData } = useSignTypedData();
signTypedData({ domain, types, primaryType, message });
```

Dynamic also exposes `primaryWallet.connector.signTypedData()` for direct access without Wagmi.

---

## 5. Multi-Wallet Linking (External Wallets)

Dynamic's multi-wallet feature allows **one Dynamic user to link multiple external wallets simultaneously**. This is the core mechanism for Phora's attestation model.

### Key hooks

| Hook | Purpose |
|---|---|
| `useUserWallets()` | Returns array of all linked wallets for the current user |
| `useDynamicContext().primaryWallet` | The currently active wallet |
| `useSwitchWallet()` | Switch the active wallet |
| `useDynamicContext().setShowLinkNewWalletModal(true)` | Trigger Dynamic's link-wallet UI |

### Signing with a Specific Linked Wallet

```typescript
const userWallets = useUserWallets();
const target = userWallets.find(w => w.address === addressToAttest);
const sig = await target?.signMessage(message);
```

Each `wallet` in `useUserWallets()` has `.signMessage()` and `.connector.signTypedData()` available regardless of whether it is the primary wallet.

### Privacy Note

Dynamic's multi-wallet associations are **scoped to your app only** — not shared across Dynamic's customer base.

---

## 6. Server Wallet for the AI Agent

### Product Name and Status

The product is called **Dynamic Server Wallets** (Node SDK). It is **generally available** (not on waitlist) with a free tier. Package: `@dynamic-labs-wallet/node-evm`.

### Authentication

Server wallets authenticate with an **API token** generated from the Dynamic dashboard (Developer > API Tokens). This is separate from the user JWT.

### Creating and Using a Server Wallet

```typescript
import { DynamicEvmWalletClient, ThresholdSignatureScheme }
  from '@dynamic-labs-wallet/node-evm';

// 1. Authenticate once at startup
const client = new DynamicEvmWalletClient({
  environmentId: process.env.DYNAMIC_ENVIRONMENT_ID!,
});
await client.authenticateApiToken(process.env.DYNAMIC_API_TOKEN!);

// 2. Create agent wallet (do once; persist the returned data)
const { walletMetadata, externalServerKeyShares, rawPublicKey } =
  await client.createWalletAccount({
    thresholdSignatureScheme: ThresholdSignatureScheme.TWO_OF_TWO,
    password: process.env.AGENT_WALLET_PASSWORD!,
    backUpToDynamic: true,   // Dynamic holds one key share; you hold the other
  });
// CRITICAL: persist walletMetadata (non-sensitive) + externalServerKeyShares
// (sensitive — store in KMS / Secret Manager). SDK is stateless.

// 3. Sign a message (AgentBook registration, x402 payment, etc.)
const sig = await client.signMessage({
  message: 'Agent registration payload',
  walletMetadata,
  externalServerKeyShares,
  password: process.env.AGENT_WALLET_PASSWORD!,
});
```

### Supported Chains for Server Wallets

The server wallet SDK supports **EVM chains** (all EVM-compatible networks). World Chain (eip155:480) is EVM, so the cryptographic signing layer should work. The x402 facilitator in Dynamic's agent payment docs uses Base/USDC by default.

**UNCONFIRMED:** Whether World Chain is explicitly listed in Dynamic's server wallet chain support, or whether you can configure an arbitrary EVM chain ID for transaction signing. The signing is chain-agnostic (ECDSA), but sending transactions requires the right RPC. You will need to provide the World Chain mainnet RPC yourself and use viem to broadcast signed transactions:

```typescript
import { createWalletClient, http } from 'viem';
import { worldchain } from 'viem/chains'; // or define EvmChain manually

const walletClient = createWalletClient({
  chain: worldchain,
  transport: http('https://worldchain-mainnet.g.alchemy.com/v2/...'),
});
// Use Dynamic to sign; use viem walletClient to broadcast
```

### Agent Payments (x402)

Dynamic's agent payment flow: when the agent calls an x402-protected endpoint, it gets a 402 response, signs the payment with its server wallet, and retries with an `X-Payment` header. Reference: `dynamic-agent-payments` CLI tool (`npx dynamic-agent-payments pay <url>`). For World Chain specifically, you will need to confirm x402 facilitator support for eip155:480 (default facilitator uses Base).

### Persistence Requirements

The Node SDK is **stateless** — you own all persistence:
- `walletMetadata` — safe to cache in Postgres/Redis
- `externalServerKeyShares` — sensitive MPC key material; store in HSM, AWS KMS, or a secrets manager. If `backUpToDynamic: true`, Dynamic holds a backup share and can assist with recovery.

### Pricing and Availability

| Tier | Cost | Operations/month | Notes |
|---|---|---|---|
| Launch (free) | $0 | 1,000 | No credit card in sandbox; all features available |
| Growth | $249/mo | 5,000 | +$0.05 per additional op |
| Enterprise | Custom | 10,000+ | SLA, volume discounts |

1,000 free operations/month is sufficient for hackathon use. Sandbox is fully free with all features. No waitlist; no enterprise gate.

---

## 7. Gotchas

1. **SSR / Hydration:** `DynamicContextProvider` must be in a `'use client'` boundary. Server components cannot import Dynamic hooks. The DynamicWidget can also cause hydration mismatches if not properly client-guarded. Dynamic's own troubleshooting doc lists this as a known issue with a recommended fix.

2. **Environment ID is not a secret** but it is tied to your environment. The sandbox ID and live ID are different strings — switching from sandbox to live requires updating `NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID` and re-deploying.

3. **Embedded wallet key custody:** With 2-of-2 TSS, Dynamic holds a server share in a TEE. Dynamic cannot sign unilaterally (both shares required), but loss of the user share without backup = permanent loss of funds. Always enable backup in production.

4. **Custom EVM chain + embedded wallet:** World Chain (480) is not a named preset. If it requires explicit chain registration, add it via `settings.overrides.evmNetworks`. UNCONFIRMED whether MPC embedded-wallet signing is available for non-preset EVM chains — test this early.

5. **Rate limits:** Dynamic publishes a rate limits page (`/docs/developer-dashboard/rate-limits`); specific numbers were not retrievable during research. The free tier (1,000 ops/month) refers to server wallet operations. JWT JWKS verification is local (no Dynamic API call per request after the key is cached).

6. **Multi-wallet privacy:** Multi-wallet associations are app-scoped. If Phora's attestation registry sees wallet A and wallet B linked under the same Dynamic user, another app using Dynamic cannot see this association. Phora's own registry is the canonical record.

7. **`multiInjectedProviderDiscovery: false`** is required in Wagmi config when using `DynamicWagmiConnector`. Forgetting this causes duplicate wallet detection.

8. **Server wallet password:** The `password` param in `createWalletAccount` encrypts the key share locally. Choose a strong secret, store it in your secrets manager, never hardcode.

---

## 8. Prize Requirements (ETHGlobal New York 2026)

Dynamic is offering **$10,000 total** across five tracks. Phora targets two:

### Best Agentic Build — $2,000

> "Allow AI agent to use Dynamic's server wallets to sign and execute onchain transactions"
> "Utilizes any Dynamic SDK in any framework"
> "Your app must be deployed and usable by judges"
>
> Bonuses: multi-primitive integration and meaningful agent autonomy.

**What Phora must show:** The AI agent holds a Dynamic server wallet, uses it to register on AgentBook (World Chain), sign x402 payments, and perform autonomous onchain actions. The agent's wallet address is the attestation anchor.

### Best Money App — $2,000

> "You've got wallets, auth, and payments handled. Go build something awesome!"
> "Utilizes any Dynamic SDK in any framework"
> "Your app must be deployed and usable by judges"
>
> Bonuses: depth, technical execution, real-world adoption potential.

**What Phora must show:** Dynamic auth gating the entire app, embedded wallets onboarding wallet-less users, and the unified behavioral profile (consent-gated Allium data) as the "money" layer.

Note: No "Best Overall" track exists at ETHGlobal New York 2026. The closest general-purpose track is Best Money App. Double-check ETHGlobal's prize page for any last-minute additions: `https://ethglobal.com/events/newyork2026/prizes/dynamic`.

---

## 9. Reference-Check Plan

Run these three checks before building on Dynamic:

### Check A: Login + JWT Verification

1. Create a Dynamic sandbox project; grab the environment ID.
2. Drop `DynamicContextProvider` + `DynamicWidget` in a minimal Next.js App Router page.
3. Log in via the widget.
4. Call `getAuthToken()` from `@dynamic-labs/sdk-react-core` and log the token.
5. From a Next.js API route (`/api/ping`), receive the token in the `Authorization` header, call `jwtVerify` against the JWKS endpoint, and return `payload.sub`.
6. Verify the `sub` is stable across sessions.

**Pass criteria:** API route returns the user ID without error; `scope` includes `user:basic`.

### Check B: Sign an Attestation Message with an Embedded Wallet + External Wallet

1. Create an embedded wallet via Dynamic's widget.
2. Link an external wallet (e.g., MetaMask) using `setShowLinkNewWalletModal`.
3. Call `useUserWallets()` and confirm both wallets appear.
4. For each wallet, call `wallet.signMessage('phora-attestation-test')`.
5. Verify the signature client-side via `viem`'s `verifyMessage`.
6. Confirm both wallets sign on Sepolia (switch network if needed).

**Pass criteria:** Two wallets, two valid signatures, both recovered addresses match wallet addresses.

### Check C: Server Wallet + World Chain Transaction

1. Generate an API token from the Dynamic dashboard.
2. Install `@dynamic-labs-wallet/node-evm`.
3. Call `createWalletAccount()` — log the returned address.
4. Call `signMessage()` — verify the signature locally.
5. Construct a minimal ETH transfer or contract call on World Chain testnet (eip155:4801 if available) using viem, with the Dynamic-signed raw transaction.
6. Broadcast and confirm on World Chain explorer.

**Pass criteria:** Transaction confirmed on World Chain; agent wallet address is recoverable from the signature.

If World Chain mainnet (eip155:480) is required for AgentBook, run step 5-6 against mainnet with a dust amount of bridged ETH. Confirm before building the full agent slice.

---

## Sources

- Dynamic docs llms.txt: https://www.dynamic.xyz/docs/llms.txt
- Dynamic ETHGlobal NY 2026 page: https://www.dynamic.xyz/docs/overview/ethglobal-new-york-2026
- ETHGlobal prize page: https://ethglobal.com/events/newyork2026/prizes/dynamic
- Server wallets overview: https://www.dynamic.xyz/docs/node/wallets/server-wallets/overview
- Agent payments: https://www.dynamic.xyz/docs/overview/agents/agent-payments
- JWT tokens: https://www.dynamic.xyz/docs/overview/authentication/tokens
- Pricing: https://www.dynamic.xyz/pricing?tab=onchain-automation
- Sandbox vs Live: https://www.dynamic.xyz/docs/developer-dashboard/sandbox-vs-live
- MPC architecture: https://www.dynamic.xyz/docs/overview/wallets/embedded-wallets/mpc/overview
- npm `@dynamic-labs/sdk-react-core` v4.88.5
- npm `@dynamic-labs/ethereum` v4.88.5
- npm `@dynamic-labs/wagmi-connector` v4.88.5
- npm `@dynamic-labs-wallet/node-evm` v1.0.38
