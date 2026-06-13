import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';

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
