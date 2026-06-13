import { NextResponse } from 'next/server';
import { isAddress, type Hex } from 'viem';
import { authenticateIdentity } from '@/lib/identity';
import { buildLinkStatement, verifyLinkSignature } from '@/lib/registry/statement';
import { appendEvent, foldAttestations, readIdentityEvents } from '@/lib/registry/log';

export const dynamic = 'force-dynamic';

/**
 * POST /api/attestation/link
 *
 * Link a wallet W to the caller's identity. W proves control by signing a structured
 * statement (EIP-191); the server rebuilds that statement from the SESSION's identity
 * and recovers the signer — so the wallet can only ever bind to the identity it
 * actually approved. On success, appends a `link` event (t0 set, window open).
 *
 * Body: { wallet, t0, signature }  (t0 is the ISO-8601 link time embedded in the statement)
 */
export async function POST(request: Request) {
  const auth = await authenticateIdentity(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { identity } = auth;

  let body: { wallet?: string; t0?: string; signature?: string; useCaseLabel?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { wallet, t0, signature } = body;
  if (!wallet || !isAddress(wallet)) {
    return NextResponse.json({ error: 'Invalid or missing wallet address' }, { status: 400 });
  }
  if (!t0 || typeof t0 !== 'string') {
    return NextResponse.json({ error: 'Missing t0 (ISO-8601 link time)' }, { status: 400 });
  }
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }
  const walletLc = wallet.toLowerCase();

  // Optional ENS use-case label → usecase.username.phora.eth. Must be a valid ENS label.
  let useCaseLabel: string | null = null;
  if (body.useCaseLabel != null && body.useCaseLabel !== '') {
    useCaseLabel = String(body.useCaseLabel).toLowerCase();
    if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(useCaseLabel)) {
      return NextResponse.json(
        { error: 'use-case label must be a valid ENS label (a-z, 0-9, hyphens)' },
        { status: 400 },
      );
    }
  }

  // Rebuild the statement from the session's identity (never the client's claim) and
  // verify the wallet actually signed it.
  const statement = buildLinkStatement({
    wallet: walletLc,
    identityId: identity.id,
    nullifier: identity.worldIdNullifier,
    t0,
  });
  const signerMatches = await verifyLinkSignature({
    wallet: walletLc,
    statement,
    signature: signature as Hex,
  });
  if (!signerMatches) {
    return NextResponse.json(
      { error: 'Signature does not recover to the wallet' },
      { status: 400 },
    );
  }

  const events = await readIdentityEvents(identity.id);

  // One open window per (identity, wallet).
  if (foldAttestations(events).some((a) => a.wallet === walletLc && a.status === 'open')) {
    return NextResponse.json(
      { error: 'Wallet already has an open link to this identity' },
      { status: 409 },
    );
  }
  // Use-case label is unique per identity (mirrors the DB partial-unique index).
  if (
    useCaseLabel &&
    events.some((e) => e.eventType === 'link' && e.useCaseLabel === useCaseLabel)
  ) {
    return NextResponse.json(
      { error: 'use-case label already in use for this identity' },
      { status: 409 },
    );
  }

  let row;
  try {
    row = await appendEvent({
      eventType: 'link',
      identityId: identity.id,
      walletAddress: walletLc,
      useCaseLabel,
      t0: new Date(t0),
      statement,
      signature,
      eventTime: new Date(),
    });
  } catch (err) {
    // Backstop the label-uniqueness race at the DB index.
    if (/use_case|unique constraint/i.test(String((err as Error)?.message))) {
      return NextResponse.json(
        { error: 'use-case label already in use for this identity' },
        { status: 409 },
      );
    }
    throw err;
  }

  return NextResponse.json({
    status: 'linked',
    seq: row.seq,
    wallet: walletLc,
    useCaseLabel,
    t0: row.t0,
    t1: null,
    prevHash: row.prevHash,
    hash: row.hash,
  });
}
