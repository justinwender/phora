import { NextResponse } from 'next/server';
import { authenticateIdentity } from '@/lib/identity';
import { appendEvent, foldAttestations, readIdentityEvents } from '@/lib/registry/log';

export const dynamic = 'force-dynamic';

/**
 * POST /api/attestation/dispute
 *
 * Contest an attestation (e.g. compromise annotation). Appends a `dispute` event
 * referencing the link, carrying a reason; the original `link` row stays intact.
 * "Annotate, never delete."
 *
 * Body: { targetSeq, reason }
 */
export async function POST(request: Request) {
  const auth = await authenticateIdentity(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { identity } = auth;

  let body: { targetSeq?: number | string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const targetSeq = Number(body.targetSeq);
  if (!Number.isInteger(targetSeq)) {
    return NextResponse.json({ error: 'Missing or invalid targetSeq' }, { status: 400 });
  }
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (!reason) {
    return NextResponse.json({ error: 'A dispute reason is required' }, { status: 400 });
  }

  const attestations = foldAttestations(await readIdentityEvents(identity.id));
  const target = attestations.find((a) => a.linkSeq === targetSeq);
  if (!target) {
    return NextResponse.json(
      { error: 'No such link for this identity' },
      { status: 404 },
    );
  }

  const row = await appendEvent({
    eventType: 'dispute',
    identityId: identity.id,
    targetSeq,
    reason,
    eventTime: new Date(),
  });

  return NextResponse.json({
    status: 'disputed',
    seq: row.seq,
    targetSeq,
    reason,
    prevHash: row.prevHash,
    hash: row.hash,
  });
}
