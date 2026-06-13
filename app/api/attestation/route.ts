import { NextResponse } from 'next/server';
import { authenticateIdentity } from '@/lib/identity';
import { foldAttestations, readChain, readIdentityEvents } from '@/lib/registry/log';
import { verifyChain } from '@/lib/registry/hashchain';

export const dynamic = 'force-dynamic';

/**
 * GET /api/attestation
 *
 * The caller's folded attestations (open/closed windows + disputes), plus a
 * verification of the WHOLE log's hash chain — so a viewer can confirm the registry
 * is internally consistent, not just trust the rows.
 */
export async function GET(request: Request) {
  const auth = await authenticateIdentity(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { identity } = auth;

  const attestations = foldAttestations(await readIdentityEvents(identity.id));
  const fullChain = await readChain();
  const verification = verifyChain(fullChain);

  return NextResponse.json({
    identityId: identity.id,
    attestations,
    chain: { length: fullChain.length, ...verification },
  });
}
