-- Feature review events retain frozen reviewed values and append-only protection.
BEGIN;

ALTER TABLE feature_review ADD COLUMN IF NOT EXISTS reviewed_value text;
ALTER TABLE review ADD COLUMN IF NOT EXISTS reviewed_statement text;

DROP TRIGGER IF EXISTS feature_review_append_only ON feature_review;
CREATE TRIGGER feature_review_append_only
  BEFORE UPDATE OR DELETE ON feature_review
  FOR EACH ROW EXECUTE FUNCTION forbid_row_mutation();

COMMIT;
