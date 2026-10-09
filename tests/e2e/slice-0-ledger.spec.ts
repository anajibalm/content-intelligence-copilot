import { expect, test, type Page, type Route } from '@playwright/test';
import workspace from './fixtures/workspace.json';

type Body = Record<string, unknown>;
const batchId = workspace.batches[0].id;
const contentId = workspace.contentsByBatch[batchId as keyof typeof workspace.contentsByBatch][0].id;
const hypothesisId = '35000000-0000-4000-8000-000000000001';

function body(route: Route): Body {
  const value = route.request().postDataJSON();
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected JSON object');
  return value as Body;
}

function features() {
  return Array.from({ length: 13 }, (_, index) => ({
    id: `active-${index}`,
    extractionRunId: 'active-run',
    fieldName: `field_${index}`,
    aiValue: `ai ${index}`,
    reviewedValue: index === 11 ? 'human correction' : index === 12 ? 'ai 12' : null,
    reviewState: index === 11 ? 'CORRECTED' : index === 12 ? 'CONFIRMED' : 'UNREVIEWED',
    provider: 'synthetic-pr34', model: 'fixture', promptVersion: 'fixture', schemaVersion: 'fixture', inputHash: 'fixture',
  })).concat(Array.from({ length: 13 }, (_, index) => ({
    id: `historic-${index}`,
    extractionRunId: 'historic-run',
    fieldName: `historic_${index}`,
    aiValue: `historic ${index}`,
    reviewedValue: null,
    reviewState: 'UNREVIEWED',
    provider: 'synthetic-pr34', model: 'fixture', promptVersion: 'fixture', schemaVersion: 'fixture', inputHash: 'fixture',
  })));
}

