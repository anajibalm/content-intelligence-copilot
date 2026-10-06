-- 0005_metrics_analysis.sql
-- S5 derived/ranking artifacts. Inputs remain immutable metric snapshots; each run records exact config and snapshot IDs.

BEGIN;

CREATE TABLE batch_ranking_result (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        uuid NOT NULL REFERENCES workspace (id),
  brand_id            uuid NOT NULL REFERENCES brand (id),
  batch_id            uuid NOT NULL REFERENCES batch (id),
  distribution        distribution_context NOT NULL,
  analysis_config_id  uuid REFERENCES brand_analysis_config (id),
  source_snapshot_ids uuid[] NOT NULL DEFAULT '{}',
  primary_metric      text,
  rule_version        text NOT NULL,
  status              text NOT NULL CHECK (status IN ('READY', 'INSUFFICIENT_DATA', 'UNCONFIGURED')),
  reason              text,
  result_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE batch_ranking_item (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         uuid NOT NULL REFERENCES workspace (id),
  ranking_result_id    uuid NOT NULL REFERENCES batch_ranking_result (id),
  content_id           uuid NOT NULL REFERENCES content (id),
  metric_snapshot_id   uuid REFERENCES metric_snapshot (id),
  position             integer,
  metric_name          text,
  metric_value         numeric,
  eligible             boolean NOT NULL,
  basis_json           jsonb NOT NULL DEFAULT '{}'::jsonb,
  exclusion_reason     text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CHECK ((eligible AND position IS NOT NULL) OR NOT eligible)
);

CREATE INDEX batch_ranking_result_lookup
  ON batch_ranking_result (workspace_id, batch_id, created_at DESC);

CREATE INDEX batch_ranking_item_lookup
  ON batch_ranking_item (workspace_id, ranking_result_id, position);

CREATE FUNCTION forbid_ranking_history_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER batch_ranking_result_append_only
  BEFORE UPDATE OR DELETE ON batch_ranking_result
  FOR EACH ROW EXECUTE FUNCTION forbid_ranking_history_mutation();

CREATE TRIGGER batch_ranking_item_append_only
  BEFORE UPDATE OR DELETE ON batch_ranking_item
  FOR EACH ROW EXECUTE FUNCTION forbid_ranking_history_mutation();

ALTER TABLE batch_ranking_result ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_ranking_item ENABLE ROW LEVEL SECURITY;

COMMIT;
