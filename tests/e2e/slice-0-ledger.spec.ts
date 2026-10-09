import { expect, test, type Page, type Route } from '@playwright/test';
import workspace from './fixtures/workspace.json';

type Body = Record<string, unknown>;
const batchId = workspace.batches[0].id;
const contentId = workspace.contentsByBatch[batchId as keyof typeof workspace.contentsByBatch][0].id;
const hypothesisId = '35000000-0000-4000-8000-000000000001';

function body(route: Route): Body {
  const value = route.request().postDataJSON();
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected JSON object');
  return value as Body;
}

function features() {
  return Array.from({ length: 13 }, (_, index) => ({
    id: `active-${index}`,
    extractionRunId: 'active-run',
    fieldName: `field_${index}`,
    aiValue: `ai ${index}`,
    reviewedValue: index === 11 ? 'human correction' : index === 12 ? 'ai 12' : null,
    reviewState: index === 11 ? 'CORRECTED' : index === 12 ? 'CONFIRMED' : 'UNREVIEWED',
    provider: 'synthetic-pr34', model: 'fixture', promptVersion: 'fixture', schemaVersion: 'fixture', inputHash: 'fixture',
  })).concat(Array.from({ length: 13 }, (_, index) => ({
    id: `historic-${index}`,
    extractionRunId: 'historic-run',
    fieldName: `historic_${index}`,
    aiValue: `historic ${index}`,
    reviewedValue: null,
    reviewState: 'UNREVIEWED',
    provider: 'synthetic-pr34', model: 'fixture', promptVersion: 'fixture', schemaVersion: 'fixture', inputHash: 'fixture',
  })));
}

async function installApi(page: Page) {
  const reviewPosts: Body[] = [];
  const hypothesisPosts: Body[] = [];
  const leaked: string[] = [];
  const contents = workspace.contentsByBatch[batchId as keyof typeof workspace.contentsByBatch].map((content, index) => index === 0 ? { ...content, title: null, externalId: 'copy-full-external-id' } : content);
  const selected = contents[0];
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/workspace') return route.fulfill({ json: {
      batches: workspace.batches,
      selectedBatch: workspace.batches[0],
      contents,
      synthetic: true,
      analysis: { synthetic: true, ranking: { status: 'READY', reason: null, rankedGroups: [], excluded: [] }, kpis: [], snapshots: [] },
      selectedContent: { ...selected, frames: [], audio: { available: false, url: null }, transcript: [], anchors: [], extraction: features() },
    } });
    if (url.pathname === '/api/processing') return route.fulfill({ json: { items: [] } });
    if (url.pathname.endsWith(`/contents/${contentId}/review`)) {
      if (route.request().method() === 'GET') return route.fulfill({ json: { contentId, reviews: [], corrections: [] } });
      reviewPosts.push(body(route));
      return route.fulfill({ status: 201, json: { ok: true } });
    }
    if (url.pathname === '/api/hypotheses/review') {
      if (route.request().method() === 'GET') return route.fulfill({ json: { reviews: [] } });
      hypothesisPosts.push(body(route));
      return route.fulfill({ status: 201, json: { id: 'review', hypothesisId, decision: body(route).decision, reasonCode: null, editedStatement: null, reviewedStatement: 'Synthetic hypothesis', goldenLabel: false, reviewer: 'reviewer', note: null, createdAt: '2026-10-09T00:00:00Z' } });
    }
    if (url.pathname === '/api/hypotheses') {
      if (route.request().method() === 'GET') {
        if (url.searchParams.has('hypothesisId')) return route.fulfill({ json: { id: hypothesisId, batchId, statement: 'Synthetic hypothesis', confidence: 'LOW', confidenceCaps: [], suggestedNextTest: null, evidence: [] } });
        return route.fulfill({ json: { items: [{ id: hypothesisId, batchId, statement: 'Synthetic hypothesis', confidence: 'LOW', confidenceCaps: [], suggestedNextTest: null, evidence: [], reviewDecision: null }] } });
      }
      return route.fulfill({ status: 201, json: { id: hypothesisId, batchId, statement: 'Synthetic hypothesis', confidence: 'LOW', confidenceCaps: [], suggestedNextTest: null, evidence: [] } });
    }
    if (url.pathname.endsWith('/s10')) return route.fulfill({ json: { batches: workspace.batches, notes: [], nextTests: [] } });
    if (url.pathname === '/api/comparisons') return route.fulfill({ status: 201, json: { id: 'comparison', ruleVersion: 'compare-v2', mode: 'CONTROLLED', scope: 'PAIR', distribution: 'ORGANIC', quality: 'LOW', qualityReasons: [], snapshotIds: [], controlledVariables: {}, uncontrolledVariables: {}, items: [], metricRows: [] } });
    leaked.push(url.pathname);
    return route.fulfill({ status: 500, json: { error: 'Unmapped fixture API' } });
  });
  return { reviewPosts, hypothesisPosts, leaked };
}

