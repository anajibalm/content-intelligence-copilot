import { expect, test, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

type FeatureReviewRow = { id: string; contentFeatureId: string; extractionRunId: string; decision: string; reasonCode: string | null; reviewedValue: string | null; goldenLabel: boolean; reviewer: string };
type FeatureCorrectionRow = { id: string; contentFeatureId: string; extractionRunId: string; originalAiValue: string; correctedValue: string; reviewer: string };
type ContentHistory = { reviews: FeatureReviewRow[]; corrections: FeatureCorrectionRow[] };
type FeatureProjection = { id: string; aiValue: string; reviewedValue: string | null; reviewState: string; extractionRunId: string };

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('integrated S9 response must be an object');
  return value as Record<string, unknown>;
}

function text(value: unknown, name: string): string {
  if (typeof value !== 'string') throw new Error(`integrated S9 response ${name} must be string`);
  return value;
}

function contentHistoryBody(value: unknown): ContentHistory {
  const body = record(value);
  const reviews = body.reviews;
  const corrections = body.corrections;
  if (!Array.isArray(reviews) || !Array.isArray(corrections)) throw new Error('integrated S9 history arrays missing');
  return {
    reviews: reviews.map((entry) => { const row = record(entry); return { id: text(row.id, 'review.id'), contentFeatureId: text(row.contentFeatureId, 'review.contentFeatureId'), extractionRunId: text(row.extractionRunId, 'review.extractionRunId'), decision: text(row.decision, 'review.decision'), reasonCode: row.reasonCode === null ? null : text(row.reasonCode, 'review.reasonCode'), reviewedValue: row.reviewedValue === null ? null : text(row.reviewedValue, 'review.reviewedValue'), goldenLabel: row.goldenLabel === true, reviewer: text(row.reviewer, 'review.reviewer') }; }),
    corrections: corrections.map((entry) => { const row = record(entry); return { id: text(row.id, 'correction.id'), contentFeatureId: text(row.contentFeatureId, 'correction.contentFeatureId'), extractionRunId: text(row.extractionRunId, 'correction.extractionRunId'), originalAiValue: text(row.originalAiValue, 'correction.originalAiValue'), correctedValue: text(row.correctedValue, 'correction.correctedValue'), reviewer: text(row.reviewer, 'correction.reviewer') }; }),
  };
}

function featureProjection(value: unknown): FeatureProjection {
  const row = record(value);
  return { id: text(row.id, 'feature.id'), aiValue: text(row.aiValue, 'feature.aiValue'), reviewedValue: row.reviewedValue === null ? null : text(row.reviewedValue, 'feature.reviewedValue'), reviewState: text(row.reviewState, 'feature.reviewState'), extractionRunId: text(row.extractionRunId, 'feature.extractionRunId') };
}
const connectionString = process.env.CIC_DATABASE_URL;
const workspaceId = process.env.CIC_WORKSPACE_ID;
const brandId = process.env.CIC_BRAND_ID;
const batchId = process.env.CIC_BATCH_ID;
const baseURL = process.env.CIC_E2E_STAGING_URL ?? 'http://127.0.0.1:3121';
if (!connectionString || !workspaceId || !brandId || !batchId) throw new Error('CIC_DATABASE_URL, CIC_WORKSPACE_ID, CIC_BRAND_ID, and CIC_BATCH_ID are required for integrated S9');

const pool = new Pool({ connectionString, max: 2 });
const contentId = randomUUID();
const extractionRunId = randomUUID();
const topicId = randomUUID();
const formatId = randomUUID();
const unreviewedId = randomUUID();
const hypothesisId = 'eb1f97ea-5d83-483a-bd37-d8f4170048c7';

async function seedContent() {
  await pool.query(
    `INSERT INTO content (id, workspace_id, brand_id, batch_id, platform, external_id, permalink, title, processing_state)
     VALUES ($1, $2, $3, $4, 'TIKTOK', $5, $6, $7, 'COMPLETED')`,
    [contentId, workspaceId, brandId, batchId, `s9-integrated-${contentId}`, `https://www.tiktok.com/@synthetic/s9-integrated-${contentId}`, `Synthetic S9 integrated review fixture ${contentId}`],
  );
  await pool.query(
    `INSERT INTO extraction_run (id, workspace_id, content_id, provider, model, prompt_version, schema_version, input_hash, status)
     VALUES ($1, $2, $3, 'synthetic-s9-integrated', 'synthetic-s9-v1', 'synthetic-s9-v1', 'synthetic-s9-v1', $4, 'SUCCEEDED')`,
    [extractionRunId, workspaceId, contentId, `sha256:s9-integrated-${contentId}`],
  );
  await pool.query(
    `INSERT INTO content_feature (id, workspace_id, content_id, extraction_run_id, field_name, ai_value)
     VALUES ($1, $2, $3, $4, 'topic', 'topic-ai')`,
    [topicId, workspaceId, contentId, extractionRunId],
  );
}

