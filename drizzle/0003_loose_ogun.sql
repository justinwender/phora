ALTER TABLE "attestation_events" ADD COLUMN "use_case_label" text;--> statement-breakpoint
ALTER TABLE "attestation_events" ADD COLUMN "canon_version" smallint;--> statement-breakpoint
ALTER TABLE "identities" ADD COLUMN "username" text;--> statement-breakpoint
CREATE UNIQUE INDEX "attestation_events_identity_use_case_idx" ON "attestation_events" USING btree ("identity_id","use_case_label") WHERE event_type = 'link' and use_case_label is not null;--> statement-breakpoint
ALTER TABLE "identities" ADD CONSTRAINT "identities_username_unique" UNIQUE("username");