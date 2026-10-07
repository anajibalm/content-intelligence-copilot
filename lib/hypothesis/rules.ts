import { createHash } from 'node:crypto';

export const HYPOTHESIS_RULE_VERSION = 'hypothesis-v1';
export const HYPOTHESIS_PROMPT_VERSION = 'hypothesis-prompt-v1';
export const HYPOTHESIS_SCHEMA_VERSION = 'hypothesis-schema-v1';

export type EvidenceLayer = 'OBSERVED' | 'DERIVED' | 'EXTRACTED' | 'INFERRED';
export type EvidenceSourceType = 'METRIC_SNAPSHOT' | 'TRANSCRIPT_SEGMENT' | 'VIDEO_FRAME' | 'CONTENT_FEATURE';
export type EvidenceRole = 'SUPPORTING' | 'CONTRADICTING' | 'CONTEXTUAL';
export type Confidence = 'LOW' | 'MEDIUM' | 'HIGH';

type Source = { sourceType: EvidenceSourceType; sourceId: string; workspaceId: string; contentId: string; comparisonId?: string; layer: EvidenceLayer; statement: string; link: string };
export type EvidenceCatalogItem = Source & { id: string };
export type HypothesisModelOutput = {
  statement: unknown;
  supporting_evidence_ids: unknown;
  contradicting_evidence_ids: unknown;
  contextual_evidence_ids: unknown;
  suggested_next_test: unknown;
  confidence?: unknown;
};
export type HypothesisInput = {
  workspaceId: string;
  batchId: string;
  comparisonId: string;
  comparisonQuality: string;
  sampleSize: number;
  primaryMetricQuality: string;
  modelOutput: HypothesisModelOutput;
  evidence: EvidenceCatalogItem[];
};

const ROLE_KEYS: Record<EvidenceRole, keyof HypothesisModelOutput> = {
  SUPPORTING: 'supporting_evidence_ids',
  CONTRADICTING: 'contradicting_evidence_ids',
  CONTEXTUAL: 'contextual_evidence_ids',
};
const CAUSAL_WORDS = /\b(causal|caused|proves?|proven|guarantee|certainly)\b/i;

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.length === 0)) throw new Error(`${field} must be an array of evidence IDs`);
  return [...new Set(value)];
}

function cap(capRule: string, reason: string) {
  return { rule: capRule, reason };
}

export function buildEvidenceIds(output: HypothesisModelOutput): string[] {
  return [...new Set([
    ...stringArray(output.supporting_evidence_ids, 'supporting_evidence_ids'),
    ...stringArray(output.contradicting_evidence_ids, 'contradicting_evidence_ids'),
    ...stringArray(output.contextual_evidence_ids, 'contextual_evidence_ids'),
  ])];
}

export function validateHypothesis(input: HypothesisInput) {
  for (const item of input.evidence) {
    if (!item.id || !item.sourceId || !item.contentId || !item.link) throw new Error(`evidence source is incomplete: ${item.id || 'unknown'}`);
    const expectedLayer = item.sourceType === 'CONTENT_FEATURE' ? 'EXTRACTED' : item.sourceType === 'METRIC_SNAPSHOT' ? null : 'OBSERVED';
    if (expectedLayer && item.layer !== expectedLayer) throw new Error(`evidence layer does not match source type: ${item.id}`);
    if (item.sourceType === 'METRIC_SNAPSHOT' && item.layer !== 'OBSERVED' && item.layer !== 'DERIVED') throw new Error(`metric evidence has invalid layer: ${item.id}`);
  }
  const statement = typeof input.modelOutput.statement === 'string' ? input.modelOutput.statement.trim() : '';
  if (!statement) throw new Error('statement must be a non-empty string');
  if (statement.length > 2000) throw new Error('statement exceeds maximum length');
  if (CAUSAL_WORDS.test(statement)) throw new Error('statement contains unsupported causal certainty');
  if (!input.modelOutput.suggested_next_test || typeof input.modelOutput.suggested_next_test !== 'object' || Array.isArray(input.modelOutput.suggested_next_test)) throw new Error('suggested_next_test must be an object');

  const byId = new Map(input.evidence.map((item) => [item.id, item]));
  const links: Array<{ evidenceId: string; role: EvidenceRole }> = [];
  for (const role of Object.keys(ROLE_KEYS) as EvidenceRole[]) {
    for (const evidenceId of stringArray(input.modelOutput[ROLE_KEYS[role]], ROLE_KEYS[role])) {
      const item = byId.get(evidenceId);
      if (!item) throw new Error(`evidence ID is not in scoped catalog: ${evidenceId}`);
      if (item.workspaceId !== input.workspaceId || item.contentId.length === 0) throw new Error(`evidence is outside workspace scope: ${evidenceId}`);
      links.push({ evidenceId, role });
    }
  }
  if (links.length === 0) throw new Error('hypothesis must cite at least one evidence ID');
  if (new Set(links.map((link) => link.evidenceId)).size !== links.length) throw new Error('evidence ID cannot have multiple roles');

  const requested = input.modelOutput.confidence;
  const confidence: Confidence = requested === 'HIGH' || requested === 'MEDIUM' || requested === 'LOW' ? requested : 'LOW';
  const caps = [];
  if (input.sampleSize < 3) caps.push(cap('INSUFFICIENT_SAMPLE', `sample size ${input.sampleSize} is below high-confidence threshold 3`));
  caps.push(cap('ONE_COMPARISON', 'one comparison cannot establish durable hypothesis confidence'));
  if (input.comparisonQuality !== 'HIGH') caps.push(cap('COMPARISON_QUALITY', `comparison quality is ${input.comparisonQuality}`));
  if (input.primaryMetricQuality === 'SUSPECT') caps.push(cap('SUSPECT_PRIMARY_METRIC', 'suspect primary metric cannot support strong hypothesis'));
  if (input.primaryMetricQuality === 'MISSING' || input.primaryMetricQuality === 'UNAVAILABLE') caps.push(cap('UNAVAILABLE_PERFORMANCE', 'missing or unavailable performance evidence cannot support a confident explanation'));
  if (input.evidence.some((item) => item.layer === 'EXTRACTED' && item.statement.toLowerCase().includes('unreviewed'))) caps.push(cap('UNREVIEWED_EXTRACTED', 'unreviewed EXTRACTED evidence caps confidence at LOW'));
  const finalConfidence = caps.length > 0 ? 'LOW' : confidence;
  return {
    statement,
    links,
    suggestedNextTest: input.modelOutput.suggested_next_test as Record<string, unknown>,
    confidence: finalConfidence as Confidence,
    confidenceCaps: caps,
  };
}

export function hashGenerationInput(input: { comparisonId: string; evidence: EvidenceCatalogItem[]; comparisonContext: Record<string, unknown> }) {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

export function promptFor(input: { comparisonId: string; comparisonContext: Record<string, unknown>; evidence: EvidenceCatalogItem[] }) {
  return [
    'You are an evidence-bound content analyst. Return JSON only.',
    'Do not invent evidence IDs. Do not claim causation. Keep OBSERVED, DERIVED, EXTRACTED, and INFERRED distinct.',
    'Shape: {statement, supporting_evidence_ids, contradicting_evidence_ids, contextual_evidence_ids, suggested_next_test, confidence}.',
    JSON.stringify(input),
  ].join('\n');
}
