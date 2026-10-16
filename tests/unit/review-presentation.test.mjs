import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyHypothesisNote, comparisonChecklist, groupHypotheses, formatMetricId, formatDateTimeId, presentStatement, summarizeStatement } from '../../lib/hypothesis/presentation.ts';

const make = (id, contentIds, statement, createdAt = '2026-10-01T00:00:00Z') => ({ id, batchId: 'batch', contentIds, statement, confidence: 'LOW', reviewDecision: null, reviewedStatement: null, createdAt, evidenceCount: 2 });

test('groups only identical canonical content sets and selects stable representative', () => {
  const groups = groupHypotheses([make('b', ['z', 'a'], 'claim B'), make('a', ['a', 'z'], 'claim A'), make('c', ['a'], 'claim C')]);
  const pair = groups.find((group) => group.contentIds.length === 2);
  assert.deepEqual(pair?.contentIds, ['a', 'z']);
  assert.equal(pair?.representative.id, 'a');
  assert.deepEqual(pair?.variants.map((item) => item.id), ['b']);
});

test('classifies only disclaimer-only statements as notes', () => {
  assert.equal(classifyHypothesisNote('Format A lebih tinggi 2,8 poin, tetapi belum membuktikan sebab.'), false);
  assert.equal(classifyHypothesisNote('Perbandingan ini tidak membuktikan kausalitas.'), true);
  assert.equal(classifyHypothesisNote('Perlu validasi lebih lanjut.'), true);
  assert.equal(classifyHypothesisNote('Tidak ada data untuk menyimpulkan.'), true);
});

test('formats percentages, integers and explicit Jakarta dates', () => {
  assert.equal(formatMetricId(0.1271, 'engagement_rate'), '12,71%');
  assert.equal(formatMetricId(0.09895833333333333, 'engagement_rate'), '9,90%');
  assert.equal(formatMetricId(236, 'views'), '236');
  assert.equal(formatDateTimeId('2026-10-06T14:23:00.000Z'), '6 Okt 2026, 21.23 WIB');
  assert.equal(formatDateTimeId('invalid'), 'Waktu tidak tersedia');
});

test('summary keeps one-line text, checklist preserves unknown controls and origin role', () => {
  assert.equal(summarizeStatement('DERIVED: Format lebih tinggi. Detail lanjutan.'), 'Format lebih tinggi.');
  const result = comparisonChecklist({ items: [{ contentId: 'a' }, { contentId: 'b' }], controlledVariables: { same_format: null }, roles: ['ORIGIN'], qualityReasons: [] }, 2);
  assert.deepEqual(result.checks, [{ label: 'Sampel', value: '2 konten' }, { label: 'Format', value: 'tidak diketahui' }, { label: 'Peran', value: 'Perbandingan asal hipotesis' }]);
});

test('unknown and malformed UUID-like tokens remain visible and warned', () => {
  const text = 'Konten 8ceb2837-ee83-4473-934c-d62990561c4f dibanding 99962fb3-edd3-4448-8cc4-999b4c06ce87.';
  const result = presentStatement(text, new Map([['8ceb2837-ee83-4473-934c-d62990561c4f', 'Barakat Siwak']]));
  assert.equal(result.segments.map((part) => part.text).join(''), 'Konten Barakat Siwak dibanding ID tidak dikenal [99962fb3-edd3-4448-8cc4-999b4c06ce87].');
  assert.equal(result.unknown.length, 1);
  const malformed = presentStatement('Konten 99962fb3-edd3-4448-8cc4-999b4c06ce8 tidak diketahui.', new Map());
  assert.equal(malformed.unknown[0], '99962fb3-edd3-4448-8cc4-999b4c06ce8');
  assert.match(malformed.segments.map((part) => part.text).join(''), /ID tidak dikenal/);
  assert.equal(result.original, text);
});
