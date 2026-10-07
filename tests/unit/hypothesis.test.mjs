import test from 'node:test';
import assert from 'node:assert/strict';
import { HYPOTHESIS_RULE_VERSION, evidenceCatalogId, validateHypothesis } from '../../lib/hypothesis/rules.ts';

const evidence = [
  { id: 'metric-1', sourceType: 'METRIC_SNAPSHOT', sourceId: 'snapshot-1', workspaceId: 'workspace-1', batchId: 'batch-1', contentId: 'content-1', comparisonId: 'comparison-1', layer: 'OBSERVED', statement: 'OBSERVED views 1200', link: '/?batchId=batch-1&contentId=content-1#metric-snapshot-snapshot-1' },
  { id: 'feature-1', sourceType: 'CONTENT_FEATURE', sourceId: 'feature-1', workspaceId: 'workspace-1', batchId: 'batch-1', contentId: 'content-1', comparisonId: 'comparison-1', layer: 'EXTRACTED', statement: 'EXTRACTED format talking_head', reviewState: 'UNREVIEWED', link: '/?batchId=batch-1&contentId=content-1#content-feature-feature-1' },
];

function output(overrides = {}) {
  return { statement: 'Talking-head format is associated with stronger reach in this comparison.', supporting_evidence_ids: ['metric-1'], contradicting_evidence_ids: [], contextual_evidence_ids: [], suggested_next_test: { variable_to_test: 'format', variant_a: 'talking_head', variant_b: 'product_demo' }, confidence: 'HIGH', ...overrides };
}

test('valid scoped output receives deterministic low caps', () => {
  const result = validateHypothesis({ workspaceId: 'workspace-1', batchId: 'batch-1', comparisonId: 'comparison-1', comparisonQuality: 'LOW', sampleSize: 2, primaryMetricQuality: 'VALID', modelOutput: output(), evidence });
  assert.equal(HYPOTHESIS_RULE_VERSION, 'hypothesis-v1');
  assert.equal(result.confidence, 'LOW');
  assert.ok(result.confidenceCaps.some((cap) => cap.rule === 'INSUFFICIENT_SAMPLE'));
  assert.ok(result.confidenceCaps.some((cap) => cap.rule === 'ONE_COMPARISON'));
});

test('unreviewed extracted evidence remains explicit and caps confidence', () => {
  const result = validateHypothesis({ workspaceId: 'workspace-1', batchId: 'batch-1', comparisonId: 'comparison-1', comparisonQuality: 'HIGH', sampleSize: 3, primaryMetricQuality: 'VALID', modelOutput: output({ supporting_evidence_ids: ['feature-1'] }), evidence });
  assert.equal(result.confidence, 'LOW');
  assert.ok(result.confidenceCaps.some((cap) => cap.rule === 'UNREVIEWED_EXTRACTED'));
});

test('invented, duplicate-role, and causal claims are rejected', () => {
  assert.throws(() => validateHypothesis({ workspaceId: 'workspace-1', batchId: 'batch-1', comparisonId: 'comparison-1', comparisonQuality: 'HIGH', sampleSize: 3, primaryMetricQuality: 'VALID', modelOutput: output({ supporting_evidence_ids: ['missing'] }), evidence }), /not in scoped catalog/);
  assert.throws(() => validateHypothesis({ workspaceId: 'workspace-1', batchId: 'batch-1', comparisonId: 'comparison-1', comparisonQuality: 'HIGH', sampleSize: 3, primaryMetricQuality: 'VALID', modelOutput: output({ contradicting_evidence_ids: ['metric-1'] }), evidence }), /multiple roles/);
  assert.throws(() => validateHypothesis({ workspaceId: 'workspace-1', batchId: 'batch-1', comparisonId: 'comparison-1', comparisonQuality: 'HIGH', sampleSize: 3, primaryMetricQuality: 'VALID', modelOutput: output({ statement: 'This proves causal lift.' }), evidence }), /causal certainty/);
});

test('Indonesian certainty and empty suggestions are rejected', () => {
  assert.throws(() => validateHypothesis({ workspaceId: 'workspace-1', batchId: 'batch-1', comparisonId: 'comparison-1', comparisonQuality: 'HIGH', sampleSize: 3, primaryMetricQuality: 'VALID', modelOutput: output({ statement: 'Format ini pasti menyebabkan peningkatan views.' }), evidence }), /causal certainty/);
  assert.throws(() => validateHypothesis({ workspaceId: 'workspace-1', batchId: 'batch-1', comparisonId: 'comparison-1', comparisonQuality: 'HIGH', sampleSize: 3, primaryMetricQuality: 'VALID', modelOutput: output({ suggested_next_test: {} }), evidence }), /actionable object/);
});

test('wrong comparison and wrong source layer are rejected', () => {
  assert.throws(() => validateHypothesis({ workspaceId: 'workspace-1', batchId: 'batch-1', comparisonId: 'other-comparison', comparisonQuality: 'HIGH', sampleSize: 3, primaryMetricQuality: 'VALID', modelOutput: output(), evidence }), /workspace\/comparison scope/);
  assert.throws(() => validateHypothesis({ workspaceId: 'workspace-1', batchId: 'batch-1', comparisonId: 'comparison-1', comparisonQuality: 'HIGH', sampleSize: 3, primaryMetricQuality: 'VALID', modelOutput: output(), evidence: [{ ...evidence[0], layer: 'EXTRACTED' }] }), /invalid layer/);
});

test('legacy-only evidence remains capped with explicit reason', () => {
  const result = validateHypothesis({ workspaceId: 'workspace-1', batchId: 'batch-1', comparisonId: 'comparison-1', comparisonQuality: 'HIGH', sampleSize: 3, primaryMetricQuality: 'VALID', modelOutput: output(), evidence: [evidence[0]] });
  assert.equal(result.confidence, 'LOW');
  assert.ok(result.confidenceCaps.some((cap) => cap.rule === 'LEGACY_ONLY'));
  assert.ok(result.confidenceCaps.some((cap) => cap.rule === 'ONE_COMPARISON'));
});

test('suspect or unavailable primary performance cannot reach strong confidence', () => {
  const suspect = validateHypothesis({ workspaceId: 'workspace-1', batchId: 'batch-1', comparisonId: 'comparison-1', comparisonQuality: 'HIGH', sampleSize: 3, primaryMetricQuality: 'SUSPECT', modelOutput: output(), evidence });
  const unavailable = validateHypothesis({ workspaceId: 'workspace-1', batchId: 'batch-1', comparisonId: 'comparison-1', comparisonQuality: 'HIGH', sampleSize: 3, primaryMetricQuality: 'UNAVAILABLE', modelOutput: output(), evidence });
  assert.equal(suspect.confidence, 'LOW');
  assert.equal(unavailable.confidence, 'LOW');
});

test('evidence IDs are stable for same scoped source', () => {
  assert.equal(evidenceCatalogId('workspace-1', 'comparison-1', 'METRIC_SNAPSHOT', 'snapshot-1', 'OBSERVED'), evidenceCatalogId('workspace-1', 'comparison-1', 'METRIC_SNAPSHOT', 'snapshot-1', 'OBSERVED'));
  assert.notEqual(evidenceCatalogId('workspace-1', 'comparison-1', 'METRIC_SNAPSHOT', 'snapshot-1', 'OBSERVED'), evidenceCatalogId('workspace-1', 'comparison-2', 'METRIC_SNAPSHOT', 'snapshot-1', 'OBSERVED'));
});
