import test from 'node:test';
import assert from 'node:assert/strict';
import { compareContents, COMPARE_RULE_VERSION } from '../../lib/compare/rules.ts';

const snapshot = (id, distribution = 'ORGANIC', quality = 'VALID', age = 24) => ({
  id,
  distribution,
  quality,
  contentAgeHours: age,
  rawMetrics: { views: quality === 'UNAVAILABLE' ? null : 100 },
  qualityByMetric: { views: { state: quality, reason: quality === 'VALID' ? null : 'NOT_ACCESSIBLE' } },
});
const content = (id, overrides = {}) => ({
  id,
  pillarId: Object.prototype.hasOwnProperty.call(overrides, 'pillarId') ? overrides.pillarId : 'pillar-a',
  durationSeconds: overrides.durationSeconds ?? 10,
  features: overrides.features ?? {
    format: { aiValue: overrides.format ?? 'talking_head', reviewedValue: overrides.reviewedFormat ?? 'talking_head', reviewState: overrides.reviewState ?? 'CONFIRMED' },
    talent_type: { aiValue: overrides.talent ?? 'creator', reviewedValue: overrides.reviewedTalent ?? 'creator', reviewState: overrides.reviewState ?? 'CONFIRMED' },
  },
  snapshots: [snapshot(`${id}-organic`, 'ORGANIC', overrides.quality ?? 'VALID', overrides.age ?? 24), snapshot(`${id}-paid`, 'PAID', overrides.quality ?? 'VALID', overrides.age ?? 24)],
});

function compare(input) {
  return compareContents({ mode: 'CONTROLLED', scope: input.contentIds.length === 2 ? 'PAIR' : 'GROUP', distribution: input.distribution ?? 'ORGANIC', ...input });
}

test('controlled pair preserves selection order and exact distribution snapshot IDs', () => {
  const result = compare({ contentIds: ['content-b', 'content-a'], contents: [content('content-a'), content('content-b')] });
  assert.equal(result.ruleVersion, COMPARE_RULE_VERSION);
  assert.deepEqual(result.items.map((item) => item.contentId), ['content-b', 'content-a']);
  assert.deepEqual(result.snapshotIds, ['content-b-organic', 'content-a-organic']);
  assert.equal(result.controlledVariables.distribution_match, true);
  assert.equal(result.controlledVariables.same_pillar, true);
  assert.equal(result.controlledVariables.same_format, true);
  assert.equal(result.uncontrolledVariables.causal, undefined);
});

test('pair always exposes explicit small-N reason and quality cap', () => {
  const result = compare({ contentIds: ['content-a', 'content-b'], contents: [content('content-a'), content('content-b')] });
  assert.equal(result.quality, 'LOW');
  assert.match(result.qualityReasons.join(' '), /sample size 2/i);
});

test('unknown controls and incompatible variables degrade quality with reasons', () => {
  const result = compare({
    contentIds: ['content-a', 'content-b'],
    contents: [
      content('content-a', { pillarId: null, features: {}, age: 0 }),
      content('content-b', { pillarId: null, format: 'product_demo', durationSeconds: 300, age: 696 }),
    ],
  });
  assert.equal(result.controlledVariables.same_pillar, null);
  assert.equal(result.controlledVariables.same_format, null);
  assert.equal(result.quality, 'LOW');
  assert.match(result.qualityReasons.join(' '), /same_pillar|same_format|unavailable/i);
  assert.match(result.qualityReasons.join(' '), /duration delta/i);
  assert.match(result.qualityReasons.join(' '), /content age delta/i);
});

test('unavailable metric quality cannot produce strong evidence or causal assertion', () => {
  const result = compare({
    contentIds: ['content-a', 'content-b', 'content-c'],
    contents: [content('content-a', { quality: 'UNAVAILABLE' }), content('content-b', { quality: 'UNAVAILABLE' }), content('content-c', { quality: 'UNAVAILABLE' })],
  });
  assert.equal(result.controlledVariables.metric_quality, 'UNAVAILABLE');
  assert.equal(result.quality, 'LOW');
  assert.equal(result.uncontrolledVariables.causal, undefined);
  assert.match(result.qualityReasons.join(' '), /metric quality is unavailable/i);
});

