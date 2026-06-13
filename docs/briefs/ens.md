# ENS Integration Brief

**Target prizes:** AI Agents (agent subnames, ENSIP-26), Most Creative (name-severance, soulbound attestations), Integrate pool.

---

## 1. ENSv2 Status on Sepolia — June 2026

### What is ENSv2?

ENSv2 replaces ENSv1's single flat registry with a **hierarchical per-name registry** model. Key changes:

- **Every `.eth` name gets its own registry contract** (deployed by a factory). Subname ownership and transfer rules are set at the name level, not protocol-wide.
- **Name Wrapper is absorbed into core.** ENSv1's Name Wrapper concept (fuses, permissions) is now native to ENSv2's role-based permission model; no separate NameWrapper contract for new names.
- **Grace period removed.** Names expire exactly when they say they expire; no 90-day grace.
- **Single-step registration.** The old commit-reveal (two transactions + 60-second wait) is compressed into one transaction. (UNCONFIRMED: exact mechanism — docs say "single step" but do not publish the new controller ABI as of brief date.)
- **Namechain cancelled (Feb 2026).** ENSv2 deploys on Ethereum L1 only; no dedicated L2. ENS stays interoperable with L2s via CCIP-Read, not via Namechain.
- **Universal Resolver is the canonical entry point.** All resolution — on-chain, CCIP-Read, cross-chain — routes through it.

### Current Sepolia Deployment (ENSv1-compatible contracts, still active)

These are the live, confirmed Sepolia addresses from `ensdomains/ens-contracts` (staging branch, verified June 2026):

| Contract | Sepolia Address |
|---|---|
| ENSRegistry | `0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e` |
| BaseRegistrarImplementation | `0x57f1887a8bf19b14fc0df6fd9b2acc9af147ea85` |
| ETHRegistrarController | `0xfb3cE5D01e0f33f41DbB39035dB9745962F1f968` |
| NameWrapper | `0x0635513f179D50A207757E05759CbD106d7dFcE8` |
| PublicResolver | `0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5` |
| UniversalResolver | `0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe` |
| ReverseRegistrar (L1) | `0xA0a1AbcDAe1a2a4A2EF8e9113Ff0e02DD81DC0C6` |
| DefaultReverseRegistrar | `0x4F382928805ba0e23B30cFB75fC9E848e82DFD47` |
| DNSRegistrar | `0x5a07C75Ae469Bf3ee2657B588e8E6ABAC6741b4f` |

**UNCONFIRMED:** ENSv2-specific new contract addresses on Sepolia. The ENS App Alpha is live at `sepolia.app.ens.domains` and an ENS Explorer Alpha is live; ENSv2 contracts are deployed on Sepolia, but the official docs page (`docs.ens.domains/contracts/ensv2/overview/`) states "work-in-progress — expect updates as design is finalised and audits are completed." No explicit ENSv2 registry/controller/resolver addresses are published in the docs as of June 2026. **Action required:** Check `app.ens.domains` app source or ENS Discord for current ENSv2 contract addresses before implementing against v2-specific interfaces.

### Library versions required for ENSv2 support

From the official ENSv2 Readiness docs:

| Library | Minimum version |
|---|---|
| `@ensdomains/ensjs` | `>= 4.2.3` (latest as of May 2026: `4.2.3`) |
| `viem` | `>= 2.35.0` |
| `web3.py` | `>= 7.16.0` |
| `ethers.js` | Native support pending; use ENS ethers patch for v5/v6 |

**Use `@ensdomains/ensjs` (not raw viem) for ENS operations.** ENSjs wraps viem under the hood and handles CCIP-Read, Universal Resolver routing, and multi-chain client setup. Use raw viem only if you need low-level control over a specific contract call ensjs doesn't expose.

---

## 2. Registering a Name on Sepolia

### Current flow (ENSv1 controller, still live on Sepolia)

1. **Commit:** call `ETHRegistrarController.commit(commitment)` — commitment is `keccak256(label, owner, duration, secret, resolver, data[], reverseRecord, ownerControlledFuses)`.
2. **Wait:** minimum 60 seconds (anti-frontrun delay).
3. **Register:** call `ETHRegistrarController.register(...)` with same parameters plus value (in Sepolia ETH — cost is via `rentPrice()` on the controller, typically near-zero on testnet).
4. **Duration:** minimum 28 days; for hackathon use, 1 year is conventional.

### ENSv2 alpha flow (app.ens.domains Sepolia alpha)

