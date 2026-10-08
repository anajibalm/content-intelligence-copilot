import { Pool, type PoolClient } from 'pg';
import {
  assessKpi,
  normalizeMetricSnapshot,
  qualityDetailsFromRaw,
  rankBatch,
  KPI_RULE_VERSION,
  METRICS_RULE_VERSION,
  RANKING_RULE_VERSION,
} from './rules.ts';
export interface MetricsRepositoryConfig {
  connectionString: string;
  workspaceId: string;
  storageRoot?: string;
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

interface DbConfig {
  id: string;
  brand_id: string;
  version: number;
  primary_metric: string | null;
  supporting_metrics: string[];
  ranking_rule_json: Record<string, unknown>;
  fallback_rule_json: Record<string, unknown>;
  configured_by: string | null;
  approval_state: 'UNCONFIGURED' | 'PENDING' | 'APPROVED';
  unconfigured_reason: string | null;
}

interface DbKpi {
  id: string;
  metric_name: string;
  target_value: number | null;
  unit: string | null;
  comparator: string | null;
  aggregation_method: string | null;
  distribution: 'ORGANIC' | 'PAID' | null;
  formula_version: string | null;
  unconfigured_reason: string | null;
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function latestConfig(configs: DbConfig[]): DbConfig | null {
  return configs.sort((left, right) => right.version - left.version)[0] ?? null;
}

export function metricsConfigFromEnv(): MetricsRepositoryConfig {
  const connectionString = process.env.CIC_DATABASE_URL ?? process.env.DATABASE_URL;
  const workspaceId = process.env.CIC_WORKSPACE_ID;
  if (!connectionString || !workspaceId) throw new Error('CIC_DATABASE_URL and CIC_WORKSPACE_ID are required for metrics');
  return { connectionString, workspaceId };
}

export function createMetricsRepository(config: MetricsRepositoryConfig) {
  const pool = new Pool({ connectionString: config.connectionString, max: 2 });

  async function batch(batchId: string) {
    const result = await analyze(pool, config.workspaceId, batchId);
    return result;
  }
  async function batchAndPersist(batchId: string) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await analyze(client, config.workspaceId, batchId);
      if (!result) {
        await client.query('COMMIT');
        return null;
      }
      const rankingResultId = await persistAnalysis(client, config.workspaceId, result);
      await client.query('COMMIT');
      return { ...result, rankingResultId };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  return { batch, batchAndPersist, close: () => pool.end() };

}

export async function analyze(clientOrPool: Pool | PoolClient, workspaceId: string, batchId: string) {
  const batchResult = await clientOrPool.query<{ id: string; name: string; brand_id: string; analysis_config_id: string | null }>(
    `SELECT id, name, brand_id, analysis_config_id FROM batch WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, batchId],
  );
  const batchRow = batchResult.rows[0];
  if (!batchRow) return null;

  const [snapshotResult, configResult, kpiResult] = await Promise.all([
    clientOrPool.query<DbSnapshot>(
      `SELECT ms.id, ms.content_id, ms.distribution, ms.source, ms.captured_at, ms.content_age_hours,
              ms.raw_metrics, ms.quality_json
       FROM metric_snapshot ms
       JOIN content c ON c.id = ms.content_id
       WHERE ms.workspace_id = $1 AND c.batch_id = $2
       ORDER BY c.external_id, ms.distribution, ms.captured_at DESC NULLS LAST, ms.created_at DESC`,
      [workspaceId, batchId],
    ),
    clientOrPool.query<DbConfig>(
      `SELECT id, brand_id, version, primary_metric, supporting_metrics, ranking_rule_json,
              fallback_rule_json, configured_by, approval_state, unconfigured_reason
       FROM brand_analysis_config
       WHERE workspace_id = $1 AND brand_id = $2
       ORDER BY version DESC`,
      [workspaceId, batchRow.brand_id],
    ),
    clientOrPool.query<DbKpi>(
      `SELECT id, metric_name, target_value, unit, comparator, aggregation_method, distribution,
              formula_version, unconfigured_reason
       FROM brand_kpi_definition
       WHERE workspace_id = $1 AND brand_id = $2
       ORDER BY version DESC, metric_name`,
      [workspaceId, batchRow.brand_id],
    ),
  ]);

  const seen = new Set<string>();
  const snapshots = snapshotResult.rows.flatMap((row) => {
    const key = `${row.content_id}:${row.distribution}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const rawMetrics = qualityDetailsFromRaw(row.raw_metrics, row.quality_json);
    return [normalizeMetricSnapshot({
      id: row.id,
      contentId: row.content_id,
      distribution: row.distribution,
      source: row.source,
      capturedAt: row.captured_at,
      contentAgeHours: row.content_age_hours,
      rawMetrics,
    })];
  });
  const configs = configResult.rows;
  const selectedConfig = configs.find((item) => item.id === batchRow.analysis_config_id) ?? latestConfig(configs);
  const ranking = rankBatch(snapshots, selectedConfig ? {
    id: selectedConfig.id,
    version: selectedConfig.version,
    approvalState: selectedConfig.approval_state,
    configuredBy: selectedConfig.configured_by,
    primaryMetric: selectedConfig.primary_metric,
    rankingRule: selectedConfig.ranking_rule_json,
    fallbackRule: selectedConfig.fallback_rule_json,
    unconfiguredReason: selectedConfig.unconfigured_reason,
  } : null);
  const kpis = kpiResult.rows.map((definition) => ({
    definition,
    assessment: assessKpi({
      metricName: definition.metric_name,
      targetValue: definition.target_value == null ? null : Number(definition.target_value),
      comparator: definition.comparator,
      aggregationMethod: definition.aggregation_method,
      distribution: definition.distribution,
      formulaVersion: definition.formula_version,
    }, snapshots, {
      minimumSampleSize: Number((selectedConfig?.ranking_rule_json ?? {}).minimumSampleSize ?? 1),
    }),
  }));

