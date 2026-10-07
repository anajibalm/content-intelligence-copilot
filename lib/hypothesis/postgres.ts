import { Pool } from 'pg';
import {
  HYPOTHESIS_PROMPT_VERSION,
  HYPOTHESIS_RULE_VERSION,
  HYPOTHESIS_SCHEMA_VERSION,
  evidenceCatalogId,
  hashGenerationInput,
  promptFor,
  validateHypothesis,
  type EvidenceCatalogItem,
  type HypothesisModelOutput,
} from './rules.ts';

export interface HypothesisRepositoryConfig {
  connectionString: string;
  workspaceId: string;
  providerEndpoint: string;
  providerApiKey: string;
  providerModel: string;
  providerName: string;
}
export interface HypothesisRepository {
  create(input: { batchId: string; comparisonId: string; regenerate?: boolean }): Promise<Record<string, unknown>>;
  get(hypothesisId: string): Promise<Record<string, unknown>>;
  close(): Promise<void>;
}

export class HypothesisNotFoundError extends Error {
  readonly statusCode = 404;
  constructor(message: string) {
    super(message);
    this.name = 'HypothesisNotFoundError';
  }
}

export class HypothesisProviderError extends Error {
  readonly statusCode = 503;
  constructor(message: string) {
    super(message);
    this.name = 'HypothesisProviderError';
  }
}

export class HypothesisValidationError extends Error {
  readonly statusCode = 422;
  constructor(message: string) {
    super(message);
    this.name = 'HypothesisValidationError';
  }
}

type ComparisonRow = {
  id: string;
  batch_id: string;
  quality: string;
  rule_version: string;
  controlled_variables: Record<string, unknown>;
  uncontrolled_variables: Record<string, unknown>;
};
type ItemRow = { content_id: string; position: number; metric_snapshot_id: string | null };
type SnapshotRow = { id: string; content_id: string; quality: string; raw_metrics: Record<string, unknown>; derived_metrics: Record<string, unknown>; quality_json: Record<string, unknown> };
type SourceRow = { id: string; content_id: string; source_type: 'TRANSCRIPT_SEGMENT' | 'VIDEO_FRAME' | 'CONTENT_FEATURE'; statement: string; link: string };
type HypothesisRow = { id: string; batch_id: string; statement: string; state: string; confidence: string; confidence_caps: Array<{ rule: string; reason: string }>; provider: string | null; model: string | null; prompt_version: string | null; schema_version: string | null; rule_version: string | null; input_hash: string | null; raw_output: Record<string, unknown>; suggested_next_test: Record<string, unknown> | null; created_at: string; updated_at: string };

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function metricQuality(row: SnapshotRow): string {
  const details = Object.values(jsonObject(row.quality_json));
  const states = details.map((detail) => String(jsonObject(detail).state ?? 'UNAVAILABLE'));
  if (states.includes('SUSPECT')) return 'SUSPECT';
  if (states.length === 0 || states.some((state) => state === 'MISSING' || state === 'UNAVAILABLE')) return 'UNAVAILABLE';
  return 'VALID';
}

function metricStatement(snapshot: SnapshotRow, layer: 'OBSERVED' | 'DERIVED'): string {
  const values = layer === 'DERIVED' ? snapshot.derived_metrics : snapshot.raw_metrics;
  return `${layer} metrics from frozen snapshot ${snapshot.id}: ${JSON.stringify(values)}`;
}

function sourceLink(batchId: string, contentId: string, sourceType?: string, sourceId?: string): string {
  const anchor = sourceType && sourceId ? `#${sourceType.toLowerCase().replaceAll('_', '-')}-${encodeURIComponent(sourceId)}` : '';
  return `/?batchId=${encodeURIComponent(batchId)}&contentId=${encodeURIComponent(contentId)}${anchor}`;
}

function parseModelOutput(value: unknown): HypothesisModelOutput {
  const candidate = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  if (!candidate) throw new HypothesisProviderError('provider returned a non-object response');
  const raw = candidate.choices && Array.isArray(candidate.choices) ? (candidate.choices[0] as Record<string, unknown> | undefined)?.message : candidate;
  const content = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).content : raw;
  if (typeof content === 'object' && content !== null) return content as HypothesisModelOutput;
  if (typeof content !== 'string') throw new HypothesisProviderError('provider response did not contain structured JSON');
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(cleaned) as HypothesisModelOutput;
  } catch {
    throw new HypothesisProviderError('provider returned malformed JSON');
  }
}

