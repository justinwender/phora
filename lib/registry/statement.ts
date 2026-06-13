import { recoverMessageAddress, type Hex } from 'viem';

/**
 * The wallet-control proof for an attestation link (spine step 3).
 *
 * A wallet proves it consents to being linked to a Phora identity by signing a
 * structured statement (EIP-191 personal_sign) that binds the wallet to the
 * identity at link time t0. The server rebuilds this statement verbatim from the
 * SESSION's identity and recovers the signer — so the signature is the unforgeable
 * proof of control, and it can only bind the wallet to the identity the signer
 * actually approved.
 */
export interface LinkStatementParams {
  wallet: string;
  /** The identity record id (the attestation's identityId). */
  identityId: string;
  /** The World ID nullifier — the human anchor behind the identity. */
  nullifier: string;
  /** Link time, ISO 8601 UTC. */
  t0: string;
}

export function buildLinkStatement(p: LinkStatementParams): string {
  return [
    'Phora — wallet attestation',
    'I am linking this wallet to my Phora identity, and I control it.',
    `wallet: ${p.wallet.toLowerCase()}`,
    `identity: ${p.identityId}`,
    `nullifier: ${p.nullifier}`,
    `linked_at: ${p.t0}`,
  ].join('\n');
}

/** Recover the address that produced an EIP-191 signature over `statement`. */
export async function recoverLinkSigner(
  statement: string,
  signature: Hex,
): Promise<string> {
  return recoverMessageAddress({ message: statement, signature });
}

/** True iff `signature` over `statement` recovers to `wallet`. */
export async function verifyLinkSignature(params: {
  wallet: string;
  statement: string;
  signature: Hex;
}): Promise<boolean> {
  const recovered = await recoverLinkSigner(params.statement, params.signature);
  return recovered.toLowerCase() === params.wallet.toLowerCase();
}
