import { expect, test, type Page, type Route, type TestInfo } from '@playwright/test';
import workspace from './fixtures/workspace.json';

type Value = Record<string, unknown>;

const batchA = workspace.batches[0];
const batchB = workspace.batches[1];
const content = workspace.contentsByBatch[batchA.id as keyof typeof workspace.contentsByBatch][0];
const ids = {
  first: '4b000000-0000-4000-8000-000000000001',
  second: '4b000000-0000-4000-8000-000000000002',
  note: '4b000000-0000-4000-8000-000000000011',
  plan: '4b000000-0000-4000-8000-000000000021',
};
const note = { id: ids.note, body: 'Catatan tersimpan\ndua baris.', author: 'analyst-a', updatedAt: '2026-10-13T08:00:00.000Z' };
const plan = {
  id: ids.plan,
  hypothesisId: ids.first,
  variableToTest: 'Gaya pembuka',
  variantA: 'Pernyataan langsung',
  variantB: 'Pertanyaan',
  controls: 'Durasi sama',
  expectedResult: 'Simpan naik',
  owner: 'analyst-a',
  successMetric: 'Rasio simpan',
  measurementWindow: '7 hari',
  targetBatchId: batchB.id,
  status: 'PROPOSED',
  updatedAt: '2026-10-13T08:00:00.000Z',
};

type State = { notes: Value[]; plans: Value[]; failRefresh: boolean; failWrite: boolean; delayWrite: boolean; notePosts: number; planPosts: number; statusPatches: number };

function hypothesis(id: string) {
  return { id, batchId: batchA.id, statement: `Hipotesis ${id}`, state: 'OPEN', confidence: 'LOW', confidenceCaps: [], provider: 'synthetic', model: 'fixture', promptVersion: 'fixture', schemaVersion: 'fixture', ruleVersion: 'fixture', inputHash: 'fixture', rawOutput: '{}', suggestedNextTest: { action: 'Tetap saran' }, evidence: [] };
}

function delay(milliseconds: number) {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, milliseconds);
  return promise;
}

async function installApi(page: Page, state: State) {
  await page.route('**/api/**', async (route: Route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (url.pathname === '/api/workspace') return route.fulfill({ json: { synthetic: true, batches: [batchA, batchB], selectedBatch: batchA, contents: [content], selectedContent: { ...content, frames: [], audio: { available: false, url: null }, transcript: [], anchors: [], extraction: [] }, analysis: { synthetic: true, ranking: { status: 'READY', reason: null, rankedGroups: [], excluded: [] }, kpis: [], snapshots: [] } } });
    if (url.pathname === '/api/processing') return route.fulfill({ json: { items: [] } });
    if (url.pathname === '/api/hypotheses') {
      const id = url.searchParams.get('hypothesisId');
      return route.fulfill({ json: id ? hypothesis(id) : { items: [
        { id: ids.first, batchId: batchA.id, statement: hypothesis(ids.first).statement, confidence: 'LOW', reviewDecision: null, reviewedStatement: null },
        { id: ids.second, batchId: batchA.id, statement: hypothesis(ids.second).statement, confidence: 'LOW', reviewDecision: null, reviewedStatement: null },
      ] } });
    }
    if (url.pathname === '/api/hypotheses/review') return route.fulfill({ json: { hypothesisId: url.searchParams.get('hypothesisId'), reviews: [] } });
    const s10 = `/api/hypotheses/${ids.first}/s10`;
    if (url.pathname === s10) {
      if (method === 'GET') {
        if (state.failRefresh) return route.fulfill({ status: 500, json: { error: 'Daftar S10 gagal dimuat' } });
        return route.fulfill({ json: { hypothesisId: ids.first, batches: [batchA, batchB], notes: state.notes, nextTests: state.plans } });
      }
      const body = route.request().postDataJSON() as Value;
      if (body.kind === 'NOTE') {
        state.notePosts += 1;
        if (state.delayWrite) await delay(250);
        if (state.failWrite) return route.fulfill({ status: 500, json: { error: 'Catatan gagal tersimpan' } });
        state.notes = [{ ...note, body: body.body, author: body.author }];
      }
      if (body.kind === 'NEXT_TEST') { state.planPosts += 1; state.plans = [{ ...plan, ...body }]; }
      return route.fulfill({ status: 201, json: state.notes[0] ?? state.plans[0] });
    }
    if (url.pathname === `${s10}/notes/${ids.note}`) {
      if (method !== 'PATCH') return route.fulfill({ status: 405 });
      const body = route.request().postDataJSON() as Value;
      state.notes = [{ ...state.notes[0], body: body.body, author: body.author }];
      return route.fulfill({ json: state.notes[0] });
    }
    if (url.pathname === `${s10}/next-tests/${ids.plan}`) {
      if (method !== 'PATCH') return route.fulfill({ status: 405 });
      const body = route.request().postDataJSON() as Value;
      if (Object.keys(body).length === 1 && body.status) state.statusPatches += 1;
      state.plans = [{ ...state.plans[0], ...body }];
      return route.fulfill({ json: state.plans[0] });
    }
    return route.fulfill({ status: 500, json: { error: `Unmapped fixture API: ${url.pathname}` } });
  });
}

