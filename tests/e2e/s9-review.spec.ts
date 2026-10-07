import { expect, test, type Page, type Route } from '@playwright/test';
import workspace from './fixtures/workspace.json';

type Body = Record<string, unknown>;
type FixtureContent = { id: string; [key: string]: unknown };
type FixtureWorkspace = { batches: Array<{ id: string; [key: string]: unknown }>; contentsByBatch: Record<string, FixtureContent[]> };
const fixture = workspace as unknown as FixtureWorkspace;
const batchId = fixture.batches[0].id;
const contents = fixture.contentsByBatch[batchId];
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
  const hypothesisId = 's9-hypothesis-1';

  await page.route('**/api/workspace**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.includes('/api/workspace/contents/')) return route.fallback();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(workspaceResponse(url.searchParams.get('contentId') ?? contents[0].id, reviewed)) });
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
      if (feature.reviewState !== 'UNREVIEWED') continue;
      const correction = corrections.find((entry) => entry.contentFeatureId === feature.id);
      const decision = body.decision === 'CORRECT' && correction ? 'CORRECT' : body.decision === 'CORRECT' ? 'CONFIRM' : body.decision;
      const next = { state: decision === 'CORRECT' ? 'CORRECTED' : decision === 'CONFIRM' ? 'CONFIRMED' : 'REJECTED', reviewedValue: decision === 'CORRECT' ? String(correction?.value) : decision === 'CONFIRM' ? feature.aiValue : null };
      reviewed.set(feature.id, next);
      const record = { id: `s9-review-${history.reviews.length + history.corrections.length + 1}`, contentFeatureId: feature.id, fieldName: feature.fieldName, decision, reasonCode: decision === 'REJECT' ? body.reasonCode ?? null : correction?.reasonCode ?? null, goldenLabel: false, reviewer: body.reviewer, note: body.note ?? null, createdAt: '2026-10-07T10:00:00.000Z' };
      history.reviews.push(record);
      if (decision === 'CORRECT') history.corrections.push({ id: `s9-correction-${history.corrections.length + 1}`, contentFeatureId: feature.id, fieldName: feature.fieldName, originalAiValue: feature.aiValue, correctedValue: correction?.value, reasonCode: correction?.reasonCode ?? body.reasonCode, reviewer: body.reviewer, note: body.note ?? null, createdAt: '2026-10-07T10:00:00.000Z' });
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
    const record = { id: `s9-hypothesis-review-${hypothesisReviews.length + 1}`, hypothesisId, decision: body.decision, reasonCode: body.reasonCode ?? null, editedStatement: body.editedStatement ?? null, goldenLabel: false, reviewer: body.reviewer, note: body.note ?? null, createdAt: '2026-10-07T10:01:00.000Z' };
    hypothesisReviews.push(record);
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(record) });
  });
  await page.route('**/api/hypotheses', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: hypothesisId, statement: 'Synthetic S9 hypothesis', confidence: 'LOW', confidenceCaps: [], suggestedNextTest: { action: 'Repeat synthetic test' }, evidence: [] }) });
  });
  return { histories, hypothesisReviews };
}

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (error) => { throw error; });
  page.on('console', (message) => { if (message.type() === 'error') throw new Error(`unexpected console error: ${message.text()}`); });
});

test('Confirm All, Correct fields, Reject All persist append-only review history', async ({ page }) => {
  const api = await installReviewApi(page);
  await page.goto(`/?batchId=${batchId}&contentId=${contents[0].id}`);
  await page.getByLabel('Reviewer').fill('analyst_confirm');
  await page.getByRole('button', { name: 'Confirm All' }).click();
  await expect(page.getByText('Review history (append-only)')).toBeVisible();
  await expect(page.getByText('CONFIRMED').first()).toBeVisible();
  await page.reload();
  await expect(page.getByText('State: CONFIRMED').first()).toBeVisible();
  expect(api.histories.get(contents[0].id)?.reviews).toHaveLength(2);

  await page.goto(`/?batchId=${batchId}&contentId=${contents[1].id}`);
  await page.getByLabel('Reviewer').fill('analyst_correct');
  await page.getByRole('button', { name: 'Correct fields' }).click();
  await page.locator('.review-correction input').first().fill('topic-corrected');
  await page.getByRole('button', { name: 'Save corrections' }).click();
  await expect(page.getByText('CORRECTED').first()).toBeVisible();
  await page.reload();
  await expect(page.getByText('AI original: topic-ai · Reviewed: topic-corrected · State: CORRECTED')).toBeVisible();

  await page.goto(`/?batchId=${batchId}&contentId=${contents[2].id}`);
  await page.getByLabel('Reviewer').fill('analyst_reject');
  await page.getByLabel('Reject reason (required for Reject All)').selectOption('WRONG_CLASSIFICATION');
  await page.getByRole('button', { name: 'Reject All' }).click();
  await expect(page.getByText('REJECTED').first()).toBeVisible();
  expect(api.histories.get(contents[2].id)?.reviews.every((review) => review.reasonCode === 'WRONG_CLASSIFICATION')).toBe(true);
});

test('Approve, Edit, Reject hypothesis controls keep append-only reasons', async ({ page }) => {
  await installReviewApi(page);
  await page.goto(`/?batchId=${batchId}&contentId=${contents[0].id}`);
  await page.getByRole('button', { name: 'Select all batch' }).click();
  await page.getByRole('button', { name: 'Generate comparison' }).click();
  await page.getByRole('button', { name: 'Generate hypothesis' }).click();
  await expect(page.getByText('Synthetic S9 hypothesis')).toBeVisible();
  await page.locator('.hypothesis-panel .review-panel').getByLabel('Reviewer').fill('hypothesis_analyst');
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.locator('.hypothesis-panel .review-history').getByText('APPROVE', { exact: true })).toBeVisible();
});
