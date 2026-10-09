import { deriveMetrics } from '../metrics/rules.ts';
const MODES: Record<string, true> = { CONTROLLED: true, PERFORMANCE_CONTRAST: true, MANUAL: true };
const SCOPES: Record<string, true> = { PAIR: true, GROUP: true, BATCH: true };
const DISTRIBUTIONS: Record<string, true> = { ORGANIC: true, PAID: true };
const METRIC_NAMES = ['views', 'awt_seconds', 'wfv_pct', 'engagement_rate'];

export const COMPARE_RULE_VERSION = 'compare-v2';
export const DURATION_TOLERANCE_SECONDS = 30;
export const CONTENT_AGE_TOLERANCE_HOURS = 168;
export const HIGH_CONFIDENCE_SAMPLE_SIZE = 3;

function assertChoice(value: string, choices: Record<string, true>, name: string) {
  if (!choices[value]) throw new Error(`invalid ${name}: ${value}`);
}

function featureState(features: Record<string, Feature> | undefined, name: string): { value: string | null; known: boolean; state: string } {
  const feature = features?.[name];
  const state = feature?.reviewState ?? 'MISSING';
  const reviewed = state === 'CONFIRMED' || state === 'CORRECTED';
  const value = reviewed ? feature?.reviewedValue ?? null : null;
  return { value, known: Boolean(value), state };
}

function sameKnown(values: Array<{ value: string | null; known: boolean }>): boolean | null {
  if (values.some((item) => !item.known || !item.value)) return null;
  return new Set(values.map((item) => item.value)).size === 1;
}

function metricValue(snapshot: Snapshot, name: string): number | null {
  const derived = deriveMetrics(snapshot.rawMetrics ?? {}, snapshot.qualityByMetric ?? {});
  const entry = name === 'engagement_rate' ? derived[name] : snapshot.rawMetrics?.[name];
  if (typeof entry === 'number') return Number.isFinite(entry) ? entry : null;
  if (entry && typeof entry === 'object' && 'value' in entry) {
    return typeof entry.value === 'number' && Number.isFinite(entry.value) ? entry.value : null;
  }
  return null;
}

function metricQuality(snapshot: Snapshot, name: string): { state: string; reason: string | null } {
  const detail = snapshot.qualityByMetric?.[name];
  const rawEntry = snapshot.rawMetrics?.[name];
  const rawDetail = rawEntry && typeof rawEntry === 'object' ? rawEntry as { quality?: string; reason?: string | null } : null;
  if (detail?.state) return { state: detail.state, reason: detail.reason ?? null };
  if (rawDetail?.quality) return { state: rawDetail.quality, reason: rawDetail.reason ?? null };
  if (snapshot.quality && snapshot.quality !== 'VALID') return { state: snapshot.quality, reason: 'SNAPSHOT_QUALITY' };
  const value = metricValue(snapshot, name);
  return { state: value == null ? 'UNAVAILABLE' : 'VALID', reason: value == null ? 'NOT_PROVIDED' : null };
}

function relevantMetricNames(snapshots: Snapshot[]) {
  return METRIC_NAMES.filter((name) => snapshots.some((snapshot) => snapshot.qualityByMetric?.[name] || metricValue(snapshot, name) != null));
}

function summarizeMetricQuality(snapshots: Snapshot[]) {
  const names = relevantMetricNames(snapshots);
  if (names.length === 0) return 'UNAVAILABLE';
  const qualities = names.flatMap((name) => snapshots.map((snapshot) => metricQuality(snapshot, name).state));
  if (qualities.includes('SUSPECT')) return 'SUSPECT';
  return qualities.every((quality) => quality === 'VALID') ? 'VALID' : 'UNAVAILABLE';
}

function delta(values: Array<number | null>) {
  if (values.some((value) => value == null)) return null;
  return Math.max(...values as number[]) - Math.min(...values as number[]);
}

function selectedSnapshot(content: Content, distribution: string) {
  return content.snapshots?.find((snapshot) => snapshot.distribution === distribution) ?? null;
}

