import { expect, test, type Page, type Route } from '@playwright/test';
import workspace from './fixtures/workspace.json';

type Body = Record<string, unknown>;
type FixtureContent = { id: string; [key: string]: unknown };
type FixtureWorkspace = { batches: Array<{ id: string; [key: string]: unknown }>; contentsByBatch: Record<string, FixtureContent[]> };
const fixture = workspace as unknown as FixtureWorkspace;
const batchId = fixture.batches[0].id;
const contents = fixture.contentsByBatch[batchId];
const hypothesisId = '90000000-0000-4000-8000-000000000001';
const extractionFields = ['topic', 'format'];

function postBody(route: Route): Body {
  const value = route.request().postDataJSON();
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('S9 fixture request body is not an object');
  return value as Body;
}

function featureState(contentId: string, reviewed: Map<string, { state: string; reviewedValue: string | null }>) {
  return extractionFields.map((fieldKey, index) => {
    const id = `s9-${contentId}-${fieldKey}`;
    const state = reviewed.get(id) ?? { state: 'UNREVIEWED', reviewedValue: null };
    return {
      id,
      extractionRunId: `s9-run-${contentId}`,
      fieldName: fieldKey,
      aiValue: `${fieldKey}-ai`,
      reviewedValue: state.reviewedValue,
      reviewState: state.state,
      provider: 'synthetic-fixture',
      model: 's9-fixture-v1',
      promptVersion: 's9-fixture-v1',
      schemaVersion: 's9-fixture-v1',
      inputHash: `sha256:${contentId}`,
    };
  });
}

function detail(content: FixtureContent, reviewed: Map<string, { state: string; reviewedValue: string | null }>) {
  return { ...content, frames: [], audio: { url: null, available: false }, transcript: [], anchors: [], extraction: featureState(content.id, reviewed) };
}

function workspaceResponse(contentId: string, reviewed: Map<string, { state: string; reviewedValue: string | null }>) {
  const selectedContent = contents.find((content) => content.id === contentId) ?? contents[0];
  return {
    batches: workspace.batches,
    selectedBatch: workspace.batches[0],
    contents,
    selectedContent: detail(selectedContent, reviewed),
    analysis: { synthetic: true, ranking: { status: 'READY', reason: null, rankedGroups: [], excluded: [] }, kpis: [], snapshots: contents.flatMap((content) => content.snapshots) },
  };
}

