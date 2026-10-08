import { test, expect } from '@playwright/test';
import { Pool } from 'pg';
import { mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createPostgresRuntime } from '../../lib/runtime/postgres.ts';
import { createFakeAcquirer } from '../../lib/acquisition/index.ts';
import { FINGERPRINT_FIELDS } from '../../lib/extraction/index.ts';
import { createComparisonRepository } from '../../lib/compare/postgres.ts';
import { createHypothesisRepository } from '../../lib/hypothesis/postgres.ts';

const workspaceId = '34000000-0000-4000-8000-000000000001';
const foreignWorkspace = '34000000-0000-4000-8000-000000000002';
const brandId = '34000000-0000-4000-8000-000000000003';
const batchA = '34000000-0000-4000-8000-000000000004';
const batchB = '34000000-0000-4000-8000-000000000005';
const connectionString = process.env.CIC_DATABASE_URL;
const storageRoot = process.env.CIC_STORAGE_ROOT;
if (!connectionString || !storageRoot) throw new Error('CIC_DATABASE_URL and CIC_STORAGE_ROOT required for PR34 integrated staging');
const pool = new Pool({ connectionString });
let failOnce = true;
const existing = join(storageRoot, 'aa3c553e-681d-4cb5-bfab-a185e4f6cb9b/08df9c0e-fc84-41ac-9537-b7d633ae2d12');
const frames = (outputDir: string, timestamps: readonly number[]) => timestamps.map((timestampMs) => {
  const storagePath = join(outputDir, `${timestampMs}.jpg`);
  mkdirSync(outputDir, { recursive: true });
  copyFileSync(join(existing, 'hook/frame-0.jpg'), storagePath);
  return { timestampMs, storagePath, width: 1080, height: 1920 };
});
const runtime = createPostgresRuntime({ connectionString, workspaceId, batchId: batchA, brandId: null, storageRoot, acquirer: createFakeAcquirer({ tempDirBase: '/tmp' }), processingTools: {
  async probe() { return { format: { duration: '4' }, streams: [{ codec_type: 'video', width: 1080, height: 1920 }] }; },
  async extractAudio(_input, output) { mkdirSync(dirname(output), { recursive: true }); copyFileSync(join(existing, 'audio.wav'), output); },
  async extractFrames(_input, output, timestamps) { return frames(output, timestamps); },
  async extractPerSecondFrames(_input, output) { return frames(output, [0, 1000, 2000, 3000]); },
  async transcribe() { if (failOnce) { failOnce = false; throw new Error('PR34 synthetic transient transcription failure'); } return { engine: 'synthetic-pr34', segments: [{ startMs: 0, endMs: 1000, text: 'Synthetic PR34 persisted transcript' }] }; },
}, fingerprintExtractor: async () => ({ provider: 'synthetic-pr34', model: 'synthetic-pr34', promptVersion: 'fingerprint-v0.1', schemaVersion: 'fingerprint-v0.1', rawOutput: { synthetic: true }, features: FINGERPRINT_FIELDS.map((fieldName) => ({ fieldName, value: 'synthetic-pr34' })) }) });

