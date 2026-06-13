import { privateKeyToAccount } from 'viem/accounts';
import type { Hex } from 'viem';

/** The platform root name. All Phora names are subnames of this. */
export const PHORA_ROOT = 'phora.eth';

/** How long (seconds) a signed gateway answer stays valid. */
export const GATEWAY_TTL_SECONDS = 300;

/** The gateway signer private key (server-only). The OffchainResolver trusts the
 *  matching address; every gateway answer is signed with it. */
export function getGatewaySignerKey(): Hex {
  const key = process.env.ENS_GATEWAY_SIGNER_KEY;
  if (!key) throw new Error('ENS_GATEWAY_SIGNER_KEY is not set');
  return (key.startsWith('0x') ? key : `0x${key}`) as Hex;
}

/** The public signer address — what the resolver is configured to trust. */
export function getGatewaySignerAddress(): string {
  return privateKeyToAccount(getGatewaySignerKey()).address;
}
