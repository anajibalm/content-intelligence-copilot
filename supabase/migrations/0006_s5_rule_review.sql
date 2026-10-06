-- 0006_s5_rule_review.sql
-- Persist KPI contributing/excluded basis so partial coverage cannot look fully valid.

BEGIN;

ALTER TABLE batch_kpi_assessment
  ADD COLUMN IF NOT EXISTS excluded_snapshot_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS exclusion_json jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE batch_kpi_assessment
  ADD CONSTRAINT batch_kpi_assessment_exclusion_json_array
  CHECK (jsonb_typeof(exclusion_json) = 'array');

COMMIT;