- Single-step registration (one transaction). UNCONFIRMED exact contract ABI. The Alpha requires **Sepolia USDC** as payment — the testnet app has shifted to stablecoin pricing. If building directly against ENSv2 contracts, obtain Sepolia USDC from a Sepolia USDC faucet first, or use the ENSv1 controller above which still uses Sepolia ETH.

### Hackathon timing note

- Using the ENSv1 commit-reveal: budget ~2–3 minutes from start to registered name (60s wait + transaction times).
- Using ENSv2 alpha: single transaction, but requires Sepolia USDC and relying on alpha contracts that may change.
- **Recommendation for demo reliability:** Use ENSv1 contracts (known, stable Sepolia addresses). The commit-reveal adds a 60-second pause; run registration at the start of a session so the name is ready.

---

## 3. Subnames via Durin

### What Durin is

Durin (from Namestone / `namestonehq/durin`) is an opinionated ENS L2 subname system. It handles the CCIP-Read stack (L1 Resolver + offchain gateway) so you only write business logic in the L2 contracts.

### Contracts

Durin deploys four contracts, all with a **uniform factory address across every supported chain:**

| Contract | Address | Role |
|---|---|---|
| `L2RegistryFactory` | `0xDddddDdDDD8Aa1f237b4fa0669cb46892346d22d` | Creates new L2 registries |
| `L2Registry` (per-parent) | deployed by factory | Stores subnames as ERC-721 NFTs; holds address + text records |
| `L2Registrar` (template) | customizable | Minting logic: pricing, allowlists, token-gating |
| `L1Resolver` | deployed on L1 | Forwards ENS queries to L2 via CCIP-Read |

Additional dependency: `UniversalSigValidator` at `0x164af34fAF9879394370C7f09064127C043A35E9` (required for signature validation).

### Supported chains

Mainnets: Arbitrum, Base, Celo, Linea, Optimism, Polygon, Scroll, Worldchain.
Testnets: Arbitrum Sepolia, Base Sepolia, Celo Sepolia, Linea Sepolia, Optimism Sepolia, Polygon Amoy, Scroll Sepolia, Worldchain Sepolia.

**Sepolia (L1) is not an L2 target chain for Durin.** Durin subnames live on one of the above L2s, with the L1Resolver deployed on Sepolia (L1) to route queries. The parent ENS name lives on Sepolia L1; subnames live on e.g. Base Sepolia.

### ENSv2 compatibility

**UNCONFIRMED.** Durin documentation does not mention ENSv2 explicitly. Durin's L1Resolver points to an L2 contract, independent of whether the parent name was registered under ENSv1 or ENSv2 contracts. CCIP-Read is compatible with both. However, if ENSv2 changes how the resolver is set on a name, the L1 side of Durin's setup may need adjustment. **Treat as compatible with ENSv1-registered names on Sepolia; verify with ENSv2-registered names if using the alpha.**

### Minting flow

1. Deploy an `L2Registry` via `L2RegistryFactory.createRegistry(...)` on the target L2 testnet (e.g. Base Sepolia).
2. Deploy or configure an `L2Registrar` and call `L2Registry.addRegistrar(registrarAddress)`.
3. Deploy `L1Resolver` on Sepolia L1 pointing at the L2Registry.
4. Set the parent name's resolver on Sepolia to the `L1Resolver` address.
5. Users (or your server) call `L2Registrar.register(label, owner, ...)` to mint a subname as an ERC-721 NFT on L2.
6. Resolution: ENS clients query L1 → `L1Resolver` reverts with `OffchainLookup` → client fetches from CCIP-Read gateway → gateway reads from L2Registry → returns verified result.

### Soulbound / non-transferable subnames

**Durin itself does not provide built-in soulbound support.** The `L2Registrar` is explicitly designed to be customized. To make attestation subnames non-transferable:

- Override the `transferFrom` / `safeTransferFrom` functions in a custom `L2Registrar` or a modified `L2Registry` subclass to revert when `from != address(0)` (i.e., allow minting but block transfers).
- This is a standard ERC-721 soulbound pattern; it is straightforward but requires deploying a custom contract rather than using Durin's default registrar out of the box.
- Alternatively, for L1 subnames under the Name Wrapper (if not using Durin), burn the `CANNOT_TRANSFER` fuse (see section 5 below).

**Feasibility:** Custom L2Registrar with soulbound logic is a ~50-line Solidity modification to Durin's template. High feasibility for hackathon, but it must be deployed and verified before demo.

### Text records on subnames

