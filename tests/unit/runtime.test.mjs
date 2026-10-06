import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createFakeAcquirer } from '../../lib/acquisition/index.ts';
import { createRuntimeService } from '../../lib/runtime/service.ts';
import { createFileJobStore } from '../../lib/processing/index.ts';

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cic-runtime-'));
}

function tools({ failOnce = false } = {}) {
  let transcriptCalls = 0;
  return {
    async probe() {
      return { format: { duration: '2.1', size: '12' }, streams: [{ codec_type: 'video', width: 640, height: 360 }] };
    },
    async extractAudio(_mediaPath, outputPath) {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, 'audio');
    },
    async extractFrames(_mediaPath, outputDir, timestamps) {
      fs.mkdirSync(outputDir, { recursive: true });
      return timestamps.map((timestampMs) => {
        const storagePath = path.join(outputDir, `${timestampMs}.jpg`);
        fs.writeFileSync(storagePath, 'frame');
        return { timestampMs, storagePath, width: 640, height: 360 };
      });
    },
    async extractPerSecondFrames(_mediaPath, outputDir) {
      fs.mkdirSync(outputDir, { recursive: true });
      const storagePath = path.join(outputDir, '0.jpg');
      fs.writeFileSync(storagePath, 'frame');
      return [{ timestampMs: 0, storagePath, width: 640, height: 360 }];
    },
    async transcribe() {
      transcriptCalls += 1;
      if (failOnce && transcriptCalls === 1) throw new Error('temporary transcriber failure');
      return { engine: 'fake', language: 'id', segments: [{ startMs: 0, endMs: 500, text: 'actual' }] };
    },
  };
}

test('runtime service persists completed flow and makes completed retry a no-op', async () => {
  const root = tempRoot();
  const storePath = path.join(root, 'runtime.json');
  const acquirer = createFakeAcquirer({ tempDirBase: root });
  const processingTools = tools();
  const service = createRuntimeService({
    storePath,
    outputRoot: path.join(root, 'outputs'),
    acquirer,
    processingTools,
  });

  const first = await service.processUrl('https://www.tiktok.com/@barakat.id/video/7420000000000000001');
  assert.equal(first.status, 'COMPLETED');
  assert.equal(first.attempts.length, 1);
  assert.equal(first.processing.output.transcript.segments[0].text, 'actual');
  assert.equal(fs.existsSync(first.processing.mediaPath), false);

  const restarted = createRuntimeService({ storePath, outputRoot: path.join(root, 'outputs'), acquirer, processingTools });
  const retry = await restarted.processUrl(first.sourceUrl);
  assert.equal(retry.status, 'COMPLETED');
  assert.equal(retry.attempts.length, 1);
  assert.equal(acquirer.calls.length, 1, 'completed retry must not reacquire media');
});

test('runtime service retries failed processing with a new acquisition attempt', async () => {
  const root = tempRoot();
  const storePath = path.join(root, 'runtime.json');
  const acquirer = createFakeAcquirer({ tempDirBase: root });
  const processingTools = tools({ failOnce: true });
  const service = createRuntimeService({
    storePath,
    outputRoot: path.join(root, 'outputs'),
    acquirer,
    processingTools,
  });
  const url = 'https://www.tiktok.com/@barakat.id/video/7420000000000000002';

  await assert.rejects(() => service.processUrl(url), /temporary transcriber failure/);
  const failed = service.list()[0];
  assert.equal(failed.status, 'FAILED');
  assert.equal(failed.attempts.length, 1);

  const retried = await service.processUrl(url);
  assert.equal(retried.status, 'COMPLETED');
  assert.equal(retried.attempts.length, 2);
  assert.equal(acquirer.calls.length, 2);
});
