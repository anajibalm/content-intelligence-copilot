import test from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { createComparisonRepository } from '../../lib/compare/postgres.ts';
import { createHypothesisRepository } from '../../lib/hypothesis/postgres.ts';
import { createWorkspaceRepository } from '../../lib/workspace/postgres.ts';
import { analyze } from '../../lib/metrics/postgres.ts';

const batchId = 'batch-a';
const contentId = 'content-a';
const comparisonId = 'comparison-a';
const base = { id: 'snapshot-a', content_id: contentId, distribution: 'ORGANIC', source: 'synthetic_adapter', quality: 'VALID', captured_at: '2026-10-08T00:00:00Z', content_age_hours: 24, quality_json: {}, derived_metrics: {} };
const content = { id: contentId, external_id: 'fixture', title: 'Fixture', pillar_id: null, duration_ms: 10000, created_at: '2026-10-07T00:00:00Z' };
const comparison = { id: comparisonId, batch_id: batchId, distribution: 'ORGANIC', mode: 'CONTROLLED', scope: 'PAIR', quality: 'LOW', quality_reasons: [], rule_version: 'compare-v2', controlled_variables: {}, uncontrolled_variables: {} };

function sqlFixture(t, snapshot) {
  const query = async (sql) => {
    if (sql.includes('FROM metric_snapshot')) return { rows: [snapshot] };
    if (sql.includes('count(*)::text')) return { rows: [{ count: '1' }] };
    if (sql.includes('FROM comparison_item')) return { rows: [{ content_id: contentId, position: 1, metric_snapshot_id: snapshot.id }] };
    if (sql.includes('FROM comparison WHERE')) return { rows: [comparison] };
    if (sql.includes('INSERT INTO comparison (')) return { rows: [{ id: comparisonId }] };
    if (sql.includes('FROM batch b')) return { rows: [{ id: batchId, name: 'Synthetic batch', brand_id: 'brand-a', brand_name: 'Synthetic brand' }] };
    if (sql.includes('FROM batch WHERE')) return { rows: [{ id: batchId, name: 'Synthetic batch', brand_id: 'brand-a' }] };
    if (sql.includes('FROM content c') || sql.includes('FROM content WHERE')) return { rows: [content, { ...content, id: 'content-b' }] };
    return { rows: [], rowCount: 1 };
  };
  t.mock.method(Pool.prototype, 'query', query);
  t.mock.method(Pool.prototype, 'connect', async () => ({ query, release() {} }));
  return query;
}

for (const [label, raw, expected] of [
  ['unexplained zero', { views: { value: 0 } }, { state: 'SUSPECT', reason: 'UNEXPLAINED_ZERO' }],
  ['explicit valid zero', { views: { value: 0, quality: 'VALID' } }, { state: 'VALID', reason: null }],
]) {
  test(`repository adapters agree on ${label}`, async (t) => {
    const snapshot = { ...base, raw_metrics: raw };
    const query = sqlFixture(t, snapshot);
    const repo = createComparisonRepository({ connectionString: 'postgres://unused', workspaceId: 'workspace-a' });
    const created = await repo.create({ batchId, contentIds: [contentId, 'content-b'], distribution: 'ORGANIC', mode: 'CONTROLLED', scope: 'PAIR' });
    const loaded = await repo.get(comparisonId);
    const workspace = await createWorkspaceRepository({ connectionString: 'postgres://unused', workspaceId: 'workspace-a', storageRoot: '/tmp/unused' }).load(batchId);
    const analysis = await analyze({ query }, 'workspace-a', batchId);
    for (const result of [created, loaded]) assert.deepEqual(result.metricRows[0].metrics.find((metric) => metric.name === 'views'), { name: 'views', value: 0, ...expected });
    assert.deepEqual(workspace.contents[0].snapshots[0].qualityByMetric.views, expected);
    assert.deepEqual(analysis.snapshots[0].qualityByMetric.views, expected);
  });
}

test('repository compare rejects persisted WFV outside fractional unit contract', async (t) => {
  sqlFixture(t, { ...base, raw_metrics: { wfv_pct: { value: 72.5, quality: 'VALID' } } });
  const repo = createComparisonRepository({ connectionString: 'postgres://unused', workspaceId: 'workspace-a' });
  await assert.rejects(repo.create({ batchId, contentIds: [contentId, 'content-b'], distribution: 'ORGANIC', mode: 'CONTROLLED', scope: 'PAIR' }), /WFV percentage must be between 0 and 1/);
  await assert.rejects(repo.get(comparisonId), /WFV percentage must be between 0 and 1/);
});

for (const stored of [{ engagement_rate: { value: 0.9, formulaVersion: 'metrics-v1' } }, {}]) {
  test(`new evidence derives canonical ER with ${Object.keys(stored).length ? 'stale' : 'empty'} persisted derived metrics`, async (t) => {
    const snapshot = { ...base, raw_metrics: Object.fromEntries(Object.entries({ views: 100, likes: 10, comments: 2, shares: 3, saves: 5 }).map(([name, value]) => [name, { value, quality: 'VALID' }])), derived_metrics: stored };
    sqlFixture(t, snapshot);
    let providerInput;
    t.mock.method(globalThis, 'fetch', async (_url, request) => {
      providerInput = JSON.parse(JSON.parse(request.body).messages[1].content.split('\n').at(-1));
      throw new Error('synthetic capture only');
    });
    const repo = createHypothesisRepository({ connectionString: 'postgres://unused', workspaceId: 'workspace-a', providerEndpoint: 'https://synthetic.invalid', providerApiKey: 'synthetic', providerModel: 'synthetic', providerName: 'synthetic' });
    await assert.rejects(repo.create({ batchId, comparisonId }), /provider request failed/);
    const derived = providerInput.evidence.find((item) => item.layer === 'DERIVED');
    assert.ok(derived, 'canonical DERIVED evidence must exist even when stored JSON is empty');
    assert.match(derived.statement, /"value":0\.2/);
    assert.match(derived.statement, /metrics-v2/);
    assert.equal(derived.basis.sourceSnapshotId, snapshot.id);
    assert.deepEqual(derived.basis.sourceMetricNames, ['likes', 'comments', 'shares', 'saves', 'views']);
    assert.deepEqual(snapshot.derived_metrics, stored, 'historical input remains unchanged');
  });
}
