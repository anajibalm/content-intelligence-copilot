import { test, expect, type Page } from '@playwright/test';
import fixture from './fixtures/workspace.json';

const batchA = fixture.batches[0].id as keyof typeof fixture.contentsByBatch;
const batchB = fixture.batches[1].id as keyof typeof fixture.contentsByBatch;
const hypothesisId = '91000000-0000-4000-8000-000000000001';
const thirdId = '91000000-0000-4000-8000-000000000003';
const otherId = '91000000-0000-4000-8000-000000000002';
const comparisonId = '92000000-0000-4000-8000-000000000001';

function snapshotEvidence(index: number, missingComments = false) {
  const content = fixture.contentsByBatch[batchA][index - 1];
  const snapshotId = content.snapshots[0].id;
  const capturedAt = index === 1 ? '2026-10-06T08:14:06.531Z' : '2026-10-06T14:23:10.480Z';
  const metrics = index === 1 ? { views: 236, likes: 27, saves: 1, shares: 2, comments: missingComments ? null : 0 } : { views: 192, likes: 19, saves: 0, shares: 0, comments: 0 };
  const rawMetrics = Object.fromEntries(Object.entries(metrics).map(([key, value]) => [key, { value: key === 'comments' && index === 1 && missingComments ? null : value, quality: key === 'comments' && index === 1 && missingComments ? 'UNAVAILABLE' : 'VALID' }]));
  const qualityByMetric = Object.fromEntries([...Object.keys(metrics), 'engagement_rate'].map((key) => [key, { state: key === 'comments' && index === 1 && missingComments ? 'UNAVAILABLE' : 'VALID', reason: key === 'comments' && index === 1 && missingComments ? 'MISSING_METRIC' : null }]));
  const basis = { sourceSnapshotId: snapshotId, source: 'synthetic fixture (unverified)', capturedAt, distribution: 'ORGANIC', rawObservations: rawMetrics, qualityJson: qualityByMetric, formulaVersion: 'metrics-v2' };
  const layers = [{ layer: 'OBSERVED', values: rawMetrics }, { layer: 'DERIVED', values: { engagement_rate: { value: index === 1 && missingComments ? null : (Number(metrics.likes) + Number(metrics.saves) + Number(metrics.shares) + Number(metrics.comments)) / Number(metrics.views) } } }];
  return layers.map(({ layer, values }) => ({ id: `${snapshotId}-${layer}`, layer, statement: `${layer} metrics from frozen snapshot ${snapshotId}: ${JSON.stringify(values)}`, role: 'SUPPORTING', source_type: 'METRIC_SNAPSHOT', source_id: snapshotId, content_id: content.id, basis: { ...basis, statement: `${layer} metrics from frozen snapshot ${snapshotId}: ${JSON.stringify(values)}` }, captured_at: capturedAt, currentSource: null, link: null }));
}
async function api(page: Page, missingComments = false, featureVariants = false) {
  const reviews: Record<string, unknown>[] = [];
  const notes: Record<string, unknown>[] = [];
  const nextTests: Record<string, unknown>[] = [];
  const leaked: string[] = [];
  let failQueue = false;
  const hypothesis = (id: string) => ({ id, batchId: batchA, statement: id === hypothesisId ? 'Synthetic original hypothesis' : id === thirdId ? 'Alternative synthetic hypothesis' : 'Other original hypothesis', confidence: 'LOW', state: 'ACTIVE', confidenceCaps: [{ rule: 'INSUFFICIENT_SAMPLE', reason: 'sample too small' }, { rule: 'ONE_COMPARISON', reason: 'one pair' }, { rule: 'LEGACY_ONLY', reason: 'legacy only' }], suggestedNextTest: { action: 'Repeat', controls: [true, null, 'text'] }, comparisons: [{ comparison_id: comparisonId, role: 'ORIGIN' }], provider: 'synthetic', model: 'synthetic', promptVersion: 'test', schemaVersion: 'test', ruleVersion: 'test', inputHash: 'test-hash', rawOutput: {}, evidence: [...snapshotEvidence(1, missingComments), ...snapshotEvidence(2), { id: 'e-1', layer: 'OBSERVED', statement: 'Historical raw evidence', role: 'SUPPORTING', source_type: 'VIDEO_FRAME', source_id: 'last-frame', content_id: fixture.contentsByBatch[batchA][0].id, basis: {}, captured_at: null, currentSource: null, link: `/?batchId=${batchA}&contentId=${fixture.contentsByBatch[batchA][0].id}&view=library#video-frame-last-frame` }], contentIds: [fixture.contentsByBatch[batchA][0].id] });
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const post = request.method() !== 'GET' ? request.postDataJSON() : null;
    if (url.pathname === '/api/comparisons') return route.fulfill({ json: { id: comparisonId, mode: 'CONTROLLED', scope: 'PAIR', distribution: 'ORGANIC', quality: 'LOW', qualityReasons: [], controlledVariables: { same_format: null }, items: [{ contentId: fixture.contentsByBatch[batchA][0].id }, { contentId: fixture.contentsByBatch[batchA][1].id }], metric: 'engagement_rate', basis: 'FROZEN', direction: 'DESC', tiePolicy: 'KEEP_ALL' } });
    if (url.pathname === '/api/workspace') {
      const batch = fixture.batches.find((item) => item.id === url.searchParams.get('batchId')) ?? fixture.batches[0];
      const contents = fixture.contentsByBatch[batch.id as keyof typeof fixture.contentsByBatch];
      const content = contents.find((item) => item.id === url.searchParams.get('contentId')) ?? contents[0];
      return route.fulfill({ json: { batches: fixture.batches, selectedBatch: batch, contents, synthetic: batch.id === batchA, analysis: null, selectedContent: { ...content, frames: [{ id: 'last-frame', type: 'SCENE', timestampMs: 3000, available: false, url: null }], audio: { available: false, url: null }, transcript: [], anchors: [], extraction: [{ id: 'cta', extractionRunId: 'run', fieldName: 'cta_type', aiValue: 'soft sell', reviewedValue: 'direct pitch', reviewState: 'CORRECTED', provider: 'synthetic-pr34' }] } } });
    }
    if (url.pathname.includes('/contents/') && url.pathname.endsWith('/review')) return route.fulfill({ json: { reviews: [], corrections: [{ id: 'correction', fieldName: 'cta_type', originalAiValue: 'soft sell', correctedValue: 'direct pitch', reasonCode: 'WRONG_CLASSIFICATION', reviewer: 'fixture', createdAt: '2026-10-08T00:00:00Z' }] } });
    if (url.pathname === '/api/processing') return route.fulfill({ json: { items: [] } });
    if (url.pathname === '/api/hypotheses') {
      const id = url.searchParams.get('hypothesisId');
      if (failQueue && !id) { failQueue = false; return route.fulfill({ status: 503, json: { error: 'Synthetic queue read failed' } }); }
      if (id) {
        const detail = hypothesis(id);
        const currentFeature = featureVariants
          ? { id: 'e-feature', layer: 'EXTRACTED', statement: 'EXTRACTED format: B', role: 'SUPPORTING', source_type: 'CONTENT_FEATURE', source_id: 'cta', content_id: fixture.contentsByBatch[batchA][0].id, basis: { fieldName: 'format', aiValue: 'A', reviewState: 'UNREVIEWED' }, captured_at: null, currentSource: { aiValue: 'B', reviewedValue: 'B', reviewState: 'CONFIRMED' }, link: `/?batchId=${batchA}&contentId=${fixture.contentsByBatch[batchA][0].id}#content-feature-cta` }
          : { id: 'e-feature', layer: 'EXTRACTED', statement: 'EXTRACTED cta_type: soft sell', role: 'SUPPORTING', source_type: 'CONTENT_FEATURE', source_id: 'cta', content_id: fixture.contentsByBatch[batchA][0].id, basis: { fieldName: 'cta_type' }, captured_at: null, currentSource: { aiValue: 'soft sell', reviewedValue: 'direct pitch', reviewState: 'CORRECTED' }, link: `/?batchId=${batchA}&contentId=${fixture.contentsByBatch[batchA][0].id}#content-feature-cta` };
        const evidence = [...detail.evidence, currentFeature];
        if (featureVariants) evidence.push({ ...currentFeature, id: 'e-feature-history', source_id: 'cta-old', statement: 'EXTRACTED format: A', basis: { fieldName: 'format', aiValue: 'A', reviewState: 'UNREVIEWED' }, currentSource: { aiValue: 'B', reviewedValue: 'B', reviewState: 'CONFIRMED' } }, { ...currentFeature, id: 'e-feature-opening', source_id: 'opening', statement: 'EXTRACTED opening_style: slow reveal', basis: { fieldName: 'opening_style', aiValue: 'slow reveal', reviewState: 'UNREVIEWED' }, currentSource: { aiValue: 'slow reveal', reviewedValue: 'slow reveal', reviewState: 'CONFIRMED' } });
        return route.fulfill({ json: { ...detail, evidence } });
      }
      return route.fulfill({ json: { items: url.searchParams.get('batchId') === batchB ? [] : [hypothesisId, otherId, thirdId].map((id) => ({ id, batchId: batchA, statement: id === hypothesisId ? 'Synthetic original hypothesis' : id === thirdId ? 'Alternative synthetic hypothesis' : 'Other original hypothesis', confidence: 'LOW', confidenceCaps: [], suggestedNextTest: { action: 'Repeat' }, contentIds: [fixture.contentsByBatch[batchA][id === otherId ? 1 : 0].id], evidenceCount: 1, createdAt: '2026-10-08T00:00:00Z', reviewDecision: id === hypothesisId ? reviews.at(-1)?.decision ?? null : id === otherId ? 'APPROVE' : null, reviewedAt: null, reviewedStatement: id === hypothesisId ? reviews.at(-1)?.reviewedStatement ?? null : null })) } });
    }
    if (url.pathname === '/api/hypotheses/review') {
      if (!post) return route.fulfill({ json: { reviews: url.searchParams.get('hypothesisId') === hypothesisId ? reviews : [] } });
      const record = { id: `review-${reviews.length}`, ...post, reviewedStatement: post.editedStatement ?? 'Synthetic original hypothesis', createdAt: '2026-10-08T00:00:00Z' };
      reviews.push(record);
      return route.fulfill({ status: 201, json: record });
    }
    if (url.pathname.endsWith('/s10')) {
      if (post?.kind === 'NOTE') notes.push({ id: `note-${notes.length}`, ...post, updatedAt: '2026-10-08' });
      if (post?.kind === 'NEXT_TEST') nextTests.push({ id: `next-${nextTests.length}`, ...post, status: 'PROPOSED', updatedAt: '2026-10-08' });
      return route.fulfill({ json: { batches: fixture.batches, notes, nextTests } });
    }
    leaked.push(request.url());
    return route.fulfill({ status: 500, json: { error: 'Unmapped fixture API' } });
  });
  return { reviews, notes, nextTests, leaked, failQueue: () => { failQueue = true; } };
}

