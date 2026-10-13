import { expect, test, type Page, type Route, type TestInfo } from '@playwright/test';
import workspace from './fixtures/workspace.json';

type Body = Record<string, unknown>;

const batch = workspace.batches[0];
const content = workspace.contentsByBatch[batch.id as keyof typeof workspace.contentsByBatch][0];
const ids = {
  primary: 'a4000000-0000-4000-8000-000000000001',
  legacy: 'a4000000-0000-4000-000000000002',
  nullEr: 'a4000000-0000-4000-8000-000000000004',
  nullObserved: 'a4000000-0000-4000-8000-000000000005',
  zeroObserved: 'a4000000-0000-4000-8000-000000000006',
  reviewed: 'a4000000-0000-4000-000000000003',
  high: 'b4000000-0000-4000-8000-000000000001',
  low: 'b4000000-0000-4000-000000000002',
};

function post(route: Route): Body {
  const body = route.request().postDataJSON();
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Expected JSON review payload');
  return body as Body;
}

function detail(id: string) {
  const legacy = id === ids.legacy;
  const nullEr = id === ids.nullEr;
  const nullObserved = id === ids.nullObserved;
  const zeroObserved = id === ids.zeroObserved;
  const views = nullObserved ? null : zeroObserved ? 0 : 100;
  const viewsQuality = nullObserved ? { state: 'MISSING', reason: 'NOT_PROVIDED' } : zeroObserved ? { state: 'VALID', reason: null } : { state: 'SUSPECT', reason: 'SOURCE_ERROR' };
  const metricBasis = { sourceSnapshotId: 'snapshot-frozen', source: 'frozen-source', capturedAt: '2026-10-12T09:00:00.000Z', distribution: 'ORGANIC', quality: 'SUSPECT', qualityJson: { views: viewsQuality, engagement_rate: { state: 'SUSPECT', reason: 'INVALID_VALUE' } }, rawObservations: { views: { value: views, quality: viewsQuality.state } }, sourceMetricNames: ['likes', 'comments', 'shares', 'saves', 'views'], formulaVersion: 'metrics-v2' };
  return {
    id,
    batchId: batch.id,
    statement: legacy ? 'Pernyataan legacy tanpa basis metrik lengkap.' : 'Pernyataan AI asli tetap dugaan walau keputusan reviewer disimpan.',
    state: 'OPEN',
    confidence: 'LOW',
    confidenceCaps: [{ rule: 'ONE_COMPARISON', reason: 'Satu perbandingan belum membuktikan pola yang bertahan.' }, { rule: 'UNREVIEWED_EXTRACTED', reason: 'Ekstraksi belum direview.' }],
    provider: 'synthetic-review', model: 'review-v1', promptVersion: 'prompt-v1', schemaVersion: 'schema-v1', ruleVersion: 'hypothesis-v1', inputHash: 'sha256:review', rawOutput: '{"statement":"AI original"}',
    suggestedNextTest: { action: 'Uji ulang pada batch berikutnya' },
    comparisons: legacy ? [] : [{ comparison_id: ids.high, role: 'PRIMARY' }, { comparison_id: ids.low, role: 'CONTEXTUAL' }],
    evidence: legacy ? [{ id: 'legacy-evidence', layer: 'DERIVED', statement: 'legacy metric artifact', source_type: 'METRIC_SNAPSHOT', role: 'SUPPORTING', link: null }] : [
      { id: 'frozen-observed', layer: 'OBSERVED', statement: `OBSERVED metrics from frozen snapshot snapshot-frozen using metrics-v2: ${JSON.stringify({ views, likes: 10, comments: 5, shares: 3, saves: 2 })}`, source_type: 'METRIC_SNAPSHOT', role: 'SUPPORTING', link: `/?batchId=${batch.id}&contentId=${content.id}#metric-snapshot-snapshot-frozen`, basis: metricBasis },
      { id: 'frozen-er', layer: 'DERIVED', statement: `DERIVED metrics from frozen snapshot snapshot-frozen using metrics-v2: ${JSON.stringify({ engagement_rate: { value: nullEr ? null : 0.2, formulaVersion: 'metrics-v2', sourceMetricNames: ['likes', 'comments', 'shares', 'saves', 'views'] } })}`, source_type: 'METRIC_SNAPSHOT', role: 'SUPPORTING', link: `/?batchId=${batch.id}&contentId=${content.id}#metric-snapshot-snapshot-frozen`, basis: metricBasis },
      { id: 'frame', layer: 'OBSERVED', statement: 'Frame pembuka tersimpan', source_type: 'VIDEO_FRAME', role: 'SUPPORTING', link: `/?batchId=${batch.id}&contentId=${content.id}#video-frame-hook`, basis: { timestampMs: 0 } },
      { id: 'extract', layer: 'EXTRACTED', statement: 'Ekstraksi snapshot lama', source_type: 'CONTENT_FEATURE', role: 'CONTEXTUAL', link: `/?batchId=${batch.id}&contentId=${content.id}#content-feature-hook`, basis: { provider: 'historic-provider', inputHash: 'sha256:frozen-feature' }, currentSource: { aiValue: 'AI sumber kini berubah', reviewedValue: 'Nilai reviewer kini', reviewState: 'CORRECTED' } },
    ],
  };
}