async function installReviewApi(page: Page) {
  const reviewed = new Map<string, { state: string; reviewedValue: string | null }>();
  const histories = new Map<string, { reviews: Body[]; corrections: Body[] }>();
  const hypothesisReviews: Body[] = [];
  let hypothesisGenerations = 0;

  await page.route('**/api/workspace**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.includes('/api/workspace/contents/')) return route.fallback();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(workspaceResponse(url.searchParams.get('contentId') ?? contents[0].id, reviewed)) });
  });
  await page.route('**/api/hypotheses/*/s10', async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ hypothesisId: new URL(route.request().url()).pathname.split('/')[3], notes: [], nextTests: [] }) });
  });

  await page.route('**/api/workspace/contents/*/review', async (route) => {
    const contentId = route.request().url().split('/contents/')[1].split('/review')[0];
    const history = histories.get(contentId) ?? { reviews: [], corrections: [] };
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ contentId, ...history }) });
      return;
    }
    const body = postBody(route);
    const features = featureState(contentId, reviewed);
    const corrections = Array.isArray(body.corrections) ? body.corrections as Body[] : [];
    for (const feature of features) {
      const correction = corrections.find((entry) => entry.contentFeatureId === feature.id);
      const shouldConfirm = body.decision === 'CONFIRM' && feature.reviewState === 'UNREVIEWED';
      const shouldReject = body.decision === 'REJECT';
      const shouldCorrect = body.decision === 'CORRECT' && correction;
      if (!shouldConfirm && !shouldReject && !shouldCorrect) continue;
      const decision = shouldCorrect ? 'CORRECT' : body.decision;
      const next = { state: decision === 'CORRECT' ? 'CORRECTED' : decision === 'CONFIRM' ? 'CONFIRMED' : 'REJECTED', reviewedValue: decision === 'CORRECT' ? String(correction?.value) : decision === 'CONFIRM' ? feature.aiValue : null };
      reviewed.set(feature.id, next);
      const record = { id: `s9-review-${history.reviews.length + history.corrections.length + 1}`, contentFeatureId: feature.id, fieldName: feature.fieldName, decision, reasonCode: decision === 'REJECT' ? body.reasonCode ?? null : correction?.reasonCode ?? null, reviewedValue: next.reviewedValue, goldenLabel: Boolean(body.goldenLabel), reviewer: body.reviewer, note: body.note ?? null, createdAt: '2026-10-07T10:00:00.000Z' };
      history.reviews.push(record);
      if (decision === 'CORRECT') history.corrections.push({ id: `s9-correction-${history.corrections.length + 1}`, contentFeatureId: feature.id, fieldName: feature.fieldName, extractionRunId: feature.extractionRunId, originalAiValue: feature.aiValue, correctedValue: correction?.value, reasonCode: correction?.reasonCode ?? body.reasonCode, reviewer: body.reviewer, note: body.note ?? null, createdAt: '2026-10-07T10:00:00.000Z' });
    }
    histories.set(contentId, history);
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });

  await page.route('**/api/comparisons', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const body = postBody(route);
    const ids = Array.isArray(body.contentIds) ? body.contentIds as string[] : contents.slice(0, 2).map((content) => content.id);
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({
      id: 's9-comparison-1', ruleVersion: 'compare-v1', mode: body.mode ?? 'CONTROLLED', scope: 'PAIR', distribution: 'ORGANIC', quality: 'VALID', qualityReasons: [],
      snapshotIds: ids.map((id) => `snapshot-${id}`), controlledVariables: {}, uncontrolledVariables: {},
      items: ids.map((contentId, position) => ({ contentId, position, metricSnapshotId: `snapshot-${contentId}` })),
      metricRows: ids.map((contentId) => ({ contentId, metricSnapshotId: `snapshot-${contentId}`, metrics: [{ name: 'views', value: 1000, state: 'VALID', reason: null }] })),
    }) });
  });
  await page.route('**/api/hypotheses/review**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ hypothesisId, reviews: hypothesisReviews }) });
      return;
    }
    const body = postBody(route);
    const previous = hypothesisReviews.at(-1)?.reviewedStatement ?? 'Synthetic S9 hypothesis';
    const record = { id: `s9-hypothesis-review-${hypothesisReviews.length + 1}`, hypothesisId, decision: body.decision, reasonCode: body.reasonCode ?? null, editedStatement: body.editedStatement ?? null, reviewedStatement: body.editedStatement ?? previous, goldenLabel: false, reviewer: body.reviewer, note: body.note ?? null, createdAt: '2026-10-07T10:01:00.000Z' };
    hypothesisReviews.push(record);
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(record) });
  });
  await page.route('**/api/hypotheses**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/review')) return route.fallback();
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: hypothesisId, statement: 'Synthetic S9 hypothesis', confidence: 'LOW', confidenceCaps: [], suggestedNextTest: { action: 'Repeat synthetic test' }, evidence: [] }) });
      return;
    }
    if (route.request().method() !== 'POST') return route.continue();
    hypothesisGenerations += 1;
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: hypothesisId, statement: 'Synthetic S9 hypothesis', confidence: 'LOW', confidenceCaps: [], suggestedNextTest: { action: 'Repeat synthetic test' }, evidence: [] }) });
  });
  return { histories, hypothesisReviews, get hypothesisGenerations() { return hypothesisGenerations; } };
}

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (error) => { throw error; });
  page.on('console', (message) => { if (message.type() === 'error') throw new Error(`unexpected console error: ${message.text()}`); });
});

