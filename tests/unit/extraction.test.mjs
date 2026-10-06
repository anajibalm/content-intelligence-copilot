import test from 'node:test';
import assert from 'node:assert/strict';
import { extractFingerprint } from '../../lib/extraction/index.ts';

const output = {
  observed: { ffprobe: { format: { duration: '2' }, streams: [] } },
  audio: { storagePath: '/tmp/audio.wav', format: 'wav' },
  transcript: { engine: 'test', segments: [{ startMs: 0, endMs: 500, text: 'Jangan beli sebelum tahu solusi produk ini' }] },
  hookFrames: [{ id: 'frame-1', timestampMs: 0, storagePath: '/tmp/frame.jpg' }],
  representativeFrames: [],
  perSecondFrames: [],
  productEntryAnchors: [],
};

test('fingerprint extraction hashes actual transcript and frames and caps confidence LOW', () => {
  const result = extractFingerprint(output);
  assert.match(result.inputHash, /^sha256:[0-9a-f]{64}$/);
  assert.equal(result.confidence, 'LOW');
  assert.equal(result.features.length, 13);
  assert.equal(result.features.find((feature) => feature.fieldName === 'tension_type').aiValue, 'problem_solution');
  assert.deepEqual(result.rawOutput.features, result.features);
});

test('fingerprint extraction changes input hash when transcript changes', () => {
  const changed = structuredClone(output);
  changed.transcript.segments[0].text = 'Konten berbeda';
  assert.notEqual(extractFingerprint(output).inputHash, extractFingerprint(changed).inputHash);
});
