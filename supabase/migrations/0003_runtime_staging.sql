-- 0003_runtime_staging.sql
-- R1 staging runtime: one DB-dispatched worker and durable processing result.
-- Candidate addition; canonical content/evidence tables remain the source of truth.

BEGIN;

CREATE TYPE runtime_job_status AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

CREATE TABLE runtime_processing_job (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   uuid NOT NULL REFERENCES workspace (id),
  content_id     uuid NOT NULL REFERENCES content (id),
  source_url     text NOT NULL,
  status         runtime_job_status NOT NULL DEFAULT 'PENDING',
  attempt_count  integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  claimed_by     text,
  lease_until    timestamptz,
  result         jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message  text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, content_id)
);

ALTER TABLE transcript
  ADD CONSTRAINT transcript_content_processing_unique UNIQUE (content_id, content_processing_id);

CREATE INDEX runtime_processing_job_dispatch_idx
  ON runtime_processing_job (status, lease_until, created_at);

ALTER TABLE runtime_processing_job ENABLE ROW LEVEL SECURITY;

COMMIT;