The `L2Registry` stores text records natively (it holds `address`, `text records`, and `contenthash` per subname). Text records are set by calling `L2Registry.setText(node, key, value)` from an authorized address (the owner or an approved operator). Resolution goes through CCIP-Read as described above. There is no ENS Public Resolver involved — the L2Registry IS the resolver for subnames.

---

## 4. Text Records

### Standard keys (ENSIP-5)

| Key | Use |
|---|---|
| `avatar` | Profile image URI |
| `description` | Human-readable description |
| `url` | Website |
| `com.twitter` | Twitter handle |
| `eth.ens.delegate` | Delegation address |

### Custom keys for Phora attestation metadata

Custom keys have no ENSIP restriction. Suggested keys for wallet attestation subnames:

| Key | Value |
|---|---|
| `phora.wallet` | The attested wallet address |
| `phora.window.start` | Unix timestamp (ISO 8601 or epoch) |
| `phora.window.end` | Unix timestamp or `"open"` |
| `phora.sig.ref` | Content hash or IPFS CID of the original attestation signature |
| `phora.dispute` | `"true"` if a compromise dispute annotation exists |

Keep keys namespaced under `phora.` to avoid collisions. ENS resolvers store and return any key/value pair; there is no allowlist.

### ENSIP-26 keys for the agent subname

ENSIP-26 (Agent Text Records, Draft, May 2025) standardizes two keys:

| Key | Format | Purpose |
|---|---|---|
| `agent-context` | Plain text, Markdown, YAML, or JSON | Describes the agent and how to interact with it; entry point for agent discovery |
| `agent-endpoint[<protocol>]` | Valid URL (including IPFS URIs) | Protocol-specific endpoint; `<protocol>` is one of `mcp`, `a2a`, `web` |

**Example for Phora's agent subname (`agent.phora.eth`):**

```
agent-context = "Phora identity agent. Queries attested wallet history for a given Phora identity. Requires KYA consent grant before disclosure."
agent-endpoint[mcp] = "https://agent.phora.xyz/mcp"
agent-endpoint[a2a] = "https://agent.phora.xyz/a2a"
agent-endpoint[web] = "https://phora.xyz/agent"
```

ENSIP-26 is a Draft (not finalized). It extends ENSIP-5 (text records) and is backward-compatible: clients that do not know these keys ignore them.

---

## 5. Soulbound Subnames on L1 (Name Wrapper path)

If subnames are managed on L1 (not via Durin), the ENSv1 **Name Wrapper** supports non-transferable subnames via fuses. This requires the parent name to be wrapped first.

### Relevant fuses

| Fuse | Effect |
|---|---|
| `PARENT_CANNOT_CONTROL` | Emancipates the subname; parent can no longer burn fuses or replace it until expiry |
| `CANNOT_UNWRAP` | Locks the name inside the Name Wrapper |
| `CANNOT_TRANSFER` | Makes the wrapped NFT non-transferable (soulbound) |

### To create a soulbound subname (L1 path)

1. Wrap the parent name in the NameWrapper.
2. Burn `CANNOT_UNWRAP` on the parent (required before you can burn fuses on children).
3. When minting the subname, burn `PARENT_CANNOT_CONTROL | CANNOT_UNWRAP | CANNOT_TRANSFER` (and optionally `CAN_EXTEND_EXPIRY`).
4. Once burned, fuses cannot be unburned until expiry. This is permanent for the life of the attestation window.

**Note:** The Name Wrapper `CANNOT_TRANSFER` fuse is what makes the subname "soulbound." This is the approved ENS mechanism. Under ENSv2, Name Wrapper functionality is integrated into the core protocol with a role-based model; the specific fuse names and mechanism may differ in ENSv2-native names. UNCONFIRMED how ENSv2 role model maps to the fuse names above.

---

## 6. Reverse Resolution

### Sepolia L1 — setting the primary name

Call `ReverseRegistrar.setName(name)` from the wallet address you want to bind. This writes to the reverse registry at `addr.reverse`. The `PublicResolver` stores the reverse record.

- Sepolia `ReverseRegistrar`: `0xA0a1AbcDAe1a2a4A2EF8e9113Ff0e02DD81DC0C6`
- Can also call `setNameForAddr(address, owner, resolver, name)` to set on behalf of a contract.

With ensjs:

```ts
import { setAddressRecord, setPrimaryName } from '@ensdomains/ensjs/wallet'
await setPrimaryName(walletClient, { name: 'phora.eth' })
```

### L2 reverse resolution (for Durin subnames)