for (const width of [1440, 390]) test(`persisted review queue, draft isolation and four-view layout ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  const state = await api(page);
  const contentId = fixture.contentsByBatch[batchA][0].id;
  await page.goto(`/?batchId=${batchA}&contentId=${contentId}&view=review`);
  const queue = page.getByRole('region', { name: 'Antrean hipotesis' });
  await queue.getByRole('button', { name: /Synthetic original hypothesis/ }).click();
  await expect(page).toHaveURL(new RegExp(`hypothesisId=${hypothesisId}`));
  const detail = page.locator(`[data-hypothesis-id="${hypothesisId}"]`);
  const approve = detail.getByRole('button', { name: 'Setujui', exact: true });
  await expect(approve).toBeEnabled();
  await approve.click();
  await detail.getByRole('button', { name: 'Tolak', exact: true }).scrollIntoViewIfNeeded();
  const decisionBar = detail.locator('.decision-region .review-actions');
  await expect(decisionBar).toBeInViewport();
  for (const button of await decisionBar.getByRole('button').all()) expect(await button.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  await expect(detail.getByText('Isi nama reviewer untuk menyimpan keputusan', { exact: true })).toBeVisible();
  await expect(detail.getByLabel('Reviewer', { exact: true })).toBeFocused();
  expect(state.reviews).toHaveLength(0);
  expect(await detail.locator('details').evaluateAll((elements) => elements.every((element) => element instanceof HTMLDetailsElement && !element.open))).toBe(true);
  const notesDisclosure = detail.locator('details.s10-disclosure > summary');
  await notesDisclosure.click();
  await expect(detail.locator('details.s10-disclosure')).toHaveAttribute('open', '');
  await notesDisclosure.click();
  await expect(detail.locator('details.s10-disclosure')).not.toHaveAttribute('open', '');
  await notesDisclosure.click();
  await detail.getByLabel('Penulis', { exact: true }).fill('synthetic analyst');
  await detail.getByLabel('Reviewer', { exact: true }).fill('synthetic analyst');
  await detail.getByRole('button', { name: 'Setujui', exact: true }).click();
  await detail.getByLabel('Notes', { exact: true }).fill('Saved synthetic note');
  await detail.getByRole('button', { name: 'Simpan Notes', exact: true }).click();
  const nextTestDisclosure = detail.locator('summary').filter({ hasText: 'Buat uji berikutnya' });
  await nextTestDisclosure.click();
  await expect(nextTestDisclosure.locator('..')).toHaveAttribute('open', '');
  for (const label of ['Variabel yang diuji', 'Varian A', 'Varian B', 'Kontrol', 'Hasil yang diharapkan', 'Penanggung jawab', 'Metrik keberhasilan', 'Periode pengukuran']) await detail.getByLabel(label, { exact: true }).fill(`Synthetic ${label}`);
  await detail.getByRole('button', { name: 'Buat Next Test', exact: true }).click();
  await detail.getByLabel('Notes', { exact: true }).fill('Draft for first hypothesis');
  if (width === 390) await detail.getByRole('button', { name: 'Kembali ke antrean', exact: true }).click();
  else await page.goBack();
  await expect(queue.getByRole('button', { name: /^Semua/ })).toContainText('3');
  await queue.getByRole('button', { name: /^Semua/ }).click();
  await queue.getByRole('button', { name: /Synthetic original hypothesis/ }).click();
  await detail.locator('details.s10-disclosure > summary').click();
  await expect(detail.getByRole('textbox', { name: 'Notes', exact: true })).toHaveValue('Draft for first hypothesis');
  await page.reload();
  await expect(page).toHaveURL(new RegExp(hypothesisId));
  await page.locator(`[data-hypothesis-id="${hypothesisId}"] details.s10-disclosure > summary`).click();
  await expect(page.getByText('Saved synthetic note', { exact: true })).toBeVisible();
  await expect(page.getByText('Synthetic Variabel yang diuji', { exact: true }).first()).toBeVisible();
  await page.locator(`[data-hypothesis-id="${hypothesisId}"]`).getByRole('tab', { name: 'Ekstraksi AI', exact: true }).click();
  await detail.getByRole('textbox', { name: 'Notes', exact: true }).fill('Draft survives source navigation');
  await detail.locator('a[href$="#video-frame-last-frame"]').click();
  await expect(page.locator('#video-frame-last-frame')).toBeVisible();
  await expect(page).toHaveURL(/view=library.*hypothesisId=.*#video-frame-last-frame/);
  await page.getByRole('navigation', { name: 'Workspace analyst' }).getByRole('link', { name: 'Review', exact: true }).click();
  await expect(detail.getByRole('textbox', { name: 'Notes', exact: true })).toHaveValue('Draft survives source navigation');
  for (const view of ['Batch', 'Library', 'Compare', 'Review']) {
    await page.getByRole('navigation', { name: 'Workspace analyst' }).getByRole('link', { name: view, exact: true }).click();
    await expect(page.getByRole('button', { name: 'Data uji synthetic' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 390) {
      const top = await page.locator(view === 'Batch' ? '.ingest-form' : view === 'Library' ? '.workspace-columns' : view === 'Compare' ? '.compare-panel' : '.review-workspace').evaluate((element) => element.getBoundingClientRect().top + scrollY);
      expect(top).toBeLessThanOrEqual(400);
    }
    if (view === 'Library') {
      await expect(page.locator('#content-feature-cta')).toContainText('soft sell');
      await expect(page.locator('#content-feature-cta')).toContainText('direct pitch');
      await page.locator('.workspace-columns .review-history').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `/tmp/cic-pr34-ux-fingerprint-history-${width}.png` });
    }
    if (view === 'Review') {
      await page.locator('.s10-next-test').filter({ visible: true }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: `/tmp/cic-pr34-ux-notes-next-test-${width}.png` });
    }
    await page.screenshot({ path: `/tmp/cic-pr34-ux-${view.toLowerCase()}-${width}.png`, fullPage: true });
  }
  await page.getByLabel('Pilih batch').selectOption(batchB);
  await expect(queue.getByText('Tidak ada hipotesis menunggu review.', { exact: false })).toBeVisible();
  await expect(page.getByText('Synthetic original hypothesis', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Data uji synthetic' })).toHaveCount(0);
  expect(state.leaked).toEqual([]);
});

test('group variants and require rejection reason with real clicks', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await api(page);
  await page.goto(`/?batchId=${batchA}&view=review`);
  const queue = page.getByRole('region', { name: 'Antrean hipotesis' });
  await queue.getByRole('button', { name: /^Semua/ }).click();
  await expect(queue.getByRole('button', { name: /^Semua/ })).toContainText('3');
  const variantsToggle = queue.getByRole('button', { name: '+2 varian', exact: true });
  await expect(variantsToggle).toHaveAttribute('aria-expanded', 'false');
  await variantsToggle.click();
  await expect(variantsToggle).toHaveAttribute('aria-expanded', 'true');
  await queue.getByRole('button', { name: /Alternative synthetic hypothesis/ }).click();
  const detail = page.getByRole('region', { name: 'Detail hipotesis' });
  await expect(detail.getByLabel('Alasan penolakan (wajib untuk Tolak)')).toHaveCount(0);
  await detail.getByLabel('Reviewer', { exact: true }).fill('synthetic reviewer');
  await detail.getByRole('button', { name: 'Tolak', exact: true }).click();
  await expect(detail.getByLabel('Alasan penolakan (wajib untuk Tolak)')).toBeVisible();
  await detail.getByRole('button', { name: 'Simpan penolakan', exact: true }).click();
  await expect(detail.getByText('Pilih alasan penolakan untuk menyimpan keputusan', { exact: true })).toBeVisible();
  await detail.getByLabel('Alasan penolakan (wajib untuk Tolak)').selectOption({ index: 1 });
  await detail.getByRole('button', { name: 'Simpan penolakan', exact: true }).click();
  await expect(detail.getByRole('button', { name: 'Simpan penolakan', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await page.getByRole('button', { name: 'Data uji synthetic' }).count())).toBe(1);
  expect(page.url()).toContain(`hypothesisId=${thirdId}`);
});

test('queue failure has working retry and detail survives queue refresh', async ({ page }) => {
  const state = await api(page);
  await page.goto(`/?batchId=${batchA}&view=review`);
  const queue = page.getByRole('region', { name: 'Antrean hipotesis' });
  const original = queue.getByRole('button', { name: /Synthetic original hypothesis/ });
  await expect(original).toBeVisible();
  await original.click();
  const detail = page.getByRole('region', { name: 'Detail hipotesis' });
  await detail.getByLabel('Reviewer', { exact: true }).fill('synthetic analyst');
  await detail.getByRole('button', { name: 'Setujui', exact: true }).click();
  state.failQueue();
  await page.goBack();
  await expect(page.getByText('Synthetic queue read failed')).toBeVisible();
  await queue.getByRole('button', { name: 'Coba lagi', exact: true }).click();
  await queue.getByRole('button', { name: /^Semua/ }).click();
  await expect(queue.getByRole('button', { name: /Synthetic original hypothesis/ })).toBeVisible();
  expect(state.leaked).toEqual([]);
});
test('snapshot detail displays exact formula and hides complete-null rows without replacing surviving values', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await api(page, true);
  await page.goto(`/?batchId=${batchA}&view=review`);
  const queue = page.getByRole('region', { name: 'Antrean hipotesis' });
  const item = queue.getByRole('button', { name: /Synthetic original hypothesis/ });
  const box = await item.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  const detail = page.getByRole('region', { name: 'Detail hipotesis' });
  const table = detail.getByRole('table').first();
  const alpha = table.getByRole('columnheader', { name: /Alpha creative/ });
  const alphaIndex = await alpha.evaluate((element) => [...element.parentElement!.children].indexOf(element));
  const beta = table.getByRole('columnheader', { name: /Beta creative/ });
  const betaIndex = await beta.evaluate((element) => [...element.parentElement!.children].indexOf(element));
  const viewsRow = table.locator('tr').filter({ hasText: 'Tayangan' });
  const savesRow = table.locator('tr').filter({ hasText: 'Simpan' });
  const rateRow = table.locator('tr').filter({ hasText: 'Engagement rate' });
  const commentsRow = table.locator('tr').filter({ hasText: 'Komentar' });
  const likesRow = table.locator('tr').filter({ hasText: 'Suka' });
  await expect(table.getByText('Rumus metrics-v2: 19 ÷ 192 = 9,90%')).toBeVisible();
  await expect(commentsRow.locator('td[data-label="Alpha creative"]')).toHaveText('');
  await expect(detail.getByText('2 field kosong disembunyikan.')).toBeVisible();
  await expect(viewsRow.locator('td').nth(alphaIndex - 1)).toContainText('236');
  await expect(likesRow.locator('td').nth(alphaIndex - 1)).toContainText('27');
  await expect(savesRow.locator('td').nth(alphaIndex - 1)).toContainText('1');
  await expect(table.locator('tr').filter({ hasText: 'Bagikan' }).locator('td').first()).toContainText('2');
  await detail.getByRole('button', { name: 'Lihat field kosong' }).click();
  await expect(commentsRow.locator('td[data-label="Alpha creative"]')).toContainText('Belum tersedia');
  await expect(commentsRow.locator('td[data-label="Alpha creative"]')).toContainText('MISSING_METRIC');
  await expect(commentsRow.locator('td[data-label="Beta creative"]')).toHaveText('0');
  await expect(table.getByText('Rumus metrics-v2: 19 ÷ 192 = 9,90%')).toBeVisible();
});

test('feature evidence groups same exact content and field while preserving historical and current values', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await api(page, false, true);
  await page.goto(`/?batchId=${batchA}&view=review`);
  const queue = page.getByRole('region', { name: 'Antrean hipotesis' });
  const item = queue.getByRole('button', { name: /Synthetic original hypothesis/ });
  const box = await item.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  const detail = page.getByRole('region', { name: 'Detail hipotesis' });
  await detail.getByRole('tab', { name: 'Ekstraksi AI', exact: true }).click();
  const features = detail.locator('#review-panel-extraction');
  const featureGroups = features.locator('article.evidence-source');
  const format = featureGroups.filter({ hasText: 'format' });
  await expect(format).toHaveCount(1);
  await expect(format).toContainText('Basis saat hipotesis dibuat: A');
  await expect(format).not.toContainText('Basis saat hipotesis dibuat: B');
  await expect(format.getByText('Nilai sumber terkini: B (Dikonfirmasi)', { exact: true })).toHaveCount(1);
  await expect(featureGroups.filter({ hasText: 'opening_style' })).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('exact frozen metric snapshots render side by side with raw delta and source timestamps', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await api(page);
  await page.goto(`/?batchId=${batchA}&view=review`);
  const queue = page.getByRole('region', { name: 'Antrean hipotesis' });
  await queue.getByRole('button', { name: /Synthetic original hypothesis/ }).click();
  const detail = page.getByRole('region', { name: 'Detail hipotesis' });
  await detail.getByRole('tab', { name: 'Metrik', exact: true }).click();
  const table = detail.getByRole('table').first();
  await expect(table).toContainText('Alpha creative');
  await expect(table).toContainText('Beta creative');
  await expect(table).toContainText('27');
  await expect(table).toContainText('19');
  await expect(table).toContainText('2,82 poin persentase');
  await expect(detail.getByRole('region', { name: 'Sumber snapshot' })).toContainText('6 Okt 2026, 15.14 WIB');
  await expect(detail.getByText('Selisih waktu snapshot lebih dari 1 jam: 6,15 jam', { exact: true })).toBeVisible();
  await expect(detail.locator('details').evaluateAll((elements) => elements.every((element) => element instanceof HTMLDetailsElement && !element.open))).resolves.toBe(true);
});
test('null metric cells are hidden with exact count and toggle while valid zero stays visible', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await api(page, true);
  await page.goto(`/?batchId=${batchA}&view=review`);
  const queue = page.getByRole('region', { name: 'Antrean hipotesis' });
  await queue.getByRole('button', { name: /Synthetic original hypothesis/ }).click();
  const detail = page.getByRole('region', { name: 'Detail hipotesis' });
  await detail.getByRole('tab', { name: 'Metrik', exact: true }).click();
  const table = detail.getByRole('table').first();
  await expect(detail.getByText('2 field kosong disembunyikan.')).toBeVisible();
  const commentsRow = table.getByRole('row').filter({ hasText: 'Komentar' });
  const alphaCell = commentsRow.locator('td[data-label="Alpha creative"]');
  const betaCell = commentsRow.locator('td[data-label="Beta creative"]');
  await expect(alphaCell).toHaveText('');
  await expect(betaCell).toHaveText('0');
  await detail.getByRole('button', { name: 'Lihat field kosong' }).click();
  await expect(alphaCell).toContainText('Belum tersedia');
  await expect(alphaCell).toContainText('MISSING_METRIC');
  await expect(betaCell).toHaveText('0');
});
test('review detail tabs keep claim visible and scope exact evidence to selected panel', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await api(page);
  await page.goto(`/?batchId=${batchA}&view=review`);
  const queue = page.getByRole('region', { name: 'Antrean hipotesis' });
  await queue.getByRole('button', { name: /Synthetic original hypothesis/ }).click();
  const detail = page.getByRole('region', { name: 'Detail hipotesis' });
  await expect(detail.locator('.hypothesis-claim')).toBeVisible();
  await expect(detail.locator('#review-panel-metrics')).toBeVisible();
  const technicalTab = detail.getByRole('tab', { name: 'Teknis', exact: true });
  const box = await technicalTab.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  await expect(detail.locator('#review-panel-technical')).toBeVisible();
  await expect(detail.locator('#review-panel-metrics')).toBeHidden();
  await expect(detail.getByRole('heading', { name: 'Klaim', exact: true })).toBeVisible();
  await detail.getByRole('tab', { name: 'Kriteria', exact: true }).click();
  await expect(detail.locator('#review-panel-criteria')).toBeVisible();
  await expect(detail.locator('#review-panel-technical')).toBeHidden();
});

for (const viewport of [{ width: 1280, height: 900 }, { width: 1440, height: 900 }, { width: 390, height: 844 }]) test(`review list, detail, and decision viewport ${viewport.width}`, async ({ page }) => {
  await page.setViewportSize(viewport);
  await api(page);
  await page.goto(`/?batchId=${batchA}&view=review`);
  const queue = page.getByRole('region', { name: 'Antrean hipotesis' });
  await expect(queue.getByRole('button', { name: /Synthetic original hypothesis/ })).toBeVisible();
  await page.screenshot({ path: `/tmp/cic-pr34-review-queue-${viewport.width}.png` });
  const queueItem = queue.getByRole('button', { name: /Synthetic original hypothesis/ });
  const queueBox = await queueItem.boundingBox();
  expect(queueBox).not.toBeNull();
  await page.mouse.move(queueBox!.x + queueBox!.width / 2, queueBox!.y + queueBox!.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  const detail = page.getByRole('region', { name: 'Detail hipotesis' });
  const technicalTab = detail.getByRole('tab', { name: 'Teknis', exact: true });
  const technicalBox = await technicalTab.boundingBox();
  expect(technicalBox).not.toBeNull();
  await technicalTab.click();
  await expect(detail.locator('#review-panel-technical')).toBeVisible();
  await expect(detail.locator('#review-panel-metrics')).toBeHidden();
  await detail.getByRole('tab', { name: 'Metrik', exact: true }).click();
  const decision = detail.getByRole('button', { name: 'Setujui', exact: true });
  await expect(detail.getByRole('table')).toBeVisible();
  await expect(decision).toBeVisible();
  expect(await detail.locator('.decision-region').evaluate((element) => getComputedStyle(element).position)).toBe('fixed');
  const decisionBox = await decision.boundingBox();
  expect(decisionBox).not.toBeNull();
  expect(decisionBox!.height).toBeGreaterThanOrEqual(44);
  expect(decisionBox!.y + decisionBox!.height).toBeLessThanOrEqual(viewport.height);
  if (viewport.width >= 1280) {
    await expect(detail.locator('.hypothesis-claim')).toBeInViewport();
    await expect(detail.getByRole('region', { name: 'Sumber snapshot' })).toBeInViewport();
  }
  await page.screenshot({ path: `/tmp/cic-pr34-review-detail-${viewport.width}.png` });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(decision).toBeInViewport();
  await page.screenshot({ path: `/tmp/cic-pr34-review-sticky-${viewport.width}.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const group = detail.getByRole('table').first();
  if (viewport.width < 850) {
    await expect(group.locator('.snapshot-metric-name').first()).toHaveCSS('white-space', 'nowrap');
    await expect(group.locator('.snapshot-metric-name').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);
    const mobileValues = group.locator('.metric-data-row').first().locator('.snapshot-mobile-values > span');
    await expect(mobileValues).toHaveText(['Alpha creative: 236', 'Beta creative: 192']);
    expect(await mobileValues.evaluateAll((values) => values.every((value) => !value.textContent?.trimStart().startsWith('·')))).toBe(true);
    await expect(group.locator('.metric-data-row').first().locator('td').first()).toBeHidden();
    await expect(group.locator('.metric-data-row').first().locator('td').nth(1)).toBeHidden();
  }
  await expect(group).toContainText('12,71%');
  await expect(group).toContainText('9,90%');
  await expect(group).toContainText('2,82 poin persentase');
  await detail.getByRole('tab', { name: 'Ekstraksi AI', exact: true }).click();
  await expect(detail.locator('article.evidence-source')).toHaveCount(2);
  const extracted = detail.locator('article.evidence-source').filter({ hasText: 'cta_type' });
  await expect(extracted).toContainText('Nilai sumber terkini: AI soft sell; hasil review direct pitch (Dikoreksi)');
  await expect(extracted.locator('a[href$="#content-feature-cta"]')).toBeVisible();
  await extracted.locator('a[href$="#content-feature-cta"]').click();
  await expect(page.locator('#content-feature-cta')).toBeVisible();
  await expect(page).toHaveURL(/view=library.*hypothesisId=.*#content-feature-cta/);
  await expect(detail.locator('details').evaluateAll((elements) => elements.every((element) => element instanceof HTMLDetailsElement && !element.open))).resolves.toBe(true);

});
