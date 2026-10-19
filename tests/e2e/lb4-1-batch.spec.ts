import { expect, test, type Page } from '@playwright/test';
import fixture from './fixtures/workspace.json';

const batchA = fixture.batches[0];
const batchB = fixture.batches[1];
const baseA = fixture.contentsByBatch[batchA.id as keyof typeof fixture.contentsByBatch];
const baseB = fixture.contentsByBatch[batchB.id as keyof typeof fixture.contentsByBatch];

// Batches list keeps existing IDs/order; only batch A count is raised to the 12-member scenario.
const batches = fixture.batches.map((batch) => batch.id === batchA.id ? { ...batch, contentCount: 12 } : batch);
const emptyBatch = { ...batchA, id: '00000000-0000-4000-8000-0000000000ff', name: 'Synthetic E2E Batch Kosong', contentCount: 0, contractedVideoCount: 0 };

const ids = {
  failed: baseA[0].id,
  missing: baseA[1].id,
  suspect: baseA[2].id,
  zero: '10000000-0000-4000-8000-0000000000d0',
};
const FULL_A = '7635995925688716561';
const FULL_B = '7635997376762645761';

function snapshot(base: { [key: string]: unknown }, overrides: Record<string, unknown>) {
  return { ...structuredClone(base), ...overrides };
}

function buildContentsA() {
  const plain = Array.from({ length: 8 }, (_, index) => ({ ...structuredClone(baseA[index % baseA.length]), id: `10000000-0000-4000-8000-0000000000${10 + index}`, externalId: `e2e-a-${10 + index}`, title: `Creative ${10 + index}` }));
  return [
    {
      ...structuredClone(baseA[0]),
      id: ids.failed,
      externalId: FULL_A,
      title: null,
      processingState: 'FAILED',
      processingError: 'synthetic processing failure',
      attemptCount: 2,
      snapshots: [
        snapshot(baseA[0].snapshots[0], { rawMetrics: { ...baseA[0].snapshots[0].rawMetrics, views: null }, quality: 'MISSING', qualityByMetric: { views: { state: 'MISSING', reason: 'NOT_PROVIDED' } } }),
        structuredClone(baseA[0].snapshots[1]),
      ],
    },
    {
      ...structuredClone(baseA[1]),
      id: ids.missing,
      externalId: FULL_B,
      title: null,
      snapshots: [
        snapshot(baseA[1].snapshots[0], { rawMetrics: { ...baseA[1].snapshots[0].rawMetrics, views: null }, quality: 'MISSING', qualityByMetric: { views: { state: 'MISSING', reason: 'NOT_PROVIDED' } } }),
        snapshot(baseA[1].snapshots[1], { rawMetrics: { ...baseA[1].snapshots[1].rawMetrics, views: null }, quality: 'UNAVAILABLE', qualityByMetric: { views: { state: 'UNAVAILABLE', reason: 'NOT_PROVIDED' } } }),
      ],
    },
    {
      ...structuredClone(baseA[2]),
      id: ids.suspect,
      externalId: 'e2e-a-suspect',
      snapshots: [
        snapshot(baseA[2].snapshots[0], { rawMetrics: { ...baseA[2].snapshots[0].rawMetrics, views: null }, quality: 'SUSPECT', qualityByMetric: { views: { state: 'SUSPECT', reason: 'NOT_PROVIDED' } } }),
        structuredClone(baseA[2].snapshots[1]),
      ],
    },
    {
      ...structuredClone(baseA[0]),
      id: ids.zero,
      externalId: 'e2e-a-zero',
      title: 'Zero creative',
      processingState: 'SUCCEEDED',
      attemptCount: 1,
      snapshots: [
        snapshot(baseA[0].snapshots[0], { rawMetrics: { ...baseA[0].snapshots[0].rawMetrics, views: 0 }, quality: 'VALID', qualityByMetric: {} }),
        structuredClone(baseA[0].snapshots[1]),
      ],
    },
    ...plain,
  ];
}

function buildContentsB() {
  return baseB.map((content) => structuredClone(content));
}

