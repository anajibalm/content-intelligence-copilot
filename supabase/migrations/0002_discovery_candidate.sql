-- 0002_discovery_candidate.sql
-- v0.2 discovery additions. Candidate only; v0.1 frozen schema remains history.
-- Unknown brand approvals, KPI targets, and ranking precedence stay explicitly unconfigured.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TYPE acquisition_status ADD VALUE IF NOT EXISTS 'UNAVAILABLE';
ALTER TYPE frame_type ADD VALUE IF NOT EXISTS 'SCENE';

ALTER TABLE metric_snapshot
  ADD COLUMN IF NOT EXISTS content_age_hours numeric CHECK (content_age_hours IS NULL OR content_age_hours >= 0),
  ADD COLUMN IF NOT EXISTS quality_json jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE video_frame
  ADD COLUMN IF NOT EXISTS sampling_policy_version text;

ALTER TABLE comparison
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'PAIR'
    CHECK (scope IN ('PAIR', 'GROUP', 'BATCH'));

CREATE TYPE config_approval_state AS ENUM ('UNCONFIGURED', 'PENDING', 'APPROVED');

CREATE TABLE brand_analysis_config (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          uuid NOT NULL REFERENCES workspace (id),
  brand_id              uuid NOT NULL REFERENCES brand (id),
  version               integer NOT NULL CHECK (version >= 1),
  primary_metric        text,
  supporting_metrics    jsonb NOT NULL DEFAULT '[]'::jsonb,
  ranking_rule_json     jsonb NOT NULL DEFAULT '{}'::jsonb,
  fallback_rule_json    jsonb NOT NULL DEFAULT '{}'::jsonb,
  creative_preferences_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  working_language      text,
  future_deck_language  text,
  configured_by         text,
  approval_state        config_approval_state NOT NULL DEFAULT 'UNCONFIGURED',
  unconfigured_reason   text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, version),
  CHECK (approval_state <> 'UNCONFIGURED' OR unconfigured_reason IS NOT NULL),
  CHECK (jsonb_typeof(supporting_metrics) = 'array')
);

ALTER TABLE batch
  ADD COLUMN IF NOT EXISTS analysis_config_id uuid REFERENCES brand_analysis_config (id);

CREATE TABLE brand_kpi_definition (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        uuid NOT NULL REFERENCES workspace (id),
  brand_id            uuid NOT NULL REFERENCES brand (id),
  version             integer NOT NULL CHECK (version >= 1),
  metric_name         text NOT NULL,
  target_value        numeric,
  unit                text,
  comparator          text,
  aggregation_method  text,
  assessment_scope    text,
  reporting_window    jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_requirement  text,
  distribution        distribution_context,
  formula_version     text,
  configured_by       text,
  effective_from      date,
  unconfigured_reason text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, version, metric_name),
  CHECK (
    target_value IS NOT NULL
    OR unconfigured_reason IS NOT NULL
  )
);

CREATE TABLE batch_kpi_assessment (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          uuid NOT NULL REFERENCES workspace (id),
  batch_id              uuid NOT NULL REFERENCES batch (id),
  kpi_definition_id     uuid NOT NULL REFERENCES brand_kpi_definition (id),
  analysis_config_id    uuid REFERENCES brand_analysis_config (id),
  source_snapshot_ids   uuid[] NOT NULL DEFAULT '{}',
  formula_version       text,
  rule_version          text NOT NULL,
  actual_value          numeric,
  status                text NOT NULL CHECK (status IN ('ACHIEVED', 'NOT_ACHIEVED', 'INSUFFICIENT_DATA', 'UNCONFIGURED')),
  quality_state         metric_quality NOT NULL,
  assessed_at           timestamptz NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'ACHIEVED' OR actual_value IS NOT NULL),
  CHECK (status <> 'NOT_ACHIEVED' OR actual_value IS NOT NULL),
  CHECK (status <> 'UNCONFIGURED' OR quality_state IN ('MISSING', 'UNAVAILABLE'))
);

CREATE TABLE temporal_evidence_anchor (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          uuid NOT NULL REFERENCES workspace (id),
  content_id            uuid NOT NULL REFERENCES content (id),
  video_frame_id       uuid REFERENCES video_frame (id),
  transcript_segment_id uuid REFERENCES transcript_segment (id),
  anchor_type           text NOT NULL,
  timestamp_ms          numeric NOT NULL CHECK (timestamp_ms >= 0),
  review_state          text NOT NULL DEFAULT 'UNREVIEWED'
    CHECK (review_state IN ('UNREVIEWED', 'CONFIRMED', 'REJECTED')),
  note                  text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CHECK (video_frame_id IS NOT NULL OR transcript_segment_id IS NOT NULL)
);

-- Versioned config and assessments are historical artifacts, not mutable settings.
CREATE FUNCTION forbid_discovery_history_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER brand_analysis_config_append_only
  BEFORE UPDATE OR DELETE ON brand_analysis_config
  FOR EACH ROW EXECUTE FUNCTION forbid_discovery_history_mutation();

CREATE TRIGGER brand_kpi_definition_append_only
  BEFORE UPDATE OR DELETE ON brand_kpi_definition
  FOR EACH ROW EXECUTE FUNCTION forbid_discovery_history_mutation();

CREATE TRIGGER batch_kpi_assessment_append_only
  BEFORE UPDATE OR DELETE ON batch_kpi_assessment
  FOR EACH ROW EXECUTE FUNCTION forbid_discovery_history_mutation();

ALTER TABLE brand_analysis_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_kpi_definition ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_kpi_assessment ENABLE ROW LEVEL SECURITY;
ALTER TABLE temporal_evidence_anchor ENABLE ROW LEVEL SECURITY;

COMMIT;
