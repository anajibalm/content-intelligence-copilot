import { test, expect } from '@playwright/test';
import fixture from './fixtures/workspace.json';

for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 812 }]) {
  test(`shell navigation and exact evidence disclosure ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const batch = fixture.batches[0];
    const contents = fixture.contentsByBatch[batch.id as keyof typeof fixture.contentsByBatch];
    const content = contents[0];
    await page.route('**/api/**', (route) => route.fulfill({ status: 500, json: { error: 'Unmapped fixture API' } }));
    await page.route('**/api/hypotheses?**', (route) => route.fulfill({ json: { items: [] } }));
    await page.route('**/api/workspace**', (route) => route.fulfill({ json: { batches: fixture.batches, selectedBatch: batch, contents, selectedContent: { ...content, frames: [{ id: 'opening', type: 'HOOK', timestampMs: 0, available: false, url: null }, { id: 'last-frame', type: 'SCENE', timestampMs: 9000, available: false, url: null }], transcript: [{ id: 'last-segment', startMs: 9000, endMs: 10000, text: 'Exact transcript target', role: 'CTA' }], audio: { available: false, url: null }, anchors: [], extraction: [] }, analysis: null } }));
    await page.route('**/api/processing**', (route) => route.fulfill({ json: { items: [] } }));
    await page.goto(`/?batchId=${batch.id}&contentId=${content.id}`);
    const nav = page.getByRole('navigation', { name: 'Workspace analyst' });
    await expect(nav).toBeVisible();
    await page.screenshot({ path: `/tmp/cic-pr34-batch-${viewport.width}.png`, fullPage: true });
    for (const name of ['Library', 'Compare', 'Review', 'Batch']) {
      await nav.getByRole('link', { name, exact: true }).click();
      await expect(nav.getByRole('link', { name, exact: true })).toHaveAttribute('aria-current', 'page');
    }
    await page.goto(`/?batchId=${batch.id}&contentId=${content.id}#video-frame-last-frame`);
    await expect(page.locator('#video-frame-last-frame')).toBeVisible();
    await expect(page.locator('details').filter({ has: page.locator('#video-frame-last-frame') })).toHaveAttribute('open', '');
    await page.goto(`/?batchId=${batch.id}&contentId=${content.id}#transcript-segment-last-segment`);
    await expect(page.locator('#transcript-segment-last-segment')).toBeVisible();
    await expect(page.getByText('Exact transcript target')).toBeVisible();
    await page.reload();
    await expect(page.locator('#transcript-segment-last-segment')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/cic-pr34-library-${viewport.width}.png`, fullPage: true });
  });
}