async function open(page: Page, hypothesisId = ids.first) {
  await page.goto(`/?batchId=${batchA.id}&contentId=${content.id}&view=review&hypothesisId=${hypothesisId}`);
  return page.getByRole('region', { name: 'Catatan dan Rencana Uji' });
}

async function screenshot(page: Page, testInfo: TestInfo, name: string) {
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 812 }]) {
  test(`AC-01 read-first records at ${viewport.width}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const state: State = { notes: [note], plans: [plan], failRefresh: false, failWrite: false, delayWrite: false, notePosts: 0, planPosts: 0, statusPatches: 0 };
    await installApi(page, state);
    const panel = await open(page);
    await expect(panel.getByRole('heading', { name: 'Catatan', exact: true })).toBeVisible();
    await expect(panel.getByText(note.body, { exact: true })).toBeVisible();
    await expect(panel.getByText(`${note.author} · ${note.updatedAt}`, { exact: true })).toBeVisible();
    await expect(panel.getByRole('heading', { name: 'Rencana Uji', exact: true })).toBeVisible();
    await expect(panel.getByRole('strong').filter({ hasText: 'Gaya pembuka' })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Tambah Catatan', exact: true })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Buat Rencana Uji', exact: true })).toBeVisible();
    await expect(panel.getByRole('textbox', { name: 'Penulis', exact: true })).toHaveCount(0);
    await expect(panel.getByLabel('Variabel yang diuji', { exact: true })).toHaveCount(0);
    await expect(panel.locator('input, textarea, select, button.secondary').evaluateAll((nodes) => nodes.every((node) => getComputedStyle(node).borderColor === 'rgb(118, 133, 139)'))).resolves.toBeTruthy();
    const bounds = await panel.boundingBox();
    expect(bounds?.width).toBeGreaterThan(0);
    await screenshot(page, testInfo, `before-read-${viewport.width}`);
    await panel.getByRole('button', { name: 'Tambah Catatan', exact: true }).click();
    const editor = panel.getByRole('textbox', { name: 'Catatan', exact: true });
    await expect(editor).toBeVisible();
    await expect(editor.evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize))).resolves.toBeGreaterThanOrEqual(13);
    await screenshot(page, testInfo, `after-editor-${viewport.width}`);
    await panel.getByRole('button', { name: 'Batal Catatan', exact: true }).click();
  });
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 812 }]) {
  test(`AC-05 error remains readable at ${viewport.width}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const state: State = { notes: [], plans: [], failRefresh: false, failWrite: true, delayWrite: false, notePosts: 0, planPosts: 0, statusPatches: 0 };
    await installApi(page, state);
    const panel = await open(page);
    await panel.getByRole('button', { name: 'Tambah Catatan', exact: true }).click();
    await panel.getByLabel('Penulis', { exact: true }).fill('analyst-a');
    await panel.getByRole('textbox', { name: 'Catatan', exact: true }).fill('Error terlihat');
    await panel.getByRole('button', { name: 'Simpan Catatan', exact: true }).click();
    const alert = panel.getByRole('alert');
    await expect(alert).toContainText('Catatan gagal tersimpan');
    await expect(alert.evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize))).resolves.toBeGreaterThanOrEqual(13);
    expect((await alert.boundingBox())?.width).toBeGreaterThan(0);
    await screenshot(page, testInfo, `after-error-${viewport.width}`);
  });
}