function variableReason(name: string, value: boolean | null, label: string, reasons: string[]) {
  if (value === null) reasons.push(`${name} is unavailable; ${label} cannot be treated as matched`);
  else if (value === false) reasons.push(`${name} differs across selected contents`);
}

export function compareContents(input: CompareInput): ComparisonResult {
  assertChoice(input.mode, MODES, 'mode');
  assertChoice(input.scope, SCOPES, 'scope');
  assertChoice(input.distribution, DISTRIBUTIONS, 'distribution');
  if (!Array.isArray(input.contentIds) || input.contentIds.length < 2) throw new Error('comparison requires at least one pair of content IDs');
  if (new Set(input.contentIds).size !== input.contentIds.length) throw new Error('comparison selection contains duplicate content IDs');
  if (input.scope === 'PAIR' && input.contentIds.length !== 2) throw new Error('PAIR comparison requires exactly two content IDs');
  if (!Array.isArray(input.contents)) throw new Error('comparison contents are required');

  const byId = new Map(input.contents.map((content) => [content.id, content]));
  const contents = input.contentIds.map((id) => {
    const content = byId.get(id);
    if (!content) throw new Error(`content not found in comparison selection: ${id}`);
    return content;
  });
  const snapshots = contents.map((content) => selectedSnapshot(content, input.distribution));
  const items = contents.map((content, index) => ({ contentId: content.id, position: index + 1, metricSnapshotId: snapshots[index]?.id ?? null }));
  const pillar = sameKnown(contents.map((content) => ({ value: content.pillarId ?? null, known: Boolean(content.pillarId) })));
  const format = sameKnown(contents.map((content) => featureState(content.features, 'format')));
  const talent = sameKnown(contents.map((content) => featureState(content.features, 'talent_type')));
  const durationDelta = delta(contents.map((content) => content.durationSeconds ?? null));
  const ageDelta = delta(snapshots.map((snapshot) => snapshot?.contentAgeHours ?? null));
  const durationMatch = durationDelta == null ? null : durationDelta <= DURATION_TOLERANCE_SECONDS;
  const contentAgeMatch = ageDelta == null ? null : ageDelta <= CONTENT_AGE_TOLERANCE_HOURS;
  const distributionMatch = snapshots.every((snapshot) => snapshot?.distribution === input.distribution) ? true : false;
  const sampleEligible = contents.length >= 2 && snapshots.every(Boolean);
  const metricQualityState = snapshots.every(Boolean) ? summarizeMetricQuality(snapshots as Snapshot[]) : 'UNAVAILABLE';
  const reviewState = contents.every((content) => ['CONFIRMED', 'CORRECTED'].includes(featureState(content.features, 'format').state) && ['CONFIRMED', 'CORRECTED'].includes(featureState(content.features, 'talent_type').state)) ? 'REVIEWED' : 'UNREVIEWED';
  const controlledVariables = {
    same_pillar: pillar,
    same_format: format,
    same_talent_class: talent,
    duration_match: durationMatch,
    content_age_match: contentAgeMatch,
    duration_tolerance_seconds: DURATION_TOLERANCE_SECONDS,
    content_age_tolerance_hours: CONTENT_AGE_TOLERANCE_HOURS,
    distribution_match: distributionMatch,
    sample_eligibility: sampleEligible,
    metric_quality: metricQualityState,
    feature_review_state: reviewState,
  };
  const uncontrolledVariables = {
    pillar: pillar === null ? 'unknown' : pillar ? null : 'mixed',
    format: format === null ? 'unknown' : format ? null : 'mixed',
    talent_class: talent === null ? 'unknown' : talent ? null : 'mixed',
    duration_delta_seconds: durationDelta,
    content_age_delta_hours: ageDelta,
    exploratory: input.mode === 'PERFORMANCE_CONTRAST',
  };
  const qualityReasons: string[] = [];
  if (input.mode === 'PERFORMANCE_CONTRAST') qualityReasons.push('performance contrast is exploratory and non-causal');
  if (contents.length < HIGH_CONFIDENCE_SAMPLE_SIZE) qualityReasons.push(`sample size ${contents.length} is below high-confidence threshold ${HIGH_CONFIDENCE_SAMPLE_SIZE}`);
  if (!sampleEligible) qualityReasons.push('sample eligibility is unavailable because one or more selected contents lacks a snapshot');
  variableReason('same_pillar', pillar, 'pillar', qualityReasons);
  variableReason('same_format', format, 'format', qualityReasons);
  variableReason('same_talent_class', talent, 'talent class', qualityReasons);
  if (durationMatch === null) qualityReasons.push('duration is unavailable; duration compatibility cannot be established');
  else if (!durationMatch) qualityReasons.push(`duration delta ${durationDelta} seconds exceeds tolerance ${DURATION_TOLERANCE_SECONDS} seconds`);
  if (contentAgeMatch === null) qualityReasons.push('content age is unavailable; content-age compatibility cannot be established');
  else if (!contentAgeMatch) qualityReasons.push(`content age delta ${ageDelta} hours exceeds tolerance ${CONTENT_AGE_TOLERANCE_HOURS} hours`);
  if (!distributionMatch) qualityReasons.push(`requested ${input.distribution} snapshot is unavailable for one or more selected contents`);
  if (reviewState !== 'REVIEWED') qualityReasons.push('missing, rejected, or unreviewed extracted features cannot establish reviewed controls');
  if (metricQualityState !== 'VALID') qualityReasons.push(`metric quality is ${metricQualityState}; unavailable or suspect metrics cannot support strong evidence`);
  const quality = !sampleEligible ? 'UNAVAILABLE' : qualityReasons.length > 0 || input.mode !== 'CONTROLLED' ? 'LOW' : 'HIGH';
  const metricRows = items.map((item, index) => ({
    contentId: item.contentId,
    metricSnapshotId: item.metricSnapshotId,
    metrics: METRIC_NAMES.map((name) => {
      const snapshot = snapshots[index];
      return { name, value: snapshot ? metricValue(snapshot, name) : null, ...(snapshot ? metricQuality(snapshot, name) : { state: 'UNAVAILABLE', reason: 'NOT_PROVIDED' }) };
    }),
  }));
  return {
    ruleVersion: COMPARE_RULE_VERSION,
    mode: input.mode,
    scope: input.scope,
    distribution: input.distribution,
    quality,
    qualityReasons,
    label: null,
    labelBasis: null,
    controlledVariables,
    uncontrolledVariables,
    items,
    snapshotIds: items.map((item) => item.metricSnapshotId).filter(Boolean) as string[],
    metricRows,
  };
}

