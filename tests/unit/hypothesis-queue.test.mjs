import test from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { createHypothesisRepository } from '../../lib/hypothesis/postgres.ts';

test('queue rejects batch absent from workspace before listing artifacts', async (t) => {
  t.mock.method(Pool.prototype, 'query', async () => ({ rows: [] }));
  const repository = createHypothesisRepository({ connectionString: 'postgres://unused', workspaceId: 'workspace-a', providerName: 'unused' });
  try { await assert.rejects(repository.list('foreign-batch'), /batch not found in workspace/); }
  finally { await repository.close(); }
});
