/**
 * Shared World ID configuration for the registration flow (spine step 2).
 *
 * One human → one registry entry. The action below scopes the World ID 4.0
 * uniqueness proof; the resulting nullifier is the per-(app, action) anchor that
 * makes a second registration by the same human detectable and rejectable.
 */

/** The World ID 4.0 action for one-human-one-entry registration. */
export const WORLD_ACTION = 'register-identity';

/** Public relying-party id (safe client-side). */
export function getWorldRpId(): string {
  const rpId = process.env.NEXT_PUBLIC_WORLD_RP_ID;
  if (!rpId) {
    throw new Error('NEXT_PUBLIC_WORLD_RP_ID is not set');
  }
  return rpId;
}

/** Secret RP signing key — server-only, never sent to the client. */
export function getWorldSigningKey(): string {
  const key = process.env.WORLD_RP_SIGNING_KEY;
  if (!key) {
    throw new Error('WORLD_RP_SIGNING_KEY is not set');
  }
  return key;
}
