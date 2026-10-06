-- S5 synthetic/demo seed. Never represents approved real-brand KPI or ranking policy.
BEGIN;

INSERT INTO brand_analysis_config (
  workspace_id, brand_id, version, primary_metric, supporting_metrics,
  ranking_rule_json, fallback_rule_json, approval_state, configured_by
)
SELECT
  b.workspace_id, b.id, 2, 'awt_seconds', '["views", "engagement_rate"]'::jsonb,
  '{"distribution":"ORGANIC","minimumSampleSize":2,"direction":"DESC"}'::jsonb,
  '{"metric":"views","direction":"DESC"}'::jsonb,
  'APPROVED', 'synthetic_s5_fixture'
FROM brand b
WHERE b.name = 'Barakat'
  AND NOT EXISTS (SELECT 1 FROM brand_analysis_config c WHERE c.brand_id = b.id AND c.version = 2);

INSERT INTO brand_kpi_definition (
  workspace_id, brand_id, version, metric_name, target_value, unit,
  comparator, aggregation_method, assessment_scope, source_requirement,
  distribution, formula_version, configured_by
)
SELECT b.workspace_id, b.id, 1, 'views', 900, 'views', 'GTE', 'AVERAGE',
  'BATCH', 'synthetic_s5_demo', 'ORGANIC', 'metrics-v1', 'synthetic_s5_fixture'
FROM brand b
WHERE b.name = 'Barakat'
  AND NOT EXISTS (SELECT 1 FROM brand_kpi_definition k WHERE k.brand_id = b.id AND k.metric_name = 'views');

UPDATE batch b
SET analysis_config_id = c.id
FROM brand_analysis_config c
WHERE b.id = '30000000-0000-0000-0000-000000000003'
  AND c.brand_id = b.brand_id AND c.version = 2;

INSERT INTO metric_snapshot (
  workspace_id, content_id, distribution, captured_at, content_age_hours, source,
  quality, raw_metrics, derived_metrics, quality_json
)
SELECT
  c.workspace_id, c.id, 'ORGANIC', '2026-10-06T00:00:00Z', 48,
  'synthetic_s5_demo', 'VALID',
  jsonb_build_object(
    'views', jsonb_build_object('value', v.views, 'quality', 'VALID'),
    'likes', jsonb_build_object('value', v.likes, 'quality', 'VALID'),
    'comments', jsonb_build_object('value', v.comments, 'quality', CASE WHEN v.comments = 0 THEN 'SUSPECT' ELSE 'VALID' END),
    'shares', jsonb_build_object('value', v.shares, 'quality', 'VALID'),
    'saves', jsonb_build_object('value', v.saves, 'quality', 'VALID'),
    'awt_seconds', jsonb_build_object('value', v.awt, 'quality', CASE WHEN v.awt IS NULL THEN 'UNAVAILABLE' ELSE 'VALID' END)
  ),
  jsonb_build_object('engagement_rate', jsonb_build_object(
    'value', CASE WHEN v.comments = 0 THEN NULL ELSE (v.likes + v.comments + v.shares + v.saves)::numeric / NULLIF(v.views, 0) END,
    'formulaVersion', 'metrics-v1',
    'sourceMetricNames', jsonb_build_array('likes', 'comments', 'shares', 'saves', 'views')
  )),
  jsonb_build_object(
    'views', jsonb_build_object('state', 'VALID', 'reason', NULL),
    'comments', jsonb_build_object('state', CASE WHEN v.comments = 0 THEN 'SUSPECT' ELSE 'VALID' END, 'reason', CASE WHEN v.comments = 0 THEN 'UNEXPLAINED_ZERO' ELSE NULL END),
    'awt_seconds', jsonb_build_object('state', CASE WHEN v.awt IS NULL THEN 'UNAVAILABLE' ELSE 'VALID' END, 'reason', CASE WHEN v.awt IS NULL THEN 'NOT_ACCESSIBLE' ELSE NULL END)
  )
FROM content c
JOIN (VALUES
  ('7603222928527756545', 1000, 120, 4, 20, 10, 0.01),
  ('7603226211023719696', 1000, 120, 4, 20, 10, NULL),
  ('7605929149194046738', 800, 80, 0, 12, 8, NULL)
) AS v(external_id, views, likes, comments, shares, saves, awt) ON v.external_id = c.external_id
WHERE c.batch_id = '30000000-0000-0000-0000-000000000003'
  AND NOT EXISTS (
    SELECT 1 FROM metric_snapshot ms
    WHERE ms.content_id = c.id AND ms.distribution = 'ORGANIC' AND ms.source = 'synthetic_s5_demo'
  );

COMMIT;
