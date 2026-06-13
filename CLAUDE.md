# Phora

Phora is a consent-based onchain identity and history rail. One human anchors one
permanent record, wallets attach to it through time-scoped attestations, and anyone
the owner authorizes can verify that history. Phora records and discloses; it computes
no score. The core idea: pseudonymity's defect is not privacy, it is commitment. A
fresh wallet costs nothing, so you cannot credibly bind your future self to your past
behavior. Phora makes shown history unforgeable and undeletable while keeping
disclosure sovereign, so verifiers can price honesty without anyone being forced to
disclose.

## Architecture: four layers

1. Uniqueness (World ID). World ID 4.0 proves one human, one registry entry, ever.
   The product breaks without proof of human: without it, one person mints unlimited
   clean identities and the commitment property is worthless. Proof validation is
   server-side.
2. Commitment (the registry). An append-only registry maps one World ID to a set of
   wallet attestations. Each attestation is time-scoped: identity X controlled wallet W
   from t0 to t1, signed by W at link time. History within an attested window is
   permanent and cannot be retroactively unlinked. Compromised-wallet disputes are
   annotated, never deleted.
3. Addressing (ENS). The registry entry is surfaced as an ENS name (the mutable label).
   Per-wallet subnames carry attestation metadata in text records, soulbound where the
   thesis requires permanence. Reverse resolution makes the identity display across
   every ENS-aware client.
4. Rendering (Allium). The attested wallet set becomes one unified behavioral profile
   via Allium: positions, transactions, and holdings across protocols and chains.
   Historical for closed windows, live for open ones.

## Non-goals (deliberate, and load-bearing)

- No score, ranking, or creditworthiness signal. Verifiers do their own evaluation.
  Phora hands over consented data, never a number.
- No behavioral clustering to discover wallets the user did not link. Completeness is
  the user's choice; Phora makes shown history verifiable, not unshown history visible.
- No reputation the protocol itself acts on (no staking, slashing, privilege escalation
  by reputation). The rail records; markets infer.
- No data monetization or marketplace dynamics. Access is consent-gated, not priced.

## Tech stack

- Next.js (App Router), TypeScript, Tailwind.
- Dynamic for auth, embedded wallets, and the agent's server wallet.
- World IDKit 4.0 (server-side verify plus an RP-signature route) for uniqueness;
  AgentKit (x402 plus AgentBook on World Chain mainnet) for the agent flow.
- viem and @ensdomains/ensjs for ENS; ENSv2 on Sepolia; Durin for the subname registry.
- Ledger Device Management Kit plus Clear Signing (ERC-7730) for on-device consent-grant
  approval.
- Allium API (via the connected MCP) for the behavioral profile.

## Prize targets

- World: Track B (uniqueness root) and Track A (human-backed agent with a free-trial gate).
- ENS: AI Agents (agent subnames, ENSIP-26), Most Creative (name-severance, soulbound
  attestations), and the Integrate pool.
- Dynamic: Best Overall (auth) and Best Agentic Build (agent server wallet).
- Ledger: agentic track (consent grant approved on the Flex, human-in-the-loop before
  access escalates).

## Build order

1. Spine: Dynamic auth -> World ID registration (one entry per human, server-side
   verify) -> append-only attestation registry with wallet-signature linking and time
   windows -> ENS name binding plus per-wallet subnames with text records -> Allium
   unified profile.
2. Consent and audit: grant/revoke with scopes, a who-queried-what dashboard, dispute
   flags, and a persona switcher (act as owner / Lender A / Lender B / agent) showing
   what each party can and cannot see.
3. Agent slice: agent registration (ENS subname plus ENSIP-26 records, delegated World
   ID via AgentKit, Dynamic server wallet), the free-trial query gate, the KYA handshake.
4. Ledger: consent grant approved on the Flex via Clear Signing.
5. Package: chaptered video, README (threat model plus non-goals), submission.

Checkpoint: spine demoable by 7 PM Saturday. If met, build the agent slice and Ledger.
If not, the overnight finishes the spine and we submit a tighter human-only build that
still covers World Track B and the ENS tracks.

## Workflow rules

- Commit frequently, one logical unit per commit, with a descriptive message. Never
  batch a long session into a single large commit (eligibility rule). Stage changes and
  propose a commit message; Justin reviews and commits himself.
- Commit plan files (this file, integration briefs, plan markdown). They are part of the
  submission.
- Everything in this repo is public. Keep all plans and code inside project scope:
  identity, attestation, consent, addressing, rendering. Nothing about scoring,
  reputation mechanisms, or unrelated projects.
- Keep CONTRIBUTIONS.md current: what Justin authored versus delegated.
- Reference-check every partner integration against the live testnet or mainnet. Do not
  report an integration as done until it is verified end to end.
- Justin must understand each load-bearing piece (World verify, the attestation
  registry, the consent logic) well enough to explain it to judges. Favor clarity over
  cleverness there.

## Environment

- Secrets live in .env.local (gitignored): World app ID, RP ID, action ID, World signer
  private key; Dynamic environment ID; Allium API key (server-side only). Never commit
  any of these.
- Connected MCPs in Claude Code: Allium (docs, schemas, realtime endpoints), World
  Developer Portal.
- Testnets: Sepolia (ENS), Base Sepolia if needed. AgentBook is World Chain mainnet
  (eip155:480); the agent slice needs a small amount of bridged World Chain ETH.