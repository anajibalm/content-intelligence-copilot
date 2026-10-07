-- Feature review decisions need the same append-only protection as corrections
-- and hypothesis reviews. Current reviewed_value remains a mutable projection.
BEGIN;

DROP TRIGGER IF EXISTS feature_review_append_only ON feature_review;
CREATE TRIGGER feature_review_append_only
  BEFORE UPDATE OR DELETE ON feature_review
  FOR EACH ROW EXECUTE FUNCTION forbid_row_mutation();

COMMIT;
