CREATE TABLE "attestation_events" (
	"seq" bigserial PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"identity_id" uuid NOT NULL,
	"wallet_address" text,
	"t0" timestamp with time zone,
	"statement" text,
	"signature" text,
	"target_seq" bigint,
	"t1" timestamp with time zone,
	"authorized_by" text,
	"reason" text,
	"event_time" timestamp with time zone NOT NULL,
	"prev_hash" text NOT NULL,
	"hash" text NOT NULL,
	CONSTRAINT "attestation_events_prev_hash_unique" UNIQUE("prev_hash"),
	CONSTRAINT "attestation_events_hash_unique" UNIQUE("hash")
);
--> statement-breakpoint
ALTER TABLE "attestation_events" ADD CONSTRAINT "attestation_events_identity_id_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attestation_events_identity_idx" ON "attestation_events" USING btree ("identity_id");