async function insertLaterFeature() {
  await pool.query(
    `INSERT INTO content_feature (id, workspace_id, content_id, extraction_run_id, field_name, ai_value)
     VALUES ($1, $2, $3, $4, 'format', 'format-ai')`,
    [formatId, workspaceId, contentId, extractionRunId],
  );
}

async function insertUnreviewedFeature() {
  await pool.query(
    `INSERT INTO content_feature (id, workspace_id, content_id, extraction_run_id, field_name, ai_value)
     VALUES ($1, $2, $3, $4, 'hook_type', 'hook-ai')`,
    [unreviewedId, workspaceId, contentId, extractionRunId],
  );
}

async function contentHistory(request: APIRequestContext): Promise<ContentHistory> {
  const response = await request.get(`${baseURL}/api/workspace/contents/${contentId}/review`);
  expect(response.status()).toBe(200);
  return contentHistoryBody(await response.json());
}

test.beforeAll(seedContent);
test.afterAll(async () => { await pool.end(); });

test('integrated S9 feature re-review, golden provenance, and append-only guards', async ({ page, request }) => {
  test.setTimeout(60_000);
  await page.goto(`${baseURL}/?batchId=${batchId}&contentId=${contentId}`);
  await expect(page.getByRole('heading', { name: `Synthetic S9 integrated review fixture ${contentId}`, exact: true })).toBeVisible();
  await expect(page.getByText('1 unreviewed · 1 extracted')).toBeVisible();

  await page.getByLabel('Reviewer').fill('integrated_s9_confirm');
  await page.getByRole('button', { name: 'Confirm All' }).click();
  await expect(page.getByText('0 unreviewed · 1 extracted')).toBeVisible();
  await insertLaterFeature();
  await page.reload();
  await expect(page.getByText('1 unreviewed · 2 extracted')).toBeVisible();

  await page.getByLabel('Reviewer').fill('integrated_s9_a');
  await page.getByRole('button', { name: 'Correct fields' }).click();
  await page.locator(`#content-feature-${topicId} .review-correction input`).fill('topic-corrected-A');
  await page.getByLabel('Mark as golden label (analyst ground truth)').check();
  await page.getByRole('button', { name: 'Save corrections' }).click();
  await expect(page.getByText('AI original: topic-ai · Reviewed: topic-corrected-A · State: CORRECTED')).toBeVisible();

  await page.getByLabel('Reviewer').fill('integrated_s9_b');
  await page.getByRole('button', { name: 'Correct fields' }).click();
  await page.locator(`#content-feature-${topicId} .review-correction input`).fill('topic-corrected-B');
  await page.getByRole('button', { name: 'Save corrections' }).click();
  await expect(page.getByText('AI original: topic-ai · Reviewed: topic-corrected-B · State: CORRECTED')).toBeVisible();
  await page.reload();
  await expect(page.getByText('AI original: topic-ai · Reviewed: topic-corrected-B · State: CORRECTED')).toBeVisible();

  await insertUnreviewedFeature();
  const wrongRun = await request.post(`${baseURL}/api/workspace/contents/${contentId}/review`, { data: {
    extractionRunId: randomUUID(), decision: 'CORRECT', reviewer: 'integrated_s9_wrong_run', corrections: [{ contentFeatureId: topicId, value: 'must-not-write', reasonCode: 'OTHER' }],
  } });
  expect(wrongRun.status()).toBe(404);
  const wrongWorkspace = await request.post(`${baseURL}/api/workspace/contents/${randomUUID()}/review`, { data: {
    extractionRunId, decision: 'CORRECT', reviewer: 'integrated_s9_wrong_workspace', corrections: [{ contentFeatureId: topicId, value: 'must-not-write', reasonCode: 'OTHER' }],
  } });
  expect(wrongWorkspace.status()).toBe(404);

  const invalidGoldenReject = await request.post(`${baseURL}/api/workspace/features/${formatId}/review`, { data: { decision: 'REJECT', reviewer: 'integrated_s9_reject', reasonCode: 'WRONG_CLASSIFICATION', goldenLabel: true } });
  expect(invalidGoldenReject.status()).toBe(400);
  const reject = await request.post(`${baseURL}/api/workspace/features/${formatId}/review`, { data: { decision: 'REJECT', reviewer: 'integrated_s9_reject', reasonCode: 'WRONG_CLASSIFICATION', goldenLabel: false } });
  expect(reject.status()).toBe(200);

  const history = await contentHistory(request);
  expect(history.reviews.filter((row) => row.contentFeatureId === topicId).map((row) => row.decision)).toEqual(['CONFIRM', 'CORRECT', 'CORRECT']);
  expect(history.reviews.filter((row) => row.contentFeatureId === formatId).map((row) => row.decision)).toEqual(['CONFIRM', 'REJECT']);
  expect(history.corrections.map((row) => row.correctedValue)).toEqual(['topic-corrected-A', 'topic-corrected-B']);
  const golden = history.reviews.find((row) => row.goldenLabel);
  if (!golden) throw new Error('integrated S9 golden review missing');
  expect(golden).toMatchObject({ contentFeatureId: topicId, extractionRunId, reviewedValue: 'topic-corrected-A', reviewer: 'integrated_s9_a' });
  expect(history.reviews.filter((row) => row.contentFeatureId === topicId).map((row) => row.id)).toHaveLength(3);
  expect(history.reviews.some((row) => row.contentFeatureId === formatId && row.goldenLabel)).toBe(false);

  const workspaceResponse = await request.get(`${baseURL}/api/workspace?batchId=${batchId}&contentId=${contentId}`);
  expect(workspaceResponse.status()).toBe(200);
  const workspaceBody = record(await workspaceResponse.json());
  const selected = record(workspaceBody.selectedContent);
  const extraction = selected.extraction;
  if (!Array.isArray(extraction)) throw new Error('integrated S9 selected extraction missing');
  const topic = featureProjection(extraction.find((feature) => record(feature).id === topicId));
  const unreviewed = featureProjection(extraction.find((feature) => record(feature).id === unreviewedId));
  expect(topic).toMatchObject({ aiValue: 'topic-ai', reviewedValue: 'topic-corrected-B', reviewState: 'CORRECTED', extractionRunId });
  expect(unreviewed).toMatchObject({ aiValue: 'hook-ai', reviewedValue: null, reviewState: 'UNREVIEWED', extractionRunId });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await expect(client.query('UPDATE feature_review SET note = $1 WHERE id = $2', ['must-rollback', golden.id])).rejects.toThrow(/append-only/);
    await client.query('ROLLBACK');
    await client.query('BEGIN');
    await expect(client.query('DELETE FROM feature_review WHERE id = $1', [golden.id])).rejects.toThrow(/append-only/);
    await client.query('ROLLBACK');
  } finally {
    client.release();
  }
});

