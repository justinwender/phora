# Phora

**A consent-based onchain identity and history rail.** One human anchors one
permanent record, wallets attach to it through time-scoped attestations, and anyone
the owner authorizes can verify that history. Phora records and discloses; it computes
no score.

The core idea: pseudonymity's defect is not privacy, it is **commitment**. A fresh
wallet costs nothing, so you cannot credibly bind your future self to your past
behavior. Phora makes shown history unforgeable and undeletable while keeping
disclosure sovereign — so verifiers can price honesty without anyone being forced to
disclose.

> **Status: Phase 0 (planning + scaffold).** No feature logic yet. The architecture of
> record is [`docs/plan.md`](docs/plan.md); per-integration research is in
> [`docs/briefs/`](docs/briefs/).

## Architecture: four layers

1. **Uniqueness (World ID).** World ID 4.0 proves one human, one registry entry, ever.
   Proof validation is server-side. Without proof of human the commitment property is
   worthless, so this layer is load-bearing.
2. **Commitment (the registry).** An append-only registry maps one World ID to a set of
   time-scoped wallet attestations, each signed by the wallet at link time. History
   within an attested window is permanent. Compromised-wallet disputes are annotated,
   never deleted.
3. **Addressing (ENS).** The registry entry surfaces as an ENS name; per-wallet subnames
   carry attestation metadata in text records, soulbound where permanence is required.
   Reverse resolution makes the identity display across ENS-aware clients.
4. **Rendering (Allium).** The attested wallet set becomes one unified behavioral
   profile — positions, transactions, holdings across protocols and chains. Historical
   for closed windows, live for open ones, never disclosed outside an attested window.

## Non-goals (deliberate, and load-bearing)

- **No score, ranking, or creditworthiness signal.** Phora hands over consented data,
  never a number. Verifiers do their own evaluation.
- **No behavioral clustering** to discover wallets the user did not link. Completeness
  is the user's choice.
- **No reputation the protocol acts on** — no staking, slashing, or privilege
  escalation by reputation. The rail records; markets infer.
- **No data monetization or marketplace dynamics.** Access is consent-gated, not priced.

## Tech stack

- Next.js (App Router), TypeScript, Tailwind.
- **Dynamic** — auth, embedded wallets, and the agent's server wallet.
- **World IDKit 4.0** — server-side uniqueness verification; **AgentKit** (x402 +
  AgentBook on World Chain) for the agent flow.
- **viem** + **@ensdomains/ensjs** — ENS on Sepolia; **Durin** for the subname registry.
- **Ledger Device Management Kit** + Clear Signing (ERC-7730) — on-device consent-grant
  approval.
- **Allium** — the unified behavioral profile.

## ENS addressing: the offchain resolver

Phora surfaces the registry through ENS without minting a name per attestation. A
**CCIP-Read offchain resolver** (EIP-3668 + ENSIP-10 wildcard) serves every
`*.phora.eth` subname as a **live projection of the attestation registry**:

- `username.phora.eth` → the identity's current primary (most-recent open) wallet.
- `usecase.username.phora.eth` (e.g. `banking.justin.phora.eth`) → the wallet attested
  for that use-case.

`resolve(name, data)` reverts `OffchainLookup` to the Phora gateway, which reads the
registry, answers, and signs the response; the on-chain resolver verifies that signature
(`SignatureVerifier` scheme) before returning. **Consent-gating is intrinsic to the
namespace**: a use-case name only resolves while its attestation window is open — unlink
the wallet and the name stops resolving, with no separate ACL.

In production, `phora.eth`'s resolver record (in the ENS registry) points at this
OffchainResolver, so every ENS-aware client resolves Phora names. On **Sepolia** the
`.eth` registrar is mid-migration to **ENS v2** — `sepolia.app.ens.domains` is the v2
alpha, which uses a different registry than the v1 contracts viem/ensjs read, and the
v1 `ETHRegistrarController` is no longer an authorized controller. Binding `phora.eth`'s
registry resolver is therefore **deferred**; the full CCIP-Read resolution **and**
consent-gating are demonstrated directly against the deployed resolver:

```
contracts/PhoraOffchainResolver.sol     the EIP-3668 resolver (deployed on Sepolia)
app/api/ens/gateway/route.ts            the signing gateway (reads the live registry)
scripts/ens/seed-demo.mts               set username + attest a "banking" wallet
scripts/ens/demo-resolve.mts            resolve before/after an unlink (consent-gating)
```

Deployed resolver (Sepolia): `0x7574581d7D872F605FD760Bb1BAcc69a551bf6e0`.

## Repository layout

```
docs/briefs/     per-integration research briefs (World, ENS, Ledger, Dynamic, Allium)
docs/plan.md     registry data model, contracts + chains, API routes, components
app/             Next.js App Router (scaffold only so far)
```

## Getting started

```bash
npm ci                 # installs the exact, lockfile-pinned dependency set
cp .env.example .env.local   # then fill in the values (see docs/plan.md §5)
npm run dev
```

Secrets (World signer key, Dynamic API token, Allium key) live in `.env.local`, which
is gitignored. Never commit them.

## Supply-chain posture

Dependencies are installed with **exact version pins** and a committed `package-lock.json`
(use `npm ci` to honor it). Each integration SDK was provenance-checked before install
(publisher, npm provenance attestations, and absence of install-time scripts);
`npm audit signatures` verifies registry signatures and attestations across the tree.
This repo deliberately pins `@ensdomains/ensjs@4.2.3` — a clean, OIDC-published,
provenance-attested build well after the November 2025 `@ensdomains` npm supply-chain
incident.

## Threat model

_To be written._ Will cover: what an attacker cannot forge (per-wallet attestation
signatures), what the registry guarantees (append-only, one-human-one-entry), what
consent does and does not protect, and the trust assumptions of each external
integration.

## License

See [LICENSE](LICENSE).