function catalogEvidence(workspaceId: string, batchId: string, comparisonId: string, items: ItemRow[], snapshots: Map<string, SnapshotRow>, sources: SourceRow[]): EvidenceCatalogItem[] {
  const result: EvidenceCatalogItem[] = [];
  for (const item of items) {
    const snapshot = item.metric_snapshot_id ? snapshots.get(item.metric_snapshot_id) : null;
    if (snapshot) {
      result.push({ id: evidenceCatalogId(workspaceId, comparisonId, 'METRIC_SNAPSHOT', snapshot.id, 'OBSERVED'), sourceType: 'METRIC_SNAPSHOT', sourceId: snapshot.id, workspaceId, contentId: item.content_id, comparisonId, layer: 'OBSERVED', statement: metricStatement(snapshot, 'OBSERVED'), link: sourceLink(batchId, item.content_id, 'metric-snapshot', snapshot.id) });
      if (Object.keys(snapshot.derived_metrics).length > 0) result.push({ id: evidenceCatalogId(workspaceId, comparisonId, 'METRIC_SNAPSHOT', snapshot.id, 'DERIVED'), sourceType: 'METRIC_SNAPSHOT', sourceId: snapshot.id, workspaceId, contentId: item.content_id, comparisonId, layer: 'DERIVED', statement: metricStatement(snapshot, 'DERIVED'), link: sourceLink(batchId, item.content_id, 'metric-snapshot', snapshot.id) });
    }
  }
  for (const source of sources) result.push({ id: evidenceCatalogId(workspaceId, comparisonId, source.source_type, source.id, source.source_type === 'CONTENT_FEATURE' ? 'EXTRACTED' : 'OBSERVED'), sourceType: source.source_type, sourceId: source.id, workspaceId, contentId: source.content_id, comparisonId, layer: source.source_type === 'CONTENT_FEATURE' ? 'EXTRACTED' : 'OBSERVED', statement: source.statement, link: sourceLink(batchId, source.content_id, source.source_type, source.id) });
  return result.sort((left, right) => left.id.localeCompare(right.id));
}
function ensureScopedCatalog(catalog: EvidenceCatalogItem[], workspaceId: string): EvidenceCatalogItem[] {
  return catalog.map((item) => ({ ...item, workspaceId }));
}

export function hypothesisConfigFromEnv(): HypothesisRepositoryConfig {
  const connectionString = process.env.CIC_DATABASE_URL ?? process.env.DATABASE_URL;
  const workspaceId = process.env.CIC_WORKSPACE_ID;
  const providerEndpoint = process.env.CIC_HYPOTHESIS_ENDPOINT ?? process.env.CIC_FINGERPRINT_ENDPOINT;
  const providerApiKey = process.env.CIC_HYPOTHESIS_API_KEY ?? process.env.CIC_FINGERPRINT_API_KEY;
  const providerModel = process.env.CIC_HYPOTHESIS_MODEL ?? process.env.CIC_FINGERPRINT_MODEL;
  if (!connectionString || !workspaceId || !providerEndpoint || !providerApiKey || !providerModel) throw new HypothesisProviderError('CIC database, workspace, hypothesis endpoint, API key, and model are required');
  return { connectionString, workspaceId, providerEndpoint, providerApiKey, providerModel, providerName: process.env.CIC_HYPOTHESIS_PROVIDER ?? '9router' };
}

