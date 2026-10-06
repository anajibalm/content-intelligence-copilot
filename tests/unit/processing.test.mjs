import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  createFileJobStore,
  createProcessingJob,
  runProcessingJob,
} from '../../lib/processing/index.ts';

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cic-processing-'));
}

function fakeTools({ failTranscription = false } = {}) {
  const calls = [];
  return {
    calls,
    async probe(mediaPath) {
      calls.push(['probe', mediaPath]);
      return { format: { duration: '3.2', size: '12' }, streams: [{ codec_type: 'video', width: 640, height: 360 }] };
    },
    async extractAudio(mediaPath, outputPath) {
      calls.push(['audio', mediaPath, outputPath]);
      fs.writeFileSync(outputPath, 'audio');
    },
    async extractFrames(mediaPath, outputDir, timestamps) {
      calls.push(['frames', mediaPath, outputDir, timestamps]);
      fs.mkdirSync(outputDir, { recursive: true });
      return timestamps.map((timestampMs) => {
        const filePath = path.join(outputDir, `${timestampMs}.jpg`);
        fs.writeFileSync(filePath, `frame-${timestampMs}`);
        return { timestampMs, storagePath: filePath, width: 640, height: 360 };
      });
    },
    async extractPerSecondFrames(mediaPath, outputDir, durationMs) {
      calls.push(['per-second', mediaPath, outputDir, durationMs]);
      fs.mkdirSync(outputDir, { recursive: true });
      return [0, 1000, 2000, 3000].map((timestampMs) => {
        const filePath = path.join(outputDir, `${timestampMs}.jpg`);
        fs.writeFileSync(filePath, `inventory-${timestampMs}`);
        return { timestampMs, storagePath: filePath, width: 640, height: 360 };
      });
    },
    async transcribe(audioPath) {
      calls.push(['transcribe', audioPath]);
      if (failTranscription) throw new Error('transcriber unavailable');
      return {
        engine: 'fake-whisper',
        model: 'fixture',
        language: 'id',
        segments: [
          { startMs: 0, endMs: 800, text: 'hook', role: 'HOOK' },
          { startMs: 1000, endMs: 1800, text: 'claim', role: 'MAIN_CLAIM' },
        ],
      };
    },
  };
}

function job(root) {
  const mediaPath = path.join(root, 'input.mp4');
  fs.writeFileSync(mediaPath, 'temporary-media');
  return createProcessingJob({
    id: 'job-1',
    workspaceId: 'workspace-1',
    contentId: 'content-1',
    mediaPath,
    outputRoot: path.join(root, 'outputs'),
    sourceUrl: 'https://www.tiktok.com/@barakat.id/video/7420000000000000001',
  });
}

test('processing persists ffprobe, audio, transcript, hook, representative, and per-second outputs', async () => {
  const root = tempRoot();
  const store = createFileJobStore(path.join(root, 'state.json'));
  const tools = fakeTools();
  const result = await runProcessingJob(job(root), { store, tools });

  assert.equal(result.state, 'COMPLETED');
  assert.equal(result.output.observed.ffprobe.format.duration, '3.2');
  assert.deepEqual(result.output.transcript.segments.map((segment) => segment.startMs), [0, 1000]);
  assert.deepEqual(result.output.perSecondFrames.map((frame) => frame.timestampMs), [0, 1000, 2000, 3000]);
  assert.ok(result.output.audio.storagePath);
  assert.equal(fs.existsSync(result.mediaPath), false, 'temporary media must be deleted after persistence');
  assert.ok(fs.existsSync(result.output.audio.storagePath));
  assert.equal(fs.existsSync(store.path), true, 'job state must survive process restart');

  const restored = store.read('job-1');
  assert.equal(restored.state, 'COMPLETED');
  assert.equal(restored.output.transcript.segments[1].endMs, 1800);

  const callsBeforeRetry = tools.calls.length;
  const retry = await runProcessingJob(restored, { store, tools });
  assert.equal(retry.state, 'COMPLETED');
  assert.equal(tools.calls.length, callsBeforeRetry, 'completed retry must be idempotent');
});

test('failed processing persists failure state and cleans temporary media safely', async () => {
  const root = tempRoot();
  const store = createFileJobStore(path.join(root, 'state.json'));
  const mediaJob = job(root);
  await assert.rejects(
    () => runProcessingJob(mediaJob, { store, tools: fakeTools({ failTranscription: true }) }),
    /transcriber unavailable/,
  );

  const result = store.read('job-1');
  assert.ok(result);
  assert.equal(result.state, 'FAILED');
  assert.match(result.error, /transcriber unavailable/);
  assert.equal(fs.existsSync(mediaJob.mediaPath), false);
  assert.equal(store.read('job-1').state, 'FAILED');
});