If a wallet's canonical subname lives on L2 (e.g., `alice.phora.eth` on Base Sepolia), L2 reverse resolution is handled by `L2ReverseRegistrar` contracts deployed by ENS on each L2 (e.g., `deployments/baseSepolia/L2ReverseRegistrar.json` in ens-contracts). The flow:

1. On the L2, call `L2ReverseRegistrar.setName(name)` from the wallet.
2. Resolution uses CCIP-Read from the L1 `DefaultReverseResolver` back to the L2 registrar.
3. ENS-aware clients that support multichain resolution (ensjs >= 4.2.3, viem >= 2.35.0) will resolve this transparently.

For Phora's demo, the simplest path is to set L1 reverse resolution for the registry owner wallet (the identity root), and rely on subname forward resolution to display attestation metadata.

---

## 7. Gotchas

### v1 / v2 namespace coexistence on Sepolia

ENSv1 names registered on Sepolia continue to work via the ENSv1 fallback resolver in ENSv2. The `LegacyENSRegistry.json` file in ens-contracts confirms a legacy registry is preserved. Do not assume a name registered on ENSv1 contracts is inaccessible after ENSv2 launch; it is not — the new Universal Resolver handles fallback automatically.

### ENSv2 alpha is genuinely alpha

The app at `sepolia.app.ens.domains` is labeled "true alpha." Contract addresses for ENSv2 are not published in the docs. Do not build your demo's critical path against ENSv2 contracts unless you can confirm addresses and ABI stability. **Safe approach: register on ENSv1 Sepolia contracts (known, stable) and set the resolver to a Durin L1Resolver or the PublicResolver for text records.**

### ENS Manager App on Sepolia (ENSv1)

The ENS Manager App at `app.ens.domains` supports Sepolia for ENSv1 names. You can view names, set records, and verify reverse resolution through the UI. Useful for demo verification without writing code.

### Resolver compatibility with ENS-aware clients

Standard ENS-aware clients (Rainbow, MetaMask, ENS Manager) resolve `.eth` names against the Universal Resolver. For CCIP-Read (Durin subnames), clients must support ERC-3668. ENSjs >= 4.2.3 and viem >= 2.35.0 both do. Check that your demo's frontend uses one of these; raw `ethers.js` without the ENS patch does not support CCIP-Read transparently.

### CCIP-Read gateway reliability for demos

Durin's CCIP-Read gateway is operated infrastructure (not permissionless). If the gateway goes down, subname resolution fails. Mitigation options:
1. **Run the gateway locally** during the demo — Durin's gateway codebase is open source.
2. **Fall back to L1 subnames** (no CCIP-Read path) if demo reliability is critical. L1 subnames are more expensive but have no external gateway dependency.
3. **Use Namestone's hosted gateway** (Durin's commercial tier via Namestone) which has higher uptime guarantees.

### Name Wrapper status under ENSv2

ENSv1 Name Wrapper (for L1 soulbound subnames) remains functional on Sepolia and mainnet. Under ENSv2, its functionality is absorbed into the core protocol. For new ENSv2 names, do not use the ENSv1 NameWrapper contract — use the ENSv2 native role model. Since ENSv2 contract details are not yet published, plan for L1 soulbound subnames using the ENSv1 NameWrapper on Sepolia if you need soulbound before ENSv2 addresses are confirmed.

### ENS CLI tool

**UNCONFIRMED.** No npm CLI tool from Greg Skril (gskril) matching a "preview tool for names" was found. gskril's ENS-related public repositories include `ens-widgets` (npm: `ens-widgets`, a React component), `ens-indexer`, and `ens-api` (a Cloudflare Worker). The search found `v3xlabs/ens-tools` (GitHub: `v3xlabs/ens-tools`, web tool at `tools.ens.xyz`) which provides a name-check dashboard (normalization, expiry, resolver, wrapped state, subnames) — this may be the "preview tool" intended. There is also `@triplespeeder/ens-updater` (npm: `@triplespeeder/ens-updater`) for CLI management of ENS names. **Neither is confirmed as the specific Greg Skril preview tool referenced in the brief prompt.** Use `tools.ens.xyz` for manual verification during development.

---

## 8. Reference-Check Plan (End-to-End Verification)

The following steps prove the full Phora ENS integration on Sepolia before demo day.

