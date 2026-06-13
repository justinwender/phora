import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { identities, type Identity } from '@/lib/db/schema';
import { verifyDynamicJwt } from '@/lib/auth';

/** The identity record owned by a Dynamic user (JWT `sub`), or null if unregistered. */
export async function getIdentityForUser(
  dynamicUserId: string,
): Promise<Identity | null> {
  const [row] = await db
    .select()
    .from(identities)
    .where(eq(identities.dynamicUserId, dynamicUserId))
    .limit(1);
  return row ?? null;
}

/** The identity for a platform username (→ username.phora.eth), or null. */
export async function getIdentityByUsername(
  username: string,
): Promise<Identity | null> {
  const [row] = await db
    .select()
    .from(identities)
    .where(eq(identities.username, username.toLowerCase()))
    .limit(1);
  return row ?? null;
}

export type IdentityAuth =
  | { ok: true; userId: string; identity: Identity }
  | { ok: false; status: number; error: string };

/**
 * Resolve the caller's authenticated identity for attestation routes: verify the
 * Dynamic session, then load the identity record that session owns. Attestation
 * mutations are gated on this — only the identity owner may link/unlink/dispute.
 */
export async function authenticateIdentity(request: Request): Promise<IdentityAuth> {
  const authorization = request.headers.get('authorization');
  const token = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : null;
  if (!token) return { ok: false, status: 401, error: 'Sign in before attesting' };

  let userId: string;
  try {
    ({ userId } = await verifyDynamicJwt(token));
  } catch {
    return { ok: false, status: 401, error: 'Invalid session' };
  }

  const identity = await getIdentityForUser(userId);
  if (!identity) {
    return { ok: false, status: 400, error: 'Register your World ID identity first' };
  }
  return { ok: true, userId, identity };
}
