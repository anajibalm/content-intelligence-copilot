import { Pool } from 'pg';
import type { NextTestStatus } from '../domain/types.ts';
import { validateNextTestInput, validateNextTestPatch, validateNoteInput, S10NotFoundError, S10ValidationError, type NextTestInput, type NextTestPatch, type NoteInput } from './rules.ts';

export type S10RepositoryConfig = { connectionString: string; workspaceId: string };
export type S10BatchRecord = { id: string; name: string; brandId: string };
export type AnalystNoteRecord = { id: string; hypothesisId: string; body: string; author: string; createdAt: string; updatedAt: string };
export type NextTestRecord = { id: string; hypothesisId: string; variableToTest: string; variantA: string; variantB: string; controls: string; expectedResult: string; owner: string; successMetric: string; measurementWindow: string; targetBatchId: string; status: NextTestStatus; createdAt: string; updatedAt: string };
export type S10Repository = { listBatches(hypothesisId: string): Promise<S10BatchRecord[]>; listNotes(hypothesisId: string): Promise<AnalystNoteRecord[]>; createNote(hypothesisId: string, input: NoteInput): Promise<AnalystNoteRecord>; updateNote(noteId: string, hypothesisId: string, input: NoteInput): Promise<AnalystNoteRecord>; listNextTests(hypothesisId: string): Promise<NextTestRecord[]>; createNextTest(hypothesisId: string, input: NextTestInput): Promise<NextTestRecord>; updateNextTest(id: string, hypothesisId: string, input: NextTestPatch): Promise<NextTestRecord>; close(): Promise<void> };

type NoteRow = { id: string; hypothesis_id: string; body: string; author: string; created_at: string; updated_at: string };
type NextTestRow = { id: string; hypothesis_id: string; variable_to_test: string; variant_a: string; variant_b: string; controls: string; expected_result: string; owner: string; success_metric: string; measurement_window: string; target_batch_id: string; status: NextTestStatus; created_at: string; updated_at: string };

export function s10ConfigFromEnv(): S10RepositoryConfig {
  const connectionString = process.env.CIC_DATABASE_URL ?? process.env.DATABASE_URL;
  const workspaceId = process.env.CIC_WORKSPACE_ID;
  if (!connectionString || !workspaceId) throw new Error('CIC_DATABASE_URL and CIC_WORKSPACE_ID are required for S10');
  return { connectionString, workspaceId };
}

function noteRecord(row: NoteRow): AnalystNoteRecord { return { id: row.id, hypothesisId: row.hypothesis_id, body: row.body, author: row.author, createdAt: row.created_at, updatedAt: row.updated_at }; }
function nextTestRecord(row: NextTestRow): NextTestRecord { return { id: row.id, hypothesisId: row.hypothesis_id, variableToTest: row.variable_to_test, variantA: row.variant_a, variantB: row.variant_b, controls: row.controls, expectedResult: row.expected_result, owner: row.owner, successMetric: row.success_metric, measurementWindow: row.measurement_window, targetBatchId: row.target_batch_id, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at }; }

