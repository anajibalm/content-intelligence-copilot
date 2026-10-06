import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn, execFile as nodeExecFile } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDefaultAcquirer } from '../lib/acquisition/index.ts';
import { createDefaultProcessingTools } from '../lib/processing/index.ts';
import { createPostgresRuntime } from '../lib/runtime/postgres.ts';

const { Pool } = createRequire(import.meta.url)('pg');
const scriptPath = fileURLToPath(import.meta.url);
const connectionString = process.env.CIC_DATABASE_URL ?? 'postgresql://postgres:staging@127.0.0.1:55432/cic';
const workspaceId = process.env.CIC_WORKSPACE_ID ?? '10000000-0000-0000-0000-000000000001';
const storageRoot = process.env.CIC_STORAGE_ROOT ?? '/home/anajibalm/.local/state/content-intelligence-copilot/r1-storage';
const brandId = process.env.CIC_BRAND_ID;
const batchId = process.env.CIC_BATCH_ID ?? '30000000-0000-0000-0000-000000000003';
const container = process.env.CIC_POSTGRES_CONTAINER ?? 'cic-postgres-r1';
const urls = [
  'https://www.tiktok.com/@barakat_id/video/7603222928527756545',
  'https://www.tiktok.com/@barakat_id/video/7603226211023719696',
  'https://www.tiktok.com/@barakat_id/video/7605929149194046738',
  'https://www.tiktok.com/@barakat_id/video/7605929718839315719',
  'https://www.tiktok.com/@barakat_id/video/7605930512053472520',
  'https://www.tiktok.com/@barakat_id/video/7601749857933511954',
  'https://www.tiktok.com/@barakat_id/video/7635995925688716561',
  'https://www.tiktok.com/@barakat_id/video/7602229928444087553',
  'https://www.tiktok.com/@barakat_id/video/7605938245536320786',
  'https://www.tiktok.com/@barakat_id/video/7635997376762645761',
  'https://www.tiktok.com/@barakat_id/video/7627079130693012757',
];

function requiredBrandId(pool) {
  return brandId ? Promise.resolve(brandId) : pool.query('SELECT id FROM brand WHERE workspace_id = $1 ORDER BY created_at LIMIT 1', [workspaceId]).then((result) => {
    const id = result.rows[0]?.id;
    if (!id) throw new Error('staging brand is missing');
    return id;
  });
}

function runtime(options = {}) {
  return createPostgresRuntime({
    connectionString,
    workspaceId,
    brandId: options.brandId,
    batchId,
    storageRoot,
    acquirer: createDefaultAcquirer(),
    ...options,
  });
}

function spawnWorker(mode) {
  return spawn(process.execPath, ['--experimental-strip-types', scriptPath, mode], {
    env: { ...process.env, CIC_DATABASE_URL: connectionString, CIC_WORKSPACE_ID: workspaceId, CIC_STORAGE_ROOT: storageRoot, CIC_BATCH_ID: batchId, ...(brandId ? { CIC_BRAND_ID: brandId } : {}) },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
}

function waitForExit(child) {
  return new Promise((resolveExit, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolveExit({ code, signal }));
  });
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function waitFor(pool, query, predicate, timeoutMs = 300_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const result = await pool.query(query.text, query.values);
      if (predicate(result)) return result;
    } catch (error) {
      if (!['ECONNRESET', 'ECONNREFUSED', '57P01'].includes(String(error.code ?? ''))) throw error;
    }
    await sleep(1000);
  }
  throw new Error(`timed out waiting for ${query.text}`);
}

function urlId(url) {
  return url.match(/video\/(\d+)/)?.[1] ?? '';
}

async function chooseUrl(pool, usedIds = []) {
  const result = await pool.query(`
    SELECT c.external_id
    FROM runtime_processing_job job
    JOIN content c ON c.id = job.content_id
    WHERE job.workspace_id = $1 AND c.external_id = ANY($2::text[])`, [workspaceId, urls.map(urlId)]);
  const present = new Set([...result.rows.map((row) => String(row.external_id)), ...usedIds]);
  const url = urls.find((candidate) => !present.has(urlId(candidate)));
  if (!url) throw new Error('no unused staging URL remains; clear prior smoke jobs or extend URL fixture list');
  return url;
}