async function installApi(page: Page, options: { holdReviewPost?: Promise<void>; onReviewPost?: () => void } = {}) {
  const reviewPosts: Body[] = [];
  const hypothesisPosts: Body[] = [];
  const leaked: string[] = [];
  let activeConfirmed = false;
  const contents = workspace.contentsByBatch[batchId as keyof typeof workspace.contentsByBatch].map((content, index) => index === 0 ? { ...content, title: null, externalId: 'copy-full-external-id', snapshots: content.snapshots.map((snapshot, snapshotIndex) => snapshotIndex === 0 ? { ...snapshot, quality: 'SUSPECT', qualityByMetric: { views: { state: 'SUSPECT', reason: 'UNEXPLAINED_ZERO' } } } : snapshot) } : content);
  const selected = contents[0];
  const history = {
    contentId,
    reviews: [
      { id: 'confirm', contentFeatureId: 'active-0', extractionRunId: 'active-run', fieldName: 'field_0', decision: 'CONFIRM', reasonCode: null, reviewedValue: 'ai 0', goldenLabel: true, reviewer: 'historical analyst', note: 'confirmed with context', createdAt: '2026-10-09T01:02:03.000Z' },
      { id: 'reject', contentFeatureId: 'historic-0', extractionRunId: 'historic-run', fieldName: 'historic_0', decision: 'REJECT', reasonCode: 'HALLUCINATION', reviewedValue: null, goldenLabel: false, reviewer: 'historical analyst', note: 'historical rejection note', createdAt: '2026-10-09T01:03:04.000Z' },
    ],
    corrections: [{ id: 'correction', contentFeatureId: 'active-11', extractionRunId: 'active-run', fieldName: 'field_11', originalAiValue: 'ai 11', correctedValue: 'human correction', reasonCode: 'WRONG_CLASSIFICATION', reviewer: 'historical analyst', note: 'historical correction note', createdAt: '2026-10-09T01:04:05.000Z' }],
  };
  const hypothesisHistory = [{ id: 'hypothesis-history', hypothesisId, decision: 'REJECT', reasonCode: 'INSUFFICIENT_EVIDENCE', editedStatement: null, reviewedStatement: 'Synthetic hypothesis', goldenLabel: false, reviewer: 'historical analyst', note: 'hypothesis history note', createdAt: '2026-10-09T01:05:06.000Z' }];
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/workspace') return route.fulfill({ json: {
      batches: workspace.batches,
      selectedBatch: workspace.batches[0],
      contents,
      synthetic: true,
      analysis: { synthetic: true, ranking: { status: 'READY', reason: null, rankedGroups: [], excluded: [] }, kpis: [], snapshots: [] },
      selectedContent: { ...selected, frames: [], audio: { available: false, url: null }, transcript: [], anchors: [], extraction: features().map((feature) => activeConfirmed && feature.extractionRunId === 'active-run' && feature.reviewState === 'UNREVIEWED' ? { ...feature, reviewState: 'CONFIRMED', reviewedValue: feature.aiValue } : feature) },
    } });
    if (url.pathname === '/api/processing') return route.fulfill({ json: { items: [] } });
    if (url.pathname.endsWith(`/contents/${contentId}/review`)) {
      if (route.request().method() === 'GET') return route.fulfill({ json: history });
      reviewPosts.push(body(route));
      if (body(route).decision === 'CONFIRM') activeConfirmed = true;
      options.onReviewPost?.();
      await options.holdReviewPost;
      return route.fulfill({ status: 201, json: { ok: true } });
    }
    if (url.pathname === '/api/hypotheses/review') {
      if (route.request().method() === 'GET') return route.fulfill({ json: { reviews: hypothesisHistory } });
      hypothesisPosts.push(body(route));
      return route.fulfill({ status: 201, json: { id: 'review', hypothesisId, decision: body(route).decision, reasonCode: null, editedStatement: null, reviewedStatement: 'Synthetic hypothesis', goldenLabel: false, reviewer: 'reviewer', note: null, createdAt: '2026-10-09T00:00:00Z' } });
    }
    if (url.pathname === '/api/hypotheses') {
      if (route.request().method() === 'GET') {
        if (url.searchParams.has('hypothesisId')) return route.fulfill({ json: { id: hypothesisId, batchId, statement: 'Synthetic hypothesis', confidence: 'LOW', confidenceCaps: [], suggestedNextTest: null, evidence: [] } });
        return route.fulfill({ json: { items: [{ id: hypothesisId, batchId, statement: 'Synthetic hypothesis', confidence: 'LOW', confidenceCaps: [], suggestedNextTest: null, evidence: [], reviewDecision: null }] } });
      }
      return route.fulfill({ status: 201, json: { id: hypothesisId, batchId, statement: 'Synthetic hypothesis', confidence: 'LOW', confidenceCaps: [], suggestedNextTest: null, evidence: [] } });
    }
    if (url.pathname.endsWith('/s10')) return route.fulfill({ json: { batches: workspace.batches, notes: [], nextTests: [] } });
    if (url.pathname === '/api/comparisons') return route.fulfill({ status: 201, json: { id: 'comparison', ruleVersion: 'compare-v2', mode: 'CONTROLLED', scope: 'PAIR', distribution: 'ORGANIC', quality: 'LOW', qualityReasons: [], snapshotIds: [], controlledVariables: {}, uncontrolledVariables: {}, items: [], metricRows: contents.slice(0, 2).map((content, index) => ({ contentId: content.id, metricSnapshotId: content.snapshots[0].id, metrics: [{ name: 'views', value: index + 1, state: 'VALID', reason: null }] })) } });
    leaked.push(url.pathname);
    return route.fulfill({ status: 500, json: { error: 'Unmapped fixture API' } });
  });
  return { reviewPosts, hypothesisPosts, leaked };
}