test('missing controls never promote a three-content comparison to high quality', () => {
  const result = compare({ contentIds: ['content-a', 'content-b', 'content-c'], contents: [content('content-a', { pillarId: null, features: {} }), content('content-b', { pillarId: null, features: {} }), content('content-c', { pillarId: null, features: {} })] });
  assert.equal(result.quality, 'LOW');
  assert.equal(result.controlledVariables.same_pillar, null);
  assert.equal(result.controlledVariables.same_format, null);
  assert.equal(result.controlledVariables.same_talent_class, null);
  assert.match(result.qualityReasons.join(' '), /unavailable|unreviewed/i);
});

test('reviewed values remain required when AI values are present', () => {
  const result = compare({ contentIds: ['content-a', 'content-b', 'content-c'], contents: [content('content-a', { reviewState: 'UNREVIEWED' }), content('content-b', { reviewState: 'UNREVIEWED' }), content('content-c', { reviewState: 'UNREVIEWED' })] });
  assert.equal(result.controlledVariables.feature_review_state, 'UNREVIEWED');
  assert.equal(result.controlledVariables.same_format, null);
  assert.equal(result.quality, 'LOW');
});

test('large duration and age deltas cannot retain high quality', () => {
  const result = compare({ contentIds: ['content-a', 'content-b', 'content-c'], contents: [content('content-a', { durationSeconds: 10, age: 0 }), content('content-b', { durationSeconds: 300, age: 696 }), content('content-c', { durationSeconds: 20, age: 24 })] });
  assert.equal(result.quality, 'LOW');
  assert.equal(result.controlledVariables.duration_match, false);
  assert.equal(result.controlledVariables.content_age_match, false);
  assert.match(result.qualityReasons.join(' '), /duration delta 290 seconds/);
  assert.match(result.qualityReasons.join(' '), /content age delta 696 hours/);
});

test('suspect metric, rejected feature, and unreviewed feature states remain visible', () => {
  const suspect = content('content-b', { quality: 'SUSPECT' });
  const rejected = content('content-a', { features: { format: { aiValue: 'talking_head', reviewedValue: null, reviewState: 'REJECTED' }, talent_type: { aiValue: 'creator', reviewedValue: 'creator', reviewState: 'CONFIRMED' } } });
  const result = compare({ contentIds: ['content-a', 'content-b'], contents: [rejected, suspect] });
  assert.equal(result.controlledVariables.metric_quality, 'SUSPECT');
  assert.equal(result.controlledVariables.feature_review_state, 'UNREVIEWED');
  assert.equal(result.quality, 'LOW');
  assert.match(result.qualityReasons.join(' '), /rejected|unreviewed/i);
  assert.match(result.qualityReasons.join(' '), /suspect/i);
});

test('three genuinely compatible reviewed contents can reach HIGH quality under versioned tolerances', () => {
  const result = compare({ contentIds: ['content-a', 'content-b', 'content-c'], contents: [content('content-a'), content('content-b', { durationSeconds: 20 }), content('content-c', { durationSeconds: 30 })] });
  assert.equal(result.quality, 'HIGH');
  assert.equal(result.controlledVariables.duration_match, true);
  assert.equal(result.controlledVariables.content_age_match, true);
  assert.equal(result.controlledVariables.feature_review_state, 'REVIEWED');
  assert.equal(result.controlledVariables.duration_tolerance_seconds, 30);
  assert.ok(result.metricRows.every((row) => row.metrics.some((metric) => metric.name === 'views')));
});

test('performance contrast is exploratory and rejects invalid selections', () => {
  const result = compareContents({ mode: 'PERFORMANCE_CONTRAST', scope: 'GROUP', distribution: 'ORGANIC', contentIds: ['content-a', 'content-b'], contents: [content('content-a'), content('content-b')] });
  assert.equal(result.uncontrolledVariables.exploratory, true);
  assert.match(result.qualityReasons.join(' '), /exploratory and non-causal/i);
  assert.throws(() => compareContents({ mode: 'CONTROLLED', scope: 'PAIR', distribution: 'ORGANIC', contentIds: [], contents: [] }), /at least one/);
  assert.throws(() => compareContents({ mode: 'CONTROLLED', scope: 'PAIR', distribution: 'ORGANIC', contentIds: ['content-a', 'content-a'], contents: [content('content-a')] }), /duplicate/);
});
