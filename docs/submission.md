# Phora — submission

**A consent-based onchain identity and history rail.** One human anchors one permanent
record; wallets attach through time-scoped, signed attestations; anyone the owner
authorizes can verify that history. Phora records and discloses — it computes **no
score**.

## The problem

Pseudonymity's defect is not privacy, it is **commitment**. A fresh wallet costs nothing,
so you cannot credibly bind your future self to your past behavior — and a counterparty
cannot tell a clean history from a clean *slate*. Phora makes the history you choose to
show unforgeable and undeletable, while keeping disclosure sovereign. Verifiers can price
honesty; no one is forced to disclose.

## How it works — four layers

1. **Uniqueness (World ID 4.0).** Proof of personhood, verified server-side. One nullifier
   → one registry entry, enforced at the protocol (replay) and by a DB constraint. Without
   this, one person mints unlimited clean identities and commitment is worthless.
2. **Commitment (the registry).** An append-only, hash-chained log of `link` / `unlink` /
   `dispute`. A wallet links by signing a statement (EIP-191) binding it to the identity
   and its nullifier at time `t0`; an unlink is authorized by the *identity owner*, not the
   wallet's key, so a stolen wallet can be severed without it; disputes annotate, never
   delete. A Postgres trigger blocks updates/deletes; `prev_hash`/`hash` make tampering
   evident.
3. **Addressing (ENS).** A deployed CCIP-Read offchain resolver serves every `*.phora.eth`
   name as a **live projection** of the registry. Consent-gating is intrinsic: a name
   resolves only while its window is open — unlink the wallet and it stops resolving, with
   no separate ACL.
4. **Rendering (Allium).** An attested wallet's unified behavioral profile — LP, staking,
   lending, holdings across chains — surfaced as a lender view. Raw positions and raw sums
   only; no score, grade, or rating.

## What's live in this build

The **entire spine is built and demoable end-to-end** and reference-checked by running it:
Dynamic auth (server-side JWT) → World ID registration → the attestation registry → ENS
offchain resolution with consent-gating → the Allium lender dossier. See the README's
[Implementation status](../README.md#implementation-status) and
[Threat model](../README.md#threat-model).

Deployed offchain resolver (Sepolia): `0x7574581d7D872F605FD760Bb1BAcc69a551bf6e0`.

**Deferred (deliberately scoped):** binding `phora.eth`'s registry resolver on Sepolia
(the `.eth` registrar is mid-migration to ENS v2, so the v1 controller is unauthorized —
diagnosed and cut rather than fought); on-chain anchoring of the registry tip; soulbound
subname fuses; the agent slice (AgentKit + agent subnames) and Ledger Clear-Signing.

## Prize tracks

Mapped honestly to **what is built** in this submission:

- **World — Track B (uniqueness root).** The registry is rooted in one-human-one-entry
  World ID 4.0 verification; the commitment property depends on it. *(Track A, the
  human-backed agent with a free-trial gate, was scoped but deferred.)*
- **ENS — Most Creative + Integrate.** A CCIP-Read offchain resolver projecting a live
  registry, with **name-severance** as the creative mechanic: revoking consent makes the
  name go dark. *(The AI-Agents / ENSIP-26 angle depends on the deferred agent slice.)*
- **Dynamic — Best Overall (auth).** Dynamic powers sign-in and session-gated attestation
  writes (server-side JWT verification). *(Best Agentic Build depends on the deferred agent
  server wallet.)*
- **Ledger — agentic track.** Scoped (consent grant on the Flex via Clear Signing),
  deferred in this build.

## Demo

```bash
npm ci
cp .env.example .env.local   # fill in keys
npm run dev
```

- **Spine UI:** `/` (sign in → World ID registration), `/dossier` (the lender view; the
  two demo wallets render real Allium data).
- **ENS consent-gating (the key beat):**
  `node --env-file=.env.local --import tsx scripts/ens/seed-demo.mts` then
  `node --env-file=.env.local --import tsx scripts/ens/demo-resolve.mts` — resolves
  `banking.justin.phora.eth` to the attested wallet, then unlinks and shows it stop
  resolving (before → after).

## Engineering notes

- **Supply-chain posture.** Exact-pinned deps + committed lockfile (`npm ci`); each SDK
  provenance-checked before install; `@ensdomains/ensjs` pinned to a clean,
  provenance-attested build after the Nov 2025 `@ensdomains` npm incident.
- **Honest diagnosis over a forced result.** The ENS v1 registration failure was traced to
  an unauthorized controller mid-v2-migration and **deferred**, not faked — the full
  resolution + consent-gating run against the deployed resolver instead.
- **IP fence.** The rendering layer hands over raw consented data and a raw sum; it never
  derives a score, grade, or risk number. `health_factor`, where shown, is the lending
  protocol's own value.

## Tech

Next.js (App Router) · TypeScript · Tailwind · Dynamic (auth) · World IDKit 4.0 · viem +
`@ensdomains/ensjs` (ENS on Sepolia) · EIP-3668 CCIP-Read + ENSIP-10 · Neon Postgres +
Drizzle · Allium.
