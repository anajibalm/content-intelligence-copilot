import { expect, test, type Page, type Route, type TestInfo } from '@playwright/test';
import workspace from './fixtures/workspace.json';

type Body = Record<string, unknown>;

const batch = workspace.batches[0];
const base = workspace.contentsByBatch[batch.id as keyof typeof workspace.contentsByBatch][0];
const mediaUrl = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="90" height="160"%3E%3Crect width="90" height="160" fill="%23155eef"/%3E%3C/svg%3E';

const ids = {
  mixed: 'lb4-2-mixed',
  unreviewed: 'lb4-2-unreviewed',
  reviewed: 'lb4-2-reviewed',
  noFrames: 'lb4-2-no-frames',
};

function features(runId: string, state: 'MIXED' | 'UNREVIEWED' | 'REVIEWED', historical = false) {
  return Array.from({ length: 13 }, (_, index) => {
    const reviewState = historical ? 'UNREVIEWED' : state === 'UNREVIEWED' ? 'UNREVIEWED' : state === 'REVIEWED' ? 'CONFIRMED' : index === 11 ? 'CORRECTED' : index === 12 ? 'CONFIRMED' : 'UNREVIEWED';
    return {
      id: `${runId}-${index}`,
      extractionRunId: runId,
      fieldName: index === 0 ? 'hook_type' : index === 11 ? 'cta_type' : `field_${index}`,
      aiValue: `AI original ${runId} ${index}`,
      reviewedValue: reviewState === 'CORRECTED' ? `Reviewed ${runId} ${index}` : reviewState === 'CONFIRMED' ? `AI original ${runId} ${index}` : null,
      reviewState,
      provider: 'synthetic-library',
      model: 'library-v1',
      promptVersion: 'prompt-v1',
      schemaVersion: 'schema-v1',
      inputHash: `sha256:${runId}`,
    };
  });
}

function content(id: string, title: string | null, extractionState: 'MIXED' | 'UNREVIEWED' | 'REVIEWED') {
  return {
    ...structuredClone(base),
    id,
    externalId: id === ids.mixed ? '7635995925688716561' : id === ids.unreviewed ? '7635997376762645761' : id,
    title,
    snapshots: [
      {
        ...structuredClone(base.snapshots[0]),
        id: `${id}-organic`,
        distribution: 'ORGANIC',
        source: 'synthetic_source',
        capturedAt: '2026-10-12T07:00:00.000Z',
        rawMetrics: { views: 0, likes: 10, comments: null, shares: 0, saves: 2 },
        quality: 'SUSPECT',
        qualityByMetric: {
          views: { state: 'VALID', reason: null },
          likes: { state: 'VALID', reason: null },
          comments: { state: 'MISSING', reason: 'NOT_PROVIDED' },
          shares: { state: 'SUSPECT', reason: 'UNEXPLAINED_ZERO' },
          saves: { state: 'VALID', reason: null },
          engagement_rate: { state: 'SUSPECT', reason: 'INVALID_VALUE' },
        },
        derivedMetrics: { engagement_rate: { value: null, formulaVersion: 'metrics-v2', sourceMetricNames: ['likes', 'comments', 'shares', 'saves', 'views'] } },
      },
      {
        ...structuredClone(base.snapshots[1]),
        id: `${id}-paid`,
        distribution: 'PAID',
        source: null,
        capturedAt: null,
        rawMetrics: { views: 12, likes: 1, comments: 0, shares: 0, saves: 0 },
        quality: 'VALID',
        qualityByMetric: {
          views: { state: 'VALID', reason: null },
          likes: { state: 'VALID', reason: null },
          comments: { state: 'VALID', reason: null },
          shares: { state: 'VALID', reason: null },
          saves: { state: 'VALID', reason: null },
          engagement_rate: { state: 'VALID', reason: null },
        },
        derivedMetrics: { engagement_rate: { value: 1 / 12, formulaVersion: 'metrics-v2', sourceMetricNames: ['likes', 'comments', 'shares', 'saves', 'views'] } },
      },
    ],
    extraction: [
      ...features(`${id}-active`, extractionState),
      ...features(`${id}-historic`, 'UNREVIEWED', true),
    ],
  };
}

