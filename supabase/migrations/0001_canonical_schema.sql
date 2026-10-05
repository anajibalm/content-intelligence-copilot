-- 0001_canonical_schema.sql
-- Canonical S1 schema — Content Intelligence Copilot MVP.
-- Sources: docs/contracts/MVP_CONTRACT_v0.1_FROZEN.md + docs/source/IMPLEMENTATION_PLAN_v0.1.md.
-- Standalone Data Contract missing (docs/decisions/DATA_CONTRACT_STATUS.md):
-- unsupported fields stay out. No donor schemas.
--
-- Frozen invariants preserved here:
--   * content has NO distribution field; Organic/Paid lives in metric_snapshot (§10.3)
--   * raw metrics never contain derived metrics such as ER (§10.2)
--   * comparison freezes the exact snapshot IDs used (§10.7)
--   * provider raw payload stays in acquisition_run (§10.1)
--   * AI originals (content_feature.ai_value, extraction_run.raw_output) are never
--     overwritten by human corrections (§11.3) — DB triggers enforce
--   * hypothesis must cite evidence (§11 / plan S8) — deferred constraint trigger
--   * review history and feature corrections are append-only (plan S9)
--   * evidence layers OBSERVED/DERIVED/EXTRACTED/INFERRED stay distinct (§9)
--
-- ponytail ceilings (upgrade paths noted inline):
--   * RLS enabled with zero policies: service role only; analyst auth/policies later
--   * metric_snapshot derived-key CHECK blocks known derived names; extend with metrics-v1
--   * content_feature.field_name vocabulary = S4 v0.1; extends via migration with config vocab

CREATE EXTENSION IF NOT EXISTS pgcrypto;
BEGIN;

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------

CREATE TYPE processing_stage_state AS ENUM
  ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'UNAVAILABLE');

CREATE TYPE processing_stage AS ENUM
  ('FFPROBE', 'AUDIO_EXTRACTION', 'TRANSCRIPTION', 'HOOK_FRAMES',
   'REPRESENTATIVE_FRAMES', 'MULTIMODAL_EXTRACTION');

CREATE TYPE platform AS ENUM ('TIKTOK');

CREATE TYPE distribution_context AS ENUM ('ORGANIC', 'PAID');

CREATE TYPE metric_quality AS ENUM ('VALID', 'MISSING', 'SUSPECT', 'UNAVAILABLE');

CREATE TYPE evidence_layer AS ENUM ('OBSERVED', 'DERIVED', 'EXTRACTED', 'INFERRED');

CREATE TYPE confidence_label AS ENUM ('LOW', 'MEDIUM', 'HIGH');

CREATE TYPE comparison_mode AS ENUM ('CONTROLLED', 'PERFORMANCE_CONTRAST', 'MANUAL');

CREATE TYPE hypothesis_state AS ENUM
  ('PROPOSED', 'ACCEPTED', 'TESTING', 'SUPPORTED', 'CONTRADICTED', 'INCONCLUSIVE', 'RETIRED');

CREATE TYPE hypothesis_link_role AS ENUM ('ORIGIN', 'REPLICATION', 'CONTRADICTION');

CREATE TYPE hypothesis_evidence_role AS ENUM ('SUPPORTING', 'CONTRADICTING', 'CONTEXTUAL');

CREATE TYPE next_test_status AS ENUM
  ('PROPOSED', 'ACCEPTED', 'RUNNING', 'COMPLETED', 'CANCELLED');

CREATE TYPE acquisition_status AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');

CREATE TYPE extraction_run_status AS ENUM ('SUCCEEDED', 'FAILED');

CREATE TYPE feature_review_decision AS ENUM ('CONFIRM', 'CORRECT', 'REJECT');

CREATE TYPE feature_review_state AS ENUM ('UNREVIEWED', 'CONFIRMED', 'CORRECTED', 'REJECTED');

CREATE TYPE hypothesis_review_decision AS ENUM ('APPROVE', 'EDIT', 'REJECT');

CREATE TYPE review_reason AS ENUM
  ('WRONG_CLASSIFICATION', 'MISSED_VISUAL_CONTEXT', 'MISSED_DIALOGUE',
   'WRONG_METRIC_INTERPRETATION', 'OVERCLAIM', 'TOO_GENERIC',
   'MISSING_VARIABLE', 'BAD_DATA', 'OTHER');

CREATE TYPE frame_type AS ENUM ('HOOK', 'REPRESENTATIVE');

CREATE TYPE transcript_role AS ENUM
  ('HOOK', 'SETUP', 'MAIN_CLAIM', 'EVIDENCE_EXAMPLES', 'PAYOFF', 'CTA');

