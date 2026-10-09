import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  AcquisitionError,
  createFakeAcquirer,
  createLedger,
  resolveIngestion,
  normalizeTikTokUrl,
  runAcquisition,
} from '../../lib/acquisition/index.ts';
import { compareContents } from '../../lib/compare/rules.ts';
import { parseModelOutput } from '../../lib/hypothesis/postgres.ts';
import { validateHypothesis } from '../../lib/hypothesis/rules.ts';
import { createFileJobStore, createProcessingJob, runProcessingJob } from '../../lib/processing/index.ts';

const URL = 'https://www.tiktok.com/@barakat.id/video/7420000000000000001';
const content = (id, { distribution = 'ORGANIC', quality = 'VALID', reviewed = true } = {}) => ({
  id,
  pillarId: 'pillar-a',
  durationSeconds: 30,
  features: {
    format: { reviewedValue: reviewed ? 'talking_head' : null, reviewState: reviewed ? 'CONFIRMED' : 'UNREVIEWED' },
    talent_type: { reviewedValue: reviewed ? 'creator' : null, reviewState: reviewed ? 'CONFIRMED' : 'UNREVIEWED' },
  },
  snapshots: [{ id: `${id}-${distribution.toLowerCase()}`, distribution, quality, contentAgeHours: 24, rawMetrics: { views: quality === 'VALID' ? 100 : null }, qualityByMetric: { views: { state: quality, reason: quality === 'VALID' ? null : 'NOT_ACCESSIBLE' } } }],
});

function hypothesisEvidence() {
  return [{ id: 'metric-1', sourceType: 'METRIC_SNAPSHOT', sourceId: 'snapshot-1', workspaceId: 'workspace-1', batchId: 'batch-1', contentId: 'content-1', comparisonId: 'comparison-1', layer: 'OBSERVED', statement: 'OBSERVED views 100', link: '/?batchId=batch-1&contentId=content-1#metric-snapshot-snapshot-1' }];
}

function output(overrides = {}) {
  return { statement: 'Observed difference.', supporting_evidence_ids: ['metric-1'], contradicting_evidence_ids: [], contextual_evidence_ids: [], suggested_next_test: { action: 'Repeat with reviewed sample.' }, confidence: 'LOW', ...overrides };
}

test('S13 failure matrix rejects invalid URL before provider', async () => {
  const acquirer = createFakeAcquirer({});
  const result = await runAcquisition(acquirer, 'https://vm.tiktok.com/ZMabcdef/', { attemptHistory: { attempts: [] } });
  assert.ok(result.error instanceof AcquisitionError);
  assert.equal(result.error.reasonCode, 'INVALID_URL');
  assert.equal(acquirer.calls.length, 0);
});

test('S13 failure matrix records acquisition failure', async () => {
  const result = await runAcquisition(createFakeAcquirer({ script: [{ failure: { reason: 'PROVIDER_ERROR', message: 'controlled acquisition failure' } }] }), URL, { attemptHistory: { attempts: [] } });
  assert.equal(result.packet, null);
  assert.equal(result.attempt.status, 'FAILED');
  assert.equal(result.attempt.failureReason, 'PROVIDER_ERROR');
});

test('S13 failure matrix persists transcription failure without pending state', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cic-s13-transcription-'));
  const media = path.join(root, 'input.mp4');
  fs.writeFileSync(media, 'temporary');
  const store = createFileJobStore(path.join(root, 'state.json'));
  const job = createProcessingJob({ id: 's13-job', workspaceId: 'workspace-1', contentId: 'content-1', mediaPath: media, outputRoot: path.join(root, 'output'), sourceUrl: URL });
  const tools = { probe: async () => ({ format: { duration: '1' }, streams: [{ codec_type: 'video', width: 1, height: 1 }] }), extractAudio: async (_input, output) => fs.writeFileSync(output, 'audio'), extractFrames: async () => [], extractPerSecondFrames: async () => [], transcribe: async () => { throw new Error('controlled transcription failure'); } };
  await assert.rejects(() => runProcessingJob(job, { store, tools }), /controlled transcription failure/);
  assert.equal(store.read('s13-job').state, 'FAILED');
  assert.equal(fs.existsSync(media), false);
});

test('S13 failure matrix marks suspect metrics low quality', () => {
  const result = compareContents({ mode: 'CONTROLLED', scope: 'PAIR', distribution: 'ORGANIC', contentIds: ['a', 'b'], contents: [content('a', { quality: 'SUSPECT' }), content('b', { quality: 'SUSPECT' })] });
  assert.equal(result.quality, 'LOW');
  assert.equal(result.controlledVariables.metric_quality, 'SUSPECT');
});

test('S13 failure matrix keeps low sample below strong quality', () => {
  const result = compareContents({ mode: 'CONTROLLED', scope: 'PAIR', distribution: 'ORGANIC', contentIds: ['a', 'b'], contents: [content('a'), content('b')] });
  assert.equal(result.quality, 'LOW');
  assert.match(result.qualityReasons.join(' '), /sample size 2/);
});

test('S13 failure matrix caps unreviewed extraction', () => {
  const result = compareContents({ mode: 'CONTROLLED', scope: 'PAIR', distribution: 'ORGANIC', contentIds: ['a', 'b'], contents: [content('a', { reviewed: false }), content('b', { reviewed: false })] });
  assert.equal(result.controlledVariables.feature_review_state, 'UNREVIEWED');
  assert.match(result.qualityReasons.join(' '), /unreviewed extracted features/);
});

test('S13 failure matrix rejects missing evidence IDs', () => {
  assert.throws(() => validateHypothesis({ workspaceId: 'workspace-1', batchId: 'batch-1', comparisonId: 'comparison-1', comparisonQuality: 'LOW', sampleSize: 2, primaryMetricQuality: 'VALID', modelOutput: output({ supporting_evidence_ids: ['missing'] }), evidence: hypothesisEvidence() }), /not in scoped catalog/);
});

test('S13 failure matrix does not compare absent Organic and Paid snapshots', () => {
  const result = compareContents({ mode: 'CONTROLLED', scope: 'PAIR', distribution: 'PAID', contentIds: ['a', 'b'], contents: [content('a'), content('b')] });
  assert.equal(result.quality, 'UNAVAILABLE');
  assert.match(result.qualityReasons.join(' '), /PAID snapshot is unavailable/);
});

test('S13 failure matrix deduplicates canonical URL identity', () => {
  const first = resolveIngestion(createLedger(), normalizeTikTokUrl(URL));
  const second = resolveIngestion(first.ledger, normalizeTikTokUrl(`${URL}?utm_source=share`));
  assert.equal(second.resolution.isRepeat, true);
  assert.equal(second.resolution.contentId, first.resolution.contentId);
  assert.equal(Object.keys(second.ledger.byKey).length, 1);
});

test('S13 failure matrix rejects malformed model JSON', () => {
  assert.throws(() => parseModelOutput({ choices: [{ message: { content: '{not-json}' } }] }), /malformed JSON/);
});
