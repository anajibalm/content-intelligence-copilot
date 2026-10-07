import test from 'node:test';
import assert from 'node:assert/strict';
import {
  featureReviewStateFor,
  goldenLabelAllowed,
  planContentReview,
  validateContentReviewInput,
  validateFeatureReviewInput,
  validateHypothesisReviewInput,
  ReviewNotFoundError,
  ReviewValidationError,
} from '../../lib/review/rules.ts';

const reviewer = 'analyst_01';
const reasonCode = 'WRONG_CLASSIFICATION';
const extractionRunId = 'run-1';
const features = [
  { id: 'f1', aiValue: 'topic_a', reviewedValue: null, reviewState: 'UNREVIEWED' },
  { id: 'f2', aiValue: 'format_a', reviewedValue: null, reviewState: 'UNREVIEWED' },
  { id: 'f3', aiValue: 'already_reviewed', reviewedValue: 'old_value', reviewState: 'CONFIRMED' },
];

function rejects(fn, ErrorType = ReviewValidationError) {
  assert.throws(fn, (error) => error instanceof ErrorType);
}

test('review decisions map to persisted feature states and golden eligibility', () => {
  assert.equal(featureReviewStateFor('CONFIRM'), 'CONFIRMED');
  assert.equal(featureReviewStateFor('CORRECT'), 'CORRECTED');
  assert.equal(featureReviewStateFor('REJECT'), 'REJECTED');
  assert.equal(goldenLabelAllowed('CONFIRM'), true);
  assert.equal(goldenLabelAllowed('APPROVE'), true);
  assert.equal(goldenLabelAllowed('REJECT'), false);
});

test('feature and hypothesis validation enforce required correction data', () => {
  rejects(() => validateFeatureReviewInput({ decision: 'REJECT', reviewer }));
  rejects(() => validateFeatureReviewInput({ decision: 'CORRECT', reviewer }));
  rejects(() => validateFeatureReviewInput({ decision: 'NOPE', reviewer }));
  rejects(() => validateFeatureReviewInput({ decision: 'REJECT', reviewer, reasonCode, goldenLabel: true }));
  rejects(() => validateHypothesisReviewInput({ decision: 'EDIT', reviewer }));
  rejects(() => validateHypothesisReviewInput({ decision: 'REJECT', reviewer }));
  assert.deepEqual(
    validateHypothesisReviewInput({ decision: 'EDIT', reviewer, editedStatement: 'edited claim' }),
    { decision: 'EDIT', reviewer, reasonCode: null, note: null, editedStatement: 'edited claim', goldenLabel: false },
  );
});

test('content review accepts corrections only for CORRECT and rejects duplicates', () => {
  rejects(() => validateContentReviewInput({ decision: 'CONFIRM', reviewer, extractionRunId, corrections: [{ contentFeatureId: 'f1', value: 'x' }] }));
  rejects(() => validateContentReviewInput({
    decision: 'CORRECT',
    reviewer,
    extractionRunId,
    corrections: [{ contentFeatureId: 'f1', value: 'x' }, { contentFeatureId: 'f1', value: 'y' }],
  }));
  const input = validateContentReviewInput({
    decision: 'CORRECT',
    reviewer,
    extractionRunId,
    corrections: [{ contentFeatureId: 'f1', value: 'topic_corrected', reasonCode }],
  });
  assert.equal(input.corrections[0].value, 'topic_corrected');
});

test('content review plan confirms untouched AI originals and never rewrites reviewed features', () => {
  const input = validateContentReviewInput({
    decision: 'CORRECT',
    reviewer,
    extractionRunId,
    corrections: [{ contentFeatureId: 'f1', value: 'topic_corrected', reasonCode }],
  });
  assert.deepEqual(planContentReview(features, input), [
    { contentFeatureId: 'f1', decision: 'CORRECT', value: 'topic_corrected', reasonCode },
    { contentFeatureId: 'f2', decision: 'CONFIRM', value: 'format_a', reasonCode: null },
  ]);
  rejects(() => planContentReview(features, {
    decision: 'CONFIRM',
    reviewer,
    reasonCode: null,
    note: null,
    goldenLabel: false,
    corrections: [{ contentFeatureId: 'missing', value: 'bad', reasonCode: null }],
  }), ReviewNotFoundError);
});

test('content review permits correction A to B and preserves previous event semantics', () => {
  const first = validateContentReviewInput({ decision: 'CORRECT', reviewer, extractionRunId, corrections: [{ contentFeatureId: 'f3', value: 'corrected_a', reasonCode }] });
  const second = validateContentReviewInput({ decision: 'CORRECT', reviewer, extractionRunId, corrections: [{ contentFeatureId: 'f3', value: 'corrected_b', reasonCode }] });
  assert.deepEqual(planContentReview(features, first), [
    { contentFeatureId: 'f1', decision: 'CONFIRM', value: 'topic_a', reasonCode: null },
    { contentFeatureId: 'f2', decision: 'CONFIRM', value: 'format_a', reasonCode: null },
    { contentFeatureId: 'f3', decision: 'CORRECT', value: 'corrected_a', reasonCode },
  ]);
  assert.deepEqual(planContentReview([{ ...features[2], reviewedValue: 'corrected_a', reviewState: 'CORRECTED' }], second), [{ contentFeatureId: 'f3', decision: 'CORRECT', value: 'corrected_b', reasonCode }]);
});
