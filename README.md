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

> **Status: the spine is complete and demoable end-to-end** — World ID uniqueness →
> the append-only attestation registry → ENS offchain resolution → the Allium profile.
> See [Implementation status](#implementation-status) for what is live versus deferred.
> Architecture of record: [`docs/plan.md`](docs/plan.md); per-integration research:
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

## Implementation status

The spine is built and verified end to end (each layer reference-checked by running it,
not by assertion):

- **Auth (Dynamic).** Server-side JWT verification (JWKS, RS256); every attestation
  route is gated on the verified session. `lib/auth.ts`, `lib/identity.ts`.
- **Uniqueness (World ID 4.0).** Server-side proof verification plus an RP-signature
  route. One nullifier → one identity, enforced both at the protocol (replayed
  nullifiers are rejected) and by a `UNIQUE` constraint in the registry.
  `app/api/world/*`, `lib/db/schema.ts`.
- **Commitment (the registry).** An append-only, hash-chained event log of
  `link` / `unlink` / `dispute`. A link carries the wallet's EIP-191 signature binding
  it to the identity and its World ID nullifier at time `t0`; an unlink is authorized by
  the *identity owner's session* (so a stolen wallet can be severed without its key); a
  dispute annotates. Append-only is enforced by a Postgres trigger; chain integrity by
  `prev_hash`/`hash` with `verifyChain`. `lib/registry/*`, `app/api/attestation/*`.
- **Addressing (ENS).** A CCIP-Read offchain resolver deployed on Sepolia projects the
  live registry; consent-gating is intrinsic and demonstrated (resolve before/after an
  unlink). See [ENS addressing](#ens-addressing-the-offchain-resolver). Binding
  `phora.eth`'s registry resolver is **deferred** while Sepolia's `.eth` registrar is
  mid-migration to ENS v2.
- **Rendering (Allium).** `GET /api/dossier` returns an attested wallet's unified
  profile (LP, staking, lending, holdings across chains); the lender view renders it.
  Raw positions and raw sums only — **no score**. `lib/allium.ts`, `app/dossier/`.

**Not in this build (deliberately scoped):** on-chain anchoring of the registry tip
(the hash-chain is currently internal); soulbound subname fuses; the agent slice
(AgentKit + agent subnames); and Ledger Clear-Signing of the consent grant.

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
app/api/world/         World ID 4.0 verify + RP-signature routes
app/api/attestation/   link / unlink / dispute (the registry's write surface)
app/api/ens/gateway/   the CCIP-Read signing gateway (projects the live registry)
app/api/dossier/       the Allium profile route
app/dossier/           lender view of an attested wallet's profile
lib/auth.ts            Dynamic JWT verification
lib/registry/          the append-only hash-chained log + signature statements
lib/ens/               offchain resolver: DNS-name parsing, resolution, gateway
lib/allium.ts          Allium positions client (server-only)
contracts/             PhoraOffchainResolver.sol (deployed on Sepolia)
scripts/ens/           deploy + demo (seed, resolve-before/after-unlink)
docs/briefs/           per-integration research briefs (World, ENS, Ledger, Dynamic, Allium)
docs/plan.md           registry data model, contracts + chains, API routes, components
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

**What an attacker cannot forge.**

- *Wallet control.* A `link` carries an EIP-191 signature over a statement that binds the
  wallet to the identity's id and its World ID nullifier at time `t0`. The server rebuilds
  that statement from the *session's* identity and recovers the signer — so a wallet can
  only ever bind to the identity that actually approved it. You cannot claim a wallet you
  do not control, nor attach someone else's wallet to your identity.
- *Proof of human.* World ID 4.0 yields one nullifier per (app, action) per human. A
  second registration with the same nullifier is rejected at the protocol (replay) and by
  a `UNIQUE` constraint. One human → one entry, so you cannot mint fresh clean identities
  to escape your own history — which is the whole point.

**What the registry guarantees.**

- *Append-only.* A Postgres trigger blocks `UPDATE` / `DELETE` / `TRUNCATE` on the event
  log; events are only ever appended.
- *Tamper-evidence.* Each row stores `prev_hash` and `hash` (a hash over the row's
  canonical content including `prev_hash`); `prev_hash` is `UNIQUE`, so the chain is
  strictly linear and altering any past row breaks every subsequent link. History within
  an attested window cannot be retroactively rewritten or silently deleted.
- *Stolen-wallet severance.* An `unlink` is authorized by the identity owner's session,
  **not** the wallet's key — a compromised wallet can be closed without its private key.
  A `dispute` annotates a link with a compromise flag without removing it: *annotate,
  never delete.*

**What consent does — and does not — protect.**

- Disclosure is sovereign and gated: a name resolves to a wallet only while that wallet's
  window is open; unlinking stops it resolving, with no separate ACL. The owner chooses
  what to show.
- It does **not** retract what a verifier already saw. Data disclosed within an open
  window can be retained by that verifier — Phora governs disclosure, not the verifier's
  memory.
- Completeness is the user's choice. Phora makes *shown* history verifiable, not *unshown*
  history visible: there is no clustering to surface wallets the user did not link.

**Trust assumptions (per integration).**

- *World ID* — trusted oracle of proof-of-human; uniqueness is only as strong as World's
  guarantee.
- *Dynamic* — session authentication and embedded-wallet key custody; a forged or stolen
  session could impersonate the identity owner for unlink/dispute. Mitigated by
  server-side JWT verification, but Dynamic sits in the trusted base.
- *The offchain resolver gateway* — the on-chain resolver verifies the gateway's
  signature, but the gateway reads the application database. So the gateway, its signing
  key, and the DB are trusted to faithfully reflect the registry. The hash-chain is
  currently internal; **anchoring the chain tip on-chain** — so the DB cannot be silently
  rewritten — is the primary planned hardening.
- *Allium* — trusted for the accuracy of the rendered behavioral profile; Phora passes
  the data through and computes nothing on it.
- *RPC providers / Sepolia* — liveness and correctness of chain reads and writes.

**Key custody.** The World RP signer, the gateway signer, the dev wallet, the Dynamic
token, and the database and Allium keys are server-side secrets in `.env.local`
(gitignored); none reach the browser.

**Known limitations (deliberately scoped).** ENS v1 registry binding is deferred on
Sepolia (mid-v2-migration); the registry tip is not yet anchored on-chain; soulbound
subname fuses are not yet enforced; the agent slice and Ledger Clear-Signing are out of
this build.

## License

See [LICENSE](LICENSE).
