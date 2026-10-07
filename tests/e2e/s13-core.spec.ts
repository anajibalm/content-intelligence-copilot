import { expect, test } from '@playwright/test';

const batchId = process.env.CIC_S13_BATCH_ID ?? '30000000-0000-0000-0000-000000000003';
const contentWithActualMedia = process.env.CIC_S13_CONTENT_ID ?? 'c338b3f5-b451-4f69-bc66-7e1b7d29a298';
const comparisonId = process.env.CIC_S13_COMPARISON_ID ?? 'a2783852-cf84-43f7-99d6-2041add02c9c';
const hypothesisId = process.env.CIC_S13_HYPOTHESIS_ID ?? '1bd7e6ed-3006-493f-a506-646edd742b14';

test.describe('S13 actual staging core', () => {
  test.skip(!process.env.CIC_S13_ACTUAL, 'opt-in integrated staging only');
  test.setTimeout(180_000);

  test('actual media through compare, hypothesis, review, note, Next Test, and reload', async ({ page, request }) => {
    const workspace = await request.get(`/api/workspace?batchId=${batchId}&contentId=${contentWithActualMedia}`);
    expect(workspace.status()).toBe(200);
    const workspaceBody = await workspace.json();
    expect(workspaceBody.contents.length).toBeGreaterThanOrEqual(10);
    const completed = workspaceBody.contents.filter((content: { acquisitionState: string; processingState: string }) => content.acquisitionState === 'SUCCEEDED' && content.processingState === 'COMPLETED');
    expect(completed.length).toBeGreaterThanOrEqual(10);
    expect(workspaceBody.selectedContent.id).toBe(contentWithActualMedia);
    expect(workspaceBody.selectedContent.frames.length).toBeGreaterThan(0);
    expect(workspaceBody.selectedContent.transcript.length).toBeGreaterThan(0);
    expect(workspaceBody.selectedContent.extraction.length).toBeGreaterThan(0);

    const comparisonResponse = await request.get(`/api/comparisons?comparisonId=${comparisonId}`);
    expect(comparisonResponse.status()).toBe(200);
    const comparison = await comparisonResponse.json();
    expect(comparison.id).toBe(comparisonId);
    expect(comparison.items.some((item: { contentId: string }) => item.contentId === contentWithActualMedia)).toBe(true);
    expect(comparison.quality).toMatch(/LOW|UNAVAILABLE/);

    const hypothesisResponse = await request.get(`/api/hypotheses?hypothesisId=${hypothesisId}`);
    expect(hypothesisResponse.status()).toBe(200);
    const hypothesis = await hypothesisResponse.json();
    expect(hypothesis.id).toBe(hypothesisId);
    expect(hypothesis.batchId).toBe(batchId);
    expect(hypothesis.provider).toBe('9router');
    expect(hypothesis.evidence.length).toBeGreaterThan(0);

    const reviewHistory = await request.get(`/api/hypotheses/review?hypothesisId=${hypothesis.id}`);
    expect(reviewHistory.status()).toBe(200);
    expect((await reviewHistory.json()).reviews.some((review: { decision: string; reasonCode: string }) => review.decision === 'REJECT' && review.reasonCode === 'OVERCLAIM')).toBe(true);
    const history = await request.get(`/api/hypotheses/${hypothesis.id}/s10`);
    expect(history.status()).toBe(200);
    const historyBody = await history.json();
    expect(historyBody.notes.some((note: { body: string }) => note.body.includes('actual-media core path'))).toBe(true);
    expect(historyBody.nextTests.some((item: { variableToTest: string }) => item.variableToTest.includes('Organic metric availability'))).toBe(true);

    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`/?batchId=${batchId}&contentId=${contentWithActualMedia}&hypothesisId=${hypothesis.id}`);
    await expect(page.getByText(`Artifact ${hypothesis.id} · confidence ${hypothesis.confidence}`, { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('S13 actual-media core path: extraction and metrics remain bounded by available evidence; review rejected overclaim.', { exact: true })).toBeVisible();
    await expect(page.getByText('reviewed extraction and Organic metric availability', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText(`Artifact ${hypothesis.id} · confidence ${hypothesis.confidence}`, { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('S13 actual-media core path: extraction and metrics remain bounded by available evidence; review rejected overclaim.', { exact: true })).toBeVisible();
    expect(errors).toEqual([]);

    const persisted = await request.get(`/api/hypotheses?hypothesisId=${hypothesis.id}`);
    expect(persisted.status()).toBe(200);
    expect((await persisted.json()).id).toBe(hypothesis.id);
  });
});
