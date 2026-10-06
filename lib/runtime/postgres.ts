import { mkdirSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { Pool, type PoolClient } from 'pg';
import { normalizeTikTokUrl } from '../acquisition/normalize.ts';
import { runAcquisition } from '../acquisition/index.ts';
import type { AcquisitionAttempt, CanonicalIdentity, VideoAcquirer } from '../acquisition/types.ts';
import { cleanupTemporaryMedia } from '../acquisition/media.ts';
import {
  createFileJobStore,
  processAcquisitionPacket,
  type ProcessingOutput,
  type ProcessingTools,
} from '../processing/index.ts';

export interface DurableJob {
  id: string;
  contentId: string;
  sourceUrl: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  attemptCount: number;
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
}

export interface DurableRuntime {
  enqueue(rawUrl: string): Promise<DurableJob>;
  list(): Promise<DurableJob[]>;
  get(id: string): Promise<DurableJob | null>;
  claim(workerId: string, leaseMs: number): Promise<DurableJob | null>;
  runOne(workerId: string): Promise<DurableJob | null>;
  addAnchor(input: { contentId: string; frameId: string; note?: string }): Promise<void>;
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
         WHERE status = 'PENDING' OR (status = 'RUNNING' AND lease_until < now())
         ORDER BY created_at
         FOR UPDATE SKIP LOCKED LIMIT 1
       )
       UPDATE runtime_processing_job job
       SET status = 'RUNNING', claimed_by = $1, lease_until = now() + ($2 * interval '1 millisecond'),
           attempt_count = job.attempt_count + 1, updated_at = now()
       FROM candidate WHERE job.id = candidate.id
       RETURNING job.*`,
      [workerId, leaseMs],
    );
    return result.rows[0] ? rowJob(result.rows[0]) : null;
  }

  async function complete(job: DurableJob, output: ProcessingOutput): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
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
      await client.query(
        `UPDATE runtime_processing_job SET status = 'COMPLETED', result = $1::jsonb, error_message = NULL, lease_until = NULL, updated_at = now() WHERE id = $2`,
        [JSON.stringify(persistedOutput), job.id],
      );
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
      `UPDATE runtime_processing_job SET status = 'FAILED', error_message = $1, lease_until = NULL, updated_at = now() WHERE id = $2`,
      [String((error as Error)?.message ?? error), job.id],
    );
  }

  async function runOne(workerId: string): Promise<DurableJob | null> {
    const job = await claim(workerId, 15 * 60 * 1000);
    if (!job) return null;
    try {
      const source = await pool.query<{ id: string; attempts: number }>(
        `SELECT cs.id, count(ar.id)::int AS attempts FROM content_source cs
         LEFT JOIN acquisition_run ar ON ar.content_source_id = cs.id
         WHERE cs.content_id = $1 GROUP BY cs.id ORDER BY cs.is_canonical DESC, cs.created_at ASC LIMIT 1`,
        [job.contentId],
      );
      const sourceRow = source.rows[0];
      if (!sourceRow) throw new Error('canonical content source missing');
      const acquisition = await runAcquisition(options.acquirer, job.sourceUrl, {
        attemptHistory: { attempts: Array.from({ length: sourceRow.attempts }, (_, index) => ({ attemptNumber: index + 1 } as AcquisitionAttempt)) },
      });
      await pool.query(
        `UPDATE content_source SET provider = $1 WHERE id = $2`,
        [acquisition.attempt.provider, sourceRow.id],
      );
      await pool.query(
        `INSERT INTO acquisition_run (workspace_id, content_source_id, content_id, provider, attempt_number, status, error_message, latency_ms, raw_payload, media_path)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)`,
        [options.workspaceId, sourceRow.id, job.contentId, acquisition.attempt.provider, acquisition.attempt.attemptNumber, acquisition.attempt.status, acquisition.attempt.errorMessage, acquisition.attempt.latencyMs, JSON.stringify(acquisition.attempt.rawPayload), acquisition.attempt.mediaPath],
      );
      if (acquisition.error || !acquisition.packet) throw acquisition.error ?? new Error('acquisition returned no packet');
      const processing = await processAcquisitionPacket(
        acquisition.packet,
        { id: job.id, workspaceId: options.workspaceId, outputRoot: `${options.storageRoot}/${job.contentId}` },
        { store: processingStore, tools: options.processingTools },
      );
      if (!processing.output) throw new Error('processing completed without output');
      await complete(job, processing.output);
      return await get(job.id);
    } catch (error) {
      await fail(job, error);
      return await get(job.id);
    }
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
    const stale = await pool.query<{ media_path: string | null }>(
      `SELECT media_path FROM acquisition_run ar
       JOIN runtime_processing_job job ON job.content_id = ar.content_id
       WHERE job.status = 'RUNNING' AND ar.media_path IS NOT NULL`,
    );
    await cleanupTemporaryMedia(stale.rows.map((row) => ({ path: row.media_path ?? undefined, temporary: true })));
    const result = await pool.query(
      `UPDATE runtime_processing_job
       SET status = 'PENDING', claimed_by = NULL, lease_until = NULL, updated_at = now()
       WHERE status = 'RUNNING'`,
    );
    return result.rowCount ?? 0;
  }

  return { enqueue, list, get, claim, runOne, recover, addAnchor, close: () => pool.end(), toPublic: (job: DurableJob) => toPublicJob(job, options.storageRoot) };
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
  return createPostgresRuntime({ ...config, acquirer, processingTools });
}