function processingItems(batchId: string) {
  if (batchId !== batchA.id) return [];
  const failed = buildContentsA().find((content) => content.id === ids.failed)!;
  const active = buildContentsA().find((content) => content.id === ids.zero)!;
  return [
    { id: 'job-failed', contentId: failed.id, sourceUrl: failed.permalink, status: 'FAILED', attemptCount: 2, error: 'synthetic processing failure' },
    { id: 'job-active', contentId: active.id, sourceUrl: active.permalink, status: 'RUNNING', attemptCount: 1, error: null },
    { id: 'job-seed-1', contentId: null, sourceUrl: 'https://www.tiktok.com/@synthetic/video/seed-1', status: 'COMPLETED', attemptCount: 1, error: null },
    { id: 'job-seed-2', contentId: null, sourceUrl: 'https://www.tiktok.com/@synthetic/video/seed-2', status: 'COMPLETED', attemptCount: 1, error: null },
    { id: 'job-seed-3', contentId: null, sourceUrl: 'https://www.tiktok.com/@synthetic/video/seed-3', status: 'COMPLETED', attemptCount: 1, error: null },
    { id: 'job-seed-4', contentId: null, sourceUrl: 'https://www.tiktok.com/@synthetic/video/seed-4', status: 'COMPLETED', attemptCount: 1, error: null },
    { id: 'job-seed-5', contentId: null, sourceUrl: 'https://www.tiktok.com/@synthetic/video/seed-5', status: 'COMPLETED', attemptCount: 1, error: null },
    { id: 'job-seed-6', contentId: null, sourceUrl: 'https://www.tiktok.com/@synthetic/video/seed-6', status: 'COMPLETED', attemptCount: 1, error: null },
  ];
}

function analysis(batchId: string) {
  if (batchId === batchB.id) {
    const contents = buildContentsB();
    return {
      synthetic: true,
      kpis: [{ definition: { id: 'kpi-1', metric_name: 'views', distribution: 'ORGANIC', target_value: 2000 }, assessment: { status: 'ACHIEVED', actualValue: 1800, excludedSnapshotIds: [] } }],
      ranking: {
        status: 'READY',
        reason: null,
        rankedGroups: [{ basis: 'views', direction: 'DESC', items: [
          { contentId: contents[0].id, value: 1800, snapshotId: contents[0].snapshots[0].id, basis: { metric: 'views', label: 'Tayangan' } },
          { contentId: contents[1].id, value: 1800, snapshotId: contents[1].snapshots[0].id, basis: { metric: 'views', label: 'Tayangan' } },
        ] }],
        excluded: [],
      },
      snapshots: [],
    };
  }
  return {
    synthetic: true,
    kpis: [],
    ranking: { status: 'UNAVAILABLE', reason: batchId === batchA.id ? 'Belum ada konfigurasi ranking untuk batch ini.' : null, rankedGroups: [], excluded: [] },
    snapshots: [],
  };
}

function detail(content: Record<string, unknown>) {
  return {
    ...structuredClone(content),
    frames: [{ id: 'frame-hook-1', type: 'HOOK', timestampMs: 0, url: null, available: false }],
    audio: { available: false, url: null },
    transcript: [{ id: 'seg-1', startMs: 0, endMs: 1200, text: 'Segmen transkrip synthetic', role: null }],
    anchors: [],
    extraction: [],
  };
}

async function installApi(page: Page) {
  let statusMode: 'ok' | 'error' = 'ok';
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/workspace') {
      const batchId = url.searchParams.get('batchId');
      const batch = [emptyBatch, ...batches].find((item) => item.id === batchId) ?? batchA;
      const contents = batch.id === emptyBatch.id ? [] : batch.id === batchB.id ? buildContentsB() : buildContentsA();
      const content = contents.find((item) => item.id === url.searchParams.get('contentId')) ?? contents[0];
      return route.fulfill({ json: {
        batches: [emptyBatch, ...batches],
        selectedBatch: batch,
        contents,
        synthetic: true,
        analysis: analysis(batch.id),
        selectedContent: content ? detail(content) : null,
      } });
    }
    if (url.pathname === '/api/processing') {
      if (route.request().method() === 'POST') {
        const body = JSON.parse(route.request().postData() ?? '{}') as { url: string; batchId: string };
        return route.fulfill({ status: 202, json: { id: 'retry', contentId: ids.failed, sourceUrl: body.url, status: 'PENDING', attemptCount: 3, error: null } });
      }
      if (statusMode === 'error') return route.fulfill({ status: 503, json: { error: 'synthetic processing status failure' } });
      return route.fulfill({ json: { items: processingItems(url.searchParams.get('batchId') ?? '') } });
    }
    return route.fulfill({ status: 500, json: { error: 'Unmapped fixture API' } });
  });
  return { failStatus: () => { statusMode = 'error'; } };
}

