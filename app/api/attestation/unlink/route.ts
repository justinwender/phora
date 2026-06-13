import { NextResponse } from 'next/server';
import { authenticateIdentity } from '@/lib/identity';
import { appendEvent, foldAttestations, readIdentityEvents } from '@/lib/registry/log';

export const dynamic = 'force-dynamic';

/**
 * POST /api/attestation/unlink
 *
 * Close an open link's window (record t1). Deliberately authorized by the IDENTITY
 * OWNER (the logged-in Dynamic session), NOT by the wallet's key — so a user can
 * sever a stolen wallet without its private key. Appends an `unlink` event; the
 * original `link` row is untouched (append-only).
 *
 * Body: { targetSeq }  (the seq of the link event to close)
 */
export async function POST(request: Request) {
  const auth = await authenticateIdentity(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { identity, userId } = auth;

  let body: { targetSeq?: number | string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const targetSeq = Number(body.targetSeq);
  if (!Number.isInteger(targetSeq)) {
    return NextResponse.json({ error: 'Missing or invalid targetSeq' }, { status: 400 });
  }

  // The target must be a link belonging to THIS identity and currently open.
  const attestations = foldAttestations(await readIdentityEvents(identity.id));
  const target = attestations.find((a) => a.linkSeq === targetSeq);
  if (!target) {
    return NextResponse.json(
      { error: 'No such link for this identity' },
      { status: 404 },
    );
  }
  if (target.status === 'closed') {
    return NextResponse.json({ error: 'Link is already unlinked' }, { status: 409 });
  }

  const row = await appendEvent({
    eventType: 'unlink',
    identityId: identity.id,
    targetSeq,
    t1: new Date(),
    authorizedBy: userId, // the identity owner's Dynamic id — not the wallet
    eventTime: new Date(),
  });

  return NextResponse.json({
    status: 'unlinked',
    seq: row.seq,
    targetSeq,
    t1: row.t1,
    authorizedBy: userId,
    prevHash: row.prevHash,
    hash: row.hash,
  });
}
