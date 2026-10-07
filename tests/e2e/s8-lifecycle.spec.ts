import { expect, test, type Page, type Route } from '@playwright/test';
import workspace from './fixtures/workspace.json';

type Body = Record<string, unknown>;
type BatchId = '00000000-0000-4000-8000-000000000001' | '00000000-0000-4000-8000-000000000002';
type FixtureSnapshot = { id: string; distribution: string; rawMetrics: Record<string, number | null>; quality: string; qualityByMetric: Record<string, { state: string; reason: string | null }>; derivedMetrics: Record<string, { value: number | null }> };
type FixtureContent = { id: string; externalId: string; title: string; permalink: string; processingState: string; acquisitionState: string; acquisitionError: string | null; processingError: string | null; attemptCount: number; error?: string | null; durationSeconds: number | null; snapshots: FixtureSnapshot[] };
type FixtureWorkspace = { batches: Array<{ id: BatchId; name: string; brandName: string; createdAt: string; contentCount: number; contractedVideoCount: number }>; contentsByBatch: Record<BatchId, FixtureContent[]> };
const fixture = workspace as unknown as FixtureWorkspace;
function postBody(route: Route): Body {
  const value = route.request().postDataJSON();
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('fixture request body is not an object');
  return value as Body;
}
function fixtureContents(batchId: string): FixtureContent[] {
  return fixture.contentsByBatch[batchId as BatchId] ?? fixture.contentsByBatch['00000000-0000-4000-8000-000000000001'];
}
const batchA: BatchId = workspace.batches[0].id as BatchId;
const batchB: BatchId = workspace.batches[1].id as BatchId;
const contentsA = fixtureContents(batchA);
const contentsB = fixtureContents(batchB);
const comparison = (body: Body) => {
  const ids = body.contentIds;
  if (!Array.isArray(ids) || !ids.every((id): id is string => typeof id === 'string')) throw new Error('fixture comparison request has invalid contentIds');
  return { id: `comparison-${String(body.mode).toLowerCase()}-${String(body.distribution).toLowerCase()}`, ruleVersion: 'compare-v1', mode: body.mode, scope: body.scope, distribution: body.distribution, quality: 'VALID', qualityReasons: [], snapshotIds: ids.map((id) => `snapshot-${id}`), controlledVariables: { distribution: body.distribution }, uncontrolledVariables: {}, items: ids.map((contentId, position) => ({ contentId, position, metricSnapshotId: `snapshot-${contentId}` })), metricRows: ids.map((contentId, position) => ({ contentId, metricSnapshotId: `snapshot-${contentId}`, metrics: [{ name: 'views', value: 1000 - position * 100, state: 'VALID', reason: null }] })) };
};
const hypothesis = (comparisonId: string) => ({ id: `hypothesis-${comparisonId}`, batchId: batchA, statement: 'Synthetic working insight for repeatable browser test.', confidence: 'LOW', confidenceCaps: [{ rule: 'SYNTHETIC_TEST', reason: 'Fixture response' }], suggestedNextTest: { action: 'Repeat with another synthetic sample.' }, evidence: [{ id: 'evidence-1', layer: 'OBSERVED', statement: 'OBSERVED views 1000', source_type: 'METRIC_SNAPSHOT', role: 'SUPPORTING', link: `/?batchId=${batchA}&contentId=${contentsA[0].id}#metric-snapshot-${contentsA[0].snapshots[0].id}` }] });

function detail(content: typeof contentsA[number]) {
  return { ...content, frames: [], audio: { url: null, available: false }, transcript: [], anchors: [], extraction: [] };
}
function workspaceResponse(batchId: string) {
  const contents = fixtureContents(batchId);
  return { batches: workspace.batches, selectedBatch: workspace.batches.find((batch) => batch.id === batchId), contents, selectedContent: detail(contents[0]), analysis: { synthetic: true, ranking: { status: 'READY', reason: null, rankedGroups: [], excluded: [] }, kpis: [], snapshots: contents.flatMap((content) => content.snapshots) } };
}
async function installFixtureApi(page: Page, options: { hypothesisDelay?: () => Promise<void>; hypothesisFailure?: boolean } = {}) {
  const seen: Body[] = [];
  await page.route('**/api/workspace**', async (route: Route) => {
    const url = new URL(route.request().url());
    const batchId = url.searchParams.get('batchId') ?? batchA;
    const contentId = url.searchParams.get('contentId');
    const body = workspaceResponse(batchId);
    if (contentId) body.selectedContent = detail(fixtureContents(batchId).find((content) => content.id === contentId) ?? body.contents[0]);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.route('**/api/comparisons', async (route: Route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const body = postBody(route);
    seen.push(body);
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(comparison(body)) });
  });
  let hypothesisCalls = 0;
  await page.route('**/api/hypotheses', async (route: Route) => {
    if (route.request().method() !== 'POST') return route.continue();
    hypothesisCalls += 1;
    if (options.hypothesisDelay) await options.hypothesisDelay();
    if (options.hypothesisFailure && hypothesisCalls === 1) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'synthetic provider unavailable' }) });
    const body = postBody(route);
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(hypothesis(String(body.comparisonId))) });
  });
  return { seen, hypothesisCalls: () => hypothesisCalls };
}
async function selectTwo(page: Page, distribution = 'ORGANIC') {
  if (distribution !== 'ORGANIC') await page.getByRole('combobox', { name: 'Distribution', exact: true }).selectOption(distribution);
  const selection = page.getByRole('list', { name: 'Comparison content selection' });
  await selection.getByRole('button').nth(0).click();
  await selection.getByRole('button').nth(1).click();
}
async function createComparison(page: Page) {
  await page.getByRole('button', { name: 'Generate comparison' }).click();
  await expect(page.getByRole('heading', { name: /Controlled comparison|Exploratory performance contrast/ })).toBeVisible();
}
async function createHypothesis(page: Page) {
  await page.getByRole('button', { name: 'Generate hypothesis' }).click();
  await expect(page.getByText('Synthetic working insight for repeatable browser test.')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (error) => { throw error; });
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('Failed to load resource: the server responded with a status of 503 (Service Unavailable)')) throw new Error(`unexpected console error: ${message.text()}`);
  });
});

