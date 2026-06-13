CREATE TABLE "identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"world_id_nullifier" text NOT NULL,
	"dynamic_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "identities_world_id_nullifier_unique" UNIQUE("world_id_nullifier")
);
