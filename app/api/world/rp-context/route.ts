import { NextResponse } from 'next/server';
import { signRequest } from '@worldcoin/idkit-server';
import { WORLD_ACTION, getWorldRpId, getWorldSigningKey } from '@/lib/world';

// RP signatures are short-lived, single-use challenges — never cache them.
export const dynamic = 'force-dynamic';

const RP_SIGNATURE_TTL_SECONDS = 300;

/**
 * GET /api/world/rp-context
 *
 * World ID 4.0 requires every proof request to carry an RP signature proving the
 * request comes from our registered relying party. The signing key is a server
 * secret (WORLD_RP_SIGNING_KEY) and must never reach the client; this route
 * returns only the signed, short-lived context the IDKit widget needs to open a
 * proof request for the `register-identity` action.
 *
 * Signing is done by `signRequest` from `@worldcoin/idkit-server` (pure-JS
 * EIP-191), whose return shape is camelCase: { sig, nonce, createdAt, expiresAt }.
 */
export function GET() {
  const rpSignature = signRequest({
    signingKeyHex: getWorldSigningKey(),
    action: WORLD_ACTION,
    ttl: RP_SIGNATURE_TTL_SECONDS,
  });

  return NextResponse.json(
    {
      rpId: getWorldRpId(),
      action: WORLD_ACTION,
      sig: rpSignature.sig,
      nonce: rpSignature.nonce,
      createdAt: rpSignature.createdAt,
      expiresAt: rpSignature.expiresAt,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
