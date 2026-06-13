import { NextResponse } from 'next/server';
import { WORLD_ACTION, getWorldRpId } from '@/lib/world';
import { verifyDynamicJwt } from '@/lib/auth';
import { db } from '@/lib/db';
import { identities } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

// World ID 4.0 proof verification endpoint (per docs.world.org). The RP id goes
// in the path; the body carries the proof responses from the IDKit widget.
const WORLD_VERIFY_BASE = 'https://developer.world.org/api/v4/verify';

/** Postgres unique_violation — the database rejecting a duplicate nullifier. */
function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string }; message?: string };
  return (
    e?.code === '23505' ||
    e?.cause?.code === '23505' ||
    /duplicate key|unique constraint|identities_world_id_nullifier_unique/i.test(
      e?.message ?? '',
    )
  );
}

/**
 * POST /api/world/verify
 *
 * Verifies an IDKit 4.0 proof against our relying party and, on success, creates
 * the registry's identity record — keyed on the RP-scoped nullifier and owned by
 * the authenticated Dynamic user.
 *
 * One human → one entry, ever: the nullifier's UNIQUE constraint means a second
 * registration by the same human is rejected (409), never duplicated. There is no
 * recovery path at this step.
 *
 *   200 { status: 'created', identityId, nullifier, ownerUserId }
 *   409 { status: 'already_registered', nullifier }   — same human, already registered
 *   401 — no/invalid Dynamic session
 *   400 — malformed or non-4.0 proof
 *   502 — World rejected the proof (e.g. RP/signature error)
 */
export async function POST(request: Request) {
  // 1. Require a logged-in Dynamic user; tie the record to their id.
  const authorization = request.headers.get('authorization');
  const token = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : null;
  if (!token) {
    return NextResponse.json({ error: 'Sign in before registering' }, { status: 401 });
  }
  let ownerUserId: string;
  try {
    ({ userId: ownerUserId } = await verifyDynamicJwt(token));
  } catch {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  }

  // 2. Parse and sanity-check the proof: 4.0 uniqueness proof for our action.
  let result: {
    protocol_version?: string;
    nonce?: string;
    action?: string;
    environment?: string;
    responses?: unknown[];
  };
  try {
    result = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (result.protocol_version !== '4.0') {
    return NextResponse.json(
      { error: 'Expected a World ID 4.0 proof', got: result.protocol_version ?? null },
      { status: 400 },
    );
  }
  if (result.action !== WORLD_ACTION) {
    return NextResponse.json(
      { error: 'Unexpected action', expected: WORLD_ACTION, got: result.action ?? null },
      { status: 400 },
    );
  }
  if (!Array.isArray(result.responses) || result.responses.length === 0) {
    return NextResponse.json({ error: 'Missing proof responses' }, { status: 400 });
  }

  // 3. Verify the proof against World.
  const verifyUrl = `${WORLD_VERIFY_BASE}/${getWorldRpId()}`;
  const worldRes = await fetch(verifyUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      protocol_version: result.protocol_version,
      nonce: result.nonce,
      action: result.action,
      environment: result.environment,
      responses: result.responses,
    }),
  });
  const data = await worldRes.json().catch(() => ({}));
  if (!worldRes.ok || !data?.success) {
    // Surface World's error verbatim — an RP/signature error here means the
    // signing key is wrong, which we must see and fix, not swallow.
    return NextResponse.json(
      { error: 'World verification failed', worldStatus: worldRes.status, detail: data },
      { status: 502 },
    );
  }

  // 4. Persist the identity, keyed on the normalized nullifier. The UNIQUE
  //    constraint is what enforces one-human-one-entry.
  const nullifier = String(data.nullifier).toLowerCase();
  try {
    const [row] = await db
      .insert(identities)
      .values({ worldIdNullifier: nullifier, dynamicUserId: ownerUserId })
      .returning({ id: identities.id });
    return NextResponse.json({
      status: 'created',
      identityId: row.id,
      nullifier,
      ownerUserId,
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json({ status: 'already_registered', nullifier }, { status: 409 });
    }
    throw err;
  }
}