| Step | Action | Tool | Expected result | Est. time | Est. cost |
|---|---|---|---|---|---|
| 1. Register name | Call `ETHRegistrarController.commit()` then wait 60s then `register()` for e.g. `phora.eth` on Sepolia | ensjs `commitName` + `registerName` or ENS Manager app | Name appears in ENS Manager on Sepolia | ~3 min | ~0 Sepolia ETH |
| 2. Wrap name | Call `NameWrapper.wrapETH2LD(...)` | ensjs `wrapName` | Name is wrapped; NameWrapper holds NFT |  ~1 min | ~0 |
| 3. Deploy L2Registry | Call `L2RegistryFactory.createRegistry(...)` on Base Sepolia | Foundry or Hardhat | L2Registry deployed at new address | ~2 min | Base Sepolia ETH (faucet) |
| 4. Deploy L1Resolver | Deploy Durin `L1Resolver` on Sepolia pointing to Base Sepolia L2Registry | Foundry | L1Resolver address | ~2 min | ~0 Sepolia ETH |
| 5. Set resolver | Call `NameWrapper.setResolver(node, l1ResolverAddress)` or ENS Manager | ensjs `setResolver` | Resolver on phora.eth = L1Resolver | ~1 min | ~0 |
| 6. Mint subname | Call `L2Registrar.register("alice", ownerAddr, ...)` on Base Sepolia | custom script | alice.phora.eth minted as ERC-721 on Base Sepolia | ~1 min | ~0 |
| 7. Set text record | Call `L2Registry.setText(node, "phora.wallet", "0xabc...")` | custom script | Record stored on L2 | ~1 min | ~0 |
| 8. Resolve with viem | `publicClient.getEnsText({ name: 'alice.phora.eth', key: 'phora.wallet' })` | viem >= 2.35.0 | Returns `"0xabc..."` via CCIP-Read | ~30s | N/A |
| 9. Set reverse record | `ReverseRegistrar.setName('phora.eth')` from owner wallet | ensjs `setPrimaryName` | Reverse lookup of owner addr → phora.eth | ~1 min | ~0 |
| 10. Display check | Open ENS Manager or Rainbow on Sepolia, look up owner address | browser | Shows phora.eth as primary name | ~1 min | N/A |
| 11. ENSIP-26 records | Set `agent-context` and `agent-endpoint[mcp]` on `agent.phora.eth` subname | L2Registry setText | Records resolve correctly | ~1 min | ~0 |

**Total estimated time for full end-to-end check: ~15 minutes.** The critical path is step 3–8 (Durin L2 setup and CCIP-Read resolution); budget extra time for gateway startup.

### Feasibility concerns for solo hackathon

- **Soulbound subnames via Durin:** requires a custom `L2Registrar` contract (small Solidity change) that must be deployed, tested, and verified. Doable but adds ~2 hours to the build. If time is short, skip soulbound on L2 subnames; use Name Wrapper CANNOT_TRANSFER fuses for L1 subnames instead (no custom contract needed).
- **ENSv2 native registration:** The ENSv2 alpha is a moving target with undisclosed contract addresses. Do not depend on it for the demo critical path. Register on ENSv1 Sepolia for reliability.
- **CCIP-Read gateway:** Run locally or use Namestone hosted. Do not rely on an un-tested gateway URL in the final demo.
- **ENSIP-26 is a Draft.** Text record keys work fine (they are just string keys); the standard will not break. The ENS "AI Agents" prize judges are aware of this draft status.
- **ensjs 4.2.3 is the minimum for ENSv2 compatibility.** Install it explicitly; `npm install @ensdomains/ensjs@^4.2.3` and `viem@^2.35.0`.

---

## Sources

- ENS Docs Deployments: https://docs.ens.domains/learn/deployments/
- ENSv2 Contracts Overview: https://docs.ens.domains/contracts/ensv2/overview/
- ENSv2 Readiness Guide: https://docs.ens.domains/web/ensv2-readiness/
- ENSv2 Architecture Blog: https://ens.domains/blog/post/ensv2-architecture
- ENS App Alpha Blog: https://ens.domains/blog/post/ens-app-alpha
- ENSIP-26: https://docs.ens.domains/ensip/26
- Durin GitHub: https://github.com/namestonehq/durin
- ENS Name Wrapper Fuses: https://docs.ens.domains/wrapper/fuses/
- ENS Contracts (Sepolia staging): https://github.com/ensdomains/ens-contracts/tree/staging/deployments/sepolia
- CCIP-Read Docs: https://docs.ens.domains/resolvers/ccip-read/
- ENS Subdomains Overview: https://docs.ens.domains/web/subdomains/
- ENS Tools (v3xlabs): https://tools.ens.xyz/check
- Namechain Cancellation: https://cointelegraph.com/news/ens-abandons-plan-namechain-will-stay-on-ethereum
