import { test, expect, type Page } from '@playwright/test';
import fixture from './fixtures/workspace.json';

const batchA = fixture.batches[0].id;
const batchB = fixture.batches[1].id;
const contentA = fixture.contentsByBatch[batchA as keyof typeof fixture.contentsByBatch][0];
const job = { id: 'job-a', contentId: contentA.id, sourceUrl: 'https://www.tiktok.com/@synthetic/video/123456789', status: 'PENDING', attemptCount: 0, error: null };

async function workspace(page: Page, completed: () => boolean = () => false) {
  await page.route('**/api/**', (route) => route.fulfill({ status: 500, json: { error: 'Unmapped fixture API' } }));
  await page.route('**/api/hypotheses?**', (route) => route.fulfill({ json: { items: [] } }));
  await page.route('**/api/workspace?**', async (route) => {
    const batchId = new URL(route.request().url()).searchParams.get('batchId') ?? batchA;
    const batch = fixture.batches.find((item) => item.id === batchId)!;
    const contents = fixture.contentsByBatch[batchId as keyof typeof fixture.contentsByBatch];
    const selected = contents[0];
    await route.fulfill({ json: { batches: fixture.batches, selectedBatch: batch, contents, selectedContent: { ...selected, title: completed() ? 'Worker result available' : selected.title, frames: [], audio: { available: false, url: null }, transcript: [], anchors: [], extraction: [] }, analysis: null } });
  });
}

async function submit(page: Page) {
  await page.getByLabel('URL TikTok publik').fill(job.sourceUrl);
  await page.getByRole('button', { name: 'Proses video', exact: true }).click();
}

test('empty queue restarts after submit and retry, transient errors recover, terminal refreshes detail', async ({ page }) => {
  let status = 'EMPTY';
  let gets = 0;
  let fail = false;
  await workspace(page, () => status === 'COMPLETED');
  await page.route('**/api/processing**', async (route) => {
    if (route.request().method() === 'POST') { status = 'PENDING'; return route.fulfill({ status: 202, json: { ...job, status } }); }
    gets++;
    if (fail) { fail = false; return route.fulfill({ status: 503, json: { error: 'synthetic status failure' } }); }
    return route.fulfill({ json: { items: status === 'EMPTY' ? [] : [{ ...job, status }] } });
  });
  await page.goto(`/?batchId=${batchA}&contentId=${contentA.id}`);
  await expect(page.getByText('Belum ada job processing pada batch ini.')).toBeVisible();
  await submit(page);
  const panel = page.getByLabel('Status processing batch');
  await expect(panel).toContainText('Menunggu');
  status = 'RUNNING';
  await expect(panel).toContainText('Diproses', { timeout: 7000 });
  fail = true;
  await expect(page.getByRole('alert').filter({ hasText: 'Batch job status unavailable' })).toBeVisible({ timeout: 7000 });
  status = 'COMPLETED';
  await expect(panel).toContainText('Selesai', { timeout: 10000 });
  await page.getByRole('link', { name: 'Library', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Worker result available', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Batch', exact: true }).click();
  const settled = gets;
  await page.waitForTimeout(2500);
  expect(gets).toBe(settled);
  await submit(page);
  await expect(panel).toContainText('Menunggu');
  status = 'FAILED';
  await expect(panel).toContainText('Gagal', { timeout: 7000 });
  await panel.getByRole('button', { name: 'Coba lagi', exact: true }).click();
  await expect(panel).toContainText('Menunggu');
  status = 'COMPLETED';
  await expect(panel).toContainText('Selesai', { timeout: 7000 });
});

test('delayed POST cannot restore old batch and unmount stops polling', async ({ page }) => {
  let release!: () => void;
  let started!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const start = new Promise<void>((resolve) => { started = resolve; });
  await workspace(page);
  let gets = 0;
  await page.route('**/api/processing**', async (route) => {
    if (route.request().method() === 'POST') { started(); await pending; return route.fulfill({ status: 202, json: job }).catch(() => {}); }
    gets++;
    const batchId = new URL(route.request().url()).searchParams.get('batchId');
    return route.fulfill({ json: { items: batchId === batchB ? [{ ...job, status: 'RUNNING' }] : [] } });
  });
  await page.goto(`/?batchId=${batchA}`);
  await submit(page);
  await start;
  await page.getByRole('combobox', { name: 'Pilih batch' }).selectOption(batchB);
  await expect(page).toHaveURL(new RegExp(`batchId=${batchB}`));
  release();
  await expect(page.getByRole('heading', { name: fixture.batches[1].name, exact: true })).toBeVisible();
  await page.waitForTimeout(2500);
  await expect(page).toHaveURL(new RegExp(`batchId=${batchB}`));
  await page.goto('about:blank');
  const stopped = gets;
  await page.waitForTimeout(2500);
  expect(gets).toBe(stopped);
});

test('status failures stop automatic retries after three attempts and manual retry restarts', async ({ page }) => {
  await workspace(page);
  let gets = 0;
  let failed = true;
  await page.route('**/api/processing**', async (route) => {
    gets++;
    return failed ? route.fulfill({ status: 503, json: { error: 'synthetic status failure' } }) : route.fulfill({ json: { items: [] } });
  });
  await page.goto(`/?batchId=${batchA}`);
  await expect(page.getByRole('button', { name: 'Coba lagi status' })).toBeVisible({ timeout: 10000 });
  await expect.poll(() => gets).toBe(3);
  await page.waitForTimeout(2500);
  expect(gets).toBe(3);
  failed = false;
  await page.getByRole('button', { name: 'Coba lagi status' }).click();
  await expect(page.getByText('Belum ada job processing pada batch ini.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Coba lagi status' })).toHaveCount(0);
});