async function enqueue(pool, brand, url) {
  const app = runtime({ brandId: brand });
  try {
    return await app.enqueue(url);
  } finally {
    await app.close();
  }
}

async function expire(pool, jobId) {
  await pool.query("UPDATE runtime_processing_job SET lease_until = now() - interval '1 second' WHERE workspace_id = $1 AND id = $2", [workspaceId, jobId]);
}

async function runWorker(mode, expectedCode = 0) {
  const child = spawnWorker(mode);
  const exit = await waitForExit(child);
  assert.equal(exit.code, expectedCode, `${mode} worker exit`);
  return exit;
}

async function restartDatabase(pool) {
  await pool.end();
  await new Promise((resolveRestart, rejectRestart) => {
    nodeExecFile('docker', ['restart', container], { encoding: 'utf8', timeout: 120_000 }, (error, stdout, stderr) => {
      if (error) rejectRestart(new Error(`${stderr || stdout || error.message}`));
      else resolveRestart();
    });
  });
  const restartedPool = new Pool({ connectionString });
  await waitFor(restartedPool, { text: 'SELECT 1', values: [] }, (result) => result.rows[0]['?column?'] === 1, 120_000);
  return restartedPool;
}

async function childWorker(mode) {
  const lookupPool = new Pool({ connectionString });
  const brand = await requiredBrandId(lookupPool);
  await lookupPool.end();
  const baseTools = await createDefaultProcessingTools();
  const processingTools = mode === '--interrupt-processing'
    ? { ...baseTools, async probe(mediaPath) { await sleep(60_000); return baseTools.probe(mediaPath); } }
    : baseTools;
  const app = runtime({ brandId, processingTools, onProcessingComplete: mode === '--crash-after-derivatives' ? async () => process.exit(75) : undefined });
  try {
    await app.recover(`smoke-${process.pid}`);
    await app.runOne(`smoke-${process.pid}`);
  } finally {
    await app.close();
  }
}

