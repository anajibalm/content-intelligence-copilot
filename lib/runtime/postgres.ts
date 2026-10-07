import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { Pool, type PoolClient } from 'pg';
import { normalizeTikTokUrl } from '../acquisition/normalize.ts';
import { runAcquisition } from '../acquisition/index.ts';
import type { AcquisitionAttempt, AcquisitionPacket, CanonicalIdentity, VideoAcquirer } from '../acquisition/types.ts';
import { cleanupTemporaryMedia } from '../acquisition/media.ts';
import { resolveAuthorizedArtifact } from './artifacts.ts';
import {
  createFileJobStore,
  processAcquisitionPacket,
  type ProcessingOutput,
  type ProcessingTools,
} from '../processing/index.ts';
import { buildExtractionInput, extractFingerprint, type ExtractionInput, type ModelOutput } from '../extraction/index.ts';
import { createMultimodalFingerprintExtractor } from '../extraction/multimodal.ts';

export interface DurableJob {
  id: string;
  contentId: string;
  sourceUrl: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  attemptCount: number;
  claimToken: string | null;
  result: ProcessingOutput | null;
  error: string | null;
  updatedAt: string;
}

export interface PostgresRuntimeOptions {
  connectionString: string;
  workspaceId: string;
  brandId: string;
  batchId: string;
  storageRoot: string;
  acquirer: VideoAcquirer;
  processingTools?: ProcessingTools;
  fingerprintExtractor?: (input: ExtractionInput) => Promise<ModelOutput>;
  onProcessingComplete?: (job: DurableJob, output: ProcessingOutput) => Promise<void>;
}

export interface DurableRuntime {
  enqueue(rawUrl: string): Promise<DurableJob>;
  list(): Promise<DurableJob[]>;
  get(id: string): Promise<DurableJob | null>;
  claim(workerId: string, leaseMs: number): Promise<DurableJob | null>;
  runOne(workerId: string): Promise<DurableJob | null>;
  addAnchor(input: { contentId: string; frameId: string; note?: string }): Promise<void>;
  // Feature review lives in lib/review/postgres.ts (one rule path for content-level
  // and single-feature decisions); the runtime owns processing jobs only.
  resolveArtifact(contentId: string, requestedFile: string): Promise<string | null>;
  toPublic(job: DurableJob): DurableJob;
  close(): Promise<void>;
  recover(workerId: string): Promise<number>;
}