  return {
    batch: { id: batchRow.id, name: batchRow.name, brandId: batchRow.brand_id },
    synthetic: snapshots.some((snapshot) => snapshot.source === 'synthetic_s5_demo'),
    snapshots,
    config: selectedConfig,
    ranking,
    kpis,
    ruleVersions: { metrics: METRICS_RULE_VERSION, ranking: RANKING_RULE_VERSION, kpi: KPI_RULE_VERSION },
  };
}

export async function persistAnalysis(client: PoolClient, workspaceId: string, result: Awaited<ReturnType<typeof analyze>>) {
  if (!result) return;
  const snapshotIds = result.snapshots.map((snapshot) => snapshot.id);
  const ranking = result.ranking;
  const insert = await client.query<{ id: string }>(
    `INSERT INTO batch_ranking_result
      (workspace_id, brand_id, batch_id, distribution, analysis_config_id, source_snapshot_ids,
       primary_metric, rule_version, status, reason, result_json)
     VALUES ($1, $2, $3, $4, $5, $6::uuid[], $7, $8, $9, $10, $11::jsonb)
     RETURNING id`,
    [workspaceId, result.batch.brandId, result.batch.id, ranking.distribution ?? 'ORGANIC', result.config?.id ?? null,
      snapshotIds, result.config?.primary_metric ?? null, ranking.ruleVersion, ranking.status, ranking.reason ?? null, JSON.stringify(ranking)],
  );
  const resultId = insert.rows[0]?.id;
  if (!resultId) throw new Error('ranking result insert returned no id');
  const rankingGroups = ranking.rankedGroups ?? [{ items: ranking.ranked }];
  for (const group of rankingGroups) {
    for (const [index, item] of group.items.entries()) {
      await client.query(
        `INSERT INTO batch_ranking_item
          (workspace_id, ranking_result_id, content_id, metric_snapshot_id, position, metric_name, metric_value, eligible, basis_json)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8::jsonb)`,
        [workspaceId, resultId, item.contentId, item.snapshotId, index + 1, item.basis.metric, item.value, JSON.stringify(item.basis)],
      );
    }
  }
  for (const item of ranking.excluded) {
    await client.query(
      `INSERT INTO batch_ranking_item
        (workspace_id, ranking_result_id, content_id, eligible, exclusion_reason)
       VALUES ($1, $2, $3, false, $4)`,
      [workspaceId, resultId, item.contentId, item.reason],
    );
  }
  for (const item of result.kpis) {
    await client.query(
      `INSERT INTO batch_kpi_assessment
        (workspace_id, batch_id, kpi_definition_id, analysis_config_id, source_snapshot_ids,
         excluded_snapshot_ids, exclusion_json, formula_version, rule_version, actual_value, status, quality_state, assessed_at)
       VALUES ($1, $2, $3, $4, $5::uuid[], $6::uuid[], $7::jsonb, $8, $9, $10, $11, $12, now())`,
      [workspaceId, result.batch.id, item.definition.id, result.config?.id ?? null, item.assessment.sourceSnapshotIds,
        item.assessment.excludedSnapshotIds, JSON.stringify(item.assessment.excluded), item.assessment.formulaVersion,
        item.assessment.ruleVersion, item.assessment.actualValue, item.assessment.status, item.assessment.qualityState],
    );
  }
  return resultId;
}
