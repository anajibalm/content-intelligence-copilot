import { expect, test } from '@playwright/test';

const batchId = process.env.CIC_S13_BATCH_ID ?? '30000000-0000-0000-0000-000000000003';
const knownSecondContentId = process.env.CIC_S13_SECOND_CONTENT_ID ?? '943574e2-406c-427a-b983-1a7852d07149';
const freshUrl = process.env.CIC_S13_FRESH_URL;

type ProcessingJob = {
  id: string;
  contentId: string;
  sourceUrl: string;
  status: string;
  attemptCount: number;
  result: { hookFrames: unknown[]; transcript: { segments: unknown[] } } | null;
};

test.describe('S13 actual staging core', () => {
  test.skip(!process.env.CIC_S13_ACTUAL, 'opt-in integrated staging only');
  test.setTimeout(360_000);

  test('actual media create flow through review, note, Next Test, reload, and replay', async ({ page, request }) => {
    test.skip(!freshUrl, 'CIC_S13_FRESH_URL must be a public, not-yet-completed Barakat URL');
    const unique = Date.now().toString();
    const noteText = `S13 fresh primary E2E ${unique}`;
    const nextTestText = `S13 stability test ${unique}`;
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
    let initialJob: ProcessingJob | null = null;
    let initialPayload: unknown = null;
    await page.route('**/api/processing', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      initialPayload = route.request().postDataJSON();
      const response = await route.fetch();
      initialJob = await response.json() as ProcessingJob;
      await route.fulfill({ response, body: JSON.stringify(initialJob) });
    });
    await page.goto(`/?batchId=${batchId}&view=batch`);
    await page.getByLabel('URL TikTok publik').fill(freshUrl!);
    await page.getByRole('button', { name: 'Proses video' }).click();
    await expect.poll(() => initialJob, { timeout: 30_000 }).not.toBeNull();
    const createdJob = initialJob as unknown as ProcessingJob;
    expect(createdJob.id).toBeTruthy();
    expect(createdJob.sourceUrl).toBe(freshUrl);
    expect(initialPayload).toEqual({ url: freshUrl, batchId });

    await expect.poll(async () => {
      const response = await request.get(`/api/workspace?batchId=${batchId}&contentId=${createdJob.contentId}`);
      expect(response.status()).toBe(200);
      const body = await response.json() as { selectedContent: { processingState: string } | null };
      return body.selectedContent?.processingState ?? null;
    }, { timeout: 300_000, intervals: [1_000, 2_000, 5_000] }).toBe('COMPLETED');
    const job = createdJob;
    const workspace = await request.get(`/api/workspace?batchId=${batchId}&contentId=${job.contentId}`);
    expect(workspace.status()).toBe(200);
    const workspaceBody = await workspace.json();
    expect(workspaceBody.selectedContent.id).toBe(job.contentId);
    expect(workspaceBody.selectedContent.frames.length).toBeGreaterThan(0);
    expect(workspaceBody.selectedContent.transcript.length).toBeGreaterThan(0);
    expect(workspaceBody.selectedContent.extraction.length).toBeGreaterThan(0);

    const comparisonResponse = await request.post('/api/comparisons', { data: { batchId, contentIds: [job.contentId, knownSecondContentId], mode: 'CONTROLLED', scope: 'PAIR', distribution: 'ORGANIC' } });
    expect(comparisonResponse.status()).toBe(201);
    const comparison = await comparisonResponse.json() as { id: string; items: Array<{ contentId: string }>; quality: string };
    expect(comparison.id).toBeTruthy();
    expect(comparison.items.map((item) => item.contentId)).toEqual([job.contentId, knownSecondContentId]);
    expect(comparison.quality).toMatch(/LOW|UNAVAILABLE/);

    const operationId = comparison.id;
    const hypothesisResponse = await request.post('/api/hypotheses', { headers: { 'idempotency-key': operationId }, data: { batchId, comparisonId: comparison.id, operationId } });
    expect(hypothesisResponse.status()).toBe(201);
    const hypothesis = await hypothesisResponse.json() as { id: string; batchId: string; provider: string; evidence: Array<{ link: string | null }> };
    expect(hypothesis.id).toBeTruthy();
    expect(hypothesis.batchId).toBe(batchId);
    expect(hypothesis.provider).toBe('9router');
    expect(hypothesis.evidence.length).toBeGreaterThan(0);

    await page.goto(`/?batchId=${batchId}&contentId=${job.contentId}&view=review&hypothesisId=${hypothesis.id}`);
    const detail = page.locator(`[data-hypothesis-id="${hypothesis.id}"]`);
    await expect(detail).toBeVisible({ timeout: 30_000 });
    const exactLink = detail.getByRole('link', { name: 'Buka sumber exact' }).first();
    await expect(exactLink).toBeVisible();
    const sourceUrl = new URL((await exactLink.getAttribute('href'))!, page.url());
    expect(sourceUrl.searchParams.get('batchId')).toBe(batchId);
    expect(sourceUrl.searchParams.get('contentId')).toBe(job.contentId);
    expect(sourceUrl.hash).toMatch(/^#(?:metric-snapshot|transcript-segment|video-frame|content-feature)-/);
    await exactLink.click();
    await expect(page).toHaveURL(sourceUrl.href);
    await expect(page.locator(sourceUrl.hash)).toBeVisible();
    await page.goto(`/?batchId=${batchId}&contentId=${job.contentId}&view=review&hypothesisId=${hypothesis.id}`);
    await expect(detail).toBeVisible({ timeout: 30_000 });
    const hypothesisReview = detail.locator('.review-panel');
    await hypothesisReview.getByLabel('Reviewer').fill('s13-e2e-analyst');
    await hypothesisReview.getByLabel('Alasan penolakan (wajib untuk Tolak)').selectOption('OVERCLAIM');
    const reviewResponse = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/hypotheses/review' && response.request().method() === 'POST');
    await hypothesisReview.getByRole('button', { name: 'Tolak', exact: true }).click();
    expect((await reviewResponse).status()).toBe(201);
    await expect(hypothesisReview.locator('.review-history')).toBeVisible();

    const s10 = detail.locator('.s10-panel');
    await s10.getByLabel('Penulis').fill('s13-e2e-analyst');
    await s10.getByLabel('Notes').fill(noteText);
    const noteResponse = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/hypotheses/${hypothesis.id}/s10` && response.request().method() === 'POST');
    await s10.getByRole('button', { name: 'Simpan Notes', exact: true }).click();
    expect((await noteResponse).status()).toBe(201);
    await expect(s10.getByText(noteText, { exact: true })).toBeVisible();

    await s10.getByRole('button', { name: 'Buat uji berikutnya', exact: true }).click();
    await s10.getByLabel('Variabel yang diuji').fill(nextTestText);
    await s10.getByLabel('Varian A').fill('Current opening');
    await s10.getByLabel('Varian B').fill('Alternative opening');
    await s10.getByLabel('Kontrol').fill('Same audience and offer');
    await s10.getByLabel('Hasil yang diharapkan').fill('Higher qualified retention');
    await s10.getByLabel('Penanggung jawab').fill('s13-e2e-analyst');
    await s10.getByLabel('Metrik keberhasilan').fill('Organic retention');
    await s10.getByLabel('Periode pengukuran').fill('7 days');
    const nextTestResponse = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/hypotheses/${hypothesis.id}/s10` && response.request().method() === 'POST');
    await s10.getByRole('button', { name: 'Buat Next Test', exact: true }).click();
    expect((await nextTestResponse).status()).toBe(201);
    await expect(s10.getByText(nextTestText, { exact: true })).toBeVisible();

    const replayResponse = await request.post('/api/processing', { data: { url: freshUrl, batchId } });
    expect(replayResponse.status()).toBe(202);
    const replayJob = await replayResponse.json() as ProcessingJob;
    expect(replayJob.id).toBe(job.id);
    expect(replayJob.contentId).toBe(job.contentId);

    await page.reload();
    await expect(detail).toBeVisible({ timeout: 30_000 });
    await expect(detail.getByText(noteText, { exact: true })).toBeVisible();
    await expect(detail.getByText(nextTestText, { exact: true })).toBeVisible();
    const persistedReview = await request.get(`/api/hypotheses/review?hypothesisId=${hypothesis.id}`);
    expect(persistedReview.status()).toBe(200);
    expect((await persistedReview.json()).reviews.some((review: { decision: string; reasonCode: string }) => review.decision === 'REJECT' && review.reasonCode === 'OVERCLAIM')).toBe(true);
    expect(errors).toEqual([]);
  });
});
