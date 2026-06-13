import { getAddress, type Address } from 'viem';
import { getIdentityByUsername } from '@/lib/identity';
import {
  foldAttestations,
  readIdentityEvents,
  type AttestationView,
} from '@/lib/registry/log';
import type { PhoraName } from './name';

export interface PhoraResolution {
  identityId: string;
  username: string;
  /** Present at the use-case level: the attestation behind this name. */
  attestation?: AttestationView & { useCaseLabel: string };
  /** The address `addr()` resolves to — null means no address (or consent revoked). */
  address: Address | null;
}

/**
 * Resolve a Phora name to its registry state. This is the LIVE PROJECTION of the
 * attestation registry that the gateway answers from. Consent-gating is intrinsic:
 * a use-case name only yields the wallet address while its window is open; once
 * unlinked (closed), the address stops resolving.
 */
export async function resolvePhoraName(
  parsed: PhoraName,
): Promise<PhoraResolution | null> {
  if (parsed.level !== 'username' && parsed.level !== 'usecase') return null;

  const identity = await getIdentityByUsername(parsed.username);
  if (!identity || !identity.username) return null;

  const events = await readIdentityEvents(identity.id);
  const views = foldAttestations(events);

  if (parsed.level === 'usecase') {
    const linkEvent = events.find(
      (e) => e.eventType === 'link' && e.useCaseLabel === parsed.useCaseLabel,
    );
    const view = linkEvent
      ? views.find((v) => v.linkSeq === linkEvent.seq)
      : undefined;
    if (!view) {
      return { identityId: identity.id, username: identity.username, address: null };
    }
    return {
      identityId: identity.id,
      username: identity.username,
      attestation: { ...view, useCaseLabel: parsed.useCaseLabel },
      // Only an OPEN window resolves the address — the namespace enforces consent.
      address: view.status === 'open' ? getAddress(view.wallet) : null,
    };
  }

  // Username level: the identity's current primary = the most recent open wallet.
  const open = views.filter((v) => v.status === 'open');
  return {
    identityId: identity.id,
    username: identity.username,
    address: open.length ? getAddress(open[open.length - 1].wallet) : null,
  };
}
