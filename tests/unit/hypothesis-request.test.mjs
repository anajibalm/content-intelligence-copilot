import test from 'node:test';
import assert from 'node:assert/strict';
import { operationIdFromRequest, validOperationId } from '../../lib/hypothesis/request.ts';

const id = '11111111-1111-4111-8111-111111111111';

test('optional operation ID accepts absent, body, and header forms', () => {
  assert.equal(operationIdFromRequest({}, null), undefined);
  assert.equal(operationIdFromRequest({}, id), id);
  assert.equal(operationIdFromRequest({ operationId: id }, null), id);
});

test('body operation ID takes precedence over idempotency header', () => {
  assert.equal(operationIdFromRequest({ operationId: id }, '22222222-2222-4222-8222-222222222222'), id);
});

test('malformed supplied operation ID is rejected by route validator', () => {
  assert.equal(validOperationId('not-a-uuid'), false);
  assert.equal(validOperationId(undefined), true);
});
