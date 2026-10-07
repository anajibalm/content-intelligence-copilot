import { expect, test, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

const connectionString = process.env.CIC_DATABASE_URL;
const workspaceId = process.env.CIC_WORKSPACE_ID;
const batchId = process.env.CIC_BATCH_ID ?? '51000000-0000-0000-0000-000000000002';
const hypothesisId = process.env.CIC_S10_HYPOTHESIS_ID ?? 'eb1f97ea-5d83-483a-bd37-d8f4170048c7';
const baseURL = process.env.CIC_E2E_STAGING_URL ?? 'http://127.0.0.1:3122';
if (!connectionString || !workspaceId) throw new Error('CIC_DATABASE_URL and CIC_WORKSPACE_ID are required for integrated S10');
const pool = new Pool({ connectionString, max: 2 });

test.afterAll(async () => { await pool.end(); });

async function body(response: Awaited<ReturnType<APIRequestContext['get']>>) { return await response.json() as Record<string, unknown>; }

test('integrated S10 notes and Next Test persist scoped edits and reload', async ({ page, request }) => {
  test.setTimeout(60_000);
  const suffix = randomUUID().slice(0, 8);
  const author = `integrated_s10_${suffix}`;
  const noteText = `Human context ${suffix}`;
  const noteEdited = `Human context edited ${suffix}`;
  const note = await request.post(`${baseURL}/api/hypotheses/${hypothesisId}/s10`, { data: { kind: 'NOTE', body: noteText, author } });
  expect(note.status()).toBe(201);
  const noteRecord = await body(note);
  expect(noteRecord.hypothesisId).toBe(hypothesisId);
  const noteId = String(noteRecord.id);
  const editedNote = await request.patch(`${baseURL}/api/hypotheses/${hypothesisId}/s10/notes/${noteId}`, { data: { body: noteEdited, author } });
  expect(editedNote.status()).toBe(200);
  const nextTest = await request.post(`${baseURL}/api/hypotheses/${hypothesisId}/s10`, { data: { kind: 'NEXT_TEST', variableToTest: `opening style ${suffix}`, variantA: 'direct claim', variantB: 'question', controls: 'same batch and duration', expectedResult: 'variant A has higher saves', owner: author, successMetric: 'save rate', measurementWindow: '7 days', targetBatchId: batchId } });
  expect(nextTest.status()).toBe(201);
  const nextTestRecord = await body(nextTest);
  const nextTestId = String(nextTestRecord.id);
  expect(nextTestRecord.targetBatchId).toBe(batchId);
  const editedTest = await request.patch(`${baseURL}/api/hypotheses/${hypothesisId}/s10/next-tests/${nextTestId}`, { data: { variableToTest: `opening style edited ${suffix}`, expectedResult: 'edited result', owner: `edited_${author}`, successMetric: 'edited metric', measurementWindow: '14 days', targetBatchId: batchId } });
  expect(editedTest.status()).toBe(200);
  const editedTestRecord = await body(editedTest);
  expect(editedTestRecord.id).toBe(nextTestId);
  expect(editedTestRecord.variableToTest).toBe(`opening style edited ${suffix}`);
  expect(editedTestRecord.targetBatchId).toBe(batchId);
  const invalidTarget = await request.patch(`${baseURL}/api/hypotheses/${hypothesisId}/s10/next-tests/${nextTestId}`, { data: { targetBatchId: 'not-a-uuid' } });
  expect(invalidTarget.status()).toBe(400);
  const missingTarget = await request.patch(`${baseURL}/api/hypotheses/${hypothesisId}/s10/next-tests/${nextTestId}`, { data: { targetBatchId: randomUUID() } });
  expect(missingTarget.status()).toBe(404);
  const invalidStatus = await request.patch(`${baseURL}/api/hypotheses/${hypothesisId}/s10/next-tests/${nextTestId}`, { data: { status: 'INVALID' } });
  expect(invalidStatus.status()).toBe(400);
  const completed = await request.patch(`${baseURL}/api/hypotheses/${hypothesisId}/s10/next-tests/${nextTestId}`, { data: { status: 'COMPLETED' } });
  expect(completed.status()).toBe(200);
  const wrongScope = await request.get(`${baseURL}/api/hypotheses/${randomUUID()}/s10`);
  expect(wrongScope.status()).toBe(404);

  await page.goto(`${baseURL}/?batchId=${batchId}&hypothesisId=${hypothesisId}`);
  await expect(page.getByRole('heading', { name: 'Notes & Next Test', exact: true })).toBeVisible();
  await expect(page.getByText(noteEdited, { exact: true })).toBeVisible();
  await expect(page.getByText(`opening style edited ${suffix}`, { exact: true })).toBeVisible();
  await expect(page.getByText(`Status: COMPLETED · Test ID: ${nextTestId}`, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText(noteEdited, { exact: true })).toBeVisible();
  await expect(page.getByText(`opening style edited ${suffix}`, { exact: true })).toBeVisible();
  await expect(page.getByText(`Status: COMPLETED · Test ID: ${nextTestId}`, { exact: true })).toBeVisible();

  const persisted = await request.get(`${baseURL}/api/hypotheses/${hypothesisId}/s10`);
  expect(persisted.status()).toBe(200);
  const persistedBody = await body(persisted);
  const persistedNotes = persistedBody.notes as Array<Record<string, unknown>>;
  const persistedTests = persistedBody.nextTests as Array<Record<string, unknown>>;
  expect(persistedNotes.some((row) => row.id === noteId && row.body === noteEdited && row.hypothesisId === hypothesisId)).toBe(true);
  expect(persistedTests.some((row) => row.id === nextTestId && row.status === 'COMPLETED' && row.targetBatchId === batchId && row.variableToTest === `opening style edited ${suffix}` && row.expectedResult === 'edited result' && row.owner === `edited_${author}` && row.successMetric === 'edited metric' && row.measurementWindow === '14 days')).toBe(true);

  const db = await pool.query<{ notes: string; tests: string; variable_to_test: string; expected_result: string; target_batch_id: string }>('SELECT (SELECT count(*) FROM analyst_note WHERE workspace_id = $1 AND hypothesis_id = $2 AND id = $3)::text AS notes, (SELECT count(*) FROM next_test WHERE workspace_id = $1 AND hypothesis_id = $2 AND id = $4)::text AS tests, (SELECT variable_to_test FROM next_test WHERE workspace_id = $1 AND hypothesis_id = $2 AND id = $4) AS variable_to_test, (SELECT expected_result FROM next_test WHERE workspace_id = $1 AND hypothesis_id = $2 AND id = $4) AS expected_result, (SELECT target_batch_id FROM next_test WHERE workspace_id = $1 AND hypothesis_id = $2 AND id = $4) AS target_batch_id', [workspaceId, hypothesisId, noteId, nextTestId]);
  expect(db.rows[0]).toEqual({ notes: '1', tests: '1', variable_to_test: `opening style edited ${suffix}`, expected_result: 'edited result', target_batch_id: batchId });
});
