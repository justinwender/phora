import { createHash } from 'node:crypto';

/**
 * Tamper-evident hash chain for the append-only attestation log (spine step 3).
 *
 * Each event row carries `prevHash` (the previous row's hash) and `hash`
 * (= SHA-256 of this row's canonical content, which itself includes `prevHash`).
 * The rows form a chain: altering any past row changes its hash, which no longer
 * matches the next row's `prevHash`, so every subsequent link breaks. These are
 * pure functions — no DB — so they can be unit-tested and reused on read-back.
 */

/** The chain's genesis link — the `prevHash` of the very first event ever. */
export const GENESIS_HASH = '0'.repeat(64);

/**
 * The hashable content of an event: every semantic field except the DB-assigned
 * `seq` and the output `hash`. `prevHash` IS included — that is what chains a row
 * to its predecessor.
 */
export interface EventContent {
  eventType: string;
  identityId: string;
  walletAddress?: string | null;
  t0?: Date | string | number | null;
  statement?: string | null;
  signature?: string | null;
  targetSeq?: number | null;
  t1?: Date | string | number | null;
  authorizedBy?: string | null;
  reason?: string | null;
  eventTime: Date | string | number;
  prevHash: string;
}

/** Timestamps → epoch milliseconds, so a DB round-trip can't change the hash. */
function toMillis(v: Date | string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  if (v instanceof Date) return v.getTime();
  return new Date(v).getTime();
}

/**
 * Deterministic canonical serialization of an event's content: fixed key order,
 * timestamps as epoch-ms, absent fields as `null`. The same content always yields
 * the same string regardless of source (insert path vs. DB read-back).
 */
export function canonicalizeEvent(c: EventContent): string {
  return JSON.stringify({
    eventType: c.eventType,
    identityId: c.identityId,
    walletAddress: c.walletAddress ?? null,
    t0: toMillis(c.t0),
    statement: c.statement ?? null,
    signature: c.signature ?? null,
    targetSeq: c.targetSeq ?? null,
    t1: toMillis(c.t1),
    authorizedBy: c.authorizedBy ?? null,
    reason: c.reason ?? null,
    eventTime: toMillis(c.eventTime),
    prevHash: c.prevHash,
  });
}

/** SHA-256 (hex) of the canonical content — this row's chain hash. */
export function computeEventHash(c: EventContent): string {
  return createHash('sha256').update(canonicalizeEvent(c), 'utf8').digest('hex');
}

export interface ChainRow extends EventContent {
  seq: number;
  hash: string;
}

export type ChainVerification =
  | { valid: true; length: number }
  | {
      valid: false;
      brokenAtSeq: number;
      reason: 'prev_hash_mismatch' | 'hash_mismatch';
      expected: string;
      actual: string;
    };

/**
 * Verify the chain over rows given in `seq` order. For each row: its `prevHash`
 * must equal the previous row's `hash` (GENESIS for the first), and its stored
 * `hash` must equal the recomputation of its content. Either mismatch means a row
 * was altered after it was written — the log is not to be trusted from that point.
 */
export function verifyChain(rows: ChainRow[]): ChainVerification {
  let expectedPrev = GENESIS_HASH;
  for (const row of rows) {
    if (row.prevHash !== expectedPrev) {
      return {
        valid: false,
        brokenAtSeq: row.seq,
        reason: 'prev_hash_mismatch',
        expected: expectedPrev,
        actual: row.prevHash,
      };
    }
    const recomputed = computeEventHash(row);
    if (recomputed !== row.hash) {
      return {
        valid: false,
        brokenAtSeq: row.seq,
        reason: 'hash_mismatch',
        expected: row.hash,
        actual: recomputed,
      };
    }
    expectedPrev = row.hash;
  }
  return { valid: true, length: rows.length };
}
