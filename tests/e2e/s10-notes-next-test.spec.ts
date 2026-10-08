import { expect, test, type Page, type Route } from '@playwright/test';
import workspace from './fixtures/workspace.json';

type RecordValue = Record<string, unknown>;
const fixture = workspace as unknown as { batches: Array<{ id: string; [key: string]: unknown }>; contentsByBatch: Record<string, Array<RecordValue>> };
const batchId = fixture.batches[0].id;
const hypothesisId = '90000000-0000-4000-8000-000000000001';
const content = fixture.contentsByBatch[batchId][0];
const note = { id: 's10-note-1', body: 'Synthetic human context', author: 'synthetic_analyst', updatedAt: '2026-10-07T00:00:00.000Z' };
const nextTest = { id: 's10-test-1', hypothesisId, variableToTest: 'opening style', variantA: 'direct claim', variantB: 'question', controls: 'same duration', expectedResult: 'variant A higher saves', owner: 'synthetic_analyst', successMetric: 'save rate', measurementWindow: '7 days', targetBatchId: batchId, status: 'PROPOSED', updatedAt: '2026-10-07T00:00:00.000Z' };

async function installApi(page: Page) {
  const state = { notes: [] as RecordValue[], nextTests: [] as RecordValue[] };
  const batches = fixture.batches;
  await page.route('**/api/workspace**', async (route: Route) => await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ batches: fixture.batches, selectedBatch: fixture.batches[0], contents: [content], selectedContent: { ...content, frames: [], audio: { url: null, available: false }, transcript: [], anchors: [], extraction: [] }, analysis: { synthetic: true, ranking: { status: 'READY', reason: null, rankedGroups: [], excluded: [] }, kpis: [], snapshots: [] } }) }));
  await page.route('**/api/processing?batchId=*', async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) });
  });
  await page.route('**/api/hypotheses?hypothesisId=*', async (route: Route) => await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: hypothesisId, batchId, statement: 'Synthetic insight', confidence: 'LOW', confidenceCaps: [], suggestedNextTest: null, evidence: [] }) }));
  await page.route(`**/api/hypotheses/${hypothesisId}/s10`, async (route: Route) => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ hypothesisId, batches, notes: state.notes, nextTests: state.nextTests }) });
    const body = route.request().postDataJSON() as RecordValue;
    if (body.kind === 'NOTE') state.notes = [{ ...note, body: String(body.body), author: String(body.author) }];
    if (body.kind === 'NEXT_TEST') state.nextTests = [{ ...nextTest, ...body }];
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(state.notes[0] ?? state.nextTests[0]) });
  });
  await page.route(`**/api/hypotheses/${hypothesisId}/s10/notes/${note.id}`, async (route: Route) => { const body = route.request().postDataJSON() as RecordValue; state.notes = [{ ...state.notes[0], body: body.body, author: body.author }]; await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(state.notes[0]) }); });
  await page.route(`**/api/hypotheses/${hypothesisId}/s10/next-tests/${nextTest.id}`, async (route: Route) => { const body = route.request().postDataJSON() as RecordValue; state.nextTests = [{ ...state.nextTests[0], ...body }]; await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(state.nextTests[0]) }); });
  await page.route('**/api/hypotheses/review**', async (route: Route) => await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ hypothesisId, reviews: [] }) }));
}

test('S10 notes and Next Test create edit status reload', async ({ page }) => {
  page.on('pageerror', (error) => { throw error; });
  page.on('console', (message) => { if (message.type() === 'error') throw new Error(`unexpected console error: ${message.text()}`); });
  await installApi(page);
  await page.goto(`/?batchId=${batchId}&hypothesisId=${hypothesisId}`);
  const panel = page.getByRole('region', { name: 'Notes & Next Test' });
  await expect(panel.getByRole('heading', { name: 'Notes & Next Test', exact: true })).toBeVisible();
  await panel.getByLabel('Author').fill('synthetic_analyst');
  await panel.getByRole('textbox', { name: 'Note', exact: true }).fill('Synthetic human context');
  await panel.getByRole('button', { name: 'Save note' }).click();
  await expect(panel.getByText('Synthetic human context', { exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Edit' }).first().click();
  await panel.getByRole('textbox', { name: 'Note', exact: true }).fill('Synthetic human context edited');
  await panel.getByRole('button', { name: 'Save note edit' }).click();
  await expect(panel.getByText('Synthetic human context edited', { exact: true })).toBeVisible();
  for (const [label, value] of [['Variable yang diuji', 'opening style'], ['Variant A', 'direct claim'], ['Variant B', 'question'], ['Controls', 'same duration'], ['Expected result', 'variant A higher saves'], ['Owner', 'synthetic_analyst'], ['Success metric', 'save rate'], ['Measurement window', '7 days']] as const) await panel.getByLabel(label).fill(value);
  await panel.getByLabel('Target batch').selectOption(fixture.batches[1].id);
  await panel.getByRole('button', { name: 'Create Next Test' }).click();
  const testArticle = panel.locator('article').filter({ hasText: 'opening style' });
  await expect(testArticle).toContainText(fixture.batches[1].id);
  await testArticle.getByRole('button', { name: 'Edit' }).click();
  await panel.getByLabel('Variable yang diuji').fill('opening style edited');
  await panel.getByLabel('Expected result').fill('edited result');
  await panel.getByLabel('Owner').fill('edited_owner');
  await panel.getByLabel('Success metric').fill('edited metric');
  await panel.getByLabel('Measurement window').fill('14 days');
  await panel.getByRole('button', { name: 'Save Next Test edit' }).click();
  await expect(panel.getByText('opening style edited', { exact: true })).toBeVisible();
  await expect(testArticle).toContainText('edited result');
  await panel.getByLabel('Status s10-test-1').selectOption('COMPLETED');
  await expect(panel.getByText('Status: COMPLETED · Test ID: s10-test-1', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Synthetic human context edited', { exact: true })).toBeVisible();
  await expect(page.getByText('opening style edited', { exact: true })).toBeVisible();
  await expect(page.getByText('Status: COMPLETED · Test ID: s10-test-1', { exact: true })).toBeVisible();
});
