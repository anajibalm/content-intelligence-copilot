-- 0004_runtime_claim_ownership.sql
-- Prevent stale workers from publishing after lease recovery.

BEGIN;

ALTER TABLE runtime_processing_job
  ADD COLUMN IF NOT EXISTS claim_token uuid;

ALTER TABLE acquisition_run
  ADD COLUMN IF NOT EXISTS claim_token uuid;

CREATE INDEX IF NOT EXISTS runtime_processing_job_claim_idx
  ON runtime_processing_job (workspace_id, id, claim_token, status, lease_until);

CREATE INDEX IF NOT EXISTS acquisition_run_claim_idx
  ON acquisition_run (workspace_id, content_id, claim_token);

COMMIT;