test('review validates inline before POST and confirms only active eligible fields', async ({ page }) => {
  const api = await installApi(page);
  await page.goto(`/?batchId=${batchId}&contentId=${contentId}&view=library`);
  const panel = page.locator('.content-detail .review-panel');
  const confirm = panel.getByRole('button', { name: 'Konfirmasi 11 field yang belum direview' });
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(panel.getByText('Isi nama reviewer untuk menyimpan keputusan', { exact: true })).toBeVisible();
  await expect(panel.getByLabel('Reviewer')).toBeFocused();
  expect(api.reviewPosts).toEqual([]);
  await panel.getByLabel('Reviewer').fill('   ');
  await confirm.click();
  await expect(panel.getByLabel('Reviewer')).toBeFocused();
  expect(api.reviewPosts).toEqual([]);
  await panel.getByLabel('Reviewer').fill('  analyst  ');
  await confirm.click();
  await expect.poll(() => api.reviewPosts.length).toBe(1);
  expect(api.reviewPosts[0].extractionRunId).toBe('active-run');
  expect(api.reviewPosts[0].reviewer).toBe('analyst');
  await expect(panel.getByRole('button', { name: 'Konfirmasi 0 field yang belum direview' })).toBeDisabled();
  await expect(page.locator('#content-feature-historic-0')).toContainText('historic 0');
  await page.reload();
  await panel.getByLabel('Reviewer').fill('analyst');
  await panel.getByRole('button', { name: 'Tolak semua' }).click();
  await expect(panel.getByText('Pilih alasan penolakan untuk menyimpan keputusan', { exact: true })).toBeVisible();
  await expect(panel.getByLabel('Alasan penolakan (wajib untuk Tolak semua)')).toBeFocused();
  expect(api.reviewPosts).toHaveLength(1);
  expect(api.leaked).toEqual([]);
});

test('historical fingerprint anchors and append-only audit details survive reload', async ({ page }) => {
  const api = await installApi(page);
  const url = `/?batchId=${batchId}&contentId=${contentId}&view=library#content-feature-historic-0`;
  await page.goto(url);
  await expect(page.locator('#content-feature-historic-0')).toContainText('historic 0');
  await expect(page.locator('.review-history')).toContainText('historical correction note');
  await expect(page.locator('.review-history')).toContainText('Klasifikasi salah');
  await page.getByText('Metadata koreksi', { exact: true }).click();
  await expect(page.getByText('Metadata koreksi', { exact: true }).locator('..').locator('pre')).toContainText('"originalAiValue": "ai 11"');
  await page.reload();
  await expect(page.locator('#content-feature-historic-0')).toContainText('historic 0');
  await page.goBack();
  await page.goForward();
  await expect(page.locator('#content-feature-historic-0')).toContainText('historic 0');
  expect(api.leaked).toEqual([]);
});

test('reject validation prioritizes reviewer then requires reason without POST', async ({ page }) => {
  const api = await installApi(page);
  await page.goto(`/?batchId=${batchId}&contentId=${contentId}&view=library`);
  const panel = page.locator('.content-detail .review-panel');
  await panel.getByRole('button', { name: 'Tolak semua' }).click();
  await expect(panel.getByText('Isi nama reviewer untuk menyimpan keputusan', { exact: true })).toBeVisible();
  await expect(panel.getByText('Pilih alasan penolakan untuk menyimpan keputusan', { exact: true })).toBeVisible();
  await expect(panel.getByLabel('Reviewer')).toBeFocused();
  await panel.getByLabel('Reviewer').fill('analyst');
  await panel.getByRole('button', { name: 'Tolak semua' }).click();
  await expect(panel.getByLabel('Alasan penolakan (wajib untuk Tolak semua)')).toBeFocused();
  expect(api.reviewPosts).toEqual([]);
});