async function main() {
  mkdirSync(storageRoot, { recursive: true });
  assert.equal(resolve(storageRoot).startsWith('/tmp/'), false, 'persistent storage root must be outside /tmp');
  let pool = new Pool({ connectionString });
  const brand = await requiredBrandId(pool);
  const used = [];
  try {
    const persistentUrl = await chooseUrl(pool, used);
    used.push(urlId(persistentUrl));
    const persistentJob = await enqueue(pool, brand, persistentUrl);
    await runWorker('--once');
    const persistentDone = await waitFor(pool, { text: 'SELECT status, error_message FROM runtime_processing_job WHERE id = $1', values: [persistentJob.id] }, (result) => {
      const row = result.rows[0];
      if (row?.status === 'FAILED') throw new Error(`persistent staging worker failed: ${row.error_message}`);
      return row?.status === 'COMPLETED';
    });
    const frame = await pool.query('SELECT id, storage_path FROM video_frame WHERE content_id = $1 ORDER BY timestamp_ms LIMIT 1', [persistentJob.contentId]);
    assert.ok(frame.rows[0], 'persistent flow must store a frame');
    const app = runtime({ brandId });
    await app.addAnchor({ contentId: persistentJob.contentId, frameId: frame.rows[0].id, note: 'persistent smoke anchor' });
    const artifactRelative = relative(resolve(storageRoot, persistentJob.contentId), resolve(frame.rows[0].storage_path));
    assert.ok(existsSync(frame.rows[0].storage_path), 'persistent frame must exist before database restart');
    assert.ok(await app.resolveArtifact(persistentJob.contentId, artifactRelative), 'persistent frame must resolve through runtime');
    await app.close();
    pool = await restartDatabase(pool);
    const restarted = await pool.query('SELECT status FROM runtime_processing_job WHERE id = $1', [persistentJob.id]);
    const restartedCounts = await pool.query(`SELECT
      (SELECT count(*) FROM transcript_segment ts JOIN transcript t ON t.id = ts.transcript_id WHERE t.content_id = $1) AS segments,
      (SELECT count(*) FROM video_frame WHERE content_id = $1) AS frames,
      (SELECT count(*) FROM temporal_evidence_anchor WHERE content_id = $1) AS anchors`, [persistentJob.contentId]);
    assert.equal(restarted.rows[0]?.status, 'COMPLETED');
    assert.equal(Number(restartedCounts.rows[0].anchors), 1);
    assert.equal(existsSync(frame.rows[0].storage_path), true);

    const interruptedUrl = await chooseUrl(pool, used);
    used.push(urlId(interruptedUrl));
    const interruptedJob = await enqueue(pool, brand, interruptedUrl);
    const delayed = spawnWorker('--interrupt-processing');
    const acquired = await waitFor(pool, {
      text: `SELECT ar.media_path, job.status FROM acquisition_run ar JOIN runtime_processing_job job ON job.content_id = ar.content_id WHERE job.id = $1 ORDER BY ar.attempt_number DESC LIMIT 1`,
      values: [interruptedJob.id],
    }, (result) => result.rows[0]?.status === 'RUNNING' && Boolean(result.rows[0]?.media_path));
    delayed.kill('SIGKILL');
    await waitForExit(delayed);
    const oldMedia = acquired.rows[0].media_path;
    assert.equal(existsSync(oldMedia), true, 'interrupted processing must leave media for recovery cleanup');
    await expire(pool, interruptedJob.id);
    await runWorker('--once');
    const recovered = await pool.query('SELECT status, attempt_count FROM runtime_processing_job WHERE id = $1', [interruptedJob.id]);
    const recoveredMedia = await pool.query('SELECT media_path FROM acquisition_run WHERE content_id = $1', [interruptedJob.contentId]);
    const recoveredFrames = await pool.query('SELECT count(*) AS count FROM video_frame WHERE content_id = $1', [interruptedJob.contentId]);
    assert.equal(recovered.rows[0]?.status, 'COMPLETED');
    assert.equal(Number(recovered.rows[0]?.attempt_count), 2);
    assert.equal(Number(recoveredFrames.rows[0]?.count) > 0, true);
    assert.equal(recoveredMedia.rows.some((row) => row.media_path && existsSync(row.media_path)), false, 'old and new temporary media must be cleaned');

    const derivativeUrl = await chooseUrl(pool, used);
    used.push(urlId(derivativeUrl));
    const derivativeJob = await enqueue(pool, brand, derivativeUrl);
    await runWorker('--crash-after-derivatives', 75);
    const crashed = await pool.query('SELECT status FROM runtime_processing_job WHERE id = $1', [derivativeJob.id]);
    assert.equal(crashed.rows[0]?.status, 'RUNNING');
    await expire(pool, derivativeJob.id);
    await runWorker('--once');
    const retried = await pool.query('SELECT status, attempt_count FROM runtime_processing_job WHERE id = $1', [derivativeJob.id]);
    const retriedMedia = await pool.query('SELECT media_path FROM acquisition_run WHERE content_id = $1', [derivativeJob.contentId]);
    const retriedCounts = await pool.query('SELECT count(*) AS count FROM video_frame WHERE content_id = $1', [derivativeJob.contentId]);
    assert.equal(retried.rows[0]?.status, 'COMPLETED');
    assert.equal(Number(retried.rows[0]?.attempt_count), 2);
    assert.equal(Number(retriedCounts.rows[0]?.count) > 0, true);
    assert.equal(retriedMedia.rows.some((row) => row.media_path && existsSync(row.media_path)), false, 'cached-output retry must clean newly acquired media');

    console.log(JSON.stringify({
      persistent: { jobId: persistentJob.id, status: persistentDone.rows[0].status, storageRoot, restart: 'PASS', frames: Number(restartedCounts.rows[0].frames), segments: Number(restartedCounts.rows[0].segments), anchors: Number(restartedCounts.rows[0].anchors) },
      acquisitionProcessingInterruption: { jobId: interruptedJob.id, status: recovered.rows[0].status, attempts: Number(recovered.rows[0].attempt_count), oldMediaCleaned: !existsSync(oldMedia), frames: Number(recoveredFrames.rows[0].count) },
      derivativeCommitInterruption: { jobId: derivativeJob.id, crashExit: 75, status: retried.rows[0].status, attempts: Number(retried.rows[0].attempt_count), cachedRetryMediaCleaned: true, frames: Number(retriedCounts.rows[0].count) },
    }, null, 2));
  } finally {
    if (!pool.ending) await pool.end();
  }
}

const mode = process.argv[2];
if (mode === '--once' || mode === '--interrupt-processing' || mode === '--crash-after-derivatives') {
  await childWorker(mode);
} else {
  await main();
}