const contents = [
  content(ids.mixed, null, 'MIXED'),
  content(ids.unreviewed, null, 'UNREVIEWED'),
  content(ids.reviewed, 'Semua direview', 'REVIEWED'),
  content(ids.noFrames, 'Tanpa frame', 'MIXED'),
];

function detail(selectedId: string) {
  const selected = contents.find((item) => item.id === selectedId) ?? contents[0];
  return {
    ...selected,
    frames: selected.id === ids.noFrames ? [] : [
      { id: 'hook-0', type: 'HOOK', timestampMs: 0, available: true, url: mediaUrl },
      { id: 'hook-1500', type: 'HOOK', timestampMs: 1500, available: true, url: mediaUrl },
      { id: 'hook-3000', type: 'HOOK', timestampMs: 3000, available: false, url: null },
      { id: 'scene-6000', type: 'SCENE', timestampMs: 6000, available: false, url: null },
    ],
    audio: { available: false, url: null },
    transcript: [
      { id: 'segment-0', startMs: 0, endMs: 1000, text: 'Pembuka synthetic', role: 'HOOK' },
      { id: 'segment-1', startMs: 1000, endMs: 3000, text: 'CTA synthetic', role: 'CTA' },
    ],
    anchors: [],
  };
}

function postBody(route: Route): Body {
  const body = route.request().postDataJSON();
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Expected review JSON body');
  return body as Body;
}

async function installApi(page: Page) {
  const posts: Body[] = [];
  const history = {
    contentId: ids.mixed,
    reviews: [{ id: 'historic-confirm', contentFeatureId: `${ids.mixed}-active-0`, extractionRunId: `${ids.mixed}-active`, fieldName: 'hook_type', decision: 'CONFIRM', reasonCode: null, reviewedValue: 'AI original', goldenLabel: false, reviewer: 'analyst', note: 'catatan event', createdAt: '2026-10-12T07:01:00.000Z' }],
    corrections: [{ id: 'historic-correction', contentFeatureId: `${ids.mixed}-active-11`, extractionRunId: `${ids.mixed}-active`, fieldName: 'cta_type', originalAiValue: 'AI original', correctedValue: 'Reviewed', reasonCode: 'WRONG_CLASSIFICATION', reviewer: 'analyst', note: 'catatan koreksi', createdAt: '2026-10-12T07:02:00.000Z' }],
  };
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/workspace') {
      const selectedId = url.searchParams.get('contentId') ?? ids.mixed;
      return route.fulfill({ json: { synthetic: true, batches: [batch], selectedBatch: batch, contents, selectedContent: detail(selectedId), analysis: null } });
    }
    if (url.pathname === '/api/processing') return route.fulfill({ json: { items: [] } });
    if (url.pathname.endsWith('/review')) {
      if (route.request().method() === 'GET') return route.fulfill({ json: history });
      posts.push(postBody(route));
      return route.fulfill({ status: 201, json: { ok: true } });
    }
    if (url.pathname === '/api/hypotheses') return route.fulfill({ json: { items: [] } });
    return route.fulfill({ status: 500, json: { error: 'Unmapped fixture API' } });
  });
  return { posts };
}

