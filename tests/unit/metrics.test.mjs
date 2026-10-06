import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessKpi,
  deriveMetrics,
  normalizeMetricSnapshot,
  rankBatch,
} from '../../lib/metrics/rules.ts';

const snapshot = (id, distribution, views, overrides = {}) => normalizeMetricSnapshot({
  id,
  contentId: `content-${id}`,
  distribution,
  source: 'synthetic_demo',
  capturedAt: '2026-10-06T00:00:00.000Z',
  rawMetrics: {
    views: { value: views, quality: 'VALID' },
    likes: { value: overrides.likes ?? 10, quality: 'VALID' },
    comments: { value: overrides.comments ?? 1, quality: overrides.commentsQuality ?? 'VALID' },
    shares: { value: overrides.shares ?? 2, quality: 'VALID' },
    saves: { value: overrides.saves ?? 1, quality: 'VALID' },
    awt_seconds: overrides.awt === undefined
      ? { value: null, quality: 'UNAVAILABLE', qualityNote: 'not_accessible' }
      : { value: overrides.awt, quality: overrides.awtQuality ?? 'VALID' },
  },
});

test('normalizes raw observations and derives ER without copying derived values into raw metrics', () => {
  const result = snapshot('one', 'ORGANIC', 100, { likes: 10, comments: 2, shares: 3, saves: 5 });
  assert.equal(result.rawMetrics.engagement_rate, undefined);
  assert.deepEqual(result.derivedMetrics.engagement_rate, {
    value: 0.2,
    formulaVersion: 'metrics-v1',
    sourceMetricNames: ['likes', 'comments', 'shares', 'saves', 'views'],
  });
  assert.equal(result.qualityByMetric.awt_seconds.state, 'UNAVAILABLE');
});

test('preserves explicit valid 0.01 measurement and distinguishes unavailable from source error', () => {
  const valid = snapshot('valid', 'ORGANIC', 100, { awt: 0.01 });
  assert.equal(valid.qualityByMetric.awt_seconds.state, 'VALID');
  assert.equal(valid.rawMetrics.awt_seconds, 0.01);

  const unavailable = snapshot('unavailable', 'ORGANIC', 100);
  assert.equal(unavailable.qualityByMetric.awt_seconds.state, 'UNAVAILABLE');

  const error = snapshot('error', 'ORGANIC', 100, { awt: 0, awtQuality: 'SUSPECT' });
  assert.equal(error.qualityByMetric.awt_seconds.state, 'SUSPECT');
  assert.equal(error.qualityByMetric.awt_seconds.reason, 'SOURCE_ERROR');
});

test('does not derive ER when an input is suspect or views are unavailable', () => {
  const suspect = snapshot('suspect', 'ORGANIC', 100, { comments: 0, commentsQuality: 'SUSPECT' });
  assert.equal(suspect.derivedMetrics.engagement_rate.value, null);
  const unavailable = snapshot('missing', 'ORGANIC', 0, { likes: null });
  assert.equal(unavailable.derivedMetrics.engagement_rate.value, null);
});

test('assesses KPI separately from relative benchmark and applies configured sample guard', () => {
  const definition = {
    id: 'kpi-1', metricName: 'engagement_rate', targetValue: 0.1, comparator: 'GTE',
    aggregationMethod: 'AVERAGE', distribution: 'ORGANIC', formulaVersion: 'metrics-v1',
  };
  const result = assessKpi(definition, [snapshot('a', 'ORGANIC', 100), snapshot('b', 'ORGANIC', 100)], {
    minimumSampleSize: 2,
  });
  assert.equal(result.status, 'ACHIEVED');
  assert.equal(result.actualValue, 0.14);
  assert.deepEqual(result.sourceSnapshotIds, ['a', 'b']);

  const insufficient = assessKpi(definition, [snapshot('a', 'ORGANIC', 100)], { minimumSampleSize: 2 });
  assert.equal(insufficient.status, 'INSUFFICIENT_DATA');
  assert.equal(insufficient.actualValue, null);

  const unconfigured = assessKpi({ ...definition, targetValue: null }, [snapshot('a', 'ORGANIC', 100)], { minimumSampleSize: 1 });
  assert.equal(unconfigured.status, 'UNCONFIGURED');
});

test('ranks complete batch only under approved brand config, keeps organic and paid separate, and uses explicit fallback', () => {
  const organicBest = snapshot('a', 'ORGANIC', 100, { likes: 30, awt: 0.01 });
  const organicFallback = snapshot('b', 'ORGANIC', 200, { likes: null });
  const paid = snapshot('c', 'PAID', 999, { likes: 99, awt: 0.5 });
  const config = {
    id: 'config-1', version: 2, approvalState: 'APPROVED', primaryMetric: 'awt_seconds',
    rankingRule: { distribution: 'ORGANIC', minimumSampleSize: 2, direction: 'DESC' },
    fallbackRule: { metric: 'views', direction: 'DESC' },
  };
  const result = rankBatch([organicBest, organicFallback, paid], config);
  assert.equal(result.status, 'READY');
  assert.deepEqual(result.ranked.map((item) => item.contentId), ['content-a', 'content-b']);
  assert.equal(result.ranked[0].basis.metric, 'awt_seconds');
  assert.equal(result.ranked[1].basis.metric, 'views');
  assert.equal(result.ranked[1].basis.fallbackUsed, true);
  assert.ok(result.excluded.some((item) => item.contentId === 'content-c' && item.reason.includes('distribution')));
});

test('returns explicit unconfigured result and stable ties without invented Best Overall score', () => {
  const items = [snapshot('b', 'ORGANIC', 100), snapshot('a', 'ORGANIC', 100)];
  const unconfigured = rankBatch(items, { id: 'config-1', version: 1, approvalState: 'UNCONFIGURED' });
  assert.equal(unconfigured.status, 'UNCONFIGURED');
  assert.ok(unconfigured.reason);

  const configured = rankBatch(items, {
    id: 'config-2', version: 1, approvalState: 'APPROVED', primaryMetric: 'views',
    rankingRule: { distribution: 'ORGANIC', minimumSampleSize: 1, direction: 'DESC' }, fallbackRule: {},
  });
  assert.deepEqual(configured.ranked.map((item) => item.contentId), ['content-a', 'content-b']);
  assert.equal(configured.ranked[0].basis.label, 'Best by Views');
  assert.equal(configured.ranked[0].basis.score, undefined);
});

test('rejects derived metric keys in raw observations', () => {
  assert.throws(() => normalizeMetricSnapshot({
    id: 'bad', contentId: 'content-bad', distribution: 'ORGANIC', rawMetrics: { engagement_rate: 0.2 },
  }), /derived metric/i);
});

assert.equal(typeof deriveMetrics, 'function');
