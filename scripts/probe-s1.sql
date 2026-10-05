\set ON_ERROR_STOP on
\echo 'S1 positive checks'
SELECT count(*) AS seeded_contents FROM content WHERE batch_id = '30000000-0000-0000-0000-000000000003';
SELECT count(*) AS seeded_sources FROM content_source WHERE content_id IN (SELECT id FROM content WHERE batch_id = '30000000-0000-0000-0000-000000000003');
SELECT count(*) AS candidate_tables
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('brand_analysis_config', 'brand_kpi_definition', 'batch_kpi_assessment', 'temporal_evidence_anchor');
SELECT column_name FROM information_schema.columns WHERE table_name = 'metric_snapshot' AND column_name IN ('quality_json', 'content_age_hours') ORDER BY column_name;
SELECT enumlabel FROM pg_enum WHERE enumtypid = 'acquisition_status'::regtype AND enumlabel = 'UNAVAILABLE';

\echo 'S1 negative check: invalid foreign key'
DO $$
BEGIN
  BEGIN
    INSERT INTO content_source (workspace_id, content_id, provider, source_url)
    VALUES ('10000000-0000-0000-0000-000000000001', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'probe', 'https://www.tiktok.com/@probe/video/1');
    RAISE EXCEPTION 'foreign key probe unexpectedly succeeded';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'PASS foreign key rejects invalid content_id';
  END;
END $$;

\echo 'S1 negative check: raw derived metric'
DO $$
DECLARE cid uuid;
BEGIN
  SELECT id INTO cid FROM content LIMIT 1;
  BEGIN
    INSERT INTO metric_snapshot (workspace_id, content_id, distribution, raw_metrics)
    VALUES ('10000000-0000-0000-0000-000000000001', cid, 'ORGANIC', '{"er": 0.5}');
    RAISE EXCEPTION 'raw derived metric probe unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS raw_metrics rejects derived metric';
  END;
END $$;

\echo 'S1 negative check: unavailable config needs reason'
DO $$
DECLARE bid uuid;
BEGIN
  SELECT id INTO bid FROM brand LIMIT 1;
  BEGIN
    INSERT INTO brand_analysis_config (workspace_id, brand_id, version, approval_state)
    VALUES ('10000000-0000-0000-0000-000000000001', bid, 99, 'UNCONFIGURED');
    RAISE EXCEPTION 'unconfigured reason probe unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS unconfigured config requires reason';
  END;
END $$;

\echo 'S1 negative check: AI original immutable'
DO $$
DECLARE fid uuid;
BEGIN
  INSERT INTO extraction_run (workspace_id, content_id, provider, model, prompt_version, schema_version, input_hash)
  SELECT workspace_id, id, 'probe', 'probe', 'probe-v1', 'probe-v1', 'probe'
  FROM content LIMIT 1;
  INSERT INTO content_feature (workspace_id, content_id, extraction_run_id, field_name, ai_value)
  SELECT workspace_id, id, (SELECT id FROM extraction_run ORDER BY created_at DESC LIMIT 1), 'topic', 'original'
  FROM content LIMIT 1;
  SELECT id INTO fid FROM content_feature ORDER BY created_at DESC LIMIT 1;
  BEGIN
    UPDATE content_feature SET ai_value = 'overwritten' WHERE id = fid;
    RAISE EXCEPTION 'AI immutability probe unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%immutable%' THEN RAISE; END IF;
    RAISE NOTICE 'PASS AI original is immutable';
  END;
END $$;

\echo 'S1 negative check: temporary anchor requires source'
DO $$
DECLARE cid uuid;
BEGIN
  SELECT id INTO cid FROM content LIMIT 1;
  BEGIN
    INSERT INTO temporal_evidence_anchor (workspace_id, content_id, anchor_type, timestamp_ms)
    VALUES ('10000000-0000-0000-0000-000000000001', cid, 'product_entry', 1000);
    RAISE EXCEPTION 'anchor source probe unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS temporal anchor requires frame or segment source';
  END;
END $$;