test('hypothesis validation, compare adjacency, synthetic disclosure, and copy preserve selection', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const api = await installApi(page);
  await page.goto(`/?batchId=${batchId}&contentId=${contentId}&view=review&hypothesisId=${hypothesisId}`);
  const hypothesisPanel = page.locator('.hypothesis-detail .review-panel');
  const approve = hypothesisPanel.getByRole('button', { name: 'Setujui', exact: true });
  await expect(approve).toBeEnabled();
  await approve.click();
  await expect(hypothesisPanel.getByText('Isi nama reviewer untuk menyimpan keputusan', { exact: true })).toBeVisible();
  await expect(hypothesisPanel.getByLabel('Reviewer')).toBeFocused();
  expect(api.hypothesisPosts).toEqual([]);
  await page.getByRole('navigation', { name: 'Workspace analyst' }).getByRole('link', { name: 'Compare', exact: true }).click();
  await expect(page.getByText('0 dari minimal 2 dipilih', { exact: true })).toBeVisible();
  const actions = page.locator('.compare-actions');
  await expect(actions.getByText('Pilih minimal dua konten', { exact: true })).toBeVisible();
  await page.locator('.compare-choice').nth(0).click();
  await expect(page.getByText('1 dari minimal 2 dipilih', { exact: true })).toBeVisible();
  await page.locator('.compare-choice').nth(1).click();
  await expect(page.getByText('2 dari minimal 2 dipilih', { exact: true })).toBeVisible();
  await expect(actions.getByText('Pilih minimal dua konten', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Buat perbandingan' }).click();
  await expect(page.locator('.compare-metrics dt')).toHaveText(['Tayangan', 'Tayangan']);
  const decisionSizes = await page.locator('.compare-metrics dt, .compare-metrics dd').evaluateAll((nodes) => nodes.filter((node) => node.checkVisibility()).map((node) => Number.parseFloat(getComputedStyle(node).fontSize)));
  expect(decisionSizes.every((size) => size >= 13), `decision sizes: ${decisionSizes.join(', ')}`).toBe(true);
  const metadataSizes = await page.locator('.compare-choice span, .compare-metrics small').evaluateAll((nodes) => nodes.filter((node) => node.checkVisibility()).map((node) => Number.parseFloat(getComputedStyle(node).fontSize)));
  expect(metadataSizes.every((size) => size >= 12), `metadata sizes: ${metadataSizes.join(', ')}`).toBe(true);
  await page.getByRole('navigation', { name: 'Workspace analyst' }).getByRole('link', { name: 'Library', exact: true }).click();
  const chip = page.getByRole('button', { name: 'Data uji synthetic' });
  await chip.click();
  await expect(page.getByRole('dialog')).toContainText('Persetujuan di sini bukan persetujuan brand nyata.');
  await page.getByRole('dialog').getByRole('button', { name: 'Tutup' }).click();
  await expect(chip).toBeFocused();
  await expect(page.getByText('Penyimpanan Postgres')).toHaveCount(0);
  const selectedRow = page.locator('.content-row').first();
  await expect(selectedRow).toContainText('Organik · Tayangan: Perlu diperiksa · Nilai nol belum memiliki penjelasan atau provenance yang memadai.');
  await selectedRow.getByRole('button', { name: 'Salin ID copy-full-external-id' }).click();
  await expect(selectedRow).toContainText('ID disalin');
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('copy-full-external-id');
  await expect(page).toHaveURL(new RegExp(`contentId=${contentId}`));
  const sizes = await page.locator('.content-row small, .review-panel label, .compare-panel .muted').evaluateAll((nodes) => nodes.filter((node) => node.checkVisibility()).map((node) => `${node.closest('.content-row')?.className ?? node.className}: ${getComputedStyle(node).fontSize}`));
  expect(sizes.every((size) => Number.parseFloat(size.split(': ')[1]) >= 12), `visible font sizes: ${sizes.join(', ')}`).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(api.leaked).toEqual([]);
});

async function expectTextFloor(page: Page, selector: string, minimum: number) {
  const sizes = await page.locator(selector).evaluateAll((nodes) => nodes.filter((node) => node.checkVisibility()).map((node) => Number.parseFloat(getComputedStyle(node).fontSize)));
  expect(sizes.length, `visible ${selector}`).toBeGreaterThan(0);
  expect(sizes.every((size) => size >= minimum), `${selector}: ${sizes.join(', ')}`).toBe(true);
}

test('review prevents double confirmation while request is pending', async ({ page }) => {
  let release!: () => void;
  let started!: () => void;
  const holdReviewPost = new Promise<void>((resolve) => { release = resolve; });
  const reviewStarted = new Promise<void>((resolve) => { started = resolve; });
  const api = await installApi(page, { holdReviewPost, onReviewPost: started });
  await page.goto(`/?batchId=${batchId}&contentId=${contentId}&view=library`);
  const panel = page.locator('.content-detail .review-panel');
  const confirm = panel.getByRole('button', { name: 'Konfirmasi 11 field yang belum direview' });
  await panel.getByLabel('Reviewer').fill('analyst');
  await confirm.click();
  await reviewStarted;
  expect(await panel.locator('.review-actions button').evaluateAll((buttons) => buttons.length === 3 && buttons.every((button) => (button as HTMLButtonElement).disabled))).toBe(true);
  await panel.locator('.review-actions button').first().click({ force: true });
  expect(api.reviewPosts).toHaveLength(1);
  release();
  await expect(panel.getByRole('button', { name: 'Konfirmasi 0 field yang belum direview' })).toBeDisabled();
  expect(api.leaked).toEqual([]);
});

test('copy failure reports feedback without changing selection', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('clipboard unavailable')) } }));
  const api = await installApi(page);
  await page.goto(`/?batchId=${batchId}&contentId=${contentId}&view=library`);
  const selectedRow = page.locator('.content-row').first();
  await selectedRow.getByRole('button', { name: 'Salin ID copy-full-external-id' }).click();
  await expect(selectedRow.getByText('ID gagal disalin', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`contentId=${contentId}`));
  expect(api.leaked).toEqual([]);
});

