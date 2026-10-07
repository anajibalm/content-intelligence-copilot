import { expect, test, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

const connectionString = process.env.CIC_DATABASE_URL;
const workspaceId = process.env.CIC_WORKSPACE_ID;
const batchId = process.env.CIC_BATCH_ID ?? '51000000-0000-0000-0000-000000000002';
const targetBatchId = process.env.CIC_S10_TARGET_BATCH_ID ?? '51000000-0000-0000-0000-000000000003';
const foreignBrandBatchId = process.env.CIC_S10_FOREIGN_BRAND_BATCH_ID ?? '30000000-0000-0000-0000-000000000003';
const hypothesisId = process.env.CIC_S10_HYPOTHESIS_ID ?? 'eb1f97ea-5d83-483a-bd37-d8f4170048c7';
const baseURL = process.env.CIC_E2E_STAGING_URL ?? 'http://127.0.0.1:3122';
if (!connectionString || !workspaceId) throw new Error('CIC_DATABASE_URL and CIC_WORKSPACE_ID are required for integrated S10');
const pool = new Pool({ connectionString, max: 2 });

test.afterAll(async () => { await pool.end(); });

async function body(response: Awaited<ReturnType<APIRequestContext['get']>>) { return await response.json() as Record<string, unknown>; }

test('integrated S10 notes and Next Test persist UI target switch, scoped edits, and reload', async ({ page, request }) => {
  test.setTimeout(60_000);
  const suffix = randomUUID().slice(0, 8);
  const author = `integrated_s10_${suffix}`;
  const noteText = `Human context ${suffix}`;
  const noteEdited = `Human context edited ${suffix}`;
  const initialVariable = `opening style ${suffix}`;
  const editedVariable = `opening style edited ${suffix}`;
  const note = await request.post(`${baseURL}/api/hypotheses/${hypothesisId}/s10`, { data: { kind: 'NOTE', body: noteText, author } });
  expect(note.status()).toBe(201);
  const noteRecord = await body(note);
  expect(noteRecord.hypothesisId).toBe(hypothesisId);
  const noteId = String(noteRecord.id);
  const editedNote = await request.patch(`${baseURL}/api/hypotheses/${hypothesisId}/s10/notes/${noteId}`, { data: { body: noteEdited, author } });
  expect(editedNote.status()).toBe(200);

  await page.goto(`${baseURL}/?batchId=${batchId}&hypothesisId=${hypothesisId}`);
  const panel = page.getByRole('region', { name: 'Notes & Next Test' });
  await expect(panel.getByRole('heading', { name: 'Notes & Next Test', exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(panel.getByText(noteEdited, { exact: true })).toBeVisible();
  for (const [label, value] of [['Variable yang diuji', initialVariable], ['Variant A', 'direct claim'], ['Variant B', 'question'], ['Controls', 'same batch and duration'], ['Expected result', 'variant A has higher saves'], ['Owner', author], ['Success metric', 'save rate'], ['Measurement window', '7 days']] as const) await panel.getByLabel(label).fill(value);
  await panel.getByLabel('Target batch').selectOption(targetBatchId);
  await panel.getByRole('button', { name: 'Create Next Test' }).click();
  const createdArticle = panel.locator('article').filter({ hasText: initialVariable });
  await expect(createdArticle).toContainText(`Target batch: ${targetBatchId}`);
  const createdText = await createdArticle.textContent();
  const nextTestId = createdText?.match(/Test ID: ([0-9a-f-]{36})/)?.[1];
  expect(nextTestId).toBeTruthy();
  await createdArticle.getByRole('button', { name: 'Edit' }).click();
  await panel.getByLabel('Variable yang diuji').fill(editedVariable);
  await panel.getByLabel('Expected result').fill('edited result');
  await panel.getByLabel('Owner').fill(`edited_${author}`);
  await panel.getByLabel('Success metric').fill('edited metric');
  await panel.getByLabel('Measurement window').fill('14 days');
  await panel.getByLabel('Target batch').selectOption(batchId);
  await panel.getByRole('button', { name: 'Save Next Test edit' }).click();
  const editedArticle = panel.locator('article').filter({ hasText: editedVariable });
  await expect(editedArticle).toContainText(`Target batch: ${batchId}`);
  await expect(editedArticle).toContainText('edited result');
  await editedArticle.getByLabel(`Status ${nextTestId}`).selectOption('COMPLETED');
  await expect(editedArticle).toContainText(`Status: COMPLETED · Test ID: ${nextTestId}`);

  const beforeForeign = await pool.query<{ count: string }>('SELECT count(*)::text AS count FROM next_test WHERE workspace_id = $1 AND hypothesis_id = $2', [workspaceId, hypothesisId]);
  const foreignCreate = await request.post(`${baseURL}/api/hypotheses/${hypothesisId}/s10`, { data: { kind: 'NEXT_TEST', variableToTest: `foreign ${suffix}`, variantA: 'A', variantB: 'B', controls: 'same', expectedResult: 'none', owner: author, successMetric: 'none', measurementWindow: '1 day', targetBatchId: foreignBrandBatchId } });
  expect(foreignCreate.status()).toBe(404);
  const foreignPatch = await request.patch(`${baseURL}/api/hypotheses/${hypothesisId}/s10/next-tests/${nextTestId}`, { data: { targetBatchId: foreignBrandBatchId } });
  expect(foreignPatch.status()).toBe(404);
  const afterForeign = await pool.query<{ count: string }>('SELECT count(*)::text AS count FROM next_test WHERE workspace_id = $1 AND hypothesis_id = $2', [workspaceId, hypothesisId]);
  expect(afterForeign.rows[0]?.count).toBe(beforeForeign.rows[0]?.count);

  await page.reload();
  await expect(page.getByText(noteEdited, { exact: true })).toBeVisible();
  const persistedArticle = page.getByRole('region', { name: 'Notes & Next Test' }).locator('article').filter({ hasText: editedVariable });
  await expect(persistedArticle).toContainText(`Target batch: ${batchId}`);
  await expect(persistedArticle).toContainText(`Status: COMPLETED · Test ID: ${nextTestId}`);
  const persisted = await request.get(`${baseURL}/api/hypotheses/${hypothesisId}/s10`);
  expect(persisted.status()).toBe(200);
  const persistedBody = await body(persisted);
  const persistedTests = persistedBody.nextTests as Array<Record<string, unknown>>;
  expect(persistedTests.some((row) => row.id === nextTestId && row.hypothesisId === hypothesisId && row.status === 'COMPLETED' && row.targetBatchId === batchId && row.variableToTest === editedVariable && row.expectedResult === 'edited result' && row.owner === `edited_${author}` && row.successMetric === 'edited metric' && row.measurementWindow === '14 days')).toBe(true);
  const hypothesis = await request.get(`${baseURL}/api/hypotheses?hypothesisId=${hypothesisId}`);
  expect(hypothesis.status()).toBe(200);
  expect((await body(hypothesis)).batchId).toBe(batchId);
  const db = await pool.query<{ notes: string; tests: string; hypothesis_id: string; target_batch_id: string; variable_to_test: string; expected_result: string; owner: string; success_metric: string; measurement_window: string; status: string }>('SELECT (SELECT count(*) FROM analyst_note WHERE workspace_id = $1 AND hypothesis_id = $2 AND id = $3)::text AS notes, (SELECT count(*) FROM next_test WHERE workspace_id = $1 AND hypothesis_id = $2 AND id = $4)::text AS tests, (SELECT hypothesis_id FROM next_test WHERE workspace_id = $1 AND id = $4) AS hypothesis_id, (SELECT target_batch_id FROM next_test WHERE workspace_id = $1 AND id = $4) AS target_batch_id, (SELECT variable_to_test FROM next_test WHERE workspace_id = $1 AND id = $4) AS variable_to_test, (SELECT expected_result FROM next_test WHERE workspace_id = $1 AND id = $4) AS expected_result, (SELECT owner FROM next_test WHERE workspace_id = $1 AND id = $4) AS owner, (SELECT success_metric FROM next_test WHERE workspace_id = $1 AND id = $4) AS success_metric, (SELECT measurement_window FROM next_test WHERE workspace_id = $1 AND id = $4) AS measurement_window, (SELECT status FROM next_test WHERE workspace_id = $1 AND id = $4) AS status', [workspaceId, hypothesisId, noteId, nextTestId]);
  expect(db.rows[0]).toEqual({ notes: '1', tests: '1', hypothesis_id: hypothesisId, target_batch_id: batchId, variable_to_test: editedVariable, expected_result: 'edited result', owner: `edited_${author}`, success_metric: 'edited metric', measurement_window: '14 days', status: 'COMPLETED' });
});
