-- Custom SQL migration file, put your code below! --

-- Enforce append-only on attestation_events at the database level: rows may only
-- be INSERTed, never UPDATEd, DELETEd, or TRUNCATEd. Combined with the hash chain,
-- this makes the registry tamper-evident, not merely tamper-discouraged.

CREATE OR REPLACE FUNCTION phora_attestation_append_only()
  RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'attestation_events is append-only; % is not permitted', TG_OP;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER attestation_events_no_update_delete
  BEFORE UPDATE OR DELETE ON attestation_events
  FOR EACH ROW EXECUTE FUNCTION phora_attestation_append_only();
--> statement-breakpoint
CREATE TRIGGER attestation_events_no_truncate
  BEFORE TRUNCATE ON attestation_events
  FOR EACH STATEMENT EXECUTE FUNCTION phora_attestation_append_only();
