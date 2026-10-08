import { randomUUID } from 'node:crypto';
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
    await page.route('**/api/processing', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      const response = await route.fetch();
      initialJob = await response.json() as ProcessingJob;
      await route.fulfill({ response, body: JSON.stringify(initialJob) });
    });
    await page.goto('/');
    await page.getByLabel('Public TikTok URL').fill(freshUrl!);
    await page.getByRole('button', { name: 'Process video' }).click();
    await expect.poll(() => initialJob, { timeout: 30_000 }).not.toBeNull();
    const createdJob = initialJob as unknown as ProcessingJob;
    expect(createdJob.id).toBeTruthy();
    expect(createdJob.sourceUrl).toBe(freshUrl);

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

    const operationId = randomUUID();
    const hypothesisResponse = await request.post('/api/hypotheses', { headers: { 'idempotency-key': operationId }, data: { batchId, comparisonId: comparison.id, operationId } });
    expect(hypothesisResponse.status()).toBe(201);
    const hypothesis = await hypothesisResponse.json() as { id: string; batchId: string; provider: string; evidence: Array<{ link: string | null }> };
    expect(hypothesis.id).toBeTruthy();
    expect(hypothesis.batchId).toBe(batchId);
    expect(hypothesis.provider).toBe('9router');
    expect(hypothesis.evidence.length).toBeGreaterThan(0);

    await page.goto(`/?batchId=${batchId}&contentId=${job.contentId}&hypothesisId=${hypothesis.id}`);
    await expect(page.getByText(`Artifact ${hypothesis.id} · confidence`, { exact: false })).toBeVisible({ timeout: 30_000 });
    const exactLink = page.locator('.hypothesis-result a').filter({ hasText: 'Buka sumber exact' }).first();
    await expect(exactLink).toBeVisible();
    const sourceUrl = new URL((await exactLink.getAttribute('href'))!, page.url());
    expect(sourceUrl.searchParams.get('batchId')).toBe(batchId);
    expect(sourceUrl.searchParams.get('contentId')).toBe(job.contentId);
    expect(sourceUrl.hash).toMatch(/^#(?:metric-snapshot|transcript-segment|video-frame|content-feature)-/);
    await exactLink.click();
    await expect(page).toHaveURL(sourceUrl.href);
    await expect(page.locator(sourceUrl.hash)).toBeVisible();
    await page.goto(`/?batchId=${batchId}&contentId=${job.contentId}&hypothesisId=${hypothesis.id}`);
    await expect(page.getByText(`Artifact ${hypothesis.id} · confidence`, { exact: false })).toBeVisible({ timeout: 30_000 });
    const hypothesisReview = page.locator('.hypothesis-result .review-panel');
    await hypothesisReview.getByLabel('Reviewer').fill('s13-e2e-analyst');
    await hypothesisReview.getByLabel('Reject reason (required for Reject)').selectOption('OVERCLAIM');
    const reviewResponse = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/hypotheses/review' && response.request().method() === 'POST');
    await hypothesisReview.getByRole('button', { name: 'Reject', exact: true }).click();
    expect((await reviewResponse).status()).toBe(201);
    await expect(hypothesisReview.getByText(/REJECT.*OVERCLAIM/)).toBeVisible();

    const s10 = page.locator('.hypothesis-result .s10-panel');
    await s10.getByLabel('Author').fill('s13-e2e-analyst');
    await s10.getByLabel('Note').fill(noteText);
    const noteResponse = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/hypotheses/${hypothesis.id}/s10` && response.request().method() === 'POST');
    await s10.getByRole('button', { name: 'Save note', exact: true }).click();
    expect((await noteResponse).status()).toBe(201);
    await expect(s10.getByText(noteText, { exact: true })).toBeVisible();

    await s10.getByLabel('Variable yang diuji').fill(nextTestText);
    await s10.getByLabel('Variant A').fill('Current opening');
    await s10.getByLabel('Variant B').fill('Alternative opening');
    await s10.getByLabel('Controls').fill('Same audience and offer');
    await s10.getByLabel('Expected result').fill('Higher qualified retention');
    await s10.getByLabel('Owner').fill('s13-e2e-analyst');
    await s10.getByLabel('Success metric').fill('Organic retention');
    await s10.getByLabel('Measurement window').fill('7 days');
    const nextTestResponse = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/hypotheses/${hypothesis.id}/s10` && response.request().method() === 'POST');
    await s10.getByRole('button', { name: 'Create Next Test', exact: true }).click();
    expect((await nextTestResponse).status()).toBe(201);
    await expect(s10.getByText(nextTestText, { exact: true })).toBeVisible();

    const replayResponse = await request.post('/api/processing', { data: { url: freshUrl } });
    expect(replayResponse.status()).toBe(202);
    const replayJob = await replayResponse.json() as ProcessingJob;
    expect(replayJob.id).toBe(job.id);
    expect(replayJob.contentId).toBe(job.contentId);

    await page.reload();
    await expect(page.getByText(`Artifact ${hypothesis.id} · confidence`, { exact: false })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(noteText, { exact: true })).toBeVisible();
    await expect(page.getByText(nextTestText, { exact: true })).toBeVisible();
    const persistedReview = await request.get(`/api/hypotheses/review?hypothesisId=${hypothesis.id}`);
    expect(persistedReview.status()).toBe(200);
    expect((await persistedReview.json()).reviews.some((review: { decision: string; reasonCode: string }) => review.decision === 'REJECT' && review.reasonCode === 'OVERCLAIM')).toBe(true);
    expect(errors).toEqual([]);
  });
});