type Feature = { aiValue?: string | null; reviewedValue?: string | null; reviewState?: string };
type Snapshot = { id: string; distribution: 'ORGANIC' | 'PAID'; quality?: string; qualityByMetric?: Record<string, { state?: string; reason?: string | null }>; rawMetrics?: Record<string, unknown>; derivedMetrics?: Record<string, unknown>; contentAgeHours?: number | null };
type Content = { id: string; pillarId?: string | null; durationSeconds?: number | null; contentAgeHours?: number | null; features?: Record<string, Feature>; snapshots: Snapshot[] };
type CompareInput = { mode: 'CONTROLLED' | 'PERFORMANCE_CONTRAST' | 'MANUAL'; scope: 'PAIR' | 'GROUP' | 'BATCH'; distribution: 'ORGANIC' | 'PAID'; contentIds: string[]; contents: Content[] };
export interface ComparisonMetricRow {
  contentId: string;
  metricSnapshotId: string | null;
  metrics: Array<{ name: string; value: number | null; state: string; reason: string | null }>;
}

export interface ComparisonResult {
  ruleVersion: string;
  mode: CompareInput['mode'];
  scope: CompareInput['scope'];
  distribution: CompareInput['distribution'];
  quality: 'LOW' | 'HIGH' | 'UNAVAILABLE';
  qualityReasons: string[];
  label: null;
  labelBasis: null;
  controlledVariables: Record<string, string | number | boolean | null>;
  uncontrolledVariables: Record<string, string | number | boolean | null>;
  items: Array<{ contentId: string; position: number; metricSnapshotId: string | null }>;
  snapshotIds: string[];
  metricRows: ComparisonMetricRow[];
}
