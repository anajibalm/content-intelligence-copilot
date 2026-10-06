import { Pool, type PoolClient } from 'pg';
import { relative, resolve as pathResolve } from 'node:path';
import { normalizeMetricSnapshot } from '../metrics/rules.ts';
import { resolveAuthorizedArtifact } from '../runtime/artifacts.ts';

export interface WorkspaceRepositoryConfig {
  connectionString: string;
  workspaceId: string;
  storageRoot: string;
}

export class WorkspaceNotFoundError extends Error {
  readonly statusCode = 404;

  constructor(message: string) {
    super(message);
    this.name = 'WorkspaceNotFoundError';
  }
}

interface DbContent {
  id: string;
  external_id: string;
  permalink: string;
  title: string | null;
  processing_state: string;
  duration_ms: number | null;
  width: number | null;
  height: number | null;
  acquisition_status: string | null;
  acquisition_error: string | null;
  acquisition_attempt_count: number | null;
  job_status: string | null;
  processing_error: string | null;
  attempt_count: number | null;
  error_message: string | null;
}

interface DbSnapshot {
  id: string;
  content_id: string;
  distribution: 'ORGANIC' | 'PAID';
  source: string | null;
  captured_at: string | null;
  content_age_hours: number | null;
  raw_metrics: Record<string, unknown>;
  quality_json: Record<string, unknown>;
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function workspaceArtifactUrl(storageRoot: string, contentId: string, storagePath: string): string | null {
  const root = pathResolve(storageRoot, contentId);
  const candidate = pathResolve(storagePath);
  const relativePath = relative(root, candidate);
  if (!relativePath || relativePath.startsWith('..') || relativePath.includes('/../') || pathResolve(root, relativePath) !== candidate) return null;
  return `/api/processing/assets?contentId=${encodeURIComponent(contentId)}&file=${encodeURIComponent(relativePath)}`;
}

async function authorizedArtifactUrl(config: WorkspaceRepositoryConfig, contentId: string, storagePath: string): Promise<string | null> {
  const root = pathResolve(config.storageRoot, contentId);
  const relativePath = relative(root, pathResolve(storagePath));
  if (!relativePath || relativePath.startsWith('..') || relativePath.includes('/../')) return null;
  const authorized = await resolveAuthorizedArtifact(config.storageRoot, contentId, relativePath, [storagePath]);
  return authorized ? workspaceArtifactUrl(config.storageRoot, contentId, authorized) : null;
}

function adaptSnapshot(row: DbSnapshot) {
  const qualityJson = jsonObject(row.quality_json);
  const rawMetrics = Object.fromEntries(Object.entries(row.raw_metrics ?? {}).map(([name, rawEntry]) => {
    const rawObject = jsonObject(rawEntry);
    const detail = jsonObject(qualityJson[name]);
    return [name, { value: rawObject.value ?? null, quality: rawObject.quality ?? detail.state ?? (rawObject.value == null ? 'UNAVAILABLE' : 'VALID'), reason: rawObject.reason ?? detail.reason, qualityNote: detail.reason }];
  }));
  return normalizeMetricSnapshot({
    id: row.id,
    contentId: row.content_id,
    distribution: row.distribution,
    source: row.source,
    capturedAt: row.captured_at,
    contentAgeHours: row.content_age_hours,
    rawMetrics,
  });
}

function contentView(row: DbContent, snapshots: ReturnType<typeof adaptSnapshot>[]) {
  return {
    id: row.id,
    externalId: row.external_id,
    title: row.title,
    permalink: row.permalink,
    processingState: row.processing_state,
    acquisitionState: row.acquisition_status ?? 'UNAVAILABLE',
    acquisitionError: row.acquisition_error,
    processingError: row.processing_error ?? row.error_message,
    attemptCount: row.acquisition_attempt_count ?? row.attempt_count ?? 0,
    error: row.processing_error ?? row.error_message,
    dimensions: row.width && row.height ? `${row.width}×${row.height}` : null,
    durationSeconds: row.duration_ms == null ? null : Number(row.duration_ms) / 1000,
    snapshots,
  };
}

export function workspaceConfigFromEnv(): WorkspaceRepositoryConfig {
  const connectionString = process.env.CIC_DATABASE_URL ?? process.env.DATABASE_URL;
  const workspaceId = process.env.CIC_WORKSPACE_ID;
  const storageRoot = process.env.CIC_STORAGE_ROOT;
  if (!connectionString || !workspaceId || !storageRoot) throw new Error('CIC_DATABASE_URL, CIC_WORKSPACE_ID, and CIC_STORAGE_ROOT are required for workspace');
  return { connectionString, workspaceId, storageRoot };
}

export function createWorkspaceRepository(config: WorkspaceRepositoryConfig) {
  const pool = new Pool({ connectionString: config.connectionString, max: 2 });

  async function load(batchId?: string | null, contentId?: string | null) {
    const batches = await pool.query(
      `SELECT b.id, b.name, b.brand_id, br.name AS brand_name, b.created_at, b.contracted_video_count,
              count(c.id)::int AS content_count
       FROM batch b
       JOIN brand br ON br.id = b.brand_id
       LEFT JOIN content c ON c.batch_id = b.id
       WHERE b.workspace_id = $1
       GROUP BY b.id, br.name
       ORDER BY b.created_at DESC, b.id DESC`,
      [config.workspaceId],
    );
    let batch = batchId ? batches.rows.find((row) => row.id === batchId) : null;
    if (batchId && !batch) throw new WorkspaceNotFoundError('batch not found in workspace');
    if (!batch && contentId) {
      const contentBatch = await pool.query(
        `SELECT b.id
         FROM content c JOIN batch b ON b.id = c.batch_id
         WHERE c.workspace_id = $1 AND c.id = $2 AND b.workspace_id = $1`,
        [config.workspaceId, contentId],
      );
      if (!contentBatch.rows[0]) throw new WorkspaceNotFoundError('content not found in workspace');
      batch = batches.rows.find((row) => row.id === contentBatch.rows[0].id);
    }
    batch ??= batches.rows[0] ?? null;
    if (!batch) return { batches: [], selectedBatch: null, contents: [], selectedContent: null };

    const contents = await pool.query<DbContent>(
      `SELECT c.id, c.external_id, c.permalink, c.title, c.processing_state, c.duration_ms, c.width, c.height,
              acquisition.status AS acquisition_status, acquisition.error_message AS acquisition_error,
              acquisition.attempt_count AS acquisition_attempt_count,
              job.status AS job_status, job.attempt_count, job.error_message,
              processing.error_message AS processing_error
       FROM content c
       LEFT JOIN LATERAL (
         SELECT ar.status, ar.error_message, count(*) OVER ()::int AS attempt_count
         FROM acquisition_run ar
         WHERE ar.workspace_id = $1 AND ar.content_id = c.id
         ORDER BY ar.attempt_number DESC, ar.created_at DESC
         LIMIT 1
       ) acquisition ON true
       LEFT JOIN runtime_processing_job job ON job.content_id = c.id AND job.workspace_id = $1
       LEFT JOIN LATERAL (
         SELECT cp.error_message
         FROM content_processing cp
         WHERE cp.workspace_id = $1 AND cp.content_id = c.id AND cp.state = 'FAILED'
         ORDER BY cp.updated_at DESC
         LIMIT 1
       ) processing ON true
       WHERE c.workspace_id = $1 AND c.batch_id = $2
       ORDER BY c.external_id, c.id`,
      [config.workspaceId, batch.id],
    );
    if (contentId && !contents.rows.some((row) => row.id === contentId)) throw new WorkspaceNotFoundError('content not found in selected batch');

    const snapshots = await pool.query<DbSnapshot>(
      `SELECT DISTINCT ON (ms.content_id, ms.distribution)
              ms.id, ms.content_id, ms.distribution, ms.source, ms.captured_at, ms.content_age_hours,
              ms.raw_metrics, ms.quality_json
       FROM metric_snapshot ms
       JOIN content c ON c.id = ms.content_id
       WHERE ms.workspace_id = $1 AND c.batch_id = $2
       ORDER BY ms.content_id, ms.distribution, ms.captured_at DESC NULLS LAST, ms.created_at DESC`,
      [config.workspaceId, batch.id],
    );
    const snapshotMap = new Map<string, ReturnType<typeof adaptSnapshot>[]>();
    for (const row of snapshots.rows) {
      const list = snapshotMap.get(row.content_id) ?? [];
      list.push(adaptSnapshot(row));
      snapshotMap.set(row.content_id, list);
    }
    const contentRows = contents.rows.map((row) => contentView(row, snapshotMap.get(row.id) ?? []));
    const selected = contentId ? contentRows.find((row) => row.id === contentId) ?? null : contentRows[0] ?? null;
    const detail = selected ? await contentDetail(pool, config, selected.id) : null;
    return {
      batches: batches.rows.map((row) => ({ id: row.id, name: row.name, brandId: row.brand_id, brandName: row.brand_name, createdAt: row.created_at, contractedVideoCount: row.contracted_video_count, contentCount: row.content_count })),
      selectedBatch: { id: batch.id, name: batch.name, brandId: batch.brand_id, brandName: batch.brand_name, createdAt: batch.created_at, contractedVideoCount: batch.contracted_video_count, contentCount: batch.content_count },
      contents: contentRows,
      selectedContent: detail,
    };
  }

  return { load, close: () => pool.end() };
}

async function contentDetail(client: Pool | PoolClient, config: WorkspaceRepositoryConfig, contentId: string) {
  const content = await client.query<DbContent>(
    `SELECT c.id, c.external_id, c.permalink, c.title, c.processing_state, c.duration_ms, c.width, c.height,
            acquisition.status AS acquisition_status, acquisition.error_message AS acquisition_error,
            acquisition.attempt_count AS acquisition_attempt_count,
            job.status AS job_status, job.attempt_count, job.error_message,
            processing.error_message AS processing_error
     FROM content c
     LEFT JOIN LATERAL (
       SELECT ar.status, ar.error_message, count(*) OVER ()::int AS attempt_count
       FROM acquisition_run ar
       WHERE ar.workspace_id = $1 AND ar.content_id = c.id
       ORDER BY ar.attempt_number DESC, ar.created_at DESC
       LIMIT 1
     ) acquisition ON true
     LEFT JOIN runtime_processing_job job ON job.content_id = c.id AND job.workspace_id = $1
     LEFT JOIN LATERAL (
       SELECT cp.error_message
       FROM content_processing cp
       WHERE cp.workspace_id = $1 AND cp.content_id = c.id AND cp.state = 'FAILED'
       ORDER BY cp.updated_at DESC
       LIMIT 1
     ) processing ON true
     WHERE c.workspace_id = $1 AND c.id = $2`,
    [config.workspaceId, contentId],
  );
  const row = content.rows[0];
  if (!row) throw new WorkspaceNotFoundError('content not found in workspace');
  const [frames, transcript, anchors, snapshots, job, extraction] = await Promise.all([
    client.query(`SELECT id, frame_type, timestamp_ms, storage_path FROM video_frame WHERE workspace_id = $1 AND content_id = $2 ORDER BY timestamp_ms, id`, [config.workspaceId, contentId]),
    client.query(`SELECT ts.id, ts.start_ms, ts.end_ms, ts.text, ts.role FROM transcript_segment ts JOIN transcript t ON t.id = ts.transcript_id WHERE t.workspace_id = $1 AND t.content_id = $2 ORDER BY ts.start_ms, ts.seq`, [config.workspaceId, contentId]),
    client.query(`SELECT a.id, a.anchor_type, a.timestamp_ms, a.review_state, a.note, a.video_frame_id, a.transcript_segment_id FROM temporal_evidence_anchor a WHERE a.workspace_id = $1 AND a.content_id = $2 ORDER BY a.timestamp_ms, a.id`, [config.workspaceId, contentId]),
    client.query<DbSnapshot>(`SELECT DISTINCT ON (ms.distribution) ms.id, ms.content_id, ms.distribution, ms.source, ms.captured_at, ms.content_age_hours, ms.raw_metrics, ms.quality_json FROM metric_snapshot ms WHERE ms.workspace_id = $1 AND ms.content_id = $2 ORDER BY ms.distribution, ms.captured_at DESC NULLS LAST, ms.created_at DESC`, [config.workspaceId, contentId]),
    client.query(`SELECT result FROM runtime_processing_job WHERE workspace_id = $1 AND content_id = $2`, [config.workspaceId, contentId]),
    client.query(`SELECT er.id AS extraction_run_id, er.provider, er.model, er.prompt_version, er.schema_version, er.input_hash, cf.id, cf.field_name, cf.ai_value, cf.reviewed_value, cf.review_state FROM extraction_run er JOIN content_feature cf ON cf.extraction_run_id = er.id WHERE er.workspace_id = $1 AND er.content_id = $2 ORDER BY er.created_at DESC, cf.field_name`, [config.workspaceId, contentId]),
  ]);
  const output = jsonObject(job.rows[0]?.result);
  const audioPath = jsonObject(output.audio).storagePath;
  const frameReferences = await Promise.all(frames.rows.map(async (frame) => ({
    id: frame.id,
    type: frame.frame_type,
    timestampMs: Number(frame.timestamp_ms),
    url: await authorizedArtifactUrl(config, contentId, String(frame.storage_path)),
  })));
  const audioUrl = typeof audioPath === 'string' ? await authorizedArtifactUrl(config, contentId, audioPath) : null;
  return {
    ...contentView(row, snapshots.rows.map(adaptSnapshot)),
    frames: frameReferences.map((frame) => ({ ...frame, available: frame.url !== null })),
    audio: { url: audioUrl, available: audioUrl !== null },
    transcript: transcript.rows.map((segment) => ({ id: segment.id, startMs: Number(segment.start_ms), endMs: Number(segment.end_ms), text: segment.text, role: segment.role })),
    anchors: anchors.rows.map((anchor) => ({ id: anchor.id, type: anchor.anchor_type, timestampMs: Number(anchor.timestamp_ms), reviewState: anchor.review_state, note: anchor.note, frameId: anchor.video_frame_id, transcriptSegmentId: anchor.transcript_segment_id })),
    extraction: extraction.rows.map((feature) => ({ id: feature.id, extractionRunId: feature.extraction_run_id, fieldName: feature.field_name, aiValue: feature.ai_value, reviewedValue: feature.reviewed_value, reviewState: feature.review_state, provider: feature.provider, model: feature.model, promptVersion: feature.prompt_version, schemaVersion: feature.schema_version, inputHash: feature.input_hash })),
  };
}
