-- 0007_controlled_compare.sql
-- S7 comparison artifacts are append-only and retain exact selected order/snapshot IDs.

BEGIN;
ALTER TABLE comparison
  ADD COLUMN IF NOT EXISTS quality_reasons jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS comparison_lookup
  ON comparison (workspace_id, batch_id, created_at DESC);

CREATE INDEX IF NOT EXISTS comparison_item_lookup
  ON comparison_item (workspace_id, comparison_id, position);

CREATE INDEX IF NOT EXISTS comparison_snapshot_lookup
  ON comparison_snapshot (workspace_id, comparison_id, content_id);

CREATE OR REPLACE FUNCTION forbid_comparison_history_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME;
END;
$$;

DROP TRIGGER IF EXISTS comparison_append_only ON comparison;
CREATE TRIGGER comparison_append_only
  BEFORE UPDATE OR DELETE ON comparison
  FOR EACH ROW EXECUTE FUNCTION forbid_comparison_history_mutation();

DROP TRIGGER IF EXISTS comparison_item_append_only ON comparison_item;
CREATE TRIGGER comparison_item_append_only
  BEFORE UPDATE OR DELETE ON comparison_item
  FOR EACH ROW EXECUTE FUNCTION forbid_comparison_history_mutation();

DROP TRIGGER IF EXISTS comparison_snapshot_append_only ON comparison_snapshot;
CREATE TRIGGER comparison_snapshot_append_only
  BEFORE UPDATE OR DELETE ON comparison_snapshot
  FOR EACH ROW EXECUTE FUNCTION forbid_comparison_history_mutation();

ALTER TABLE comparison ENABLE ROW LEVEL SECURITY;
ALTER TABLE comparison_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE comparison_snapshot ENABLE ROW LEVEL SECURITY;

COMMIT;