function rowJob(row: Record<string, unknown>): DurableJob {
  return {
    id: String(row.id),
    contentId: String(row.content_id),
    sourceUrl: String(row.source_url),
    status: String(row.status) as DurableJob['status'],
    attemptCount: Number(row.attempt_count),
    claimToken: row.claim_token ? String(row.claim_token) : null,
    result: (row.result && Object.keys(row.result as object).length > 0 ? row.result : null) as ProcessingOutput | null,
    error: row.error_message ? String(row.error_message) : null,
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

function publicPath(storageRoot: string, contentId: string, path: string): string {
  const root = resolve(storageRoot, contentId);
  const candidate = resolve(path);
  const rel = relative(root, candidate);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error('stored artifact is outside content storage boundary');
  }
  return `/api/processing/assets?contentId=${encodeURIComponent(contentId)}&file=${encodeURIComponent(rel)}`;
}

export function toPublicJob(job: DurableJob, storageRoot: string): DurableJob {
  if (!job.result) return job;
  const result = structuredClone(job.result);
  const rewrite = (frame: ProcessingOutput['hookFrames'][number]): ProcessingOutput['hookFrames'][number] => ({ ...frame, storagePath: publicPath(storageRoot, job.contentId, frame.storagePath) });
  result.audio.storagePath = publicPath(storageRoot, job.contentId, result.audio.storagePath);
  result.hookFrames = result.hookFrames.map(rewrite);
  result.representativeFrames = result.representativeFrames.map(rewrite);
  result.perSecondFrames = result.perSecondFrames.map(rewrite);
  result.productEntryAnchors = [];
  return { ...job, result };
}

async function ensureContent(client: PoolClient, options: PostgresRuntimeOptions, identity: CanonicalIdentity): Promise<{ contentId: string; sourceId: string }> {
  const content = await client.query<{ id: string }>(
    `INSERT INTO content (workspace_id, brand_id, batch_id, platform, external_id, permalink)
     VALUES ($1, $2, $3, 'TIKTOK', $4, $5)
     ON CONFLICT (workspace_id, platform, external_id)
     DO UPDATE SET permalink = EXCLUDED.permalink, updated_at = now()
     RETURNING id`,
    [options.workspaceId, options.brandId, options.batchId, identity.externalId, identity.permalink],
  );
  const contentId = content.rows[0]?.id;
  if (!contentId) throw new Error('database did not return canonical content id');
  const existingSource = await client.query<{ id: string }>(
    'SELECT id FROM content_source WHERE content_id = $1 ORDER BY is_canonical DESC, created_at ASC LIMIT 1',
    [contentId],
  );
  if (existingSource.rows[0]) return { contentId, sourceId: existingSource.rows[0].id };
  const source = await client.query<{ id: string }>(
    `INSERT INTO content_source (workspace_id, content_id, provider, source_url, external_id)
     VALUES ($1, $2, 'pending', $3, $4) RETURNING id`,
    [options.workspaceId, contentId, identity.permalink, identity.externalId],
  );
  const sourceId = source.rows[0]?.id;
  if (!sourceId) throw new Error('database did not return canonical content source id');
  return { contentId, sourceId };
}

export function createPostgresRuntime(options: PostgresRuntimeOptions): DurableRuntime {
  mkdirSync(options.storageRoot, { recursive: true });
  const pool = new Pool({ connectionString: options.connectionString, max: 2 });
  const processingStore = createFileJobStore(`${options.storageRoot}/processing-state.json`);

  async function enqueue(rawUrl: string): Promise<DurableJob> {
    const identity = normalizeTikTokUrl(rawUrl);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { contentId } = await ensureContent(client, options, identity);
      const result = await client.query<Record<string, unknown>>(
        `INSERT INTO runtime_processing_job (workspace_id, content_id, source_url)
         VALUES ($1, $2, $3)
         ON CONFLICT (workspace_id, content_id)
         DO UPDATE SET source_url = EXCLUDED.source_url,
           status = CASE WHEN runtime_processing_job.status = 'FAILED' THEN 'PENDING'::runtime_job_status ELSE runtime_processing_job.status END,
           error_message = CASE WHEN runtime_processing_job.status = 'FAILED' THEN NULL ELSE runtime_processing_job.error_message END,
           updated_at = now()
         RETURNING *`,
        [options.workspaceId, contentId, identity.permalink],
      );
      await client.query('COMMIT');
      return rowJob(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`database enqueue failed: ${String((error as Error).message ?? error)}`);
    } finally {
      client.release();
    }
  }

  async function list(): Promise<DurableJob[]> {
    const result = await pool.query<Record<string, unknown>>('SELECT * FROM runtime_processing_job WHERE workspace_id = $1 ORDER BY updated_at DESC', [options.workspaceId]);
    return result.rows.map(rowJob);
  }

  async function get(id: string): Promise<DurableJob | null> {
    const result = await pool.query<Record<string, unknown>>('SELECT * FROM runtime_processing_job WHERE workspace_id = $1 AND id = $2', [options.workspaceId, id]);
    return result.rows[0] ? rowJob(result.rows[0]) : null;
  }
  async function claim(workerId: string, leaseMs: number): Promise<DurableJob | null> {
    const result = await pool.query<Record<string, unknown>>(
      `WITH candidate AS (
         SELECT id FROM runtime_processing_job
         WHERE workspace_id = $3 AND (status = 'PENDING' OR (status = 'RUNNING' AND lease_until < now()))
         ORDER BY created_at
         FOR UPDATE SKIP LOCKED LIMIT 1
       )
       UPDATE runtime_processing_job job
       SET status = 'RUNNING', claimed_by = $1, claim_token = $4, lease_until = now() + ($2 * interval '1 millisecond'),
           attempt_count = job.attempt_count + 1, updated_at = now()
       FROM candidate WHERE job.id = candidate.id
       RETURNING job.*`,
      [workerId, leaseMs, options.workspaceId, randomUUID()],
    );
    return result.rows[0] ? rowJob(result.rows[0]) : null;
  }

  async function assertClaim(client: PoolClient, job: DurableJob): Promise<void> {
    if (!job.claimToken) throw new Error('worker claim token is missing');
    const result = await client.query(
      `SELECT 1 FROM runtime_processing_job
       WHERE workspace_id = $1 AND id = $2 AND status = 'RUNNING'
         AND claim_token = $3 AND lease_until > now()
       FOR UPDATE`,
      [options.workspaceId, job.id, job.claimToken],
    );
    if (result.rowCount !== 1) throw new Error('worker claim is no longer valid');
  }

  async function renewClaim(job: DurableJob, leaseMs: number): Promise<boolean> {
    if (!job.claimToken) return false;
    const result = await pool.query(
      `UPDATE runtime_processing_job SET lease_until = now() + ($1 * interval '1 millisecond'), updated_at = now()
       WHERE workspace_id = $2 AND id = $3 AND status = 'RUNNING' AND claim_token = $4 AND lease_until > now()`,
      [leaseMs, options.workspaceId, job.id, job.claimToken],
    );
    return result.rowCount === 1;
  }

  async function complete(job: DurableJob, output: ProcessingOutput): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await assertClaim(client, job);
      const processing = await client.query<{ id: string }>(
        `INSERT INTO content_processing (workspace_id, content_id, stage, state, output, started_at, completed_at)
         VALUES ($1, $2, 'FFPROBE', 'COMPLETED', $3::jsonb, now(), now())
         ON CONFLICT (content_id, stage) DO UPDATE SET state = 'COMPLETED', output = EXCLUDED.output, error_message = NULL, completed_at = now(), updated_at = now()
         RETURNING id`,
        [options.workspaceId, job.contentId, JSON.stringify(output)],
      );
      const processingId = processing.rows[0]?.id;
      if (!processingId) throw new Error('database did not return processing id');
      const probe = output.observed.ffprobe;
      const video = probe.streams.find((stream) => stream.codec_type === 'video');
      await client.query(
        `UPDATE content SET processing_state = 'COMPLETED', duration_ms = $1, width = $2, height = $3, updated_at = now() WHERE id = $4`,
        [Number(probe.format.duration) * 1000, video?.width ?? null, video?.height ?? null, job.contentId],
      );
      const transcript = await client.query<{ id: string }>(
        `INSERT INTO transcript (workspace_id, content_id, content_processing_id, engine, model, language, duration_ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (content_id, content_processing_id) DO UPDATE SET engine = EXCLUDED.engine, model = EXCLUDED.model, language = EXCLUDED.language, duration_ms = EXCLUDED.duration_ms
         RETURNING id`,
        [options.workspaceId, job.contentId, processingId, output.transcript.engine, output.transcript.model ?? null, output.transcript.language ?? null, Number(probe.format.duration) * 1000],
      );
      const transcriptId = transcript.rows[0]?.id;
      if (!transcriptId) throw new Error('database did not return transcript id');
      for (const [index, segment] of output.transcript.segments.entries()) {
        await client.query(
          `INSERT INTO transcript_segment (workspace_id, transcript_id, seq, start_ms, end_ms, text)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (transcript_id, seq) DO UPDATE SET start_ms = EXCLUDED.start_ms, end_ms = EXCLUDED.end_ms, text = EXCLUDED.text`,
          [options.workspaceId, transcriptId, index + 1, segment.startMs, segment.endMs, segment.text],
        );
      }
      const persistedOutput = structuredClone(output);
      const frames = [...persistedOutput.hookFrames, ...persistedOutput.representativeFrames, ...persistedOutput.perSecondFrames];
      for (const frame of frames) {
        const frameType = frame.frameType ?? 'SCENE';
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO video_frame (workspace_id, content_id, content_processing_id, frame_type, timestamp_ms, storage_path, width, height, sampling_policy_version)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'r1-actual-media-v1')
           ON CONFLICT (content_id, frame_type, timestamp_ms) DO UPDATE SET storage_path = EXCLUDED.storage_path, width = EXCLUDED.width, height = EXCLUDED.height, content_processing_id = EXCLUDED.content_processing_id
           RETURNING id`,
          [options.workspaceId, job.contentId, processingId, frameType, frame.timestampMs, frame.storagePath, frame.width ?? null, frame.height ?? null],
        );
        frame.id = inserted.rows[0]?.id;
      }
      const contentMetadata = await client.query<{ title: string | null }>('SELECT title FROM content WHERE workspace_id = $1 AND id = $2', [options.workspaceId, job.contentId]);
      const extractionInput = buildExtractionInput(persistedOutput, { contentId: job.contentId, title: contentMetadata.rows[0]?.title ?? null, caption: null });
      const modelOutput = options.fingerprintExtractor ? await options.fingerprintExtractor(extractionInput) : null;
      const extraction = extractFingerprint(extractionInput, modelOutput);
      const extractionRun = await client.query<{ id: string }>(
        `INSERT INTO extraction_run (workspace_id, content_id, provider, model, prompt_version, schema_version, input_hash, raw_output, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, 'SUCCEEDED') RETURNING id`,
        [options.workspaceId, job.contentId, extraction.provider, extraction.model, extraction.promptVersion, extraction.schemaVersion, extraction.inputHash, JSON.stringify(extraction.rawOutput)],
      );
      const extractionRunId = extractionRun.rows[0]?.id;
      if (!extractionRunId) throw new Error('database did not return extraction run id');
      for (const feature of extraction.features) {
        await client.query(
          `INSERT INTO content_feature (workspace_id, content_id, extraction_run_id, field_name, ai_value)
           VALUES ($1, $2, $3, $4, $5)`,
          [options.workspaceId, job.contentId, extractionRunId, feature.fieldName, feature.value],
        );
      }
      const completion = await client.query(
        `UPDATE runtime_processing_job SET status = 'COMPLETED', result = $1::jsonb, error_message = NULL, lease_until = NULL, updated_at = now()
         WHERE workspace_id = $2 AND id = $3 AND status = 'RUNNING' AND claim_token = $4 AND lease_until > now()`,
        [JSON.stringify(persistedOutput), options.workspaceId, job.id, job.claimToken],
      );
      if (completion.rowCount !== 1) throw new Error('worker claim expired before completion');
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async function fail(job: DurableJob, error: unknown): Promise<void> {
    await pool.query(
      `UPDATE runtime_processing_job SET status = 'FAILED', error_message = $1, lease_until = NULL, updated_at = now()
       WHERE workspace_id = $2 AND id = $3 AND status = 'RUNNING' AND claim_token = $4 AND lease_until > now()`,
      [String((error as Error)?.message ?? error), options.workspaceId, job.id, job.claimToken],
    );
  }

  async function runOne(workerId: string): Promise<DurableJob | null> {
    const job = await claim(workerId, 15 * 60 * 1000);
    if (!job) return null;
    let temporaryMedia: { path?: string; temporary: boolean } | undefined;
    let completed = false;
    try {
      const source = await pool.query<{ id: string; attempts: number }>(
        `SELECT cs.id, count(ar.id)::int AS attempts FROM content_source cs
         LEFT JOIN acquisition_run ar ON ar.content_source_id = cs.id
         WHERE cs.workspace_id = $1 AND cs.content_id = $2 GROUP BY cs.id ORDER BY cs.is_canonical DESC, cs.created_at ASC LIMIT 1`,
        [options.workspaceId, job.contentId],
      );
      const sourceRow = source.rows[0];
      if (!sourceRow) throw new Error('canonical content source missing');
      const acquisition = await runAcquisition(options.acquirer, job.sourceUrl, {
        attemptHistory: { attempts: Array.from({ length: sourceRow.attempts }, (_, index) => ({ attemptNumber: index + 1 } as AcquisitionAttempt)) },
      });
      temporaryMedia = acquisition.packet?.media ?? undefined;
      const ownership = await pool.query(
        `SELECT 1 FROM runtime_processing_job WHERE workspace_id = $1 AND id = $2 AND status = 'RUNNING' AND claim_token = $3 AND lease_until > now()`,
        [options.workspaceId, job.id, job.claimToken],
      );
      if (ownership.rowCount !== 1) throw new Error('worker claim expired during acquisition');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await assertClaim(client, job);
        await client.query(
          `UPDATE content_source SET provider = $1 WHERE workspace_id = $2 AND id = $3`,
          [acquisition.attempt.provider, options.workspaceId, sourceRow.id],
        );
        await client.query(
          `INSERT INTO acquisition_run (workspace_id, content_source_id, content_id, provider, attempt_number, status, error_message, latency_ms, raw_payload, media_path, claim_token)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)`,
          [options.workspaceId, sourceRow.id, job.contentId, acquisition.attempt.provider, acquisition.attempt.attemptNumber, acquisition.attempt.status, acquisition.attempt.errorMessage, acquisition.attempt.latencyMs, JSON.stringify(acquisition.attempt.rawPayload), acquisition.attempt.mediaPath, job.claimToken],
        );
        await assertClaim(client, job);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      if (acquisition.error || !acquisition.packet) throw acquisition.error ?? new Error('acquisition returned no packet');
      const processing = await processAcquisitionPacket(
        acquisition.packet,
        { id: job.id, workspaceId: options.workspaceId, outputRoot: `${options.storageRoot}/${job.contentId}` },
        { store: processingStore, tools: options.processingTools },
      );
      if (!processing.output) throw new Error('processing completed without output');
      if (options.onProcessingComplete) await options.onProcessingComplete(job, processing.output);
      if (!(await renewClaim(job, 15 * 60 * 1000))) throw new Error('worker claim expired after processing');
      await complete(job, processing.output);
      completed = true;
      return await get(job.id);
    } catch (error) {
      await fail(job, error);
      return await get(job.id);
    } finally {
      if (!completed && temporaryMedia) await cleanupTemporaryMedia([temporaryMedia]);
    }

  }

  async function resolveArtifact(contentId: string, requestedFile: string): Promise<string | null> {
    const result = await pool.query<{ storage_path: string }>(
      `SELECT storage_path FROM video_frame WHERE workspace_id = $1 AND content_id = $2
       UNION ALL
       SELECT result->'audio'->>'storagePath' FROM runtime_processing_job
       WHERE workspace_id = $1 AND content_id = $2 AND result->'audio'->>'storagePath' IS NOT NULL`,
      [options.workspaceId, contentId],
    );
    return resolveAuthorizedArtifact(options.storageRoot, contentId, requestedFile, result.rows.map((row) => row.storage_path));
  }

  async function addAnchor(input: { contentId: string; frameId: string; note?: string }): Promise<void> {
    await pool.query(
      `INSERT INTO temporal_evidence_anchor (workspace_id, content_id, video_frame_id, anchor_type, timestamp_ms, review_state, note)
       SELECT $1, vf.content_id, vf.id, 'PRODUCT_ENTRY', vf.timestamp_ms, 'CONFIRMED', $2
       FROM video_frame vf WHERE vf.id = $3 AND vf.content_id = $4`,
      [options.workspaceId, input.note ?? null, input.frameId, input.contentId],
    );
  }

  async function recover(_workerId: string): Promise<number> {
    const client = await pool.connect();
    let staleMedia: Array<{ path?: string; temporary: boolean }> = [];
    try {
      await client.query('BEGIN');
      const stale = await client.query<{ id: string; claim_token: string | null; media_path: string | null }>(
        `SELECT job.id, job.claim_token, ar.media_path
         FROM runtime_processing_job job
         LEFT JOIN acquisition_run ar ON ar.content_id = job.content_id AND ar.claim_token = job.claim_token
         WHERE job.workspace_id = $1 AND job.status = 'RUNNING' AND job.lease_until < now()
         FOR UPDATE OF job SKIP LOCKED`,
        [options.workspaceId],
      );
      staleMedia = stale.rows.map((row) => ({ path: row.media_path ?? undefined, temporary: true }));
      const result = await client.query(
        `UPDATE runtime_processing_job
         SET status = 'PENDING', claimed_by = NULL, claim_token = NULL, lease_until = NULL, updated_at = now()
         WHERE workspace_id = $1 AND id = ANY($2::uuid[]) AND status = 'RUNNING' AND lease_until < now()`,
        [options.workspaceId, stale.rows.map((row) => row.id)],
      );
      await client.query('COMMIT');
      await cleanupTemporaryMedia(staleMedia);
      return result.rowCount ?? 0;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  return { enqueue, list, get, claim, runOne, recover, addAnchor, resolveArtifact, close: () => pool.end(), toPublic: (job: DurableJob) => toPublicJob(job, options.storageRoot) };
}

export interface RuntimeConfig {
  connectionString: string;
  workspaceId: string;
  brandId: string;
  batchId: string;
  storageRoot: string;
}

export function runtimeConfigFromEnv(): RuntimeConfig {
  const connectionString = process.env.CIC_DATABASE_URL ?? process.env.DATABASE_URL;
  const workspaceId = process.env.CIC_WORKSPACE_ID;
  const brandId = process.env.CIC_BRAND_ID;
  const batchId = process.env.CIC_BATCH_ID;
  const storageRoot = process.env.CIC_STORAGE_ROOT;
  if (!connectionString || !workspaceId || !brandId || !batchId || !storageRoot) {
    throw new Error('CIC_DATABASE_URL, CIC_WORKSPACE_ID, CIC_BRAND_ID, CIC_BATCH_ID, and CIC_STORAGE_ROOT are required for durable runtime');
  }
  return { connectionString, workspaceId, brandId, batchId, storageRoot };
}

export function createPostgresRuntimeFromEnv(acquirer: VideoAcquirer, processingTools?: ProcessingTools): DurableRuntime {
  const config = runtimeConfigFromEnv();
  const endpoint = process.env.CIC_FINGERPRINT_ENDPOINT;
  const apiKey = process.env.CIC_FINGERPRINT_API_KEY;
  const model = process.env.CIC_FINGERPRINT_MODEL;
  const fingerprintExtractor = endpoint && apiKey && model
    ? createMultimodalFingerprintExtractor({
        endpoint,
        apiKey,
        model,
        provider: process.env.CIC_FINGERPRINT_PROVIDER,
      })
    : undefined;
  return createPostgresRuntime({ ...config, acquirer, processingTools, fingerprintExtractor });
}