test('AC-02 through AC-06 create edit cancel status and reload', async ({ page }) => {
  const state: State = { notes: [note], plans: [plan], failRefresh: false, failWrite: false, delayWrite: false, notePosts: 0, planPosts: 0, statusPatches: 0 };
  await installApi(page, state);
  const panel = await open(page);
  await panel.getByRole('button', { name: 'Tambah Catatan', exact: true }).click();
  await panel.getByLabel('Penulis', { exact: true }).fill('analyst-b');
  await panel.getByRole('textbox', { name: 'Catatan', exact: true }).fill('Draft baru');
  await panel.getByRole('button', { name: 'Batal Catatan', exact: true }).click();
  await expect(panel.getByLabel('Penulis', { exact: true })).toHaveCount(0);
  expect(state.notePosts).toBe(0);
  await panel.getByRole('button', { name: 'Tambah Catatan', exact: true }).click();
  await panel.getByLabel('Penulis', { exact: true }).fill('analyst-b');
  await panel.getByRole('textbox', { name: 'Catatan', exact: true }).fill('Catatan baru\ndengan baris kedua');
  await panel.getByRole('button', { name: 'Simpan Catatan', exact: true }).click();
  await expect(panel.getByText('Catatan baru\ndengan baris kedua', { exact: true })).toBeVisible();
  expect(state.notePosts).toBe(1);
  await panel.getByRole('button', { name: 'Edit Catatan', exact: true }).click();
  await panel.getByRole('textbox', { name: 'Catatan', exact: true }).fill('Catatan diedit');
  await panel.getByRole('button', { name: 'Simpan edit Catatan', exact: true }).click();
  await expect(panel.getByText('Catatan diedit', { exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Buat Rencana Uji', exact: true }).click();
  for (const [label, value] of [['Variabel yang diuji', 'Variabel baru'], ['Varian A', 'A'], ['Varian B', 'B'], ['Kontrol', 'Kontrol'], ['Hasil yang diharapkan', 'Hasil'], ['Penanggung jawab', 'analyst-b'], ['Metrik keberhasilan', 'Simpan'], ['Periode pengukuran', '7 hari']] as const) await panel.getByLabel(label, { exact: true }).fill(value);
  await panel.getByLabel('Batch tujuan', { exact: true }).selectOption(batchB.id);
  await panel.getByRole('button', { name: 'Simpan Rencana Uji', exact: true }).click();
  await expect(panel.getByRole('strong').filter({ hasText: 'Variabel baru' })).toBeVisible();
  expect(state.planPosts).toBe(1);
  await panel.getByLabel(`Status ${ids.plan}`).selectOption('COMPLETED');
  await expect(panel.getByLabel(`Status ${ids.plan}`)).toHaveValue('COMPLETED');
  expect(state.statusPatches).toBe(1);
  await page.reload();
  await expect(page.getByText('Catatan diedit', { exact: true })).toBeVisible();
  await expect(page.getByLabel(`Status ${ids.plan}`)).toHaveValue('COMPLETED');
});

test('AC-05 error keeps note draft and rejects empty input locally', async ({ page }, testInfo) => {
  const state: State = { notes: [], plans: [], failRefresh: false, failWrite: false, delayWrite: false, notePosts: 0, planPosts: 0, statusPatches: 0 };
  await installApi(page, state);
  const panel = await open(page);
  await panel.getByRole('button', { name: 'Tambah Catatan', exact: true }).click();
  await expect(panel.getByText('Penulis dan Catatan wajib diisi.', { exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Simpan Catatan', exact: true })).toBeDisabled();
  expect(state.notePosts).toBe(0);
  await panel.getByLabel('Penulis', { exact: true }).fill('analyst-a');
  await panel.getByRole('textbox', { name: 'Catatan', exact: true }).fill('Draf gagal tetap ada');
  state.failRefresh = true;
  await panel.getByRole('button', { name: 'Simpan Catatan', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('Penyimpanan berhasil, tetapi daftar gagal dimuat. Coba lagi untuk memuat daftar terbaru.');
  await screenshot(page, testInfo, 'after-error-1440');
});

test('AC-01 GET gagal membedakan error dari empty dan dapat retry', async ({ page }) => {
  const state: State = { notes: [], plans: [], failRefresh: true, failWrite: false, delayWrite: false, notePosts: 0, planPosts: 0, statusPatches: 0 };
  await installApi(page, state);
  const panel = await open(page);
  await expect(panel.getByRole('alert')).toContainText('Daftar S10 gagal dimuat');
  await expect(panel.getByText('Belum ada Catatan tersimpan.', { exact: false })).toHaveCount(0);
  state.failRefresh = false;
  await panel.getByRole('button', { name: 'Coba lagi', exact: true }).click();
  await expect(panel.getByText('Belum ada Catatan tersimpan.', { exact: false })).toBeVisible();
  await expect(panel.getByRole('alert')).toHaveCount(0);
});

test('AC-05 write gagal dan pending menjaga draf tanpa request ganda', async ({ page }) => {
  const state: State = { notes: [], plans: [], failRefresh: false, failWrite: true, delayWrite: true, notePosts: 0, planPosts: 0, statusPatches: 0 };
  await installApi(page, state);
  const panel = await open(page);
  await panel.getByRole('button', { name: 'Tambah Catatan', exact: true }).click();
  await panel.getByLabel('Penulis', { exact: true }).fill('analyst-a');
  await panel.getByRole('textbox', { name: 'Catatan', exact: true }).fill('Draf write gagal');
  const save = panel.getByRole('button', { name: 'Simpan Catatan', exact: true });
  await save.click();
  await expect(panel.getByRole('button', { name: 'Menyimpan…', exact: true })).toBeDisabled();
  await save.click({ force: true });
  await expect(panel.getByRole('alert')).toContainText('Catatan gagal tersimpan');
  await expect(panel.getByRole('textbox', { name: 'Catatan', exact: true })).toHaveValue('Draf write gagal');
  expect(state.notePosts).toBe(1);
});
