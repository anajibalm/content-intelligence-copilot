-- 0008_evidence_hypothesis.sql
-- S8 generation provenance and append-only analytical artifacts.

BEGIN;

ALTER TABLE hypothesis
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS prompt_version text,
  ADD COLUMN IF NOT EXISTS schema_version text,
  ADD COLUMN IF NOT EXISTS input_hash text,
  ADD COLUMN IF NOT EXISTS raw_output jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS suggested_next_test jsonb;

CREATE INDEX IF NOT EXISTS evidence_workspace_lookup
  ON evidence (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS evidence_source_workspace_lookup
  ON evidence_source (workspace_id, evidence_id);
CREATE INDEX IF NOT EXISTS hypothesis_workspace_lookup
  ON hypothesis (workspace_id, batch_id, created_at DESC);

CREATE OR REPLACE FUNCTION forbid_s8_artifact_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME;
END;
$$;

CREATE OR REPLACE FUNCTION hypothesis_requires_evidence() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  hid uuid;
BEGIN
  hid := COALESCE((to_jsonb(NEW)->>'hypothesis_id')::uuid, (to_jsonb(OLD)->>'hypothesis_id')::uuid, (to_jsonb(NEW)->>'id')::uuid);
  IF NOT EXISTS (SELECT 1 FROM hypothesis_evidence WHERE hypothesis_id = hid) THEN
    RAISE EXCEPTION 'hypothesis % must cite at least one evidence', hid;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS evidence_append_only ON evidence;
CREATE TRIGGER evidence_append_only
  BEFORE UPDATE OR DELETE ON evidence
  FOR EACH ROW EXECUTE FUNCTION forbid_s8_artifact_mutation();

DROP TRIGGER IF EXISTS evidence_source_append_only ON evidence_source;
CREATE TRIGGER evidence_source_append_only
  BEFORE UPDATE OR DELETE ON evidence_source
  FOR EACH ROW EXECUTE FUNCTION forbid_s8_artifact_mutation();

DROP TRIGGER IF EXISTS hypothesis_append_only ON hypothesis;
CREATE TRIGGER hypothesis_append_only
  BEFORE UPDATE OR DELETE ON hypothesis
  FOR EACH ROW EXECUTE FUNCTION forbid_s8_artifact_mutation();

DROP TRIGGER IF EXISTS hypothesis_comparison_append_only ON hypothesis_comparison;
CREATE TRIGGER hypothesis_comparison_append_only
  BEFORE UPDATE OR DELETE ON hypothesis_comparison
  FOR EACH ROW EXECUTE FUNCTION forbid_s8_artifact_mutation();

DROP TRIGGER IF EXISTS hypothesis_evidence_append_only ON hypothesis_evidence;
CREATE TRIGGER hypothesis_evidence_append_only
  BEFORE UPDATE OR DELETE ON hypothesis_evidence
  FOR EACH ROW EXECUTE FUNCTION forbid_s8_artifact_mutation();

COMMIT;
