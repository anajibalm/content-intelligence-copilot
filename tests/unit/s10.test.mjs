import test from 'node:test';
import assert from 'node:assert/strict';
import { S10ValidationError, validateNextTestInput, validateNextTestPatch, validateNoteInput } from '../../lib/s10/rules.ts';

const nextTest = { variableToTest: 'opening style', variantA: 'direct claim', variantB: 'question', controls: 'same batch and duration', expectedResult: 'variant A has higher saves', owner: 'analyst_01', successMetric: 'save rate', measurementWindow: '7 days' };

test('S10 validation requires human note and structured Next Test fields', () => {
  assert.deepEqual(validateNoteInput({ body: 'Keep hook concise', author: 'analyst_01' }), { body: 'Keep hook concise', author: 'analyst_01' });
  assert.equal(validateNextTestInput({ ...nextTest, targetBatchId: '51000000-0000-0000-0000-000000000002' }).targetBatchId, '51000000-0000-0000-0000-000000000002');
  assert.throws(() => validateNextTestInput({ ...nextTest, targetBatchId: 'not-a-uuid' }), S10ValidationError);
  assert.throws(() => validateNextTestPatch({ targetBatchId: 'not-a-uuid' }), S10ValidationError);
  assert.throws(() => validateNextTestInput({ ...nextTest, owner: '' }), S10ValidationError);
  assert.throws(() => validateNextTestPatch({ status: 'NOPE' }), S10ValidationError);
});
