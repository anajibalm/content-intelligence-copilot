-- 0007_controlled_compare.sql
-- S7 comparison artifacts are append-only and retain exact selected order/snapshot IDs.

BEGIN;

CREATE INDEX comparison_lookup
  ON comparison (workspace_id, batch_id, created_at DESC);

CREATE INDEX comparison_item_lookup
  ON comparison_item (workspace_id, comparison_id, position);

CREATE INDEX comparison_snapshot_lookup
  ON comparison_snapshot (workspace_id, comparison_id, content_id);

CREATE FUNCTION forbid_comparison_history_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER comparison_append_only
  BEFORE UPDATE OR DELETE ON comparison
  FOR EACH ROW EXECUTE FUNCTION forbid_comparison_history_mutation();

CREATE TRIGGER comparison_item_append_only
  BEFORE UPDATE OR DELETE ON comparison_item
  FOR EACH ROW EXECUTE FUNCTION forbid_comparison_history_mutation();

CREATE TRIGGER comparison_snapshot_append_only
  BEFORE UPDATE OR DELETE ON comparison_snapshot
  FOR EACH ROW EXECUTE FUNCTION forbid_comparison_history_mutation();

ALTER TABLE comparison ENABLE ROW LEVEL SECURITY;
ALTER TABLE comparison_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE comparison_snapshot ENABLE ROW LEVEL SECURITY;

COMMIT;
