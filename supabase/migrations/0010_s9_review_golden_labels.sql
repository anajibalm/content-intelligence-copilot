-- 0010_s9_review_golden_labels.sql
-- S9 analyst review: explicit reject reasons for feature decisions, edited hypothesis
-- statement (hypothesis rows are append-only), traceable golden labels, and history lookups.

BEGIN;

-- Feature-level reject reason. Correction reasons already live on feature_correction;
-- CONFIRM/REJECT decisions previously carried no reason at all (plan S9 "reject reasons are explicit").
ALTER TABLE feature_review
  ADD COLUMN IF NOT EXISTS reason_code review_reason,
  ADD COLUMN IF NOT EXISTS golden_label boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feature_review_reject_reason') THEN
    ALTER TABLE feature_review
      ADD CONSTRAINT feature_review_reject_reason
      CHECK (decision <> 'REJECT' OR reason_code IS NOT NULL);
  END IF;
END;
$$;

-- Hypothesis review history is append-only, so an edited statement is stored on the review row.
ALTER TABLE review
  ADD COLUMN IF NOT EXISTS edited_statement text,
  ADD COLUMN IF NOT EXISTS golden_label boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS feature_review_feature_created_lookup
  ON feature_review (workspace_id, content_feature_id, created_at DESC);

CREATE INDEX IF NOT EXISTS review_hypothesis_created_lookup
  ON review (workspace_id, hypothesis_id, created_at DESC);

COMMIT;