test('AC-01 shell and URL context round-trip', async ({ page }) => {
  await installApi(page);
  await page.goto(`/?batchId=${batchA.id}&contentId=${ids.failed}&view=library#video-frame-frame-hook-1`);
  await expect(page.getByRole('heading', { name: 'Library', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: batchA.name, exact: true })).toBeVisible();
  await expect(page.locator('#video-frame-frame-hook-1')).toBeVisible();
  await page.goto(`/?batchId=${batchA.id}&contentId=${ids.failed}&view=library#transcript-segment-seg-1`);
  await expect(page.locator('#transcript-segment-seg-1')).toBeVisible();
  await page.getByRole('navigation', { name: 'Workspace analyst' }).getByRole('link', { name: 'Batch', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Batch', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Batch', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Library', exact: true })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('heading', { name: 'Batch', exact: true })).toBeVisible();
  await expect(page.getByLabel('Pilih batch')).toHaveValue(batchA.id);
});

test('AC-02 membership counts differ from job ledger and stay honest on load/error', async ({ page }) => {
  const api = await installApi(page);
  const members = page.getByRole('region', { name: 'Anggota batch' });
  const summary = page.locator('.batch-members .section-heading .muted');
  await page.goto(`/?batchId=${batchA.id}&view=batch`);
  await expect(summary).toContainText('12 anggota konten');
  await expect(summary).toContainText('8 job');
  await expect(summary).toContainText('1 aktif');
  await expect(summary).toContainText('1 gagal');
  await expect(members.locator('.content-row')).toHaveCount(12);
  await expect(page.getByLabel('Status processing batch')).toContainText('8 job pada ledger processing');
  await page.getByLabel('Pilih batch').selectOption(emptyBatch.id);
  await expect(summary).toContainText('0 anggota konten');
  await expect(summary).toContainText('0 job');
  api.failStatus();
  await page.getByLabel('Pilih batch').selectOption(batchA.id);
  await expect(page.getByText(/attempt 1\/3/)).toBeVisible();
  await expect(summary).not.toContainText('job processing');
  await expect(summary).toContainText('status job gagal dimuat');
});

test('AC-03 null-title identity, mono IDs, copy, and open in Library', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await installApi(page);
  await page.goto(`/?batchId=${batchA.id}&contentId=${ids.failed}&view=batch`);
  const members = page.getByRole('region', { name: 'Anggota batch' });
  const first = members.locator('.content-row').first();
  await expect(first.getByRole('button').first()).toContainText('Konten TikTok');
  await expect(first.locator('code')).toHaveText(FULL_A);
  await expect(first.locator('code')).toHaveCount(1);
  await expect(first).toContainText('Frame belum tersedia');
  const second = members.locator('.content-row').nth(1);
  await expect(second.getByRole('button').first()).toContainText('Konten TikTok');
  await expect(second.locator('code')).toHaveText(FULL_B);
  await expect(second.locator('code')).toHaveCount(1);
  await first.getByRole('button', { name: `Salin ID ${FULL_A}` }).click();
  await expect(first.getByText('ID disalin', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(FULL_A);
  await expect(page).toHaveURL(new RegExp(`contentId=${ids.failed}`));
  await second.locator('.content-row-select').click();
  await expect(page.getByRole('heading', { name: 'Library', exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.get('contentId')).toBe(ids.missing);
  expect(new URL(page.url()).searchParams.get('batchId')).toBe(batchA.id);
});

test('AC-03b clipboard failure never claims success', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('clipboard unavailable')) } }));
  await installApi(page);
  await page.goto(`/?batchId=${batchA.id}&contentId=${ids.failed}&view=batch`);
  const first = page.getByRole('region', { name: 'Anggota batch' }).locator('.content-row').first();
  await first.getByRole('button', { name: `Salin ID ${FULL_A}` }).click();
  await expect(first.getByText('ID gagal disalin', { exact: true })).toBeVisible();
  await expect(first.getByText('ID disalin', { exact: true })).toHaveCount(0);
});

