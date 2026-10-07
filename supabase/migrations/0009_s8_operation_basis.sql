-- 0009_s8_operation_basis.sql
-- Freeze source basis used by each evidence artifact and bind operation IDs.

BEGIN;

ALTER TABLE evidence
  ADD COLUMN IF NOT EXISTS basis jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS hypothesis_operation_id_workspace_unique
  ON hypothesis (workspace_id, operation_id) WHERE operation_id IS NOT NULL;

COMMIT;
