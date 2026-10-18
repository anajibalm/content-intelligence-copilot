import { expect, test } from '@playwright/test';
import fixture from './fixtures/workspace.json';

const batch = fixture.batches[0];
const contents = fixture.contentsByBatch[batch.id as keyof typeof fixture.contentsByBatch];
const hypothesisId = '93000000-0000-4000-8000-000000000001';
const comparisonId = '93000000-0000-4000-8000-000000000002';
const source = contents[0];
const evidence = contents.slice(0, 2).flatMap((content, contentIndex) => {
  const item = content.snapshots.find((candidate) => candidate.distribution === 'ORGANIC')!;
  const raw = Object.fromEntries(Object.entries(item.rawMetrics).map(([key, value]) => [key, { value, quality: 'VALID' }]));
  const qualities = Object.fromEntries([...Object.keys(item.rawMetrics), 'engagement_rate'].map((key) => [key, { state: 'VALID', reason: null }]));
  const captureTime = contentIndex === 0 ? '2026-10-06T08:14:06.531Z' : '2026-10-06T08:24:06.531Z';
  const basis = { sourceSnapshotId: item.id, capturedAt: captureTime, distribution: 'ORGANIC', rawObservations: raw, qualityJson: qualities, formulaVersion: 'metrics-v2' };
  return ['OBSERVED', 'DERIVED'].map((layer) => ({
    id: `mock-${item.id}-${layer}`, layer,
    statement: layer === 'OBSERVED' ? 'OBSERVED: Synthetic frozen snapshot observations' : 'DERIVED: Synthetic frozen snapshot calculation',
    role: 'SUPPORTING', source_type: 'METRIC_SNAPSHOT', source_id: item.id, content_id: content.id,
    basis: { ...basis, statement: JSON.stringify(layer === 'OBSERVED' ? { rawMetrics: raw, qualityByMetric: qualities } : Object.fromEntries(Object.entries(item.derivedMetrics).filter(([key]) => key === 'engagement_rate'))) },
    captured_at: captureTime, currentSource: null, link: null,
  }));
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) test(`MOCK Review layout ${viewport.width}x${viewport.height}`, async ({ page }) => {
  await page.setViewportSize(viewport);
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/workspace') return route.fulfill({ json: { batches: fixture.batches, selectedBatch: batch, contents, selectedContent: { ...source, frames: [], audio: { available: false, url: null }, transcript: [], anchors: [], extraction: [] }, analysis: null, synthetic: true } });
    if (url.pathname === '/api/hypotheses' && url.searchParams.has('hypothesisId')) return route.fulfill({ json: { id: hypothesisId, batchId: batch.id, statement: 'OBSERVED: Synthetic fixture hypothesis claim.', confidence: 'LOW', confidenceCaps: [{ rule: 'INSUFFICIENT_SAMPLE', reason: 'sample size 2 is below high-confidence threshold 3' }], suggestedNextTest: { action: 'Repeat with a controlled sample' }, comparisons: [{ comparison_id: comparisonId, role: 'ORIGIN' }], provider: 'synthetic-fixture', model: 'synthetic-fixture', promptVersion: 'fixture', schemaVersion: 'fixture', ruleVersion: 'fixture', inputHash: 'fixture-hash', rawOutput: {}, evidence } });
    if (url.pathname === '/api/hypotheses') return route.fulfill({ json: { items: [{ id: hypothesisId, batchId: batch.id, statement: 'OBSERVED: Synthetic fixture hypothesis claim.', confidence: 'LOW', reviewDecision: null, reviewedStatement: null, createdAt: '2026-10-06T08:14:06.531Z', contentIds: contents.slice(0, 2).map((content) => content.id), evidenceCount: evidence.length }] } });
    if (url.pathname === '/api/comparisons') return route.fulfill({ json: { id: comparisonId, mode: 'CONTROLLED', scope: 'PAIR', distribution: 'ORGANIC', quality: 'LOW', qualityReasons: ['INSUFFICIENT_SAMPLE'], controlledVariables: { same_format: null }, items: contents.slice(0, 2).map((content) => ({ contentId: content.id })), metric: 'engagement_rate', basis: 'FROZEN', direction: 'DESC', tiePolicy: 'KEEP_ALL' } });
    if (url.pathname === '/api/hypotheses/review') return route.fulfill({ json: { hypothesisId, reviews: [] } });
    if (url.pathname.endsWith('/s10')) return route.fulfill({ json: { batches: fixture.batches, notes: [], nextTests: [] } });
    return route.fulfill({ status: 500, json: { error: `Unmapped MOCK API: ${url.pathname} ${request.method()}` } });
  });

  await page.goto(`/?batchId=${batch.id}&view=review`);
  const queue = page.getByRole('region', { name: 'Antrean hipotesis' });
  await expect(queue.getByText('Synthetic fixture hypothesis claim.')).toBeVisible();
  await page.screenshot({ path: `/tmp/cic-review-MOCK-queue-${viewport.width}x${viewport.height}.png` });
  if (viewport.width === 390) {
    const navigation = page.getByRole('navigation', { name: 'Workspace analyst' });
    const navigationBoxes = await navigation.getByRole('link').evaluateAll((links) => links.map((link) => link.getBoundingClientRect()));
    expect(navigationBoxes.every((box) => Math.round(box.y) === Math.round(navigationBoxes[0]!.y))).toBe(true);
    expect(await navigation.evaluate((element) => element.getBoundingClientRect().height)).toBeLessThanOrEqual(52);
  }
  const item = queue.getByRole('button', { name: /Synthetic fixture hypothesis claim/ });
  const box = await item.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.up();

  const detail = page.locator(`[data-hypothesis-id="${hypothesisId}"]`);
  await expect(detail.getByText('Synthetic fixture hypothesis claim.', { exact: true })).toBeVisible();
  await expect(detail.getByText('Confidence Rendah')).toBeVisible();
  await expect(detail.getByRole('table')).toBeVisible();
  const confidenceReason = detail.getByText('Alasan confidence: sample size 2 is below high-confidence threshold 3');
  await expect(confidenceReason).toBeVisible();
  expect(await confidenceReason.evaluate((element) => { const style = getComputedStyle(element); return style.color === 'rgb(102, 112, 133)' && Number.parseFloat(style.fontSize) === 12; })).toBe(true);
  const backToQueue = detail.getByRole('button', { name: 'Kembali ke antrean' });
  if (viewport.width === 1440) await expect(backToQueue).toBeHidden();
  else await expect(backToQueue).toBeVisible();
  const tabBoxes = await detail.getByRole('tab').evaluateAll((tabs) => tabs.map((tab) => tab.getBoundingClientRect()));
  expect(tabBoxes.every((box) => Math.round(box.y) === Math.round(tabBoxes[0]!.y))).toBe(true);
  const tabStyles = await detail.getByRole('tab').evaluateAll((tabs) => tabs.map((tab) => {
    const style = getComputedStyle(tab);
    return { backgroundColor: style.backgroundColor, borderBottomWidth: style.borderBottomWidth };
  }));
  expect(tabStyles.every((style) => style.backgroundColor === 'rgba(0, 0, 0, 0)')).toBe(true);
  expect(tabStyles[0]!.borderBottomWidth).toBe('2px');
  const metricTable = detail.getByRole('table');
  const metricFontSize = await metricTable.evaluate((table) => getComputedStyle(table).fontSize);
  expect(Number.parseFloat(metricFontSize)).toBeGreaterThanOrEqual(13);
  await expect(detail.getByRole('heading', { name: 'Klaim', exact: true })).toBeVisible();
  await expect(detail.getByText('Synthetic fixture hypothesis claim.', { exact: true })).toHaveCount(1);
  if (viewport.width === 1440) {
    const queueTitle = await queue.getByRole('heading', { name: 'Antrean hipotesis', exact: true }).evaluate((element) => { const style = getComputedStyle(element); return { fontSize: Number.parseFloat(style.fontSize), fontWeight: style.fontWeight }; });
    expect(queueTitle).toEqual({ fontSize: 15, fontWeight: '600' });
    const queueStyle = await item.evaluate((element) => { const style = getComputedStyle(element); return { background: style.backgroundColor, borderWidth: style.borderTopWidth, borderColor: style.borderTopColor, borderRadius: style.borderTopLeftRadius, fontSize: Number.parseFloat(style.fontSize), fontWeight: style.fontWeight }; });
    expect(queueStyle.background).toBe('rgb(234, 241, 255)');
    expect(queueStyle.borderWidth).toBe('1px');
    expect(queueStyle.borderColor).toBe('rgb(227, 230, 235)');
    expect(queueStyle.borderRadius).toBe('6px');
    expect(queueStyle.fontSize).toBe(13);
    expect(queueStyle.fontWeight).toBe('500');
    await expect(queue.getByText('Rendah', { exact: true })).toBeVisible();
    await expect(queue.getByText('Menunggu review', { exact: true })).toBeVisible();
    const filterStyles = await queue.locator('.queue-filters button').evaluateAll((buttons) => buttons.map((button) => { const style = getComputedStyle(button); return { fontSize: Number.parseFloat(style.fontSize), whiteSpace: style.whiteSpace }; }));
    expect(filterStyles).toEqual([{ fontSize: 13, whiteSpace: 'nowrap' }, { fontSize: 13, whiteSpace: 'nowrap' }]);
  }
  expect(await detail.locator('.snapshot-value .ontology-chip').count()).toBe(0);
  if (viewport.width === 1440) {
    await expect(metricTable.getByRole('columnheader', { name: 'Sumber', exact: true })).toBeVisible();
    const alignments = await metricTable.locator('tbody .metric-data-row td.snapshot-value').evaluateAll((cells) => cells.map((cell) => getComputedStyle(cell).textAlign));
    expect(alignments.every((alignment) => alignment === 'right')).toBe(true);
    await expect(metricTable.locator('tbody .metric-data-row td.snapshot-value')).toHaveText(['1.000', '900', '10,00%', '9,00%']);
  }
  await expect(detail.getByRole('region', { name: 'Sumber snapshot' })).toBeVisible();
  const heavyText = await page.locator('.view-review').locator('h2, h3, h4, h5, h6, button, th, td, p, span, strong, summary, label').evaluateAll((elements) => elements.filter((element) => getComputedStyle(element).display !== 'none' && element.getClientRects().length > 0 && !element.matches('h1, .hypothesis-claim h2') && Number.parseInt(getComputedStyle(element).fontWeight, 10) >= 700).map((element) => element.textContent?.trim()));
  expect(heavyText).toEqual([]);
  const bar = detail.locator('.decision-region');
  await expect(bar.getByRole('button', { name: 'Setujui', exact: true })).toBeVisible();
  for (const label of ['Setujui', 'Edit', 'Tolak']) {
    const button = bar.getByRole('button', { name: label, exact: true });
    await expect(button).toBeVisible();
    const box = await button.boundingBox();
    const barBox = await bar.boundingBox();
    expect(box).not.toBeNull();
    expect(barBox).not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(barBox!.y);
    expect(box!.y + box!.height).toBeLessThanOrEqual(barBox!.y + barBox!.height);
  }
  await expect(bar.getByLabel('Catatan')).toBeVisible();
  await expect(bar.getByText('Opsi', { exact: true })).toBeVisible();
  await expect(bar.getByLabel('Tandai golden label (ground truth analyst)')).toBeHidden();
  const height = await bar.evaluate((element) => element.getBoundingClientRect().height);
  expect(height).toBeLessThanOrEqual(viewport.width === 1440 ? 64 : 152);
  if (viewport.width === 1440) {
    const rows = await detail.getByRole('table').first().locator('tbody tr').count();
    expect(rows).toBeGreaterThanOrEqual(3);
    await expect(detail.locator('.hypothesis-claim')).toBeInViewport();
    await expect(detail.getByRole('table')).toBeInViewport();
    await expect(detail.getByRole('region', { name: 'Sumber snapshot' })).toBeInViewport();
  }
  await page.screenshot({ path: `/tmp/cic-review-MOCK-detail-${viewport.width}x${viewport.height}.png` });
  await page.mouse.wheel(0, 600);
  const stickyBox = await bar.boundingBox();
  expect(stickyBox).not.toBeNull();
  expect(Math.round(stickyBox!.y + stickyBox!.height)).toBeLessThanOrEqual(viewport.height);
  if (viewport.width === 390) {
    const actionHeights = await bar.getByRole('button').evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height));
    expect(actionHeights.every((height) => height >= 44)).toBe(true);
  }
  if (viewport.width === 390) {
    await expect(page.locator('.app-brand')).toBeHidden();
    expect((await backToQueue.boundingBox())?.height).toBeLessThanOrEqual(36);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `/tmp/cic-review-MOCK-sticky-${viewport.width}x${viewport.height}.png` });
  const sourceColumn = viewport.width === 1440 ? await metricTable.getByRole('columnheader', { name: 'Sumber', exact: true }).isVisible() : null;
  const numericAlignments = viewport.width === 1440 ? await metricTable.locator('tbody .metric-data-row td.snapshot-value').evaluateAll((cells) => cells.map((cell) => getComputedStyle(cell).textAlign)) : [];
  const controlHeights = await bar.getByRole('button').evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height));
  const nav = page.getByRole('navigation', { name: 'Workspace analyst' });
  const navBoxes = await nav.getByRole('link').evaluateAll((links) => links.map((link) => link.getBoundingClientRect()));
  console.info(`REVIEW_LAYOUT_MEASURE ${JSON.stringify({ viewport, viewportMeasured: { width: await page.evaluate(() => innerWidth), height: await page.evaluate(() => innerHeight) }, queuePointerSelected: await detail.isVisible(), backVisible: await backToQueue.isVisible(), tabsSingleRow: tabBoxes.every((tab) => Math.round(tab.y) === Math.round(tabBoxes[0]!.y)), metricFontPx: Number.parseFloat(metricFontSize), sourceColumn, numericAlignments, heavyTextCount: heavyText.length, confidenceReasonHeightPx: await confidenceReason.evaluate((element) => element.getBoundingClientRect().height), confidenceReasonFontPx: await confidenceReason.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize)), decisionHeightPx: height, controlHeights, stickyWithinViewport: Math.round(stickyBox!.y + stickyBox!.height) <= viewport.height, pageOverflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), navSingleRow: navBoxes.every((navBox) => Math.round(navBox.y) === Math.round(navBoxes[0]!.y)), navHeightPx: await nav.evaluate((element) => element.getBoundingClientRect().height) })}`);
});