CREATE TYPE note_target_type AS ENUM ('BATCH', 'CONTENT', 'COMPARISON', 'HYPOTHESIS');

CREATE TYPE evidence_source_type AS ENUM
  ('METRIC_SNAPSHOT', 'TRANSCRIPT_SEGMENT', 'VIDEO_FRAME', 'CONTENT_FEATURE');

-- ---------------------------------------------------------------------------
-- Identity / scope tables
-- ---------------------------------------------------------------------------

CREATE TABLE workspace (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE brand (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspace (id),
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, name)
);

CREATE TABLE objective (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspace (id),
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, name)
);

CREATE TABLE batch (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          uuid NOT NULL REFERENCES workspace (id),
  brand_id              uuid NOT NULL REFERENCES brand (id),
  name                  text NOT NULL,
  contracted_video_count integer CHECK (contracted_video_count IS NULL OR contracted_video_count > 0),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, name)
);

CREATE TABLE pillar (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id           uuid NOT NULL REFERENCES workspace (id),
  batch_id               uuid NOT NULL REFERENCES batch (id),
  name                   text NOT NULL,
  primary_objective_id   uuid REFERENCES objective (id),
  secondary_objective_id uuid REFERENCES objective (id),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, name)
);

-- ---------------------------------------------------------------------------
-- Content / acquisition / processing
-- ---------------------------------------------------------------------------

-- content has NO Organic/Paid distribution field (contract §4/§10.3).
-- Canonical identity: platform + external_id; permalink kept as canonical URL.
CREATE TABLE content (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspace (id),
  brand_id        uuid NOT NULL REFERENCES brand (id),
  batch_id        uuid NOT NULL REFERENCES batch (id),
  pillar_id       uuid REFERENCES pillar (id),
  platform        platform NOT NULL DEFAULT 'TIKTOK',
  external_id     text NOT NULL,
  permalink       text NOT NULL,
  title           text,
  processing_state processing_stage_state NOT NULL DEFAULT 'PENDING',
  duration_ms     numeric CHECK (duration_ms IS NULL OR duration_ms >= 0),
  width           integer CHECK (width IS NULL OR width > 0),
  height          integer CHECK (height IS NULL OR height > 0),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, platform, external_id),
  UNIQUE (workspace_id, permalink)
);

CREATE TABLE content_source (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspace (id),
  content_id   uuid NOT NULL REFERENCES content (id),
  provider     text NOT NULL,
  source_url   text,
  external_id  text,
  is_canonical boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (source_url IS NOT NULL OR external_id IS NOT NULL)
);

CREATE UNIQUE INDEX content_source_canonical_external
  ON content_source (content_id, provider, external_id)
  WHERE external_id IS NOT NULL;

-- Provider raw payload stays in this acquisition layer (contract §10.1).
CREATE TABLE acquisition_run (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid NOT NULL REFERENCES workspace (id),
  content_source_id uuid NOT NULL REFERENCES content_source (id),
  content_id       uuid NOT NULL REFERENCES content (id),
  provider         text NOT NULL,
  attempt_number   integer NOT NULL DEFAULT 1 CHECK (attempt_number >= 1),
  status           acquisition_status NOT NULL DEFAULT 'PENDING',
  error_message    text,
  latency_ms       integer CHECK (latency_ms IS NULL OR latency_ms >= 0),
  cost_estimate    numeric,
  raw_payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  media_path       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (content_source_id, attempt_number)
);

-- One row per pipeline stage; stages retryable independently (plan S3).
CREATE TABLE content_processing (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspace (id),
  content_id   uuid NOT NULL REFERENCES content (id),
  stage        processing_stage NOT NULL,
  state        processing_stage_state NOT NULL DEFAULT 'PENDING',
  error_message text,
  output       jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at   timestamptz,
  completed_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (content_id, stage)
);

-- ---------------------------------------------------------------------------
-- Transcript / frames / extraction
-- ---------------------------------------------------------------------------

