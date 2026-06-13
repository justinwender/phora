import { NextResponse } from 'next/server';
import { verifyDynamicJwt } from '@/lib/auth';

/**
 * GET /api/me
 *
 * Returns the authenticated user's id, derived purely from a server-side
 * verification of the Dynamic session JWT. The route trusts nothing from the
 * client except the bearer token, and that token must cryptographically verify.
 *
 *   200 { userId }        — token valid; identity established server-side
 *   401 { error }         — token missing, malformed, tampered, or expired
 */
export async function GET(request: Request) {
  const authorization = request.headers.get('authorization');
  const token = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : null;

  if (!token) {
    return NextResponse.json(
      { error: 'Missing bearer token' },
      { status: 401 },
    );
  }

  try {
    const { userId } = await verifyDynamicJwt(token);
    return NextResponse.json({ userId });
  } catch {
    // Do not leak which check failed (signature vs issuer vs expiry).
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }
}
