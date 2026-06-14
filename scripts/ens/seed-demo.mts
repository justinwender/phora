// Seed the offchain-resolver demo against the LIVE registry (Neon):
//  1. set username "justin" on the identity  → justin.phora.eth
//  2. attest a wallet with use_case_label "banking" (a real, signature-valid link
//     event) → banking.justin.phora.eth
// Idempotent: skips the username/link if already present. Persists the banking
// wallet key so the demo can reference it.
import { eq } from 'drizzle-orm';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { db } from '@/lib/db';
import { identities } from '@/lib/db/schema';
import { buildLinkStatement } from '@/lib/registry/statement';
import { appendEvent, readIdentityEvents, foldAttestations } from '@/lib/registry/log';

const USERNAME = 'justin';
const USE_CASE = 'banking';
const KEY_FILE = '.phora-banking-wallet';

const [identity] = await db.select().from(identities).limit(1);
if (!identity) throw new Error('no identity in DB — register World ID first');
console.log('identity:', identity.id, '| nullifier:', identity.worldIdNullifier.slice(0, 14) + '…');

// 1. username
if (identity.username === USERNAME) {
  console.log(`username already "${USERNAME}" — skipping`);
} else if (identity.username) {
  throw new Error(`identity already has a different username: ${identity.username}`);
} else {
  await db.update(identities).set({ username: USERNAME }).where(eq(identities.id, identity.id));
  console.log(`set username = "${USERNAME}"  → ${USERNAME}.phora.eth`);
}

// 2. banking link (idempotent on use-case label)
const existing = await readIdentityEvents(identity.id);
const already = existing.find((e) => e.eventType === 'link' && e.useCaseLabel === USE_CASE);
if (already) {
  const view = foldAttestations(existing).find((v) => v.linkSeq === already.seq);
  console.log(`use-case "${USE_CASE}" already linked: seq=${already.seq} wallet=${already.walletAddress} status=${view?.status}`);
  console.log(`${USE_CASE}.${USERNAME}.phora.eth → ${already.walletAddress}`);
} else {
  // A wallet we control proves consent by signing the link statement (EIP-191).
  const pk = existsSync(KEY_FILE) ? (readFileSync(KEY_FILE, 'utf8').trim() as `0x${string}`) : generatePrivateKey();
  if (!existsSync(KEY_FILE)) writeFileSync(KEY_FILE, pk);
  const account = privateKeyToAccount(pk);
  const wallet = account.address.toLowerCase();
  const t0 = new Date().toISOString();
  const statement = buildLinkStatement({ wallet, identityId: identity.id, nullifier: identity.worldIdNullifier, t0 });
  const signature = await account.signMessage({ message: statement });
  const row = await appendEvent({
    eventType: 'link',
    identityId: identity.id,
    walletAddress: wallet,
    useCaseLabel: USE_CASE,
    t0: new Date(t0),
    statement,
    signature,
    eventTime: new Date(),
  });
  console.log(`linked wallet ${wallet} as "${USE_CASE}": seq=${row.seq} (open, signature-valid)`);
  console.log(`${USE_CASE}.${USERNAME}.phora.eth → ${wallet}`);
}