test('AC-04 metric quality states and separate distributions', async ({ page }) => {
  await installApi(page);
  await page.goto(`/?batchId=${batchA.id}&view=batch`);
  const members = page.getByRole('region', { name: 'Anggota batch' });
  const failed = members.locator('.content-row').first();
  await expect(failed).toContainText('Organik: Tayangan Belum tersedia');
  await expect(failed).toContainText('Belum tersedia · Nilai belum diberikan.');
  const suspect = members.locator('.content-row').filter({ hasText: 'e2e-a-suspect' });
  await expect(suspect).toContainText('Tayangan Belum tersedia');
  await expect(suspect).toContainText('Perlu diperiksa · Nilai belum diberikan.');
  const zero = members.locator('.content-row').filter({ hasText: 'e2e-a-zero' });
  await expect(zero).toContainText('Organik: Tayangan 0');
  await expect(zero).toContainText('Iklan: Tayangan 1100');
  await expect(zero).not.toContainText('Nilai nol belum memiliki penjelasan');
  await expect(zero).toContainText('Akuisisi Berhasil · Processing Berhasil');
});

test('AC-05 failure detail without drill-in and retry POST', async ({ page }) => {
  const posts: Array<{ url: string; batchId: string }> = [];
  await installApi(page);
  await page.route('**/api/processing**', async (route) => {
    if (route.request().method() === 'POST') {
      posts.push(JSON.parse(route.request().postData() ?? '{}'));
      return route.fulfill({ status: 202, json: { id: 'retry', contentId: ids.failed, sourceUrl: posts.at(-1)!.url, status: 'PENDING', attemptCount: 3, error: null } });
    }
    return route.fallback();
  });
  await page.goto(`/?batchId=${batchA.id}&view=batch`);
  const panel = page.getByLabel('Status processing batch');
  await expect(panel).toContainText('synthetic processing failure');
  await expect(panel).toContainText('Percobaan 2');
  await expect(panel.getByText('Detail job').first()).toBeVisible();
  await expect(panel.locator('a.job-source').first()).toBeVisible();
  await expect(panel.locator('a.job-source').first()).toHaveText(/https:\/\/www\.tiktok\.com/);
  await expect(panel.locator('a.job-source').first()).toHaveAttribute('href', /tiktok\.com/);
  await panel.getByRole('button', { name: 'Coba lagi', exact: true }).click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0].batchId).toBe(batchA.id);
  expect(posts[0].url).toContain('tiktok.com');
});

test('AC-06 empty states and available KPI/ranking with ties', async ({ page }) => {
  await installApi(page);
  await page.goto(`/?batchId=${batchA.id}&view=batch`);
  await expect(page.getByText('Belum ada target KPI.', { exact: true })).toBeVisible();
  await expect(page.getByText('Ranking belum tersedia atau belum dikonfigurasi.')).toBeVisible();
  await expect(page.getByText('Alasan teknis ranking')).toBeVisible();
  await page.getByLabel('Pilih batch').selectOption(emptyBatch.id);
  await expect(page.getByRole('region', { name: 'Anggota batch' }).getByText('Belum ada konten pada batch ini. Tambahkan URL dari Batch.')).toBeVisible();
  await page.getByLabel('Pilih batch').selectOption(batchB.id);
  await expect(page.getByText('Belum ada target KPI.')).toHaveCount(0);
  await expect(page.getByText('Terbaik pada basis ini')).toBeVisible();
  await expect(page.getByRole('button', { name: /1800/ }).first()).toBeVisible();
  expect(await page.getByRole('button', { name: /1800/ }).count()).toBeGreaterThanOrEqual(2);
  await expect(page.getByText('Best Overall')).toHaveCount(0);
});

