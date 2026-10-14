import test from 'node:test';
import assert from 'node:assert/strict';
import { actualTikTokReceiptSnapshot } from '../../lib/metrics/actual-receipts.ts';

const receipt = {
  id: 'acad32b6-8c71-4d04-8a8a-2ec2d43d4e2d',
  provider: 'yt-dlp',
  status: 'SUCCEEDED',
  createdAt: '2026-10-06T08:08:46.044378Z',
  rawPayload: {
    extractor: 'TikTok', extractor_key: 'TikTok',
    _version: { version: '2026.08.19', release_git_head: '594bd50c2c78ac432f81600d309fdc4e0a92d82c' },
    view_count: 178, like_count: 4, comment_count: 0, repost_count: 1, save_count: 0,
  },
};

test('maps one verified receipt, keeps explicit zero, receipt time, and stable identity', () => {
  const snapshot = actualTikTokReceiptSnapshot(receipt, 'c22e660f-7f33-46f8-b178-fa732260ca82');
  assert.equal(snapshot.capturedAt, receipt.createdAt);
  assert.equal(snapshot.distribution, 'ORGANIC');
  assert.match(snapshot.source, /distribution=ORGANIC \(demo assumption; unverified\)/);
  assert.deepEqual(snapshot.rawMetrics, {
    views: { value: 178, quality: 'VALID' }, likes: { value: 4, quality: 'VALID' },
    comments: { value: 0, quality: 'VALID' }, shares: { value: 1, quality: 'VALID' }, saves: { value: 0, quality: 'VALID' },
  });
  assert.equal(actualTikTokReceiptSnapshot(receipt, 'c22e660f-7f33-46f8-b178-fa732260ca82').id, snapshot.id);
});

test('rejects unverified aliases and missing/non-numeric metrics', () => {
  assert.throws(() => actualTikTokReceiptSnapshot({ ...receipt, rawPayload: { ...receipt.rawPayload, _version: { version: '2026.09', release_git_head: 'x' } } }, 'content'), /verified TikTok/);
  assert.throws(() => actualTikTokReceiptSnapshot({ ...receipt, rawPayload: { ...receipt.rawPayload, repost_count: undefined } }, 'content'), /missing valid repost_count/);
  assert.throws(() => actualTikTokReceiptSnapshot({ ...receipt, rawPayload: { ...receipt.rawPayload, view_count: '178' } }, 'content'), /missing valid view_count/);
});


test('metrics writer appends receipt snapshots once and rejects partial or foreign content scopes', async (t) => {
  const { Pool } = await import('pg');
  const { createMetricsRepository } = await import('../../lib/metrics/postgres.ts');
  const clientContentId = 'c22e660f-7f33-46f8-b178-fa732260ca82';
  const database = new Map();
  let failMissing = false;
  const client = {
    async query(sql, params = []) {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [], rowCount: 0 };
      if (sql.includes('FROM batch WHERE')) return { rows: [{ id: '30000000-0000-0000-0000-000000000003' }], rowCount: 1 };
      if (sql.includes('FROM content c JOIN LATERAL')) return { rows: failMissing ? [] : [{ content_id: clientContentId, id: receipt.id, provider: receipt.provider, status: receipt.status, created_at: receipt.createdAt, raw_payload: receipt.rawPayload }], rowCount: failMissing ? 0 : 1 };
      if (sql.includes('INSERT INTO metric_snapshot')) {
        const [id, , content_id, , captured_at, source, , raw_metrics] = params;
        if (database.has(id)) return { rows: [], rowCount: 0 };
        database.set(id, { content_id, source, captured_at, raw_metrics: JSON.parse(raw_metrics) });
        return { rows: [{ id }], rowCount: 1 };
      }
      if (sql.includes('SELECT content_id, source, captured_at')) return { rows: database.has(params[0]) ? [database.get(params[0])] : [], rowCount: database.has(params[0]) ? 1 : 0 };
      return { rows: [], rowCount: 0 };
    },
    release() {},
  };
  t.mock.method(Pool.prototype, 'connect', async () => client);
  t.mock.method(Pool.prototype, 'end', async () => {});
  const repository = createMetricsRepository({ connectionString: 'postgres://unused', workspaceId: '10000000-0000-0000-0000-000000000001' });
  const packet = await repository.appendActualTikTokSnapshots('30000000-0000-0000-0000-000000000003', [clientContentId]);
  assert.deepEqual(packet, { batchId: '30000000-0000-0000-0000-000000000003', receipts: 1, inserted: 1 });
  const rerun = await repository.appendActualTikTokSnapshots('30000000-0000-0000-0000-000000000003', [clientContentId]);
  assert.equal(rerun.inserted, 0);
  assert.equal(database.size, 1);
  failMissing = true;
  await assert.rejects(repository.appendActualTikTokSnapshots('30000000-0000-0000-0000-000000000003', [clientContentId]), /not members of the selected batch/);
  await repository.close();
});