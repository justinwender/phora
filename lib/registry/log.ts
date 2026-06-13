import { asc, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { attestationEvents } from '@/lib/db/schema';
import {
  GENESIS_HASH,
  CURRENT_CANON_VERSION,
  computeEventHash,
  type ChainRow,
  type EventContent,
} from './hashchain';

const CHAIN_CONSTRAINTS = [
  'attestation_events_prev_hash_unique',
  'attestation_events_hash_unique',
];

/**
 * A unique violation specifically on the chain columns (prev_hash/hash) — i.e. a
 * concurrent append raced us for the tip. Only these are safe to retry; other
 * unique violations (e.g. a duplicate use-case label) must propagate.
 */
function isChainContention(err: unknown): boolean {
  const e = err as { code?: string; constraint?: string; message?: string };
  if (e?.code !== '23505' && !/unique constraint/i.test(e?.message ?? '')) return false;
  if (e?.constraint && CHAIN_CONSTRAINTS.includes(e.constraint)) return true;
  return CHAIN_CONSTRAINTS.some((name) => (e?.message ?? '').includes(name));
}

/** Everything a caller supplies for an event — the chain fields are added here. */
export type AppendInput = Omit<EventContent, 'prevHash'>;

/**
 * Append an event to the hash-chained log. Optimistic concurrency: read the tip,
 * compute this row's hash over (content + prevHash = tip), insert. The
 * UNIQUE(prev_hash) constraint keeps the chain strictly linear — if a concurrent
 * append already chained off this tip, the insert violates the constraint and we
 * retry against the new tip. (Append-only: there is no update path.)
 */
export async function appendEvent(input: AppendInput) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const [tip] = await db
      .select({ hash: attestationEvents.hash })
      .from(attestationEvents)
      .orderBy(desc(attestationEvents.seq))
      .limit(1);
    const prevHash = tip?.hash ?? GENESIS_HASH;
    // New events are written at the current canonicalization version.
    const hash = computeEventHash(
      { ...input, prevHash } as EventContent,
      CURRENT_CANON_VERSION,
    );
    // Coerce the hashable timestamps to Date for the timestamptz columns. The hash
    // above used the same values (canonicalized to epoch-ms), so they stay in sync.
    const values = {
      eventType: input.eventType,
      identityId: input.identityId,
      walletAddress: input.walletAddress ?? null,
      useCaseLabel: input.useCaseLabel ?? null,
      t0: input.t0 != null ? new Date(input.t0) : null,
      statement: input.statement ?? null,
      signature: input.signature ?? null,
      targetSeq: input.targetSeq ?? null,
      t1: input.t1 != null ? new Date(input.t1) : null,
      authorizedBy: input.authorizedBy ?? null,
      reason: input.reason ?? null,
      eventTime: new Date(input.eventTime),
      prevHash,
      hash,
      canonVersion: CURRENT_CANON_VERSION,
    };
    try {
      const [row] = await db.insert(attestationEvents).values(values).returning();
      return row;
    } catch (err) {
      if (isChainContention(err)) continue; // lost the race for this tip; retry
      throw err; // other unique violations (e.g. duplicate use-case label) propagate
    }
  }
  throw new Error('appendEvent: exceeded retry budget');
}

/** The entire log in chain order — the input to a global chain verification. */
export async function readChain(): Promise<ChainRow[]> {
  const rows = await db
    .select()
    .from(attestationEvents)
    .orderBy(asc(attestationEvents.seq));
  return rows as unknown as ChainRow[];
}

/** One identity's events, in order — the input to folding/display. */
export async function readIdentityEvents(identityId: string): Promise<ChainRow[]> {
  const rows = await db
    .select()
    .from(attestationEvents)
    .where(eq(attestationEvents.identityId, identityId))
    .orderBy(asc(attestationEvents.seq));
  return rows as unknown as ChainRow[];
}

export interface AttestationView {
  linkSeq: number;
  wallet: string;
  identityId: string;
  t0: Date | string | number | null;
  t1: Date | string | number | null;
  status: 'open' | 'closed';
  disputes: { seq: number; reason: string }[];
}

/**
 * Fold an identity's event subset into the current attestation state. A `link`
 * opens an attestation; an `unlink` referencing it closes the window (sets t1); a
 * `dispute` referencing it annotates it. Nothing is mutated — state is derived.
 */
export function foldAttestations(events: ChainRow[]): AttestationView[] {
  const byLink = new Map<number, AttestationView>();
  for (const e of events) {
    if (e.eventType === 'link') {
      byLink.set(e.seq, {
        linkSeq: e.seq,
        wallet: e.walletAddress ?? '',
        identityId: e.identityId,
        t0: e.t0 ?? null,
        t1: null,
        status: 'open',
        disputes: [],
      });
    } else if (e.eventType === 'unlink' && e.targetSeq != null) {
      const a = byLink.get(e.targetSeq);
      if (a) {
        a.t1 = e.t1 ?? null;
        a.status = 'closed';
      }
    } else if (e.eventType === 'dispute' && e.targetSeq != null) {
      const a = byLink.get(e.targetSeq);
      if (a) a.disputes.push({ seq: e.seq, reason: e.reason ?? '' });
    }
  }
  return [...byLink.values()];
}
