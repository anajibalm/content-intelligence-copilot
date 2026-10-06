import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExtractionInput, extractFingerprint, FINGERPRINT_FIELDS } from '../../lib/extraction/index.ts';

const output = {
  observed: { ffprobe: { format: { duration: '2' }, streams: [] } },
  audio: { storagePath: '/tmp/audio.wav', format: 'wav' },
  transcript: { engine: 'test', segments: [{ startMs: 0, endMs: 500, text: 'actual transcript' }] },
  hookFrames: [{ id: 'frame-1', timestampMs: 0, storagePath: '/tmp/hook.jpg' }],
  representativeFrames: [{ id: 'frame-2', timestampMs: 1000, storagePath: '/tmp/representative.jpg' }],
  perSecondFrames: [],
  productEntryAnchors: [],
};

const modelOutput = {
  provider: 'test-multimodal',
  model: 'test-vision-v1',
  promptVersion: 'fingerprint-v0.1',
  schemaVersion: 'fingerprint-v0.1',
  rawOutput: { responseId: 'actual-model-response' },
  features: FINGERPRINT_FIELDS.map((fieldName) => ({ fieldName, value: fieldName === 'talent_type' ? 'uncertain' : `${fieldName}-observed` })),
};

test('extraction sends metadata, timestamped transcript, hook frames, and representative frames to model boundary', () => {
  const input = buildExtractionInput(output, { contentId: 'content-1', title: 'Title', caption: 'Caption' });
  assert.equal(input.metadata.caption, 'Caption');
  assert.deepEqual(input.transcript, output.transcript);
  assert.deepEqual(input.hookFrames, output.hookFrames);
  assert.deepEqual(input.representativeFrames, output.representativeFrames);
  const result = extractFingerprint(input, modelOutput);
  assert.match(result.inputHash, /^sha256:[0-9a-f]{64}$/);
  assert.equal(result.confidence, 'LOW');
  assert.equal(result.features.length, 13);
  assert.equal(result.provider, 'test-multimodal');
  assert.deepEqual(result.rawOutput.modelOutput, modelOutput.rawOutput);
});

test('extraction blocks absent multimodal provider instead of inventing heuristic values', () => {
  const input = buildExtractionInput(output, { contentId: 'content-1', title: null, caption: null });
  assert.throws(() => extractFingerprint(input, null), /no multimodal fingerprint provider\/model is configured/);
});

test('extraction rejects incomplete model output', () => {
  const input = buildExtractionInput(output, { contentId: 'content-1', title: null, caption: null });
  assert.throws(() => extractFingerprint(input, { ...modelOutput, features: modelOutput.features.slice(1) }), /complete fingerprint schema/);
});
