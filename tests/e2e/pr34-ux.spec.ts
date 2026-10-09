import { test, expect, type Page } from '@playwright/test';
import fixture from './fixtures/workspace.json';

const batchA = fixture.batches[0].id as keyof typeof fixture.contentsByBatch;
const batchB = fixture.batches[1].id as keyof typeof fixture.contentsByBatch;
const hypothesisId = '91000000-0000-4000-8000-000000000001';
const otherId = '91000000-0000-4000-8000-000000000002';

async function api(page: Page) {
  const reviews: Record<string, unknown>[] = [];
  const notes: Record<string, unknown>[] = [];
  const nextTests: Record<string, unknown>[] = [];
  const leaked: string[] = [];
  let failQueue = false;
  const hypothesis = (id: string) => ({ id, batchId: batchA, statement: id === hypothesisId ? 'Synthetic original hypothesis' : 'Other original hypothesis', confidence: 'LOW', confidenceCaps: [{ rule: 'INSUFFICIENT_SAMPLE', reason: 'sample too small' }, { rule: 'ONE_COMPARISON', reason: 'one pair' }, { rule: 'LEGACY_ONLY', reason: 'legacy only' }], suggestedNextTest: '{"action":"Repeat","controls":[true,null,"text"]}', evidence: [{ id: 'e-1', layer: 'OBSERVED', statement: 'Historical raw evidence', role: 'SUPPORTING', source_type: 'VIDEO_FRAME', link: `/?batchId=${batchA}&contentId=${fixture.contentsByBatch[batchA][0].id}#video-frame-last-frame` }] });
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const post = request.method() !== 'GET' ? request.postDataJSON() : null;
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
      if (id) return route.fulfill({ json: hypothesis(id) });
      if (failQueue) { failQueue = false; return route.fulfill({ status: 503, json: { error: 'Synthetic queue read failed' } }); }
      return route.fulfill({ json: { items: url.searchParams.get('batchId') === batchB ? [] : [hypothesisId, otherId].map((id) => ({ ...hypothesis(id), reviewDecision: id === hypothesisId ? reviews.at(-1)?.decision ?? null : 'APPROVE', reviewedStatement: id === hypothesisId ? reviews.at(-1)?.reviewedStatement ?? null : null })) } });
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

for (const width of [1440, 375]) test(`persisted review queue, draft isolation and four-view layout ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
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
  await expect(detail.getByText('Isi nama reviewer untuk menyimpan keputusan', { exact: true })).toBeVisible();
  await expect(detail.getByLabel('Reviewer', { exact: true })).toBeFocused();
  expect(state.reviews).toHaveLength(0);
  await expect(detail.locator('details').filter({ has: page.locator('summary', { hasText: 'Buat uji berikutnya' }) })).not.toHaveAttribute('open');
  await detail.getByLabel('Reviewer', { exact: true }).fill('synthetic analyst');
  await detail.getByRole('button', { name: 'Edit', exact: true }).click();
  await detail.getByLabel('Pernyataan hasil edit').fill('Reviewed synthetic hypothesis');
  await detail.getByRole('button', { name: 'Simpan edit' }).click();
  await expect(queue.getByRole('button', { name: /Synthetic original hypothesis/ })).toHaveCount(0);
  await expect(detail.getByText('Hasil review terbaru: Reviewed synthetic hypothesis')).toBeVisible();
  await detail.getByLabel('Penulis', { exact: true }).fill('synthetic analyst');
  await detail.getByLabel('Notes', { exact: true }).fill('Saved synthetic note');
  await detail.getByRole('button', { name: 'Simpan Notes', exact: true }).click();
  await detail.locator('summary').filter({ hasText: 'Buat uji berikutnya' }).click();
  for (const label of ['Variabel yang diuji', 'Varian A', 'Varian B', 'Kontrol', 'Hasil yang diharapkan', 'Penanggung jawab', 'Metrik keberhasilan', 'Periode pengukuran']) await detail.getByLabel(label, { exact: true }).fill(`Synthetic ${label}`);
  await detail.getByRole('button', { name: 'Buat Next Test', exact: true }).click();
  await detail.getByLabel('Notes', { exact: true }).fill('Draft for first hypothesis');
  await queue.getByRole('button', { name: 'Semua', exact: true }).click();
  await queue.getByRole('button', { name: /Other original hypothesis/ }).click();
  await expect(page.getByLabel('Notes', { exact: true }).filter({ visible: true })).toHaveValue('');
  await page.goBack();
  await expect(detail.getByRole('textbox', { name: 'Notes', exact: true })).toHaveValue('Draft for first hypothesis');
  await page.goForward();
  await expect(page).toHaveURL(new RegExp(otherId));
  await page.goBack();
  await page.reload();
  await expect(page.getByText('Saved synthetic note', { exact: true })).toBeVisible();
  await expect(page.getByText('Synthetic Variabel yang diuji', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Hasil review terbaru: Reviewed synthetic hypothesis')).toBeVisible();
  await detail.getByRole('textbox', { name: 'Notes', exact: true }).fill('Draft survives source navigation');
  await detail.getByRole('link', { name: 'Buka sumber exact' }).click();
  await expect(page.locator('#video-frame-last-frame')).toBeVisible();
  await expect(page).toHaveURL(/view=library.*hypothesisId=.*#video-frame-last-frame/);
  await page.getByRole('navigation', { name: 'Workspace analyst' }).getByRole('link', { name: 'Review', exact: true }).click();
  await expect(detail.getByRole('textbox', { name: 'Notes', exact: true })).toHaveValue('Draft survives source navigation');
  for (const view of ['Batch', 'Library', 'Compare', 'Review']) {
    await page.getByRole('navigation', { name: 'Workspace analyst' }).getByRole('link', { name: view, exact: true }).click();
    await expect(page.getByRole('button', { name: 'Data uji synthetic' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 375) {
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

test('queue failure has working retry and reviewed deep link survives empty default', async ({ page }) => {
  const state = await api(page);
  state.failQueue();
  await page.goto(`/?batchId=${batchA}&view=review&hypothesisId=${otherId}`);
  await expect(page.getByText('Synthetic queue read failed')).toBeVisible();
  await page.getByRole('button', { name: 'Coba lagi', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Antrean hipotesis' }).getByRole('button', { name: /Synthetic original hypothesis/ })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Detail hipotesis' }).getByText('Other original hypothesis', { exact: true })).toBeVisible();
  expect(state.leaked).toEqual([]);
});
