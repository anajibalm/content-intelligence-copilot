import { normalizeMetricSnapshot, qualityDetailsFromRaw, METRICS_RULE_VERSION } from '../metrics/rules.ts';
import { Pool } from 'pg';
import { compareContents, type ComparisonResult } from './rules.ts';

export interface ComparisonRepositoryConfig {
  connectionString: string;
  workspaceId: string;
}

export class ComparisonNotFoundError extends Error {
  readonly statusCode = 404;

  constructor(message: string) {
    super(message);
    this.name = 'ComparisonNotFoundError';
  }
}
interface FeatureInput { aiValue: string; reviewedValue: string | null; reviewState: string; }

interface DbContent { id: string; pillar_id: string | null; duration_ms: number | null; created_at: string; }
interface DbSnapshot {
  id: string;
  content_id: string;
  distribution: 'ORGANIC' | 'PAID';
  source: string | null;
  quality: 'VALID' | 'MISSING' | 'SUSPECT' | 'UNAVAILABLE';
  captured_at: string | null;
  content_age_hours: number | null;
  raw_metrics: Record<string, unknown>;
  derived_metrics: Record<string, unknown>;
  quality_json: Record<string, unknown>;
}
interface DbFeature { content_id: string; field_name: string; ai_value: string; reviewed_value: string | null; review_state: string; }
interface DbComparison {
  id: string;
  batch_id: string;
  mode: 'CONTROLLED' | 'PERFORMANCE_CONTRAST' | 'MANUAL';
  scope: 'PAIR' | 'GROUP' | 'BATCH';
  distribution: 'ORGANIC' | 'PAID';
  quality: 'LOW' | 'HIGH' | 'UNAVAILABLE';
  quality_reasons: string[];
  rule_version: string;
  controlled_variables: Record<string, unknown>;
  uncontrolled_variables: Record<string, unknown>;
  label: null;
  label_basis: null;
}

type SnapshotInput = {
  id: string;
  distribution: 'ORGANIC' | 'PAID';
  quality: string;
  qualityByMetric: Record<string, { state?: string; reason?: string | null }>;
  rawMetrics: Record<string, unknown>;
  derivedMetrics: Record<string, unknown>;
  contentAgeHours: number | null;
};

const METRIC_NAMES = ['views', 'awt_seconds', 'wfv_pct', 'engagement_rate'];

// Snapshot IDs and stored comparison conclusions stay historical; metric rows name current derivation explicitly.

function metricValue(snapshot: SnapshotInput, name: string): number | null {
  const entry = name === 'engagement_rate' ? snapshot.derivedMetrics[name] : snapshot.rawMetrics[name];
  if (typeof entry === 'number') return Number.isFinite(entry) ? entry : null;
  if (entry && typeof entry === 'object' && 'value' in entry) {
    const value = entry.value;
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }
  return null;
}

function metricQuality(snapshot: SnapshotInput, name: string) {
  const detail = snapshot.qualityByMetric[name];
  if (detail?.state) return { state: detail.state, reason: detail.reason ?? null };
  return { state: 'UNAVAILABLE', reason: 'NOT_PROVIDED' };
}
function snapshotInput(row: DbSnapshot): SnapshotInput {
  return normalizeMetricSnapshot({
    id: row.id,
    contentId: row.content_id,
    distribution: row.distribution,
    source: row.source,
    capturedAt: row.captured_at,
    contentAgeHours: row.content_age_hours,
    rawMetrics: qualityDetailsFromRaw(row.raw_metrics, row.quality_json),
  });
}


function metricRows(items: Array<{ contentId: string; metricSnapshotId: string | null; position: number }>, snapshots: Map<string, SnapshotInput>) {
  return items.map((item) => {
    const snapshot = item.metricSnapshotId ? snapshots.get(item.metricSnapshotId) : null;
    return {
      contentId: item.contentId,
      metricSnapshotId: item.metricSnapshotId,
      metrics: METRIC_NAMES.map((name) => ({ name, value: snapshot ? metricValue(snapshot, name) : null, ...(snapshot ? metricQuality(snapshot, name) : { state: 'UNAVAILABLE', reason: 'NOT_PROVIDED' }) })),
    };
  });
}