test('happy path renders artifact and exact source link', async ({ page }) => {
  await installFixtureApi(page);
  await page.goto(`/?batchId=${batchA}`);
  await selectTwo(page);
  await createComparison(page);
  await expect(page.getByRole('button', { name: 'Generate hypothesis' })).toBeEnabled();
  await createHypothesis(page);
  await expect(page.getByText('Uji berikutnya yang disarankan')).toBeVisible();
  await page.getByRole('link', { name: 'Buka sumber exact' }).click();
  await expect(page).toHaveURL(new RegExp(`batchId=${batchA}.*contentId=${contentsA[0].id}.*metric-snapshot`));
});

test('mode change while hypothesis pending clears stale response and allows new flow', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await installFixtureApi(page, { hypothesisDelay: () => gate });
  await page.goto(`/?batchId=${batchA}`); await selectTwo(page); await createComparison(page);
  await page.getByRole('button', { name: 'Generate hypothesis' }).click();
  await expect(page.getByRole('button', { name: 'Generating…' })).toBeDisabled();
  await page.getByLabel('Mode').selectOption('PERFORMANCE_CONTRAST');
  await expect(page.getByText('Generate comparison first')).toBeVisible();
  release();
  await expect(page.getByText('Synthetic working insight for repeatable browser test.')).toHaveCount(0);
  await page.getByRole('button', { name: 'Select all batch' }).click();
  await page.getByRole('list', { name: 'Comparison content selection' }).getByRole('button').nth(2).click();
  await createComparison(page); await createHypothesis(page);
  await expect(page.getByRole('heading', { name: 'Exploratory performance contrast' })).toBeVisible();
});

test('distribution change clears selection and sends paid body', async ({ page }) => {
  const { seen } = await installFixtureApi(page);
  await page.goto(`/?batchId=${batchA}`); await selectTwo(page); await createComparison(page);
  await page.getByRole('combobox', { name: 'Distribution', exact: true }).selectOption('PAID');
  await expect(page.getByText('0 selected · order preserved')).toBeVisible();
  await selectTwo(page, 'PAID'); await createComparison(page);
  expect(seen.at(-1)).toMatchObject({ distribution: 'PAID', contentIds: [contentsA[0].id, contentsA[1].id] });
  await expect(page.getByText('Synthetic working insight for repeatable browser test.')).toHaveCount(0);
});

test('selection and batch changes cannot render delayed old response', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await installFixtureApi(page, { hypothesisDelay: () => gate });
  await page.goto(`/?batchId=${batchA}`); await selectTwo(page); await createComparison(page);
  await page.getByRole('button', { name: 'Generate hypothesis' }).click();
  await page.getByRole('list', { name: 'Comparison content selection' }).getByRole('button', { name: /Gamma creative e2e-a-3$/, exact: false }).click();
  await expect(page.getByText('Generate comparison first')).toBeVisible();
  release(); await expect(page.getByText('Synthetic working insight for repeatable browser test.')).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Select batch', exact: true }).selectOption(batchB);
  await expect(page.getByRole('heading', { name: 'Synthetic E2E Batch B', exact: true })).toBeVisible();
  await expect(page.getByText('Generate comparison first')).toBeVisible();
});

test('provider failure is visible and retry succeeds', async ({ page }) => {
  await installFixtureApi(page, { hypothesisFailure: true });
  await page.goto(`/?batchId=${batchA}`); await selectTwo(page); await createComparison(page);
  await page.getByRole('button', { name: 'Generate hypothesis' }).click();
  await expect(page.getByText('synthetic provider unavailable', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Generate hypothesis' }).click();
  await expect(page.getByText('Synthetic working insight for repeatable browser test.')).toBeVisible();
});

test('pending hypothesis ignores double submit', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const api = await installFixtureApi(page, { hypothesisDelay: () => gate });
  await page.goto(`/?batchId=${batchA}`); await selectTwo(page); await createComparison(page);
  const button = page.getByRole('button', { name: 'Generate hypothesis' });
  await button.click(); await expect(page.getByRole('button', { name: 'Generating…' })).toBeDisabled();
  await page.getByRole('button', { name: 'Generating…' }).click({ force: true });
  expect(api.hypothesisCalls()).toBe(1);
  release(); await expect(page.getByText('Synthetic working insight for repeatable browser test.')).toBeVisible();
});
