import test from 'node:test';
import assert from 'node:assert/strict';
import { compareContents, COMPARE_RULE_VERSION } from '../../lib/compare/rules.ts';

const snapshot = (id, distribution = 'ORGANIC', quality = 'VALID') => ({
  id,
  distribution,
  quality,
  qualityByMetric: { views: { state: quality, reason: quality === 'VALID' ? null : 'SOURCE_ERROR' } },
});

const content = (id, overrides = {}) => ({
  id,
  pillarId: overrides.pillarId ?? 'pillar-a',
  durationSeconds: overrides.durationSeconds ?? 10,
  contentAgeHours: overrides.contentAgeHours ?? 24,
  features: {
    format: { aiValue: overrides.format ?? 'talking_head', reviewedValue: null, reviewState: overrides.reviewState ?? 'CONFIRMED' },
    talent_type: { aiValue: overrides.talent ?? 'creator', reviewedValue: null, reviewState: overrides.reviewState ?? 'CONFIRMED' },
  },
  snapshots: [snapshot(`${id}-organic`), snapshot(`${id}-paid`, 'PAID')],
});

test('controlled pair preserves selection order and freezes exact distribution snapshot IDs', () => {
  const result = compareContents({
    mode: 'CONTROLLED',
    scope: 'PAIR',
    distribution: 'ORGANIC',
    contentIds: ['content-b', 'content-a'],
    contents: [content('content-a'), content('content-b')],
  });

  assert.equal(result.ruleVersion, COMPARE_RULE_VERSION);
  assert.deepEqual(result.items.map((item) => item.contentId), ['content-b', 'content-a']);
  assert.deepEqual(result.items.map((item) => item.position), [1, 2]);
  assert.deepEqual(result.snapshotIds, ['content-b-organic', 'content-a-organic']);
  assert.equal(result.controlledVariables.distribution_match, true);
  assert.equal(result.controlledVariables.same_pillar, true);
  assert.equal(result.controlledVariables.same_format, true);
});

test('controlled compare records uncontrolled differences without inventing a winner', () => {
  const result = compareContents({
    mode: 'CONTROLLED',
    scope: 'PAIR',
    distribution: 'ORGANIC',
    contentIds: ['content-a', 'content-b'],
    contents: [content('content-a'), content('content-b', { pillarId: 'pillar-b', durationSeconds: 30, format: 'product_demo' })],
  });

  assert.equal(result.label, null);
  assert.equal(result.uncontrolledVariables.pillar, 'mixed');
  assert.equal(result.uncontrolledVariables.format, 'mixed');
  assert.equal(result.uncontrolledVariables.duration_delta_seconds, 20);
  assert.equal(result.quality, 'LOW');
});

test('paid and organic snapshots stay explicit and suspect metrics degrade quality', () => {
  const suspect = content('content-b');
  suspect.snapshots = [snapshot('content-b-paid', 'PAID', 'SUSPECT')];
  const result = compareContents({
    mode: 'CONTROLLED',
    scope: 'PAIR',
    distribution: 'PAID',
    contentIds: ['content-a', 'content-b'],
    contents: [content('content-a'), suspect],
  });

  assert.deepEqual(result.snapshotIds, ['content-a-paid', 'content-b-paid']);
  assert.equal(result.controlledVariables.distribution_match, true);
  assert.equal(result.quality, 'LOW');
  assert.match(result.qualityReasons.join(' '), /suspect/i);
});

test('performance contrast is exploratory and rejects empty or duplicate selections', () => {
  const result = compareContents({
    mode: 'PERFORMANCE_CONTRAST',
    scope: 'GROUP',
    distribution: 'ORGANIC',
    contentIds: ['content-a', 'content-b'],
    contents: [content('content-a'), content('content-b')],
  });
  assert.equal(result.uncontrolledVariables.causal, false);
  assert.equal(result.uncontrolledVariables.exploratory, true);

  assert.throws(() => compareContents({ mode: 'CONTROLLED', scope: 'PAIR', distribution: 'ORGANIC', contentIds: [], contents: [] }), /at least one/);
  assert.throws(() => compareContents({ mode: 'CONTROLLED', scope: 'PAIR', distribution: 'ORGANIC', contentIds: ['content-a', 'content-a'], contents: [content('content-a')] }), /duplicate/);
});

test('unreviewed extracted feature caps comparison at LOW and missing snapshots become unavailable', () => {
  const unreviewed = content('content-a', { reviewState: 'UNREVIEWED' });
  const missing = content('content-b');
  missing.snapshots = [];
  const result = compareContents({
    mode: 'CONTROLLED',
    scope: 'PAIR',
    distribution: 'ORGANIC',
    contentIds: ['content-a', 'content-b'],
    contents: [unreviewed, missing],
  });

  assert.equal(result.quality, 'UNAVAILABLE');
  assert.match(result.qualityReasons.join(' '), /snapshot/i);
  assert.match(result.qualityReasons.join(' '), /unreviewed/i);
});