export function comparisonConfigFromEnv(): ComparisonRepositoryConfig {
  const connectionString = process.env.CIC_DATABASE_URL ?? process.env.DATABASE_URL;
  const workspaceId = process.env.CIC_WORKSPACE_ID;
  if (!connectionString || !workspaceId) throw new Error('CIC_DATABASE_URL and CIC_WORKSPACE_ID are required for comparison');
  return { connectionString, workspaceId };
}

export function createComparisonRepository(config: ComparisonRepositoryConfig) {
  const pool = new Pool({ connectionString: config.connectionString, max: 2 });

  async function create(input: { batchId: string; contentIds: string[]; mode: 'CONTROLLED' | 'PERFORMANCE_CONTRAST' | 'MANUAL'; scope: 'PAIR' | 'GROUP' | 'BATCH'; distribution: 'ORGANIC' | 'PAID' }) {
    const batch = await pool.query<{ id: string }>('SELECT id FROM batch WHERE workspace_id = $1 AND id = $2', [config.workspaceId, input.batchId]);
    if (!batch.rows[0]) throw new ComparisonNotFoundError('batch not found in workspace');
    const [contentResult, snapshotResult, featureResult] = await Promise.all([
      pool.query<DbContent>(`SELECT id, pillar_id, duration_ms, created_at FROM content WHERE workspace_id = $1 AND batch_id = $2 AND id = ANY($3::uuid[])`, [config.workspaceId, input.batchId, input.contentIds]),
      pool.query<DbSnapshot>(`SELECT DISTINCT ON (ms.content_id) ms.id, ms.content_id, ms.distribution, ms.source, ms.quality, ms.captured_at, ms.content_age_hours, ms.raw_metrics, ms.derived_metrics, ms.quality_json FROM metric_snapshot ms JOIN content c ON c.id = ms.content_id WHERE ms.workspace_id = $1 AND c.batch_id = $2 AND c.id = ANY($3::uuid[]) AND ms.distribution = $4 ORDER BY ms.content_id, ms.captured_at DESC NULLS LAST, ms.created_at DESC`, [config.workspaceId, input.batchId, input.contentIds, input.distribution]),
      pool.query<DbFeature>(`SELECT DISTINCT ON (cf.content_id, cf.field_name) cf.content_id, cf.field_name, cf.ai_value, cf.reviewed_value, cf.review_state FROM content_feature cf JOIN extraction_run er ON er.id = cf.extraction_run_id WHERE cf.workspace_id = $1 AND cf.content_id = ANY($2::uuid[]) ORDER BY cf.content_id, cf.field_name, er.created_at DESC, cf.updated_at DESC`, [config.workspaceId, input.contentIds]),
    ]);
    if (contentResult.rows.length !== input.contentIds.length) throw new ComparisonNotFoundError('one or more content IDs are not members of selected batch');
    const contentMap = new Map(contentResult.rows.map((row) => [row.id, row]));
    const snapshotMap = new Map(snapshotResult.rows.map((row) => [row.content_id, snapshotInput(row)]));
    const featureMap = new Map<string, Record<string, FeatureInput>>();
    for (const row of featureResult.rows) featureMap.set(row.content_id, { ...(featureMap.get(row.content_id) ?? {}), [row.field_name]: { aiValue: row.ai_value, reviewedValue: row.reviewed_value, reviewState: row.review_state } });
    const contents = input.contentIds.map((id) => {
      const row = contentMap.get(id)!;
      const snapshot = snapshotMap.get(id);
      return { id, pillarId: row.pillar_id, durationSeconds: row.duration_ms == null ? null : Number(row.duration_ms) / 1000, contentAgeHours: snapshot?.contentAgeHours ?? (Date.now() - Date.parse(row.created_at)) / 3_600_000, features: featureMap.get(id) ?? {}, snapshots: snapshot ? [snapshot] : [] };
    });
    const result = compareContents({ ...input, contents });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const comparison = await client.query<{ id: string }>(`INSERT INTO comparison (workspace_id, batch_id, mode, scope, distribution, quality, quality_reasons, rule_version, controlled_variables, uncontrolled_variables, label, label_basis) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9::jsonb, $10::jsonb, $11, $12) RETURNING id`, [config.workspaceId, input.batchId, input.mode, input.scope, input.distribution, result.quality, JSON.stringify(result.qualityReasons), result.ruleVersion, JSON.stringify(result.controlledVariables), JSON.stringify(result.uncontrolledVariables), result.label, result.labelBasis]);
      const comparisonId = comparison.rows[0]?.id;
      if (!comparisonId) throw new Error('comparison insert returned no ID');
      for (const item of result.items) {
        await client.query(`INSERT INTO comparison_item (workspace_id, comparison_id, content_id, position) VALUES ($1, $2, $3, $4)`, [config.workspaceId, comparisonId, item.contentId, item.position]);
        if (item.metricSnapshotId) await client.query(`INSERT INTO comparison_snapshot (workspace_id, comparison_id, content_id, metric_snapshot_id) VALUES ($1, $2, $3, $4)`, [config.workspaceId, comparisonId, item.contentId, item.metricSnapshotId]);
      }
      await client.query('COMMIT');
      return { id: comparisonId, ...result, metricDerivationVersion: METRICS_RULE_VERSION, metricBasis: 'CURRENT_RULES_FROM_FROZEN_SNAPSHOTS' };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async function get(comparisonId: string) {
    const comparisonResult = await pool.query<DbComparison>(`SELECT id, batch_id, mode, scope, distribution, quality, quality_reasons, rule_version, controlled_variables, uncontrolled_variables, label, label_basis FROM comparison WHERE workspace_id = $1 AND id = $2`, [config.workspaceId, comparisonId]);
    const comparison = comparisonResult.rows[0];
    if (!comparison) throw new ComparisonNotFoundError('comparison not found in workspace');
    const itemResult = await pool.query<{ content_id: string; position: number; metric_snapshot_id: string | null }>(`SELECT ci.content_id, ci.position, cs.metric_snapshot_id FROM comparison_item ci LEFT JOIN comparison_snapshot cs ON cs.workspace_id = ci.workspace_id AND cs.comparison_id = ci.comparison_id AND cs.content_id = ci.content_id WHERE ci.workspace_id = $1 AND ci.comparison_id = $2 ORDER BY ci.position`, [config.workspaceId, comparisonId]);
    const snapshotIds = itemResult.rows.map((item) => item.metric_snapshot_id).filter((id): id is string => Boolean(id));
    const snapshotRows = snapshotIds.length === 0 ? [] : (await pool.query<DbSnapshot>(`SELECT id, content_id, distribution, source, quality, captured_at, content_age_hours, raw_metrics, derived_metrics, quality_json FROM metric_snapshot WHERE workspace_id = $1 AND id = ANY($2::uuid[])`, [config.workspaceId, snapshotIds])).rows;
    const snapshots = new Map(snapshotRows.map((row) => [row.id, snapshotInput(row)]));
    return {
      id: comparison.id,
      ruleVersion: comparison.rule_version,
      metricDerivationVersion: METRICS_RULE_VERSION,
      metricBasis: 'CURRENT_RULES_FROM_FROZEN_SNAPSHOTS',
      mode: comparison.mode,
      scope: comparison.scope,
      distribution: comparison.distribution,
      quality: comparison.quality,
      qualityReasons: comparison.quality_reasons,
      label: comparison.label,
      labelBasis: comparison.label_basis,
      controlledVariables: comparison.controlled_variables as ComparisonResult['controlledVariables'],
      uncontrolledVariables: comparison.uncontrolled_variables as ComparisonResult['uncontrolledVariables'],
      items: itemResult.rows.map((item) => ({ contentId: item.content_id, position: item.position, metricSnapshotId: item.metric_snapshot_id })),
      snapshotIds,
      metricRows: metricRows(itemResult.rows.map((item) => ({ contentId: item.content_id, position: item.position, metricSnapshotId: item.metric_snapshot_id })), snapshots),
    };
  }

  return { create, get, close: () => pool.end() };
}