export function createHypothesisRepository(config: HypothesisRepositoryConfig): HypothesisRepository {
  const pool = new Pool({ connectionString: config.connectionString, max: 2 });

  async function loadScope(comparisonId: string) {
    const comparisonResult = await pool.query<ComparisonRow>(`SELECT id, batch_id, quality, rule_version, controlled_variables, uncontrolled_variables FROM comparison WHERE workspace_id = $1 AND id = $2`, [config.workspaceId, comparisonId]);
    const comparison = comparisonResult.rows[0];
    if (!comparison) throw new HypothesisNotFoundError('comparison not found in workspace');
    const items = (await pool.query<ItemRow>(`SELECT ci.content_id, ci.position, cs.metric_snapshot_id FROM comparison_item ci JOIN content c ON c.id = ci.content_id AND c.workspace_id = ci.workspace_id AND c.batch_id = $3 LEFT JOIN comparison_snapshot cs ON cs.workspace_id = ci.workspace_id AND cs.comparison_id = ci.comparison_id AND cs.content_id = ci.content_id WHERE ci.workspace_id = $1 AND ci.comparison_id = $2 ORDER BY ci.position`, [config.workspaceId, comparisonId, comparison.batch_id])).rows;
    const itemCount = Number((await pool.query<{ count: string }>(`SELECT count(*)::text AS count FROM comparison_item WHERE workspace_id = $1 AND comparison_id = $2`, [config.workspaceId, comparisonId])).rows[0]?.count ?? 0);
    if (itemCount !== items.length) throw new HypothesisValidationError('comparison contains content outside selected batch');
    const snapshotIds = items.map((item) => item.metric_snapshot_id).filter((id): id is string => Boolean(id));
    const snapshots = snapshotIds.length === 0 ? [] : (await pool.query<SnapshotRow>(`SELECT id, content_id, quality, raw_metrics, derived_metrics, quality_json FROM metric_snapshot WHERE workspace_id = $1 AND id = ANY($2::uuid[])`, [config.workspaceId, snapshotIds])).rows;
    const contentIds = items.map((item) => item.content_id);
    const sources = contentIds.length === 0 ? [] : (await pool.query<SourceRow>(`SELECT ts.id, t.content_id, 'TRANSCRIPT_SEGMENT' AS source_type, ts.text AS statement, $3 || '&contentId=' || t.content_id AS link FROM transcript_segment ts JOIN transcript t ON t.id = ts.transcript_id WHERE ts.workspace_id = $1 AND t.workspace_id = $1 AND t.content_id = ANY($2::uuid[]) UNION ALL SELECT vf.id, vf.content_id, 'VIDEO_FRAME', 'VIDEO_FRAME at ' || vf.timestamp_ms || 'ms', $3 || '&contentId=' || vf.content_id FROM video_frame vf WHERE vf.workspace_id = $1 AND vf.content_id = ANY($2::uuid[]) UNION ALL SELECT cf.id, cf.content_id, 'CONTENT_FEATURE', 'EXTRACTED ' || cf.field_name || ': ' || COALESCE(cf.reviewed_value, cf.ai_value) || ' [' || cf.review_state || ']', $3 || '&contentId=' || cf.content_id FROM content_feature cf WHERE cf.workspace_id = $1 AND cf.content_id = ANY($2::uuid[])`, [config.workspaceId, contentIds, `/?batchId=${comparison.batch_id}`])).rows;
    const catalog = catalogEvidence(config.workspaceId, comparison.batch_id, comparisonId, items, new Map(snapshots.map((row) => [row.id, row])), sources);
    const quality = snapshots.some((row) => metricQuality(row) === 'SUSPECT') ? 'SUSPECT' : snapshots.length === 0 || snapshots.some((row) => metricQuality(row) !== 'VALID') ? 'UNAVAILABLE' : 'VALID';
    return { comparison, items, snapshots, catalog, primaryMetricQuality: quality };
  }

  async function generate(catalog: EvidenceCatalogItem[], comparison: ComparisonRow) {
    const input = { comparisonId: comparison.id, comparisonContext: { quality: comparison.quality, ruleVersion: comparison.rule_version, controlledVariables: comparison.controlled_variables, uncontrolledVariables: comparison.uncontrolled_variables }, evidence: catalog };
    const response = await fetch(config.providerEndpoint, { method: 'POST', headers: { authorization: `Bearer ${config.providerApiKey}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: config.providerModel, temperature: 0, max_tokens: 1000, messages: [{ role: 'system', content: 'Return only the requested JSON object.' }, { role: 'user', content: promptFor(input) }] }) });
    if (!response.ok) throw new HypothesisProviderError(`hypothesis provider returned HTTP ${response.status}`);
    return parseModelOutput(await response.json());
  }

  async function create(input: { batchId: string; comparisonId: string; regenerate?: boolean }) {
    const scope = await loadScope(input.comparisonId);
    if (scope.comparison.batch_id !== input.batchId) throw new HypothesisNotFoundError('comparison does not belong to selected batch');
    const inputHash = hashGenerationInput({ comparisonId: input.comparisonId, evidence: scope.catalog, comparisonContext: scope.comparison.controlled_variables });
    if (!input.regenerate) {
      const existing = (await pool.query<{ id: string }>(`SELECT id FROM hypothesis WHERE workspace_id = $1 AND batch_id = $2 AND input_hash = $3 ORDER BY created_at DESC LIMIT 1`, [config.workspaceId, input.batchId, inputHash])).rows[0];
      if (existing) return get(existing.id);
    }
    const modelOutput = await generate(scope.catalog, scope.comparison);
    const validated = validateHypothesis({ workspaceId: config.workspaceId, batchId: input.batchId, comparisonId: input.comparisonId, comparisonQuality: scope.comparison.quality, sampleSize: scope.items.length, primaryMetricQuality: scope.primaryMetricQuality, modelOutput, evidence: scope.catalog });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const item of scope.catalog) {
        await client.query(`INSERT INTO evidence (id, workspace_id, layer, statement, created_by) VALUES ($1, $2, $3, $4, $5)`, [item.id, config.workspaceId, item.layer, item.statement, config.providerName]);
        await client.query(`INSERT INTO evidence_source (workspace_id, evidence_id, source_type, metric_snapshot_id, transcript_segment_id, video_frame_id, content_feature_id) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [config.workspaceId, item.id, item.sourceType, item.sourceType === 'METRIC_SNAPSHOT' ? item.sourceId : null, item.sourceType === 'TRANSCRIPT_SEGMENT' ? item.sourceId : null, item.sourceType === 'VIDEO_FRAME' ? item.sourceId : null, item.sourceType === 'CONTENT_FEATURE' ? item.sourceId : null]);
      }
      const hypothesis = await client.query<{ id: string }>(`INSERT INTO hypothesis (workspace_id, batch_id, statement, confidence, confidence_caps, created_by, provider, model, prompt_version, schema_version, rule_version, input_hash, raw_output, suggested_next_test) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb) RETURNING id`, [config.workspaceId, input.batchId, validated.statement, validated.confidence, JSON.stringify(validated.confidenceCaps), config.providerName, config.providerName, config.providerModel, HYPOTHESIS_PROMPT_VERSION, HYPOTHESIS_SCHEMA_VERSION, HYPOTHESIS_RULE_VERSION, inputHash, JSON.stringify(modelOutput), JSON.stringify(validated.suggestedNextTest)]);
      const hypothesisId = hypothesis.rows[0]?.id;
      if (!hypothesisId) throw new Error('hypothesis insert returned no ID');
      await client.query(`INSERT INTO hypothesis_comparison (workspace_id, hypothesis_id, comparison_id, role) VALUES ($1, $2, $3, 'ORIGIN')`, [config.workspaceId, hypothesisId, input.comparisonId]);
      for (const link of validated.links) await client.query(`INSERT INTO hypothesis_evidence (workspace_id, hypothesis_id, evidence_id, role) VALUES ($1, $2, $3, $4)`, [config.workspaceId, hypothesisId, link.evidenceId, link.role]);
      await client.query('COMMIT');
      return get(hypothesisId);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async function get(hypothesisId: string) {
    const hypothesis = (await pool.query<HypothesisRow>(`SELECT id, batch_id, statement, state, confidence, confidence_caps, provider, model, prompt_version, schema_version, rule_version, input_hash, raw_output, suggested_next_test, created_at, updated_at FROM hypothesis WHERE workspace_id = $1 AND id = $2`, [config.workspaceId, hypothesisId])).rows[0];
    if (!hypothesis) throw new HypothesisNotFoundError('hypothesis not found in workspace');
    const evidenceRows = (await pool.query(`SELECT e.id, e.layer, e.statement, es.source_type, COALESCE(es.metric_snapshot_id, es.transcript_segment_id, es.video_frame_id, es.content_feature_id) AS source_id, COALESCE(ms.content_id, t.content_id, vf.content_id, cf.content_id) AS content_id, he.role FROM hypothesis_evidence he JOIN evidence e ON e.id = he.evidence_id AND e.workspace_id = he.workspace_id JOIN evidence_source es ON es.evidence_id = e.id AND es.workspace_id = e.workspace_id LEFT JOIN metric_snapshot ms ON ms.id = es.metric_snapshot_id AND ms.workspace_id = es.workspace_id LEFT JOIN transcript_segment ts ON ts.id = es.transcript_segment_id AND ts.workspace_id = es.workspace_id LEFT JOIN transcript t ON t.id = ts.transcript_id AND t.workspace_id = ts.workspace_id LEFT JOIN video_frame vf ON vf.id = es.video_frame_id AND vf.workspace_id = es.workspace_id LEFT JOIN content_feature cf ON cf.id = es.content_feature_id AND cf.workspace_id = es.workspace_id WHERE he.workspace_id = $1 AND he.hypothesis_id = $2 ORDER BY e.created_at, e.id`, [config.workspaceId, hypothesisId])).rows;
    const evidence = evidenceRows.map((row) => ({ ...row, link: row.content_id ? sourceLink(hypothesis.batch_id, row.content_id, row.source_type, row.source_id) : null }));
    const comparison = (await pool.query<{ comparison_id: string; role: string }>(`SELECT comparison_id, role FROM hypothesis_comparison WHERE workspace_id = $1 AND hypothesis_id = $2 ORDER BY created_at`, [config.workspaceId, hypothesisId])).rows;
    return { id: hypothesis.id, batchId: hypothesis.batch_id, statement: hypothesis.statement, state: hypothesis.state, confidence: hypothesis.confidence, confidenceCaps: hypothesis.confidence_caps, provider: hypothesis.provider, model: hypothesis.model, promptVersion: hypothesis.prompt_version, schemaVersion: hypothesis.schema_version, ruleVersion: hypothesis.rule_version, inputHash: hypothesis.input_hash, rawOutput: hypothesis.raw_output, suggestedNextTest: hypothesis.suggested_next_test, comparisons: comparison, evidence };
  }

  return { create, get, close: () => pool.end() };
}
