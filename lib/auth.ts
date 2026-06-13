import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';

/**
 * Server-side verification of a Dynamic session JWT.
 *
 * This is the boundary where server code stops trusting the client. The client
 * can claim any identity; only a token whose signature verifies against
 * Dynamic's published JWKS (RS256), with a matching issuer and unexpired window,
 * establishes "who is this user" (the `sub` claim).
 *
 * Step 1 scope: identity of the logged-in user only. No wallets, no registry.
 */

function getEnvironmentId(): string {
  const id = process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID;
  if (!id) {
    throw new Error('NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID is not set');
  }
  return id;
}

// Memoized across requests: createRemoteJWKSet caches keys and handles rotation,
// so we fetch the JWKS once per server process rather than per verification.
let cachedJwks: JWTVerifyGetKey | undefined;

function getJwks(environmentId: string): JWTVerifyGetKey {
  if (!cachedJwks) {
    // The SDK authenticates against app.dynamicauth.com, and that is also the
    // host in the token's `iss` claim, so we fetch keys from the same host.
    cachedJwks = createRemoteJWKSet(
      new URL(
        `https://app.dynamicauth.com/api/v0/sdk/${environmentId}/.well-known/jwks`,
      ),
    );
  }
  return cachedJwks;
}

export interface DynamicSession {
  /** The Dynamic user id (`sub`) — our canonical user identifier. */
  userId: string;
  /** The full verified JWT payload, for callers that need other claims. */
  payload: JWTPayload;
}

/**
 * Verify a Dynamic-issued JWT. Resolves to the authenticated session on success;
 * throws on any failure (bad signature, wrong issuer, expired, malformed, or
 * missing `sub`). Callers must treat a thrown error as "not authenticated."
 */
export async function verifyDynamicJwt(token: string): Promise<DynamicSession> {
  const environmentId = getEnvironmentId();

  const { payload } = await jwtVerify(token, getJwks(environmentId), {
    // Dynamic issues tokens under either of its two domains depending on
    // version/config; accept both so verification doesn't break on a domain swap.
    issuer: [
      `app.dynamicauth.com/${environmentId}`,
      `app.dynamic.xyz/${environmentId}`,
    ],
    algorithms: ['RS256'],
  });

  if (!payload.sub) {
    throw new Error('Verified token has no sub claim');
  }

  return { userId: payload.sub, payload };
}
