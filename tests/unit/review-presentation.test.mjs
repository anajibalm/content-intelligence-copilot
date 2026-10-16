import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyHypothesisNote, comparisonChecklist, engagementCalculation, groupFeatureEvidence, groupHypotheses, formatMetricId, formatDateTimeId, presentStatement, statementSegments, summarizeStatement } from '../../lib/hypothesis/presentation.ts';

const make = (id, contentIds, statement, createdAt = '2026-10-01T00:00:00Z') => ({ id, batchId: 'batch', contentIds, statement, confidence: 'LOW', reviewDecision: null, reviewedStatement: null, createdAt, evidenceCount: 2 });

test('derives engagement display only from complete valid metrics-v2 snapshot inputs', () => {
  const raw = { likes: 27, comments: 0, shares: 2, saves: 1, views: 236 };
  const qualities = Object.fromEntries(Object.keys(raw).map((key) => [key, { state: 'VALID' }]));
  assert.deepEqual(engagementCalculation(raw, qualities, 30 / 236, 'metrics-v2'), { interactions: 30, views: 236, value: 30 / 236 });
  assert.equal(engagementCalculation(raw, qualities, 30 / 236, 'metrics-v1'), null);
  assert.equal(engagementCalculation(raw, { ...qualities, comments: { state: 'UNAVAILABLE' } }, 30 / 236, 'metrics-v2'), null);
  assert.equal(engagementCalculation({ ...raw, views: 0 }, qualities, null, 'metrics-v2'), null);
  assert.equal(engagementCalculation(raw, qualities, 0.127, 'metrics-v2'), null);
});

test('groups feature evidence by exact content and field, without collapsing different fields', () => {
  const items = [
    { id: 'frozen', content_id: 'a', source_id: 'old', basis: { fieldName: 'format', aiValue: 'A', reviewState: 'UNREVIEWED' } },
    { id: 'current', content_id: 'a', source_id: 'new', basis: { fieldName: 'format', aiValue: 'A', reviewState: 'CORRECTED' } },
    { id: 'other', content_id: 'b', source_id: 'other', basis: { fieldName: 'format' } },
    { id: 'field', content_id: 'a', source_id: 'field', basis: { fieldName: 'opening_style' } },
  ];
  const groups = groupFeatureEvidence(items);
  assert.deepEqual(groups.map((group) => group.map((item) => item.id)), [['frozen', 'current'], ['other'], ['field']]);
});
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
test('keeps original statement and separates every ontology prefix without guessing absent layers', () => {
  const original = 'EXTRACTED: format: A. OBSERVED: engagement_rate 12,71%';
  const parsed = statementSegments(original);
  assert.equal(parsed.statement, original);
  assert.deepEqual(parsed.segments, [
    { layer: 'EXTRACTED', text: 'format: A. ' },
    { layer: 'OBSERVED', text: 'engagement_rate 12,71%' },
  ]);
  assert.deepEqual(statementSegments('Narrative without ontology prefix').segments, [{ layer: null, text: 'Narrative without ontology prefix' }]);
});

test('flags malformed UUID-like reference without rewriting token', () => {
  const malformed = '99962fb3-edd3-4448-8cc4-999b4c06ce87';
  const result = presentStatement(`Acuan ${malformed}`, new Map());
  assert.equal(result.unknown[0], malformed);
  assert.equal(result.segments.map((part) => part.text).join(''), `Acuan ID tidak dikenal [${malformed}]`);
  assert.equal(result.original, `Acuan ${malformed}`);
});