CREATE TABLE transcript (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         uuid NOT NULL REFERENCES workspace (id),
  content_id           uuid NOT NULL REFERENCES content (id),
  content_processing_id uuid REFERENCES content_processing (id),
  engine               text NOT NULL DEFAULT 'faster-whisper',
  model                text,
  language             text,
  duration_ms          numeric CHECK (duration_ms IS NULL OR duration_ms >= 0),
  quality_note         text,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE transcript_segment (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace (id),
  transcript_id uuid NOT NULL REFERENCES transcript (id),
  seq           integer NOT NULL CHECK (seq >= 1),
  start_ms      numeric NOT NULL CHECK (start_ms >= 0),
  end_ms        numeric NOT NULL CHECK (end_ms > start_ms),
  text          text NOT NULL,
  role          transcript_role,
  UNIQUE (transcript_id, seq)
);

CREATE TABLE video_frame (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         uuid NOT NULL REFERENCES workspace (id),
  content_id           uuid NOT NULL REFERENCES content (id),
  content_processing_id uuid REFERENCES content_processing (id),
  frame_type           frame_type NOT NULL,
  timestamp_ms         numeric NOT NULL CHECK (timestamp_ms >= 0),
  storage_path         text NOT NULL,
  width                integer CHECK (width IS NULL OR width > 0),
  height               integer CHECK (height IS NULL OR height > 0),
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (content_id, frame_type, timestamp_ms)
);

CREATE TABLE extraction_run (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   uuid NOT NULL REFERENCES workspace (id),
  content_id     uuid NOT NULL REFERENCES content (id),
  provider       text NOT NULL,
  model          text NOT NULL,
  prompt_version text NOT NULL,
  schema_version text NOT NULL,
  input_hash     text NOT NULL,
  raw_output     jsonb NOT NULL DEFAULT '{}'::jsonb,
  status         extraction_run_status NOT NULL DEFAULT 'SUCCEEDED',
  error_message  text,
  cost_estimate  numeric,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ai_value = AI original, immutable (trigger below).
-- reviewed_value = canonical value only after human review (contract §11.1–§11.3).
CREATE TABLE content_feature (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspace (id),
  content_id      uuid NOT NULL REFERENCES content (id),
  extraction_run_id uuid NOT NULL REFERENCES extraction_run (id),
  field_name      text NOT NULL CHECK (field_name IN (
                    'topic', 'format', 'hook_type', 'hook_subject', 'talent_type',
                    'talent_familiarity', 'opening_style', 'pacing',
                    'narrative_structure', 'emotional_trigger', 'tension_type',
                    'product_placement', 'cta_type')),
  ai_value        text NOT NULL,
  reviewed_value  text,
  review_state    feature_review_state NOT NULL DEFAULT 'UNREVIEWED',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (extraction_run_id, field_name)
);

CREATE TABLE feature_review (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid NOT NULL REFERENCES workspace (id),
  content_feature_id uuid NOT NULL REFERENCES content_feature (id),
  extraction_run_id uuid NOT NULL REFERENCES extraction_run (id),
  decision          feature_review_decision NOT NULL,
  reviewer          text NOT NULL,
  note              text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Append-only (trigger below): human corrections never overwrite/delete AI output (§11.3).
CREATE TABLE feature_correction (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid NOT NULL REFERENCES workspace (id),
  content_feature_id uuid NOT NULL REFERENCES content_feature (id),
  extraction_run_id uuid NOT NULL REFERENCES extraction_run (id),
  original_ai_value text NOT NULL,
  corrected_value   text NOT NULL,
  reason_code       review_reason NOT NULL,
  note              text,
  reviewer          text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Metrics
-- ---------------------------------------------------------------------------

-- Distribution (Organic/Paid) + quality live HERE, never on content (§10.3/§10.5).
-- raw_metrics = observed provider counts only; derived_metrics = deterministic,
-- formula version recorded per entry (contract §10.2 / plan S5).
CREATE TABLE metric_snapshot (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspace (id),
  content_id      uuid NOT NULL REFERENCES content (id),
  distribution    distribution_context NOT NULL,
  captured_at     timestamptz,
  source          text,
  quality         metric_quality NOT NULL DEFAULT 'VALID',
  raw_metrics     jsonb NOT NULL DEFAULT '{}'::jsonb,
  derived_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  -- Blocks known derived metric keys in raw_metrics.
  -- ponytail: extend key list alongside config/rules/metrics-v1 vocabulary.
  CHECK (NOT (raw_metrics ? 'er') AND NOT (raw_metrics ? 'engagement_rate'))
);

-- ---------------------------------------------------------------------------
-- Comparison
-- ---------------------------------------------------------------------------

CREATE TABLE comparison (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          uuid NOT NULL REFERENCES workspace (id),
  batch_id              uuid NOT NULL REFERENCES batch (id),
  mode                  comparison_mode NOT NULL DEFAULT 'CONTROLLED',
  distribution          distribution_context NOT NULL,
  -- Deterministic comparison quality (contract §12/§13); vocabulary reuses confidence labels.
  quality               text NOT NULL DEFAULT 'UNAVAILABLE'
                        CHECK (quality IN ('LOW', 'MEDIUM', 'HIGH', 'UNAVAILABLE')),
  rule_version          text NOT NULL,
  controlled_variables  jsonb NOT NULL DEFAULT '{}'::jsonb,
  uncontrolled_variables jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Every relative label states its comparison basis (contract §8).
  label                 text,
  label_basis           text,
  created_by            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CHECK ((label IS NULL) = (label_basis IS NULL))
);

CREATE TABLE comparison_item (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace (id),
  comparison_id uuid NOT NULL REFERENCES comparison (id),
  content_id    uuid NOT NULL REFERENCES content (id),
  position      integer NOT NULL CHECK (position >= 1),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (comparison_id, content_id)
);

-- Freezes the exact snapshot IDs actually used (contract §10.7).
CREATE TABLE comparison_snapshot (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid NOT NULL REFERENCES workspace (id),
  comparison_id     uuid NOT NULL REFERENCES comparison (id),
  content_id        uuid NOT NULL REFERENCES content (id),
  metric_snapshot_id uuid NOT NULL REFERENCES metric_snapshot (id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (comparison_id, metric_snapshot_id)
);

-- ---------------------------------------------------------------------------
-- Evidence / hypothesis / review / next test / notes
-- ---------------------------------------------------------------------------

CREATE TABLE evidence (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspace (id),
  layer        evidence_layer NOT NULL,
  statement    text NOT NULL,
  created_by   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Points back to immutable source observations (contract §10.8).
-- Exactly one source FK per row, matched to source_type (CHECK below).
CREATE TABLE evidence_source (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        uuid NOT NULL REFERENCES workspace (id),
  evidence_id         uuid NOT NULL REFERENCES evidence (id),
  source_type         evidence_source_type NOT NULL,
  metric_snapshot_id  uuid REFERENCES metric_snapshot (id),
  transcript_segment_id uuid REFERENCES transcript_segment (id),
  video_frame_id      uuid REFERENCES video_frame (id),
  content_feature_id  uuid REFERENCES content_feature (id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (source_type = 'METRIC_SNAPSHOT')    = (metric_snapshot_id IS NOT NULL) AND
    (source_type = 'TRANSCRIPT_SEGMENT') = (transcript_segment_id IS NOT NULL) AND
    (source_type = 'VIDEO_FRAME')        = (video_frame_id IS NOT NULL) AND
    (source_type = 'CONTENT_FEATURE')    = (content_feature_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX evidence_source_one_per_source
  ON evidence_source (evidence_id, metric_snapshot_id) WHERE metric_snapshot_id IS NOT NULL;
CREATE UNIQUE INDEX evidence_source_one_per_segment
  ON evidence_source (evidence_id, transcript_segment_id) WHERE transcript_segment_id IS NOT NULL;
CREATE UNIQUE INDEX evidence_source_one_per_frame
  ON evidence_source (evidence_id, video_frame_id) WHERE video_frame_id IS NOT NULL;
CREATE UNIQUE INDEX evidence_source_one_per_feature
  ON evidence_source (evidence_id, content_feature_id) WHERE content_feature_id IS NOT NULL;

CREATE TABLE hypothesis (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid NOT NULL REFERENCES workspace (id),
  batch_id         uuid NOT NULL REFERENCES batch (id),
  statement        text NOT NULL,
  state            hypothesis_state NOT NULL DEFAULT 'PROPOSED',
  -- Deterministic caps win; LLM cannot override (contract §13).
  confidence       confidence_label NOT NULL DEFAULT 'LOW',
  confidence_caps  jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE hypothesis_comparison (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   uuid NOT NULL REFERENCES workspace (id),
  hypothesis_id  uuid NOT NULL REFERENCES hypothesis (id),
  comparison_id  uuid NOT NULL REFERENCES comparison (id),
  role           hypothesis_link_role NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hypothesis_id, comparison_id, role)
);

CREATE TABLE hypothesis_evidence (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   uuid NOT NULL REFERENCES workspace (id),
  hypothesis_id  uuid NOT NULL REFERENCES hypothesis (id),
  evidence_id    uuid NOT NULL REFERENCES evidence (id),
  role           hypothesis_evidence_role NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hypothesis_id, evidence_id)
);

-- Append-only review history (trigger below); reject requires a reason (CHECK).
CREATE TABLE review (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace (id),
  hypothesis_id uuid NOT NULL REFERENCES hypothesis (id),
  decision      hypothesis_review_decision NOT NULL,
  reason_code   review_reason,
  note          text,
  reviewer      text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (decision <> 'REJECT' OR reason_code IS NOT NULL)
);

-- Structured Next Test (contract §16); a completed test may link a result comparison.
CREATE TABLE next_test (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         uuid NOT NULL REFERENCES workspace (id),
  hypothesis_id        uuid NOT NULL REFERENCES hypothesis (id),
  variable_to_test     text NOT NULL,
  variant_a            text NOT NULL,
  variant_b            text NOT NULL,
  controls             text NOT NULL,
  target_batch_id      uuid NOT NULL REFERENCES batch (id),
  status               next_test_status NOT NULL DEFAULT 'PROPOSED',
  result_comparison_id uuid REFERENCES comparison (id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- Analyst notes = human context, NOT objective evidence (contract §11.6).
-- No FK from evidence to analyst_note — deliberate.
CREATE TABLE analyst_note (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspace (id),
  target_type   note_target_type NOT NULL,
  body          text NOT NULL,
  batch_id      uuid REFERENCES batch (id),
  content_id    uuid REFERENCES content (id),
  comparison_id uuid REFERENCES comparison (id),
  hypothesis_id uuid REFERENCES hypothesis (id),
  author        text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (target_type = 'BATCH')      = (batch_id IS NOT NULL) AND
    (target_type = 'CONTENT')    = (content_id IS NOT NULL) AND
    (target_type = 'COMPARISON') = (comparison_id IS NOT NULL) AND
    (target_type = 'HYPOTHESIS') = (hypothesis_id IS NOT NULL)
  )
);

-- ---------------------------------------------------------------------------
-- Invariant triggers
-- ---------------------------------------------------------------------------

-- §11.3: AI original feature value is immutable; corrections go to feature_correction.
CREATE FUNCTION block_ai_value_overwrite() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.ai_value IS DISTINCT FROM OLD.ai_value THEN
    RAISE EXCEPTION 'content_feature.ai_value is immutable; record corrections in feature_correction';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER content_feature_ai_value_immutable
  BEFORE UPDATE ON content_feature
  FOR EACH ROW EXECUTE FUNCTION block_ai_value_overwrite();

-- Plan S9: review history append-only.
CREATE FUNCTION forbid_row_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER feature_correction_append_only
  BEFORE UPDATE OR DELETE ON feature_correction
  FOR EACH ROW EXECUTE FUNCTION forbid_row_mutation();

CREATE TRIGGER review_append_only
  BEFORE UPDATE OR DELETE ON review
  FOR EACH ROW EXECUTE FUNCTION forbid_row_mutation();

-- Plan S8: a hypothesis without evidence is rejected (checked at commit).
CREATE FUNCTION hypothesis_requires_evidence() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  hid uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    hid := NEW.hypothesis_id;
  ELSE
    hid := OLD.hypothesis_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM hypothesis_evidence WHERE hypothesis_id = hid) THEN
    RAISE EXCEPTION 'hypothesis % must cite at least one evidence', hid;
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER hypothesis_requires_evidence_trg
  AFTER INSERT ON hypothesis
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION hypothesis_requires_evidence();

CREATE CONSTRAINT TRIGGER hypothesis_requires_evidence_trg
  AFTER DELETE ON hypothesis_evidence
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION hypothesis_requires_evidence();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- ponytail: zero policies → anon/authenticated denied; Supabase service role
-- (bypasses RLS) is the only writer/reader until analyst auth lands.
-- Upgrade path: enable policies per role when an auth model exists.

ALTER TABLE workspace              ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE objective              ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE pillar                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE content                ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_source         ENABLE ROW LEVEL SECURITY;
ALTER TABLE acquisition_run        ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_processing     ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcript             ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcript_segment     ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_frame            ENABLE ROW LEVEL SECURITY;
ALTER TABLE extraction_run         ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_feature        ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_review         ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_correction     ENABLE ROW LEVEL SECURITY;
ALTER TABLE metric_snapshot        ENABLE ROW LEVEL SECURITY;
ALTER TABLE comparison             ENABLE ROW LEVEL SECURITY;
ALTER TABLE comparison_item        ENABLE ROW LEVEL SECURITY;
ALTER TABLE comparison_snapshot    ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence               ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_source        ENABLE ROW LEVEL SECURITY;
ALTER TABLE hypothesis             ENABLE ROW LEVEL SECURITY;
ALTER TABLE hypothesis_comparison  ENABLE ROW LEVEL SECURITY;
ALTER TABLE hypothesis_evidence    ENABLE ROW LEVEL SECURITY;
ALTER TABLE review                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE next_test              ENABLE ROW LEVEL SECURITY;
ALTER TABLE analyst_note           ENABLE ROW LEVEL SECURITY;

COMMIT;
