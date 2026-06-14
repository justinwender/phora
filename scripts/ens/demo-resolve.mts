// Demonstrate the Phora offchain resolver end-to-end via CCIP-Read, against the
// DEPLOYED resolver on Sepolia (PHORA_RESOLVER_ADDRESS) — without phora.eth needing
// to be in the v1 registry. We call resolve(name,data) directly on the resolver with
// CCIP-Read enabled: it reverts OffchainLookup → viem fetches our gateway → the gateway
// reads the live registry and signs → the resolver's resolveWithProof verifies the
// signature on-chain and returns the answer.
//
// Beat: resolve banking.justin.phora.eth (open → returns the attested wallet), then
// unlink that wallet and resolve again (closed → no longer resolves). Consent-gating
// is intrinsic to the namespace.
import { createPublicClient, http, encodeFunctionData, decodeAbiParameters, namehash, toHex, getAddress, zeroAddress } from 'viem';
import { sepolia } from 'viem/chains';
import { eq, asc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { identities, attestationEvents } from '@/lib/db/schema';
import { appendEvent, readIdentityEvents, foldAttestations } from '@/lib/registry/log';

const RESOLVER = getAddress(process.env.PHORA_RESOLVER_ADDRESS!);
const pub = createPublicClient({ chain: sepolia, transport: http(process.env.SEPOLIA_RPC_URL) });

const resolveAbi = [{ name: 'resolve', inputs: [{ type: 'bytes' }, { type: 'bytes' }], outputs: [{ type: 'bytes' }], stateMutability: 'view', type: 'function' }] as const;
const addrAbi = [{ name: 'addr', inputs: [{ type: 'bytes32' }], outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' }] as const;

/** DNS wire format: each label length-prefixed, then a 0 terminator. */
function dnsEncode(name: string): `0x${string}` {
  const bytes: number[] = [];
  for (const label of name.split('.')) {
    const l = new TextEncoder().encode(label);
    bytes.push(l.length, ...l);
  }
  bytes.push(0);
  return toHex(Uint8Array.from(bytes));
}

/** Full CCIP-Read forward resolution of addr() through the deployed resolver. */
async function resolveAddr(name: string): Promise<string> {
  const data = encodeFunctionData({ abi: addrAbi, functionName: 'addr', args: [namehash(name)] });
  const res = await pub.readContract({
    address: RESOLVER, abi: resolveAbi, functionName: 'resolve',
    args: [dnsEncode(name), data],
  }); // ccipRead enabled by default → viem follows OffchainLookup to the gateway
  if (res === '0x') return '(empty)';
  const [addr] = decodeAbiParameters([{ type: 'address' }], res as `0x${string}`);
  return addr === zeroAddress ? '(does not resolve — 0x0)' : getAddress(addr);
}

const NAME_USECASE = 'banking.justin.phora.eth';
const NAME_USER = 'justin.phora.eth';

console.log('resolver (on Sepolia):', RESOLVER);
console.log('gateway URL          :', process.env.PHORA_GATEWAY_URL || '(resolver.url)');

console.log('\n── BEFORE (banking link open) ───────────────────────────');
console.log(`${NAME_USECASE.padEnd(28)} →`, await resolveAddr(NAME_USECASE));
console.log(`${NAME_USER.padEnd(28)} →`, await resolveAddr(NAME_USER), '(username = most-recent open wallet)');

// Revoke consent: unlink the banking wallet (identity-owner authorized).
const [identity] = await db.select().from(identities).where(eq(identities.username, 'justin')).limit(1);
const events = await readIdentityEvents(identity.id);
const link = events.find((e) => e.eventType === 'link' && e.useCaseLabel === 'banking');
const open = foldAttestations(events).find((v) => v.linkSeq === link!.seq && v.status === 'open');
if (open) {
  await appendEvent({ eventType: 'unlink', identityId: identity.id, targetSeq: link!.seq, t1: new Date(), authorizedBy: identity.dynamicUserId, eventTime: new Date() });
  console.log(`\n[unlinked banking wallet — appended unlink targeting seq=${link!.seq}]`);
} else {
  console.log(`\n[banking link already closed — re-run seed to reset]`);
}

console.log('\n── AFTER (banking link closed / consent revoked) ────────');
console.log(`${NAME_USECASE.padEnd(28)} →`, await resolveAddr(NAME_USECASE));
console.log(`${NAME_USER.padEnd(28)} →`, await resolveAddr(NAME_USER));
