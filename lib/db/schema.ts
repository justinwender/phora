import {
  pgTable,
  uuid,
  text,
  timestamp,
  bigserial,
  bigint,
  index,
} from 'drizzle-orm/pg-core';

/**
 * The registry's anchor record (spine step 2).
 *
 * One human → one entry, ever. `world_id_nullifier` is the RP-scoped World ID 4.0
 * nullifier (per-(app, action) per-human); its UNIQUE constraint is the database-level
 * enforcement of the one-human-one-entry guarantee — a second registration with the
 * same nullifier violates the constraint and is rejected, never duplicated.
 *
 * Minimal for now: nullifier, owning Dynamic user, created-at. Wallet attestations
 * attach in step 3.
 */
export const identities = pgTable('identities', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Stored as the canonical hex string World returns (e.g. 0x17ae…), normalized
  // lowercase by the writer so equality/uniqueness is exact.
  worldIdNullifier: text('world_id_nullifier').notNull().unique(),
  // The Dynamic user id (JWT `sub`) that owns this record.
  dynamicUserId: text('dynamic_user_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Identity = typeof identities.$inferSelect;
export type NewIdentity = typeof identities.$inferInsert;

/**
 * The attestation registry (spine step 3) — an append-only, hash-chained event log.
 *
 * Every change is a new appended row; rows are NEVER updated or deleted (enforced by
 * an append-only trigger; see the migration). Three event types:
 *  - 'link'    : a wallet W links to identity N at t0. W signs a structured statement
 *                proving control; `signature` over `statement` is the unforgeable proof.
 *  - 'unlink'  : closes a link's window (records t1). Authorized by the IDENTITY OWNER
 *                (the logged-in Dynamic session, `authorized_by`), NOT the wallet key —
 *                so a stolen wallet can be severed without its private key.
 *  - 'dispute' : contests a link (compromise annotation). References the link, carries a
 *                reason; the original row stays intact. "Annotate, never delete."
 *
 * Tamper-evidence: each row stores `prev_hash` (the previous row's hash) and `hash`
 * (= H(this row's canonical content, including prev_hash)). The rows form a chain;
 * altering any past row changes its hash and breaks every subsequent link. `prev_hash`
 * is UNIQUE, which keeps the chain linear (no two rows may descend from one parent).
 * The chain is internal; on-chain anchoring of the tip is a future extension.
 */
export const attestationEvents = pgTable(
  'attestation_events',
  {
    // Monotonic insertion order; also the chain order (ORDER BY seq).
    seq: bigserial('seq', { mode: 'number' }).primaryKey(),
    eventType: text('event_type').notNull(), // 'link' | 'unlink' | 'dispute'
    identityId: uuid('identity_id')
      .notNull()
      .references(() => identities.id),

    // link events
    walletAddress: text('wallet_address'), // W, lowercased
    t0: timestamp('t0', { withTimezone: true }), // link time
    statement: text('statement'), // the canonical message W signed
    signature: text('signature'), // W's signature over `statement`

    // unlink / dispute events
    targetSeq: bigint('target_seq', { mode: 'number' }), // the link row being closed/disputed
    t1: timestamp('t1', { withTimezone: true }), // unlink time
    authorizedBy: text('authorized_by'), // dynamic_user_id that authorized the unlink
    reason: text('reason'), // dispute reason

    // hash chain
    eventTime: timestamp('event_time', { withTimezone: true }).notNull(),
    prevHash: text('prev_hash').notNull().unique(),
    hash: text('hash').notNull().unique(),
  },
  (table) => [index('attestation_events_identity_idx').on(table.identityId)],
);

export type AttestationEvent = typeof attestationEvents.$inferSelect;
export type NewAttestationEvent = typeof attestationEvents.$inferInsert;
