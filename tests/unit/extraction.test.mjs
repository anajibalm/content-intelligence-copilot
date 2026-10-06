import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMultimodalFingerprintExtractor } from '../../lib/extraction/multimodal.ts';
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

test('multimodal adapter sends image bytes and parses complete JSON response', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cic-extraction-'));
  const framePath = join(directory, 'frame.jpg');
  const representativePath = join(directory, 'representative.jpg');
  await writeFile(framePath, Buffer.from([1, 2, 3]));
  await writeFile(representativePath, Buffer.from([4, 5, 6]));
  let request;
  const extractor = createMultimodalFingerprintExtractor({
    endpoint: 'http://provider.test/v1/chat/completions',
    apiKey: 'test-key',
    model: 'test-vision',
    fetchImpl: async (_url, init) => {
      request = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ features: modelOutput.features }) } }] }), { status: 200 });
    },
  });
  const result = await extractor(buildExtractionInput({ ...output, hookFrames: [{ ...output.hookFrames[0], storagePath: framePath }], representativeFrames: [{ ...output.representativeFrames[0], storagePath: representativePath }] }, { contentId: 'content-1', title: null, caption: null }));
  assert.equal(result.features.length, FINGERPRINT_FIELDS.length);
  assert.match(request.messages[0].content[1].image_url.url, /^data:image\/jpeg;base64,AQID$/);
  assert.equal(request.model, 'test-vision');
  assert.equal(result.inputHash, `sha256:${createHash('sha256').update(JSON.stringify(request)).digest('hex')}`);
});

test('input hash follows image bytes at the same path and preserves original model output', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cic-extraction-hash-'));
  try {
    const framePath = join(directory, 'frame.jpg');
    await writeFile(framePath, Buffer.from([1, 2, 3]));
    const extractor = createMultimodalFingerprintExtractor({
      endpoint: 'http://provider.test/v1/chat/completions',
      apiKey: 'test-key',
      model: 'test-vision',
      fetchImpl: async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ features: modelOutput.features }) } }] }), { status: 200 }),
    });
    const input = buildExtractionInput({ ...output, hookFrames: [{ ...output.hookFrames[0], storagePath: framePath }], representativeFrames: [] }, { contentId: 'content-1', title: null, caption: null });
    const firstOutput = await extractor(input);
    const first = extractFingerprint(input, firstOutput);
    assert.equal(first.inputHash, extractFingerprint(input, await extractor(input)).inputHash);
    assert.equal(first.rawOutput.inputHashBasis, 'multimodal_request');
    assert.deepEqual(first.rawOutput.modelOutput, firstOutput.rawOutput);
    await writeFile(framePath, Buffer.from([4, 5, 6]));
    const changed = extractFingerprint(input, await extractor(input));
    assert.notEqual(first.inputHash, changed.inputHash);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
