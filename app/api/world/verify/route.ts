import { NextResponse } from 'next/server';
import { WORLD_ACTION, getWorldRpId } from '@/lib/world';

export const dynamic = 'force-dynamic';

// World ID 4.0 proof verification endpoint (per docs.world.org). The RP id goes
// in the path; the body carries the proof responses from the IDKit widget.
const WORLD_VERIFY_BASE = 'https://developer.world.org/api/v4/verify';

/**
 * POST /api/world/verify
 *
 * Receives an IDKit 4.0 result (IDKitResultV4) from the client and verifies it
 * server-side against our relying party. On success it returns the RP-scoped
 * nullifier — the per-(app, action) anchor for one-human-one-entry. This sub-unit
 * only returns the nullifier; persisting it as an identity record comes next.
 */
export async function POST(request: Request) {
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

  // Accept only 4.0 uniqueness proofs for our registration action.
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

  // Success: the nullifier is the top-level field in World's v4 response.
  return NextResponse.json({
    nullifier: data.nullifier,
    action: data.action,
    environment: data.environment,
  });
}