test('review validates inline before POST and confirms only active eligible fields', async ({ page }) => {
  const api = await installApi(page);
  await page.goto(`/?batchId=${batchId}&contentId=${contentId}&view=library`);
  const panel = page.locator('.content-detail .review-panel');
  const confirm = panel.getByRole('button', { name: 'Konfirmasi 11 field yang belum direview' });
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(panel.getByText('Isi nama reviewer untuk menyimpan keputusan', { exact: true })).toBeVisible();
  await expect(panel.getByLabel('Reviewer')).toBeFocused();
  expect(api.reviewPosts).toEqual([]);
  await panel.getByLabel('Reviewer').fill('  analyst  ');
  await confirm.click();
  await expect.poll(() => api.reviewPosts.length).toBe(1);
  expect(api.reviewPosts[0].extractionRunId).toBe('active-run');
  expect(api.reviewPosts[0].reviewer).toBe('analyst');
  await page.reload();
  await panel.getByLabel('Reviewer').fill('analyst');
  await panel.getByRole('button', { name: 'Tolak semua' }).click();
  await expect(panel.getByText('Pilih alasan penolakan untuk menyimpan keputusan', { exact: true })).toBeVisible();
  await expect(panel.getByLabel('Alasan penolakan (wajib untuk Tolak semua)')).toBeFocused();
  expect(api.reviewPosts).toHaveLength(1);
  expect(api.leaked).toEqual([]);
});

test('reject validation prioritizes reviewer then requires reason without POST', async ({ page }) => {
  const api = await installApi(page);
  await page.goto(`/?batchId=${batchId}&contentId=${contentId}&view=library`);
  const panel = page.locator('.content-detail .review-panel');
  await panel.getByRole('button', { name: 'Tolak semua' }).click();
  await expect(panel.getByText('Isi nama reviewer untuk menyimpan keputusan', { exact: true })).toBeVisible();
  await expect(panel.getByText('Pilih alasan penolakan untuk menyimpan keputusan', { exact: true })).toBeVisible();
  await expect(panel.getByLabel('Reviewer')).toBeFocused();
  await panel.getByLabel('Reviewer').fill('analyst');
  await panel.getByRole('button', { name: 'Tolak semua' }).click();
  await expect(panel.getByLabel('Alasan penolakan (wajib untuk Tolak semua)')).toBeFocused();
  expect(api.reviewPosts).toEqual([]);
});

test('hypothesis validation, compare adjacency, synthetic disclosure, and copy preserve selection', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const api = await installApi(page);
  await page.goto(`/?batchId=${batchId}&contentId=${contentId}&view=review&hypothesisId=${hypothesisId}`);
  const hypothesisPanel = page.locator('.hypothesis-detail .review-panel');
  const approve = hypothesisPanel.getByRole('button', { name: 'Setujui', exact: true });
  await expect(approve).toBeEnabled();
  await approve.click();
  await expect(hypothesisPanel.getByText('Isi nama reviewer untuk menyimpan keputusan', { exact: true })).toBeVisible();
  await expect(hypothesisPanel.getByLabel('Reviewer')).toBeFocused();
  expect(api.hypothesisPosts).toEqual([]);
  await page.getByRole('navigation', { name: 'Workspace analyst' }).getByRole('link', { name: 'Compare', exact: true }).click();
  await expect(page.getByText('0 dari minimal 2 dipilih', { exact: true })).toBeVisible();
  const actions = page.locator('.compare-actions');
  await expect(actions.getByText('Pilih minimal dua konten', { exact: true })).toBeVisible();
  await page.locator('.compare-choice').nth(0).click();
  await expect(page.getByText('1 dari minimal 2 dipilih', { exact: true })).toBeVisible();
  await page.locator('.compare-choice').nth(1).click();
  await expect(page.getByText('2 dari minimal 2 dipilih', { exact: true })).toBeVisible();
  await expect(actions.getByText('Pilih minimal dua konten', { exact: true })).toHaveCount(0);
  await page.getByRole('navigation', { name: 'Workspace analyst' }).getByRole('link', { name: 'Library', exact: true }).click();
  const chip = page.getByRole('button', { name: 'Data uji synthetic' });
  await chip.click();
  await expect(page.getByRole('dialog')).toContainText('Persetujuan di sini bukan persetujuan brand nyata.');
  await page.getByRole('dialog').getByRole('button', { name: 'Tutup' }).click();
  await expect(chip).toBeFocused();
  await expect(page.getByText('Penyimpanan Postgres')).toHaveCount(0);
  const selectedRow = page.locator('.content-row').first();
  await selectedRow.getByRole('button', { name: 'Salin ID copy-full-external-id' }).click();
  await expect(selectedRow).toContainText('ID disalin');
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('copy-full-external-id');
  await expect(page).toHaveURL(new RegExp(`contentId=${contentId}`));
  const sizes = await page.locator('.content-row small, .review-panel label, .compare-panel .muted').evaluateAll((nodes) => nodes.filter((node) => node.checkVisibility()).map((node) => `${node.closest('.content-row')?.className ?? node.className}: ${getComputedStyle(node).fontSize}`));
  expect(sizes.every((size) => Number.parseFloat(size.split(': ')[1]) >= 12), `visible font sizes: ${sizes.join(', ')}`).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(api.leaked).toEqual([]);
});