test.beforeAll(async () => {
  await pool.query('INSERT INTO workspace(id,name) VALUES ($1,$2),($3,$4) ON CONFLICT DO NOTHING', [workspaceId, 'Synthetic PR34 isolated workspace', foreignWorkspace, 'Synthetic PR34 foreign workspace']);
  await pool.query('INSERT INTO brand(id,workspace_id,name) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [brandId, workspaceId, 'Synthetic PR34 review fixture']);
  await pool.query('INSERT INTO batch(id,workspace_id,brand_id,name) VALUES ($1,$2,$3,$4),($5,$2,$3,$6) ON CONFLICT DO NOTHING', [batchA, workspaceId, brandId, 'Synthetic PR34 batch A', batchB, 'Synthetic PR34 batch B']);
  // Finish only interrupted synthetic PR34 jobs; never reset existing workspace data.
  failOnce = false;
  while (await runtime.runOne('pr34-fixture-resume')) { /* durable dispatcher drains this isolated fixture workspace */ }
  failOnce = true;
});
test.afterAll(async () => { await runtime.close(); await pool.end(); });

test('selected batch worker retry, persistence, tenant scope, recovery and canonical evidence', async ({ page, request }) => {
  test.setTimeout(120_000);
  const url = `https://www.tiktok.com/@synthetic_pr34/video/${Date.now()}000001`;
  await page.goto(`/?batchId=${batchB}&view=batch`);
  await page.getByLabel('Public TikTok URL').fill(url);
  const accepted = page.waitForResponse((response) => response.url().endsWith('/api/processing') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Process video', exact: true }).click();
  const response = await accepted;
  expect(response.status()).toBe(202);
  const job = await response.json();
  const jobStatus = page.getByLabel('Batch processing status').locator('article').filter({ hasText: url });
  await expect(jobStatus).toContainText('PENDING');
  const failed = await runtime.runOne('pr34-fixture-worker');
  expect(failed?.id).toBe(job.id);
  expect(failed?.status).toBe('FAILED');
  await expect(jobStatus).toContainText('FAILED', { timeout: 10000 });
  await page.getByLabel('Public TikTok URL').fill(url);
  const retried = page.waitForResponse((response) => response.url().endsWith('/api/processing') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Process video', exact: true }).click();
  expect((await retried).status()).toBe(202);
  await expect(jobStatus).toContainText('PENDING');
  const completed = await runtime.runOne('pr34-fixture-worker');
  expect(completed?.status).toBe('COMPLETED');
  await expect(jobStatus).toContainText('COMPLETED', { timeout: 10000 });
  await page.getByRole('link', { name: 'Content Library', exact: true }).click();
  await expect(page.getByText('Synthetic PR34 persisted transcript')).toHaveCount(1);
  await page.locator('summary').filter({ hasText: 'Timestamped transcript' }).click();
  await expect(page.getByText('Synthetic PR34 persisted transcript')).toBeVisible();
  const readback = await request.get(`/api/workspace?batchId=${batchB}&contentId=${job.contentId}`);
  const detail = (await readback.json()).selectedContent;
  expect(detail.frames.some((frame: { available: boolean }) => frame.available)).toBe(true);
  expect(detail.extraction).toHaveLength(13);
  const frame = detail.frames[0];
  expect((await request.post(`/api/processing/${job.id}/anchors`, { data: { frameId: frame.id } })).status()).toBe(200);
  expect((await request.post(`/api/processing/${job.id}/anchors`, { data: { frameId: '34000000-0000-4000-8000-000000000099' } })).status()).toBe(404);
  const replay = await request.post('/api/processing', { data: { url, batchId: batchB } });
  expect((await replay.json()).id).toBe(job.id);
  expect((await request.post('/api/processing', { data: { url, batchId: batchA } })).status()).toBe(409);
  expect((await request.get(`/api/processing?batchId=${batchA}`)).status()).toBe(200);
  const foreign = createPostgresRuntime({ connectionString: connectionString!, workspaceId: foreignWorkspace, batchId: null, brandId: null, storageRoot: storageRoot!, acquirer: createFakeAcquirer() });
  try { expect(await foreign.get(job.id, null)).toBeNull(); await expect(foreign.enqueue(url, batchB)).rejects.toThrow('selected batch not found'); expect(await foreign.addAnchor({ contentId: job.contentId, frameId: frame.id })).toBe(false); } finally { await foreign.close(); }
  await page.reload();
  await expect(page.getByText('Fingerprint extraction', { exact: true })).toBeVisible();
  await page.screenshot({ path: '/tmp/cic-pr34-staging-library-1440.png', fullPage: true });
  const recoverUrl = `https://www.tiktok.com/@synthetic_pr34/video/${Date.now()}000002`;
  const recoveryJob = await runtime.enqueue(recoverUrl, batchB);
  const claimed = await runtime.claim('pr34-recovery-fixture', 10000);
  expect(claimed?.id).toBe(recoveryJob.id);
  expect(await runtime.recover('pr34-recovery-fixture')).toBe(0);
  await pool.query("UPDATE runtime_processing_job SET lease_until=now()-interval '1 second' WHERE workspace_id=$1 AND id=$2", [workspaceId, recoveryJob.id]);
  expect(await runtime.recover('pr34-recovery-fixture')).toBe(1);
  expect((await runtime.runOne('pr34-recovered-worker'))?.status).toBe('COMPLETED');
  const raw = Object.fromEntries(Object.entries({ views: 100, likes: 10, comments: 2, shares: 3, saves: 5, wfv_pct: 0.725 }).map(([name, value]) => [name, { value, quality: 'VALID' }]));
  await pool.query("INSERT INTO metric_snapshot(workspace_id,content_id,distribution,source,raw_metrics,derived_metrics,quality_json,captured_at) VALUES($1,$2,'ORGANIC','synthetic_pr34',$3::jsonb,$4::jsonb,'{}',now()),($1,$5,'ORGANIC','synthetic_pr34',$3::jsonb,'{}','{}',now())", [workspaceId, job.contentId, JSON.stringify(raw), JSON.stringify({ engagement_rate: { value: 0.9, formulaVersion: 'metrics-v1' } }), recoveryJob.contentId]);
  const comparisons = createComparisonRepository({ connectionString: connectionString!, workspaceId });
  const comparison = await comparisons.create({ batchId: batchB, contentIds: [job.contentId, recoveryJob.contentId], mode: 'CONTROLLED', scope: 'PAIR', distribution: 'ORGANIC' });
  expect(comparison.metricRows[0].metrics.find((metric) => metric.name === 'engagement_rate')?.value).toBe(0.2);
  const comparedReadback = await comparisons.get(comparison.id);
  expect(comparedReadback.metricRows.map((row) => row.metrics.find((metric) => metric.name === 'engagement_rate')?.value)).toEqual([0.2, 0.2]);
  const metricWorkspace = await request.get(`/api/workspace?batchId=${batchB}&contentId=${job.contentId}`);
  expect((await metricWorkspace.json()).selectedContent.snapshots[0].derivedMetrics.engagement_rate.value).toBe(0.2);
  const storedMetric = await pool.query('SELECT derived_metrics FROM metric_snapshot WHERE id=$1', [comparison.snapshotIds[0]]);
  expect(storedMetric.rows[0].derived_metrics.engagement_rate.value).toBe(0.9);
  let catalog: Array<{ layer: string; statement: string; id: string }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    const prompt = JSON.parse(String(options?.body)).messages[1].content;
    catalog = JSON.parse(prompt.split('\n').at(-1)).evidence;
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ statement: 'Synthetic PR34 working hypothesis.', supporting_evidence_ids: [catalog.find((item) => item.layer === 'DERIVED')!.id], contradicting_evidence_ids: [], contextual_evidence_ids: [], suggested_next_test: { action: 'Repeat synthetic fixture' }, confidence: 'LOW' }) } }] }));
  };
  const hypotheses = createHypothesisRepository({ connectionString: connectionString!, workspaceId, providerName: 'synthetic-pr34', providerEndpoint: 'https://synthetic.invalid', providerApiKey: 'synthetic', providerModel: 'synthetic-pr34' });
  try {
    const hypothesis = await hypotheses.create({ batchId: batchB, comparisonId: comparison.id });
    expect(catalog.filter((item) => item.layer === 'DERIVED').every((item) => item.statement.includes('"value":0.2') && item.statement.includes('metrics-v2'))).toBe(true);
    const feature = detail.extraction[0];
    const correction = await request.post(`/api/workspace/contents/${job.contentId}/review`, { data: { extractionRunId: feature.extractionRunId, decision: 'CORRECT', reviewer: 'synthetic_pr34_analyst', corrections: [{ contentFeatureId: feature.id, value: 'synthetic_pr34_corrected', reasonCode: 'WRONG_CLASSIFICATION' }] } });
    expect(correction.status()).toBe(201);
    const history = await request.get(`/api/workspace/contents/${job.contentId}/review`);
    expect((await history.json()).corrections[0].originalAiValue).toBe('synthetic-pr34');
    expect((await request.post('/api/hypotheses/review', { data: { hypothesisId: hypothesis.id, decision: 'EDIT', reviewer: 'synthetic_pr34_analyst', editedStatement: 'Synthetic PR34 reviewed statement.' } })).status()).toBe(201);
    const note = await request.post(`/api/hypotheses/${hypothesis.id}/s10`, { data: { kind: 'NOTE', body: 'Synthetic PR34 persisted analyst note', author: 'synthetic_pr34_analyst' } });
    expect(note.status()).toBe(201);
    const next = await request.post(`/api/hypotheses/${hypothesis.id}/s10`, { data: { kind: 'NEXT_TEST', variableToTest: 'synthetic opening', variantA: 'synthetic A', variantB: 'synthetic B', controls: 'same synthetic duration', expectedResult: 'synthetic directional contrast', owner: 'synthetic_pr34_analyst', successMetric: 'synthetic saves', measurementWindow: '7 days', targetBatchId: batchA } });
    expect(next.status()).toBe(201);
    const nextId = (await next.json()).id;
    expect((await request.patch(`/api/hypotheses/${hypothesis.id}/s10/next-tests/${nextId}`, { data: { status: 'COMPLETED' } })).status()).toBe(200);
    const frozen = await hypotheses.get(String(hypothesis.id));
    expect(frozen.statement).toBe('Synthetic PR34 working hypothesis.');
    expect(JSON.stringify(frozen.evidence)).toContain('metrics-v2');
    const saved = await pool.query('SELECT ai_value,reviewed_value FROM content_feature WHERE id=$1 AND workspace_id=$2', [feature.id, workspaceId]);
    expect(saved.rows[0]).toEqual({ ai_value: 'synthetic-pr34', reviewed_value: 'synthetic_pr34_corrected' });
    await page.goto(`/?batchId=${batchB}&contentId=${job.contentId}&view=review&hypothesisId=${hypothesis.id}`);
    await expect(page.getByText('Current reviewed statement: Synthetic PR34 reviewed statement.')).toBeVisible();
    await expect(page.getByText('Synthetic PR34 persisted analyst note', { exact: true })).toBeVisible();
    await expect(page.getByLabel(`Status ${nextId}`)).toHaveValue('COMPLETED');
    await expect(page.getByText('AI original: synthetic-pr34 · Reviewed: synthetic_pr34_corrected · State: CORRECTED', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText('Synthetic PR34 persisted analyst note', { exact: true })).toBeVisible();
    await expect(page.getByLabel(`Status ${nextId}`)).toHaveValue('COMPLETED');
    await expect(page.getByText('AI original: synthetic-pr34 · Reviewed: synthetic_pr34_corrected · State: CORRECTED', { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: '/tmp/cic-pr34-staging-review-1440.png', fullPage: true });
    await page.setViewportSize({ width: 375, height: 812 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: '/tmp/cic-pr34-staging-review-375.png', fullPage: true });
    console.log(JSON.stringify({ evidence: 'DB persistence + synthetic worker/provider, not actual acquisition', jobId: job.id, contentId: job.contentId, recoveryJobId: recoveryJob.id, comparisonId: comparison.id, hypothesisId: hypothesis.id }));
  } finally { globalThis.fetch = originalFetch; await hypotheses.close(); await comparisons.close(); }
});