async function capture(page: Page, testInfo: TestInfo, state: string) {
  await page.screenshot({ path: testInfo.outputPath(`${state}.png`) });
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 812 }]) {
  test(`Library evidence and fingerprint ledger ${viewport.width}`, async ({ page, context }, testInfo) => {
    await page.setViewportSize(viewport);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const api = await installApi(page);
    await page.goto(`/?batchId=${batch.id}&contentId=${ids.mixed}&view=library`);
    await capture(page, testInfo, `mixed-${viewport.width}`);

    const library = page.locator('.view-library');
    await expect(library.getByText('Ringkasan media', { exact: true })).toBeVisible();
    await expect(library.locator('.primary-media figure')).toHaveCount(3);
    await expect(library.locator('summary', { hasText: /Frame lainnya \(1\)/ })).toBeVisible();
    await expect(library.getByText('Kartu bukti metrik', { exact: true })).toBeVisible();
    await expect(library.getByText('Rincian teknis snapshot', { exact: true }).first()).toBeVisible();
    await library.getByText('Rincian teknis snapshot', { exact: true }).first().click();
    await expect(library.getByText('Observasi mentah', { exact: true }).first()).toBeVisible();
    await expect(library.getByText('Hasil perhitungan', { exact: true }).first()).toBeVisible();
    await expect(library.getByText('Versi formula', { exact: true }).first()).toBeVisible();
    await expect(library.getByText('metrics-v2', { exact: true }).first()).toBeVisible();
    await expect(library.locator('.metric-card .quality-reason', { hasText: 'Nilai nol belum memiliki penjelasan atau provenance yang memadai.' }).first()).toBeVisible();

    await expect(library.getByText('11 field perlu perhatian', { exact: true })).toBeVisible();
    await expect(library.locator('summary', { hasText: /Semua field aktif \(13\)/ })).toBeVisible();
    await expect(library.locator('summary', { hasText: /Run historis \(1 run, 13 field\)/ })).toBeVisible();
    await expect(page.locator(`#content-feature-${ids.mixed}-historic-0`)).toHaveCount(1);
    await expect(library.getByText('Riwayat review (append-only)', { exact: true })).toBeVisible();
    await expect(library.locator('.review-history li', { hasText: 'catatan koreksi' })).toBeVisible();

    await page.goto(`/?batchId=${batch.id}&contentId=${ids.mixed}&view=library#video-frame-scene-6000`);
    await expect(page.locator('#video-frame-scene-6000')).toBeVisible();
    await expect(page.locator('details').filter({ has: page.locator('#video-frame-scene-6000') })).toHaveAttribute('open', '');
    await page.goto(`/?batchId=${batch.id}&contentId=${ids.mixed}&view=library#content-feature-${ids.mixed}-historic-0`);
    await expect(page.locator(`#content-feature-${ids.mixed}-historic-0`)).toBeVisible();
    await expect(page.locator('details').filter({ has: page.locator(`#content-feature-${ids.mixed}-historic-0`) })).toHaveAttribute('open', '');
    await page.reload();
    await expect(page.locator(`#content-feature-${ids.mixed}-historic-0`)).toBeVisible();

    await page.getByRole('button', { name: /Konfirmasi 11 field yang belum direview/ }).click();
    await expect(page.getByText('Isi nama reviewer untuk menyimpan keputusan', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Reviewer', { exact: true })).toBeFocused();
    expect(api.posts).toHaveLength(0);
    const metadata = await library.locator('.metric-card small, .fingerprint-summary, .review-history, .content-name code').evaluateAll((nodes) => nodes.filter((node) => node.checkVisibility()).map((node) => Number.parseFloat(getComputedStyle(node).fontSize)));
    expect(metadata.length).toBeGreaterThan(0);
    expect(metadata.every((size) => size >= 12), `metadata ${metadata.join(', ')}`).toBe(true);
    const decisions = await library.locator('.fingerprint-summary strong, .review-actions button, .metric-card strong').evaluateAll((nodes) => nodes.filter((node) => node.checkVisibility()).map((node) => Number.parseFloat(getComputedStyle(node).fontSize)));
    expect(decisions.every((size) => size >= 13), `decisions ${decisions.join(', ')}`).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 812 }]) {
test(`Library reports review counts and absent frames honestly ${viewport.width}`, async ({ page, context }, testInfo) => {
  await page.setViewportSize(viewport);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await installApi(page);
  await page.goto(`/?batchId=${batch.id}&contentId=${ids.unreviewed}&view=library`);
  await expect(page.getByText('13 field perlu perhatian', { exact: true })).toBeVisible();
  await capture(page, testInfo, `unreviewed-${viewport.width}`);
  await page.getByRole('button', { name: /Salin ID 7635997376762645761/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'ID disalin' }).first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('7635997376762645761');

  await page.locator('.workspace-columns .content-row', { hasText: 'Semua direview' }).locator('.content-row-select').click();
  await expect(page.getByText('0 field perlu perhatian', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Konfirmasi 0 field yang belum direview/ })).toBeDisabled();
  await capture(page, testInfo, `reviewed-${viewport.width}`);

  await page.locator('.workspace-columns .content-row', { hasText: 'Tanpa frame' }).locator('.content-row-select').click();
  await expect(page.getByText('Frame belum tersedia untuk konten ini.', { exact: true })).toBeVisible();
  await expect(page.locator('.primary-media figure')).toHaveCount(0);
  await capture(page, testInfo, `no-frames-${viewport.width}`);
});
}