export function createS10Repository(config: S10RepositoryConfig): S10Repository {
  const pool = new Pool({ connectionString: config.connectionString, max: 2 });
  async function hypothesisScope(client: Pick<Pool, 'query'>, hypothesisId: string): Promise<{ batchId: string; brandId: string }> {
    const result = await client.query<{ batch_id: string; brand_id: string }>('SELECT h.batch_id, b.brand_id FROM hypothesis h JOIN batch b ON b.id = h.batch_id AND b.workspace_id = h.workspace_id WHERE h.workspace_id = $1 AND h.id = $2', [config.workspaceId, hypothesisId]);
    if (!result.rows[0]) throw new S10NotFoundError('hypothesis not found in workspace');
    return { batchId: result.rows[0].batch_id, brandId: result.rows[0].brand_id };
  }
  async function targetBatchInScope(sourceBatchId: string, brandId: string, targetBatchId: string): Promise<void> {
    const result = await pool.query<{ id: string }>('SELECT id FROM batch WHERE workspace_id = $1 AND brand_id = $2 AND id = $3', [config.workspaceId, brandId, targetBatchId]);
    if (!result.rows[0] || targetBatchId === '') throw new S10NotFoundError('target batch not found in workspace and brand scope');
    if (sourceBatchId === targetBatchId) return;
  }
  async function noteById(noteId: string, hypothesisId: string): Promise<AnalystNoteRecord> {
    const row = (await pool.query<NoteRow>('SELECT id, hypothesis_id, body, author, created_at, updated_at FROM analyst_note WHERE workspace_id = $1 AND id = $2 AND hypothesis_id = $3', [config.workspaceId, noteId, hypothesisId])).rows[0];
    if (!row) throw new S10NotFoundError('note not found in hypothesis scope');
    return noteRecord(row);
  }
  async function nextTestById(id: string, hypothesisId: string): Promise<NextTestRecord> {
    const row = (await pool.query<NextTestRow>('SELECT id, hypothesis_id, variable_to_test, variant_a, variant_b, controls, expected_result, owner, success_metric, measurement_window, target_batch_id, status, created_at, updated_at FROM next_test WHERE workspace_id = $1 AND id = $2 AND hypothesis_id = $3', [config.workspaceId, id, hypothesisId])).rows[0];
    if (!row) throw new S10NotFoundError('Next Test not found in hypothesis scope');
    return nextTestRecord(row);
  }
  async function listNotes(hypothesisId: string) { await hypothesisScope(pool, hypothesisId); const rows = (await pool.query<NoteRow>('SELECT id, hypothesis_id, body, author, created_at, updated_at FROM analyst_note WHERE workspace_id = $1 AND hypothesis_id = $2 ORDER BY updated_at, id', [config.workspaceId, hypothesisId])).rows; return rows.map(noteRecord); }
  async function createNote(hypothesisId: string, rawInput: NoteInput) {
    const input = validateNoteInput(rawInput); await hypothesisScope(pool, hypothesisId);
    const row = (await pool.query<NoteRow>('INSERT INTO analyst_note (workspace_id, target_type, body, hypothesis_id, author) VALUES ($1, \'HYPOTHESIS\', $2, $3, $4) RETURNING id, hypothesis_id, body, author, created_at, updated_at', [config.workspaceId, input.body, hypothesisId, input.author])).rows[0];
    return noteRecord(row);
  }
  async function updateNote(noteId: string, hypothesisId: string, rawInput: NoteInput) {
    const input = validateNoteInput(rawInput); await hypothesisScope(pool, hypothesisId); await noteById(noteId, hypothesisId);
    const row = (await pool.query<NoteRow>('UPDATE analyst_note SET body = $1, author = $2, updated_at = now() WHERE workspace_id = $3 AND id = $4 AND hypothesis_id = $5 RETURNING id, hypothesis_id, body, author, created_at, updated_at', [input.body, input.author, config.workspaceId, noteId, hypothesisId])).rows[0];
    return noteRecord(row);
  }
  async function listBatches(hypothesisId: string) { const scope = await hypothesisScope(pool, hypothesisId); const rows = (await pool.query<{ id: string; name: string; brand_id: string }>('SELECT id, name, brand_id FROM batch WHERE workspace_id = $1 AND brand_id = $2 ORDER BY created_at, id', [config.workspaceId, scope.brandId])).rows; return rows.map((row) => ({ id: row.id, name: row.name, brandId: row.brand_id })); }
  async function listNextTests(hypothesisId: string) { await hypothesisScope(pool, hypothesisId); const rows = (await pool.query<NextTestRow>('SELECT id, hypothesis_id, variable_to_test, variant_a, variant_b, controls, expected_result, owner, success_metric, measurement_window, target_batch_id, status, created_at, updated_at FROM next_test WHERE workspace_id = $1 AND hypothesis_id = $2 ORDER BY created_at, id', [config.workspaceId, hypothesisId])).rows; return rows.map(nextTestRecord); }
  async function createNextTest(hypothesisId: string, rawInput: NextTestInput) {
    const scope = await hypothesisScope(pool, hypothesisId); const input = validateNextTestInput(rawInput); const targetBatchId = input.targetBatchId ?? scope.batchId;
    await targetBatchInScope(scope.batchId, scope.brandId, targetBatchId);
    const row = (await pool.query<NextTestRow>('INSERT INTO next_test (workspace_id, hypothesis_id, variable_to_test, variant_a, variant_b, controls, expected_result, owner, success_metric, measurement_window, target_batch_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id, hypothesis_id, variable_to_test, variant_a, variant_b, controls, expected_result, owner, success_metric, measurement_window, target_batch_id, status, created_at, updated_at', [config.workspaceId, hypothesisId, input.variableToTest, input.variantA, input.variantB, input.controls, input.expectedResult, input.owner, input.successMetric, input.measurementWindow, targetBatchId])).rows[0];
    return nextTestRecord(row);
  }
  async function updateNextTest(id: string, hypothesisId: string, rawInput: NextTestPatch) {
    const scope = await hypothesisScope(pool, hypothesisId); const patch = validateNextTestPatch(rawInput); await nextTestById(id, hypothesisId);
    if (patch.targetBatchId !== undefined) await targetBatchInScope(scope.batchId, scope.brandId, patch.targetBatchId);
    const fields = Object.entries(patch); const values: unknown[] = []; const assignments = fields.map(([key, value], index) => { const column = ({ variableToTest: 'variable_to_test', variantA: 'variant_a', variantB: 'variant_b', controls: 'controls', expectedResult: 'expected_result', owner: 'owner', successMetric: 'success_metric', measurementWindow: 'measurement_window', targetBatchId: 'target_batch_id', status: 'status' } as Record<string, string>)[key]; values.push(value); return `${column} = $${index + 1}${key === 'status' ? '::next_test_status' : ''}`; });
    values.push(config.workspaceId, id, hypothesisId);
    const row = (await pool.query<NextTestRow>(`UPDATE next_test SET ${assignments.join(', ')}, updated_at = now() WHERE workspace_id = $${values.length - 2} AND id = $${values.length - 1} AND hypothesis_id = $${values.length} RETURNING id, hypothesis_id, variable_to_test, variant_a, variant_b, controls, expected_result, owner, success_metric, measurement_window, target_batch_id, status, created_at, updated_at`, values)).rows[0];
    return nextTestRecord(row);
  }
  return { listBatches, listNotes, createNote, updateNote, listNextTests, createNextTest, updateNextTest, close: () => pool.end() };
}