test('Confirm All, Correct fields twice, Reject All persist append-only review history', async ({ page }) => {
  const api = await installReviewApi(page);
  const contentId = contents[0].id;
  await page.goto(`/?batchId=${batchId}&contentId=${contentId}`);
  await page.getByLabel('Reviewer').fill('analyst_confirm');
  await page.getByRole('button', { name: 'Confirm All' }).click();
  await expect(page.getByText('Review history (append-only)')).toBeVisible();
  await expect(page.getByText('CONFIRMED').first()).toBeVisible();
  await page.reload();
  await page.getByLabel('Reviewer').fill('analyst_correct_a');
  await expect(page.getByRole('button', { name: 'Correct fields' })).toBeEnabled();
  await page.getByRole('button', { name: 'Correct fields' }).click();
  await page.locator(`#content-feature-s9-${contentId}-topic .review-correction input`).fill('topic-corrected-A');
  await page.getByLabel('Mark as golden label (analyst ground truth)').check();
  await page.getByRole('button', { name: 'Save corrections' }).click();
  await expect(page.getByText('AI original: topic-ai · Reviewed: topic-corrected-A · State: CORRECTED')).toBeVisible();
  await page.getByLabel('Reviewer').fill('analyst_correct_b');
  await page.getByRole('button', { name: 'Correct fields' }).click();
  await page.locator(`#content-feature-s9-${contentId}-topic .review-correction input`).fill('topic-corrected-B');
  await page.getByRole('button', { name: 'Save corrections' }).click();
  await expect(page.getByText('AI original: topic-ai · Reviewed: topic-corrected-B · State: CORRECTED')).toBeVisible();
  await page.reload();
  await expect(page.getByText('AI original: topic-ai · Reviewed: topic-corrected-B · State: CORRECTED')).toBeVisible();
  expect(api.histories.get(contentId)?.reviews.map((row) => row.decision)).toEqual(['CONFIRM', 'CONFIRM', 'CORRECT', 'CORRECT']);
  expect(api.histories.get(contentId)?.corrections.map((row) => row.correctedValue)).toEqual(['topic-corrected-A', 'topic-corrected-B']);
  expect(api.histories.get(contentId)?.corrections.every((row) => row.originalAiValue === 'topic-ai')).toBe(true);
  expect(api.histories.get(contentId)?.reviews.filter((row) => row.goldenLabel).map((row) => row.reviewedValue)).toEqual(['topic-corrected-A']);
});

test('Reject All keeps explicit reason on separate same-content fixture', async ({ page }) => {
  const api = await installReviewApi(page);
  const contentId = contents[2].id;
  await page.goto(`/?batchId=${batchId}&contentId=${contentId}`);
  await page.getByLabel('Reviewer').fill('analyst_reject');
  await page.getByLabel('Reject reason (required for Reject All)').selectOption('WRONG_CLASSIFICATION');
  await page.getByRole('button', { name: 'Reject All' }).click();
  await expect(page.getByText('REJECTED').first()).toBeVisible();
  expect(api.histories.get(contentId)?.reviews.every((review) => review.reasonCode === 'WRONG_CLASSIFICATION')).toBe(true);
});

test('Approve, Edit, Reject hypothesis controls persist reviewed statement after reload', async ({ page }) => {
  const api = await installReviewApi(page);
  await page.goto(`/?batchId=${batchId}&contentId=${contents[0].id}`);
  await page.getByRole('button', { name: 'Select all batch' }).click();
  await page.getByRole('button', { name: 'Generate comparison' }).click();
  await page.getByRole('button', { name: 'Generate hypothesis' }).click();
  await expect(page.getByText('Synthetic S9 hypothesis')).toBeVisible();
  const persistedUrl = `/?batchId=${batchId}&hypothesisId=${hypothesisId}`;
  const panel = page.locator('.hypothesis-panel .review-panel');
  await panel.getByLabel('Reviewer').fill('hypothesis_editor');
  await panel.getByRole('button', { name: 'Edit' }).click();
  await panel.getByLabel('Edited statement').fill('Reviewed hypothesis B');
  await panel.getByRole('button', { name: 'Save edit' }).click();
  await expect(panel.getByText('edited: Reviewed hypothesis B')).toBeVisible();
  await panel.getByRole('button', { name: 'Approve' }).click();
  await expect(panel.getByText('Current reviewed statement: Reviewed hypothesis B')).toBeVisible();
  await panel.getByLabel('Reject reason (required for Reject)').selectOption('OVERCLAIM');
  await panel.getByRole('button', { name: 'Reject' }).click();
  await expect(panel.getByText('REJECT', { exact: true })).toBeVisible();
  await page.goto(persistedUrl);
  await expect(page.getByText(`Artifact ${hypothesisId} · confidence LOW`)).toBeVisible();
  await expect(page.getByText('AI original statement: Synthetic S9 hypothesis')).toBeVisible();
  await expect(page.getByText('Current reviewed statement: Reviewed hypothesis B')).toBeVisible();
  await expect(page.locator('.hypothesis-panel .review-history li')).toHaveCount(3);
  expect(api.hypothesisGenerations).toBe(1);
  expect(api.hypothesisReviews.map((review) => review.decision)).toEqual(['EDIT', 'APPROVE', 'REJECT']);
  expect(api.hypothesisReviews[0].editedStatement).toBe('Reviewed hypothesis B');
  expect(api.hypothesisReviews[2].reasonCode).toBe('OVERCLAIM');
});