test('integrated S9 hypothesis readback keeps existing evidence and review history', async ({ request }) => {
  const hypothesisResponse = await request.get(`${baseURL}/api/hypotheses?hypothesisId=${hypothesisId}`);
  expect(hypothesisResponse.status()).toBe(200);
  const hypothesisBody = record(await hypothesisResponse.json());
  expect(hypothesisBody.id).toBe(hypothesisId);
  if (!Array.isArray(hypothesisBody.evidence)) throw new Error('integrated S9 hypothesis evidence missing');
  expect(hypothesisBody.evidence).toHaveLength(2);
  const reviewsResponse = await request.get(`${baseURL}/api/hypotheses/review?hypothesisId=${hypothesisId}`);
  expect(reviewsResponse.status()).toBe(200);
  const reviewsBody = record(await reviewsResponse.json());
  if (!Array.isArray(reviewsBody.reviews)) throw new Error('integrated S9 hypothesis reviews missing');
  const reviews = reviewsBody.reviews.map((entry) => { const row = record(entry); return { decision: text(row.decision, 'hypothesis.review.decision'), reasonCode: row.reasonCode === null ? null : text(row.reasonCode, 'hypothesis.review.reasonCode'), reviewedStatement: text(row.reviewedStatement, 'hypothesis.review.reviewedStatement') }; });
  expect(reviews.map((row) => row.decision).slice(-3)).toEqual(['EDIT', 'APPROVE', 'REJECT']);
  expect(reviews.at(-1)).toMatchObject({ reasonCode: 'OVERCLAIM', reviewedStatement: 'Reviewed hypothesis S9 delivery' });
});
