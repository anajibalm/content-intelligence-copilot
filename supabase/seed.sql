-- supabase/seed.sql
-- S1 fixture: one workspace + Barakat brand + Batch 8 (acceptance: plan S1).
-- Run once on a clean DB after 0001_canonical_schema.sql. Idempotent (ON CONFLICT DO NOTHING).
--
-- Content rows carry canonical identity ONLY (platform + TikTok external ID + permalink),
-- taken from spikes/video-acquisition/video-acquisition-spike/barakat_batch8_urls.csv.
--
-- Deliberately NOT seeded (unsupported / contract-blocked):
--   * metric_snapshots — CSV er_pct is DERIVED (raw metrics must never hold ER, §10.2);
--     views/engagement counts lack captured_at provenance (Barakat report PDF is
--     confidential, not tracked in repo). Attach snapshots via the metrics flow instead.
--   * pillars — pillar vocabulary is human-defined and not frozen anywhere in contracts.
--   * objectives — only the contract §8 label vocabulary is seeded (Reach / Engagement /
--     Watch Quality); batch→objective mapping stays analyst-owned.
--   * duration_ms — ffprobe OBSERVED fact; CSV durations are not stored as canonical.

BEGIN;

INSERT INTO workspace (id, name)
VALUES ('10000000-0000-0000-0000-000000000001', 'Agency Content Intelligence')
ON CONFLICT (id) DO NOTHING;

INSERT INTO brand (workspace_id, name)
VALUES ('10000000-0000-0000-0000-000000000001', 'Barakat')
ON CONFLICT (workspace_id, name) DO NOTHING;

-- Objective-aware label vocabulary (contract §8: "Best by Reach / Engagement / Watch Quality").
INSERT INTO objective (workspace_id, name) VALUES
  ('10000000-0000-0000-0000-000000000001', 'Reach'),
  ('10000000-0000-0000-0000-000000000001', 'Engagement'),
  ('10000000-0000-0000-0000-000000000001', 'Watch Quality')
ON CONFLICT (workspace_id, name) DO NOTHING;

-- Discovery candidate config: settings remain unconfigured until brand agreement supplies them.
INSERT INTO brand_analysis_config (
  id, workspace_id, brand_id, version, primary_metric, supporting_metrics,
  ranking_rule_json, fallback_rule_json, creative_preferences_json,
  working_language, future_deck_language, approval_state, unconfigured_reason
)
SELECT
  '20000000-0000-0000-0000-000000000002',
  w.id,
  b.id,
  1,
  NULL,
  '[]'::jsonb,
  '{}'::jsonb,
  '{}'::jsonb,
  '{}'::jsonb,
  'id',
  'en',
  'UNCONFIGURED',
  'brand approval and ranking precedence not supplied'
FROM workspace w
JOIN brand b ON b.workspace_id = w.id AND b.name = 'Barakat'
WHERE w.id = '10000000-0000-0000-0000-000000000001'
ON CONFLICT (id) DO NOTHING;

UPDATE batch
SET analysis_config_id = '20000000-0000-0000-0000-000000000002'
WHERE id = '30000000-0000-0000-0000-000000000003';

-- Contract-defined batch: Barakat Batch 8, 15 short videos (PRD §6).
INSERT INTO batch (id, workspace_id, brand_id, name, contracted_video_count)
VALUES (
  '30000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000001',
  (SELECT id FROM brand
    WHERE workspace_id = '10000000-0000-0000-0000-000000000001' AND name = 'Barakat'),
  'Batch 8',
  15
)
ON CONFLICT (id) DO NOTHING;

-- Batch 8 contents from the spike CSV (canonical identity only).
INSERT INTO content (workspace_id, brand_id, batch_id, platform, external_id, permalink, title)
SELECT
  '10000000-0000-0000-0000-000000000001',
  b.id,
  bt.id,
  'TIKTOK',
  v.external_id,
  'https://www.tiktok.com/@barakat_id/video/' || v.external_id,
  v.title
FROM brand b
CROSS JOIN batch bt
CROSS JOIN (VALUES
  ('7603222928527756545', 'Outing Kantor'),
  ('7603224019688590609', 'Drama jajan'),
  ('7603226211023719696', 'Pengumuman Karyawan Terbaik'),
  ('7605929149194046738', 'Cek bau mulut'),
  ('7605929718839315719', 'Ketika Anak kantor Dapet Makanan Tak Terduga'),
  ('7605930512053472520', 'Gep Temen Kantor mau First Date'),
  ('7601749857933511954', 'Bakteri vs Siwak'),
  ('7602229928444087553', 'Fakta Siwak'),
  ('7605938245536320786', 'Kurma Bikin Gigi Gampang Berlubang?'),
  ('7635995925688716561', 'Boleh Nanya Jalan?'),
  ('7635997376762645761', 'Surprise!'),
  ('7627079130693012757', 'Drama Minuman Kantor')
) AS v (external_id, title)
WHERE b.workspace_id = '10000000-0000-0000-0000-000000000001'
  AND b.name = 'Barakat'
  AND bt.id = '30000000-0000-0000-0000-000000000003'
ON CONFLICT (workspace_id, platform, external_id) DO NOTHING;

-- Canonical TikTok source per content.
INSERT INTO content_source (workspace_id, content_id, provider, source_url, external_id, is_canonical)
SELECT c.workspace_id, c.id, 'tiktok', c.permalink, c.external_id, true
FROM content c
WHERE c.workspace_id = '10000000-0000-0000-0000-000000000001'
  AND c.batch_id = '30000000-0000-0000-0000-000000000003'
ON CONFLICT (content_id, provider, external_id) WHERE external_id IS NOT NULL DO NOTHING;

COMMIT;
