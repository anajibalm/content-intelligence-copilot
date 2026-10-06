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
    views: { value: views, quality: overrides.viewsQuality ?? 'VALID' },
    likes: { value: overrides.likes ?? 10, quality: overrides.likesQuality ?? 'VALID' },
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
    rankingRule: { distribution: 'ORGANIC', minimumSampleSize: 1, direction: 'DESC' },
    fallbackRule: { metric: 'views', direction: 'DESC' },
  };
  const result = rankBatch([organicBest, organicFallback, paid], config);
  assert.equal(result.status, 'READY');
  assert.deepEqual(result.ranked, []);
  assert.deepEqual(result.rankedGroups.map((group) => group.items.map((item) => item.contentId)), [['content-a'], ['content-b']]);
  assert.equal(result.rankedGroups[0].items[0].basis.metric, 'awt_seconds');
  assert.equal(result.rankedGroups[1].items[0].basis.metric, 'views');
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

test('separates primary and fallback bases and honors fallback direction', () => {
  const primary = snapshot('primary', 'ORGANIC', 100, { awt: 0.01 });
  const fallbackHigh = snapshot('fallback-high', 'ORGANIC', 1000);
  const fallbackLow = snapshot('fallback-low', 'ORGANIC', 10);
  const result = rankBatch([primary, fallbackHigh, fallbackLow], {
    id: 'config-separate', version: 1, approvalState: 'APPROVED', primaryMetric: 'awt_seconds',
    rankingRule: { distribution: 'ORGANIC', minimumSampleSize: 1, direction: 'DESC' },
    fallbackRule: { metric: 'views', direction: 'ASC' },
  });
  assert.equal(result.status, 'READY');
  assert.equal(result.ranked.length, 0);
  assert.deepEqual(result.rankedGroups.map((group) => group.items.map((item) => item.value)), [[0.01], [10, 1000]]);
  assert.equal(result.rankedGroups[1].direction, 'ASC');
  assert.equal(result.reason, 'fallback basis is not approved for cross-basis ordering');
});

test('identifies only top tied DESC items and lowest ASC items as cohort winners', () => {
  const values = [snapshot('middle', 'ORGANIC', 50), snapshot('top-a', 'ORGANIC', 100), snapshot('top-b', 'ORGANIC', 100)];
  const desc = rankBatch(values, { id: 'desc', version: 1, approvalState: 'APPROVED', primaryMetric: 'views', rankingRule: { distribution: 'ORGANIC', minimumSampleSize: 1, direction: 'DESC' }, fallbackRule: {} });
  assert.deepEqual(desc.rankedGroups[0].items.map((item) => item.contentId), ['content-top-a', 'content-top-b', 'content-middle']);
  assert.deepEqual(desc.rankedGroups[0].items.filter((item) => item.value === desc.rankedGroups[0].items[0].value).map((item) => item.contentId), ['content-top-a', 'content-top-b']);
  const asc = rankBatch(values, { id: 'asc', version: 1, approvalState: 'APPROVED', primaryMetric: 'views', rankingRule: { distribution: 'ORGANIC', minimumSampleSize: 1, direction: 'ASC' }, fallbackRule: {} });
  assert.equal(asc.rankedGroups[0].items[0].contentId, 'content-middle');
});
test('preserves canonical quality reasons without converting suspect zero to source error', () => {
  const result = normalizeMetricSnapshot({
    id: 'reason', contentId: 'content-reason', distribution: 'ORGANIC',
    rawMetrics: { comments: { value: 0, quality: 'SUSPECT', reason: 'UNEXPLAINED_ZERO' }, awt_seconds: { value: null, quality: 'UNAVAILABLE', reason: 'NOT_ACCESSIBLE' } },
  });
  assert.equal(result.qualityByMetric.comments.reason, 'UNEXPLAINED_ZERO');
  assert.equal(result.qualityByMetric.awt_seconds.reason, 'NOT_ACCESSIBLE');
});

test('calculates Organic and Paid KPI independently and excludes non-contributing inputs', () => {
  const organic = snapshot('organic', 'ORGANIC', 100);
  const paid = snapshot('paid', 'PAID', 2000);
  const suspect = snapshot('suspect', 'PAID', 0, { viewsQuality: 'SUSPECT', likes: 0, likesQuality: 'SUSPECT' });
  const definition = { id: 'paid-kpi', metricName: 'views', targetValue: 1000, comparator: 'GTE', aggregationMethod: 'SUM', distribution: 'PAID' };
  const result = assessKpi(definition, [organic, paid, suspect], { minimumSampleSize: 1 });
  assert.equal(result.status, 'ACHIEVED');
  assert.equal(result.actualValue, 2000);
  assert.deepEqual(result.sourceSnapshotIds, ['paid']);
  assert.deepEqual(result.excludedSnapshotIds, ['suspect']);
});

test('does not treat unsupported KPI policy as an achieved result', () => {
  const result = assessKpi({ metricName: 'views', targetValue: 10, comparator: 'BOGUS', aggregationMethod: 'MEDIAN' }, [snapshot('bad-policy', 'ORGANIC', 100)], { minimumSampleSize: 1 });
  assert.equal(result.status, 'UNCONFIGURED');
  assert.match(result.reason, /comparator|aggregation/i);
});

test('does not activate synthetic approval for non-demo observations', () => {
  const result = rankBatch([normalizeMetricSnapshot({
    id: 'real', contentId: 'content-real', distribution: 'ORGANIC', source: 'owned_export',
    rawMetrics: { views: { value: 100, quality: 'VALID' } },
  })], {
    id: 'synthetic-config', version: 2, approvalState: 'APPROVED', configuredBy: 'synthetic_s5_fixture',
    primaryMetric: 'views', rankingRule: { distribution: 'ORGANIC', minimumSampleSize: 1 }, fallbackRule: {},
  });
  assert.equal(result.status, 'UNCONFIGURED');
  assert.match(result.reason, /synthetic|provenance/i);
});

assert.equal(typeof deriveMetrics, 'function');