test('AC-07 readability floors and no horizontal overflow', async ({ page }) => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 812 }]) {
    await page.setViewportSize(viewport);
    await installApi(page);
    await page.goto(`/?batchId=${batchA.id}&contentId=${ids.failed}&view=batch`);
    const members = page.getByRole('region', { name: 'Anggota batch' });
    await expect(members.locator('code').first()).toHaveText(FULL_A);
    await expect(members).toContainText('Tayangan Belum tersedia');
    const metadata = await page.locator('.batch-members code, .batch-members .quality-reason, .batch-members .content-status small').evaluateAll((nodes) => nodes.filter((node) => node.checkVisibility()).map((node) => Number.parseFloat(getComputedStyle(node).fontSize)));
    expect(metadata.length).toBeGreaterThan(0);
    expect(metadata.every((size) => size >= 12), `metadata ${metadata.join(', ')}`).toBe(true);
    const metrics = await page.locator('.batch-members .content-status > span').evaluateAll((nodes) => nodes.filter((node) => node.checkVisibility()).map((node) => Number.parseFloat(getComputedStyle(node).fontSize)));
    expect(metrics.every((size) => size >= 13), `metrics ${metrics.join(', ')}`).toBe(true);
    const controls = await page.locator('.copy-id, .ingest-form > .form-row button, .batch-processing button, .batch-picker select').evaluateAll((nodes) => nodes.filter((node) => node.checkVisibility()).map((node) => Number.parseFloat(getComputedStyle(node).fontSize)));
    expect(controls.every((size) => size >= 13), `controls ${controls.join(', ')}`).toBe(true);
    const select = members.locator('.content-row-select').first();
    const copy = members.getByRole('button', { name: `Salin ID ${FULL_A}` });
    expect((await select.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    expect((await copy.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/cic-lb4-1-after-${viewport.width}.png`, fullPage: true });
  }
});

test('AC-07b synthetic chip disclosure keeps existing condition', async ({ page }) => {
  await installApi(page);
  await page.goto(`/?batchId=${batchA.id}&view=batch`);
  const chip = page.getByRole('button', { name: 'Data uji synthetic' });
  await expect(chip).toBeVisible();
  await chip.click();
  await expect(page.getByRole('dialog')).toContainText('bukan persetujuan brand nyata');
  await page.getByRole('dialog').getByRole('button', { name: 'Tutup' }).click();
  await expect(chip).toBeFocused();
  expect(await page.locator('.content-row .synthetic-chip, .content-row [data-synthetic]').count()).toBe(0);
});

test('R40 ledger state ignores delayed prior batch and control borders stay distinct', async ({ page }) => {
  await installApi(page);
  let releaseBatchA: (() => void) | undefined;
  await page.route('**/api/processing**', async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === 'GET' && url.searchParams.get('batchId') === batchA.id) await new Promise<void>((resolve) => { releaseBatchA = resolve; });
    await route.fallback();
  });
  await page.goto(`/?batchId=${batchA.id}&view=batch`);
  const summary = page.locator('.batch-members .section-heading .muted');
  await expect(summary).toContainText('memuat status job');
  await page.getByLabel('Pilih batch').selectOption(batchB.id);
  await expect(summary).toContainText('0 job');
  releaseBatchA?.();
  await page.waitForTimeout(50);
  await expect(summary).not.toContainText('8 job');
  await page.goBack();
  await expect(summary).toContainText('memuat status job');
  releaseBatchA?.();
  const fields = await page.locator('.batch-picker select, .form-row input').evaluateAll((nodes) => nodes.filter((node) => node.checkVisibility()).map((node) => getComputedStyle(node).borderTopColor));
  expect(fields.every((color) => color === 'rgb(118, 133, 139)'), fields.join(', ')).toBe(true);
  const copyControls = await page.locator('.copy-id').evaluateAll((nodes) => nodes.filter((node) => node.checkVisibility()).map((node) => getComputedStyle(node).borderTopColor));
  expect(copyControls.every((color) => color === 'rgb(227, 230, 235)'), copyControls.join(', ')).toBe(true);
});
