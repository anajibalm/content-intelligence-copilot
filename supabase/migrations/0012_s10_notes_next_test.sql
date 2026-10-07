-- 0012_s10_notes_next_test.sql
-- S10 human notes and structured Next Test persistence.

BEGIN;

ALTER TABLE next_test
  ADD COLUMN IF NOT EXISTS expected_result text,
  ADD COLUMN IF NOT EXISTS owner text,
  ADD COLUMN IF NOT EXISTS success_metric text,
  ADD COLUMN IF NOT EXISTS measurement_window text;

ALTER TABLE analyst_note
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS next_test_workspace_hypothesis_lookup
  ON next_test (workspace_id, hypothesis_id, created_at DESC);

CREATE INDEX IF NOT EXISTS analyst_note_workspace_hypothesis_lookup
  ON analyst_note (workspace_id, hypothesis_id, updated_at DESC);

COMMIT;