for (const width of [1440, 375]) test(`decision controls and Compare hint meet floors at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
  const api = await installApi(page);
  await page.goto(`/?batchId=${batchId}&contentId=${contentId}&view=library`);
  const library = page.locator('.content-detail');
  await library.getByRole('button', { name: 'Koreksi field' }).click();
  await expectTextFloor(page, '.review-correction label, .review-correction input', 13);
  await page.getByRole('navigation', { name: 'Workspace analyst' }).getByRole('link', { name: 'Compare', exact: true }).click();
  await expectTextFloor(page, '.compare-controls label, .compare-controls select', 13);
  const actions = page.locator('.compare-actions');
  const actionBox = await actions.boundingBox();
  const buttonBox = await actions.getByRole('button', { name: 'Buat perbandingan' }).boundingBox();
  const hintBox = await actions.getByText('Pilih minimal dua konten', { exact: true }).boundingBox();
  expect(actionBox).not.toBeNull();
  expect(buttonBox).not.toBeNull();
  expect(hintBox).not.toBeNull();
  expect(buttonBox!.x).toBeGreaterThanOrEqual(actionBox!.x);
  expect(hintBox!.x).toBeGreaterThanOrEqual(actionBox!.x);
  expect(buttonBox!.x + buttonBox!.width).toBeLessThanOrEqual(actionBox!.x + actionBox!.width + 1);
  expect(hintBox!.x + hintBox!.width).toBeLessThanOrEqual(actionBox!.x + actionBox!.width + 1);
  expect(hintBox!.y).toBeLessThan(buttonBox!.y + buttonBox!.height);
  expect(buttonBox!.y).toBeLessThan(hintBox!.y + hintBox!.height);
  await page.locator('.compare-choice').first().focus();
  await expect(page.locator('.compare-choice').first()).toBeFocused();
  await page.locator('.compare-choice').nth(0).click();
  await page.locator('.compare-choice').nth(1).click();
  await page.getByRole('button', { name: 'Buat perbandingan' }).click();
  await expectTextFloor(page, '.compare-metrics dt, .compare-metrics dd', 13);
  await expectTextFloor(page, '.compare-choice span, .compare-metrics small', 12);
  await page.goto(`/?batchId=${batchId}&contentId=${contentId}&view=review&hypothesisId=${hypothesisId}`);
  const review = page.locator('.hypothesis-detail');
  await review.locator('summary').filter({ hasText: 'Buat uji berikutnya' }).click();
  await expectTextFloor(page, '.s10-notes label, .s10-notes input, .s10-notes textarea, .s10-next-test label, .s10-next-test input, .s10-next-test select', 13);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `/tmp/cic-pr36-r36-4-decision-controls-${width}.png`, fullPage: true });
  expect(api.leaked).toEqual([]);
});
