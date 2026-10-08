import { test, expect, type Page } from '@playwright/test';
import fixture from './fixtures/workspace.json';

const batchA = fixture.batches[0].id;
const batchB = fixture.batches[1].id;
const contentA = fixture.contentsByBatch[batchA as keyof typeof fixture.contentsByBatch][0];
const job = { id: 'job-a', contentId: contentA.id, sourceUrl: 'https://www.tiktok.com/@synthetic/video/123456789', status: 'PENDING', attemptCount: 0, error: null };

async function workspace(page: Page, completed: () => boolean = () => false) {
  await page.route('**/api/workspace?**', async (route) => {
    const batchId = new URL(route.request().url()).searchParams.get('batchId') ?? batchA;
    const batch = fixture.batches.find((item) => item.id === batchId)!;
    const contents = fixture.contentsByBatch[batchId as keyof typeof fixture.contentsByBatch];
    const selected = contents[0];
    await route.fulfill({ json: { batches: fixture.batches, selectedBatch: batch, contents, selectedContent: { ...selected, title: completed() ? 'Worker result available' : selected.title, frames: [], audio: { available: false, url: null }, transcript: [], anchors: [], extraction: [] }, analysis: null } });
  });
}

async function submit(page: Page) {
  await page.getByLabel('Public TikTok URL').fill(job.sourceUrl);
  await page.getByRole('button', { name: 'Process video', exact: true }).click();
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
  await expect(page.getByText('No processing jobs for this batch.')).toBeVisible();
  await submit(page);
  const panel = page.getByLabel('Batch processing status');
  await expect(panel).toContainText('PENDING');
  status = 'RUNNING';
  await expect(panel).toContainText('RUNNING', { timeout: 7000 });
  fail = true;
  await expect(page.getByRole('alert').filter({ hasText: 'Batch job status unavailable' })).toBeVisible({ timeout: 7000 });
  status = 'COMPLETED';
  await expect(panel).toContainText('COMPLETED', { timeout: 10000 });
  await expect(page.getByRole('heading', { name: 'Worker result available', exact: true })).toBeVisible();
  const settled = gets;
  await page.waitForTimeout(2500);
  expect(gets).toBe(settled);
  await submit(page);
  await expect(panel).toContainText('PENDING');
  status = 'FAILED';
  await expect(panel).toContainText('FAILED', { timeout: 7000 });
  await submit(page);
  await expect(panel).toContainText('PENDING');
  status = 'COMPLETED';
  await expect(panel).toContainText('COMPLETED', { timeout: 7000 });
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
    return route.fulfill({ json: { items: [] } });
  });
  await page.goto(`/?batchId=${batchA}`);
  await submit(page);
  await start;
  await page.getByRole('combobox', { name: 'Select batch' }).selectOption(batchB);
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
  await expect(page.getByRole('button', { name: 'Retry status' })).toBeVisible({ timeout: 10000 });
  await expect.poll(() => gets).toBe(3);
  await page.waitForTimeout(2500);
  expect(gets).toBe(3);
  failed = false;
  await page.getByRole('button', { name: 'Retry status' }).click();
  await expect(page.getByText('No processing jobs for this batch.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry status' })).toHaveCount(0);
});