async function installApi(page: Page, syntheticState = { workspace: true, analysis: false }) {
  const reviews = new Map<string, Body[]>();
  const invalidPosts: Body[] = [];
  const queue = [
    { id: ids.primary, batchId: batch.id, statement: detail(ids.primary).statement, confidence: 'LOW', reviewDecision: null, reviewedStatement: null },
    { id: ids.legacy, batchId: batch.id, statement: detail(ids.legacy).statement, confidence: 'LOW', reviewDecision: null, reviewedStatement: null },
    { id: ids.reviewed, batchId: batch.id, statement: 'Sudah direview', confidence: 'LOW', reviewDecision: 'APPROVE', reviewedStatement: 'Sudah direview' },
  ];
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/workspace') return route.fulfill({ json: { synthetic: syntheticState.workspace, batches: [batch], selectedBatch: batch, contents: [content], selectedContent: { ...content, frames: [], audio: { available: false, url: null }, transcript: [], anchors: [], extraction: [] }, analysis: syntheticState.analysis ? { synthetic: true, ranking: { status: 'UNCONFIGURED', reason: null, rankedGroups: [], excluded: [] }, kpis: [], snapshots: [] } : null } });
    if (url.pathname === '/api/processing') return route.fulfill({ json: { items: [] } });
    if (url.pathname === '/api/hypotheses') {
      const hypothesisId = url.searchParams.get('hypothesisId');
      return route.fulfill({ json: hypothesisId ? detail(hypothesisId) : { items: queue } });
    }
    if (url.pathname === '/api/comparisons') {
      const quality = url.searchParams.get('comparisonId') === ids.high ? 'HIGH' : 'LOW';
      return route.fulfill({ json: { id: url.searchParams.get('comparisonId'), quality, qualityReasons: quality === 'LOW' ? ['SUSPECT_PRIMARY_METRIC'] : [], mode: 'CONTROLLED', scope: 'PAIR', distribution: 'ORGANIC' } });
    }
    if (url.pathname === '/api/hypotheses/review') {
      const hypothesisId = url.searchParams.get('hypothesisId') ?? String(post(route).hypothesisId);
      if (route.request().method() === 'GET') return route.fulfill({ json: { hypothesisId, reviews: reviews.get(hypothesisId) ?? [] } });
      const body = post(route);
      if (!body.reviewer || (body.decision === 'REJECT' && !body.reasonCode)) invalidPosts.push(body);
      const previous = reviews.get(String(body.hypothesisId)) ?? [];
      const record = { id: `review-${previous.length + 1}`, ...body, editedStatement: body.editedStatement ?? null, reviewedStatement: body.editedStatement ?? detail(String(body.hypothesisId)).statement, goldenLabel: false, createdAt: '2026-10-12T10:00:00.000Z' };
      reviews.set(String(body.hypothesisId), [...previous, record]);
      return route.fulfill({ status: 201, json: record });
    }
    if (url.pathname.endsWith('/s10')) return route.fulfill({ json: { notes: [], nextTests: [] } });
    return route.fulfill({ status: 500, json: { error: `Unmapped fixture API: ${url.pathname}` } });
  });
  return { reviews, invalidPosts };
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`) });
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 812 }]) {
  test(`Review keeps evidence dimensions separate at ${viewport.width}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const api = await installApi(page);
    await page.goto(`/?batchId=${batch.id}&contentId=${content.id}&view=review&hypothesisId=${ids.primary}`);
    const detailPanel = page.locator(`[data-hypothesis-id="${ids.primary}"]`);
    await expect(detailPanel.locator('.hypothesis-statement').getByText('Dugaan', { exact: true })).toBeVisible();
    await expect(detailPanel.getByText('Confidence', { exact: true })).toBeVisible();
    await expect(detailPanel.getByText('Rendah', { exact: true }).first()).toBeVisible();
    await expect(detailPanel.getByText('Kualitas perbandingan', { exact: true })).toBeVisible();
    await expect(detailPanel.getByText('Tinggi', { exact: true })).toBeVisible();
    await expect(detailPanel.getByText('Rendah', { exact: true }).nth(1)).toBeVisible();
    await expect(detailPanel.getByText('Batas confidence', { exact: true })).toBeVisible();
    await expect(detailPanel.locator('.confidence-caps').getByText('Satu perbandingan belum membuktikan pola yang bertahan.', { exact: true })).toBeVisible();

    const evidence = detailPanel.getByRole('region', { name: 'Bukti hipotesis' });
    const erCard = evidence.locator('.review-evidence-card').nth(1);
    await expect(erCard.locator(':scope > strong')).toContainText('Rasio interaksi');
    await expect(erCard.locator('.review-evidence-value')).toHaveText('20.0%');
    await expect(erCard.locator(':scope > span').filter({ hasText: 'Perhitungan' })).toHaveCount(1);
    await expect(erCard.locator(':scope > .status').filter({ hasText: 'Basis beku' })).toHaveCount(1);
    await expect(erCard.getByRole('link', { name: 'Buka sumber exact' })).toHaveAttribute('href', /metric-snapshot-snapshot-frozen/);
    const extractionCard = evidence.locator('.review-evidence-card').nth(3);
    await expect(extractionCard.getByText('Nilai sumber kini', { exact: true })).toBeVisible();
    await expect(extractionCard.locator('details').nth(1).getByText('AI sumber kini berubah', { exact: true })).toBeVisible();
    await expect(evidence.getByText('Provenance dan isi asli', { exact: true }).first()).toBeVisible();
    await capture(page, testInfo, `before-${viewport.width}`);

    const decision = detailPanel.locator('.hypothesis-decision');
    if (viewport.width === 375) {
      await expect(decision.locator('details')).not.toHaveAttribute('open');
      await decision.getByText('Keputusan review', { exact: true }).click();
    }
    await decision.getByRole('button', { name: 'Setujui', exact: true }).click();
    await expect(decision.getByText('Isi nama reviewer untuk menyimpan keputusan', { exact: true })).toBeVisible();
    await expect(decision.getByLabel('Reviewer', { exact: true })).toBeFocused();
    await decision.getByLabel('Reviewer', { exact: true }).fill('Analyst synthetic');
    await decision.getByRole('button', { name: 'Tolak', exact: true }).click();
    await expect(decision.getByText('Pilih alasan penolakan untuk menyimpan keputusan', { exact: true })).toBeVisible();
    const rejectionReason = page.getByRole('combobox', { name: 'Alasan penolakan (wajib untuk Tolak)' });
    await expect(rejectionReason).toHaveAttribute('aria-invalid', 'true');
    await expect(rejectionReason).toBeFocused();
    expect(api.invalidPosts).toEqual([]);
    await rejectionReason.selectOption('OVERCLAIM');
    await decision.getByRole('button', { name: 'Tolak', exact: true }).click();
    await expect(detailPanel.getByText('Ditolak', { exact: true })).toBeVisible();
    expect(api.reviews.get(ids.primary)?.map((entry) => entry.decision)).toEqual(['REJECT']);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await capture(page, testInfo, `after-${viewport.width}`);

    await page.goto(`/?batchId=${batch.id}&contentId=${content.id}&view=review&hypothesisId=${ids.legacy}`);
    const legacyPanel = page.locator(`[data-hypothesis-id="${ids.legacy}"]`);
    await expect(legacyPanel.getByText('Kualitas perbandingan', { exact: true })).toBeVisible();
    await expect(legacyPanel.getByText('Belum tersedia. Hipotesis legacy tidak merujuk ID perbandingan tersimpan.', { exact: true })).toBeVisible();
    await expect(legacyPanel.getByText('Format bukti historis tidak dikenali untuk ringkasan tampilan.', { exact: true })).toBeVisible();
    await capture(page, testInfo, `legacy-${viewport.width}`);
  });
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 812 }]) {
  test(`R45 evidence, decision bar, synthetic, and controls at ${viewport.width}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await installApi(page);
    await page.goto(`/?batchId=${batch.id}&contentId=${content.id}&view=review&hypothesisId=${ids.primary}`);
    const detailPanel = page.locator(`[data-hypothesis-id="${ids.primary}"]`);
    const evidence = detailPanel.getByRole('region', { name: 'Bukti hipotesis' });
    const observedCard = evidence.locator('.review-evidence-card').first();
    await expect(observedCard.getByText('Ringkasan tampilan', { exact: true })).toBeVisible();
    await expect(observedCard.getByText('Tayangan · Observasi', { exact: true })).toBeVisible();
    await expect(observedCard.locator('.review-evidence-value')).toHaveText('100');
    await expect(observedCard.locator('.metric-quality')).toHaveText('Perlu diperiksa · Sumber melaporkan error.');
    const erCard = evidence.locator('.review-evidence-card').nth(1);
    await expect(erCard.locator('.review-evidence-value')).toHaveText('20.0%');
    await expect(erCard.locator('.metric-quality')).toHaveText('Perlu diperiksa · Nilai atau metrik sumber tidak valid.');
    const decision = detailPanel.locator('.hypothesis-decision');
    await expect(decision.getByText('Data uji synthetic. Keputusan di sini bukan persetujuan brand nyata.', { exact: true })).toBeVisible();
    expect(await decision.evaluate((element) => getComputedStyle(element).position)).toBe('sticky');
    await page.evaluate(() => {
      const decision = document.querySelector('.hypothesis-decision');
      if (!decision) throw new Error('Keputusan review tidak ditemukan');
      scrollTo(0, decision.getBoundingClientRect().top + scrollY + 160);
    });
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
    const stickyBox = await decision.boundingBox();
    expect(stickyBox).not.toBeNull();
    expect(stickyBox!.y).toBeGreaterThanOrEqual(viewport.width === 375 ? 8 : 16);
    expect(stickyBox!.y + stickyBox!.height).toBeLessThanOrEqual(viewport.height);
    await capture(page, testInfo, `r45-sticky-${viewport.width}`);
    if (viewport.width === 375) {
      await expect(decision.locator('details')).not.toHaveAttribute('open');
      await capture(page, testInfo, 'r45-mobile-collapsed');
      await decision.getByText('Keputusan review', { exact: true }).click();
    }
    const controls = decision.locator('input:not([type="checkbox"]), textarea, select');
    await expect(controls).toHaveCount(3);
    expect(await controls.evaluateAll((items) => items.every((item) => getComputedStyle(item).borderColor === 'rgb(118, 133, 139)'))).toBe(true);
    await decision.getByRole('button', { name: 'Setujui', exact: true }).click();
    await expect(decision.getByText('Isi nama reviewer untuk menyimpan keputusan', { exact: true })).toBeVisible();
    await capture(page, testInfo, `r45-error-${viewport.width}`);

    await page.goto(`/?batchId=${batch.id}&contentId=${content.id}&view=review&hypothesisId=${ids.nullEr}`);
    const nullErCard = page.locator(`[data-hypothesis-id="${ids.nullEr}"]`).getByRole('region', { name: 'Bukti hipotesis' }).locator('.review-evidence-card').nth(1);
    await expect(nullErCard.locator('.review-evidence-value')).toHaveText('Belum tersedia');
    await expect(nullErCard.locator('.metric-quality')).toHaveText('Perlu diperiksa · Nilai atau metrik sumber tidak valid.');
    await expect(nullErCard).not.toContainText('Format bukti historis tidak dikenali untuk ringkasan tampilan.');
  });
}

test('R45-2 renders canonical OBSERVED null and explicit valid zero', async ({ page }, testInfo) => {
  await installApi(page);
  for (const [hypothesisId, value, quality] of [[ids.nullObserved, 'Belum tersedia', 'Belum tersedia · Nilai belum diberikan.'], [ids.zeroObserved, '0', 'Valid']] as const) {
    await page.goto(`/?batchId=${batch.id}&contentId=${content.id}&view=review&hypothesisId=${hypothesisId}`);
    const card = page.locator(`[data-hypothesis-id="${hypothesisId}"]`).getByRole('region', { name: 'Bukti hipotesis' }).locator('.review-evidence-card').first();
    await expect(card.getByText('Ringkasan tampilan', { exact: true })).toBeVisible();
    await expect(card.locator('.review-evidence-value')).toHaveText(value);
    await expect(card.locator('.metric-quality')).toHaveText(quality);
    await expect(card).not.toContainText('Format bukti historis tidak dikenali untuk ringkasan tampilan.');
    await card.screenshot({ path: testInfo.outputPath(`r45-2-observed-${value === '0' ? 'zero' : 'null'}.png`) });
  }
});

test('R45 synthetic warning follows workspace and analysis flags, not batch name', async ({ page }) => {
  const syntheticState = { workspace: true, analysis: false };
  await installApi(page, syntheticState);
  const url = `/?batchId=${batch.id}&contentId=${content.id}&view=review&hypothesisId=${ids.primary}`;
  const warning = page.locator('.synthetic-review-note');
  await page.goto(url);
  await expect(warning).toBeVisible();
  syntheticState.workspace = false;
  await page.reload();
  await expect(warning).toHaveCount(0);
  syntheticState.analysis = true;
  await page.reload();
  await expect(warning).toBeVisible();
});
