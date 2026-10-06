import test from 'node:test';
import assert from 'node:assert/strict';
import { rankingExtremes, selectionRequestKey } from '../../lib/workspace/presentation.ts';

test('returns both best and lowest ties without crossing ranking bases', () => {
  const group = {
    basis: 'views',
    direction: 'DESC',
    items: [
      { contentId: 'best-a', value: 100, basis: { metric: 'views', label: 'Best by Views' } },
      { contentId: 'best-b', value: 100, basis: { metric: 'views', label: 'Best by Views' } },
      { contentId: 'middle', value: 50, basis: { metric: 'views', label: 'Best by Views' } },
      { contentId: 'low-a', value: 10, basis: { metric: 'views', label: 'Best by Views' } },
      { contentId: 'low-b', value: 10, basis: { metric: 'views', label: 'Best by Views' } },
    ],
  };
  const result = rankingExtremes(group);
  assert.deepEqual(result.best.items.map((item) => item.contentId), ['best-a', 'best-b']);
  assert.deepEqual(result.lowest.items.map((item) => item.contentId), ['low-a', 'low-b']);
  assert.equal(result.best.value, 100);
  assert.equal(result.lowest.value, 10);

  const ascending = rankingExtremes({ ...group, direction: 'ASC', items: [...group.items].reverse() });
  assert.deepEqual(ascending.best.items.map((item) => item.contentId), ['low-a', 'low-b']);
  assert.deepEqual(ascending.lowest.items.map((item) => item.contentId), ['best-a', 'best-b']);
});

test('changes request key when active selection is requested again', () => {
  assert.notEqual(selectionRequestKey('batch-1', 'content-1', 1), selectionRequestKey('batch-1', 'content-1', 2));
  assert.equal(selectionRequestKey('batch-1', 'content-1', 2), 'batch-1:content-1:2');
});
