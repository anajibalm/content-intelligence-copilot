// @ts-nocheck
const DERIVED_RAW_KEYS = new Set(['er', 'engagement_rate', 'watch_percentage', 'wfv_pct']);
const QUALITY_STATES = new Set(['VALID', 'MISSING', 'SUSPECT', 'UNAVAILABLE']);
const QUALITY_REASONS = new Set(['NOT_ACCESSIBLE', 'NOT_PROVIDED', 'SOURCE_ERROR', 'UNEXPLAINED_ZERO', 'INVALID_VALUE']);

/** Versioned deterministic metric rules. No ranking score or cross-distribution baseline exists here. */
export const METRICS_RULE_VERSION = 'metrics-v1';
export const RANKING_RULE_VERSION = 'ranking-v1';
export const KPI_RULE_VERSION = 'kpi-v1';

function assertDistribution(distribution) {
  if (distribution !== 'ORGANIC' && distribution !== 'PAID') throw new Error(`invalid distribution: ${distribution}`);
}

function qualityState(value, quality) {
  const state = String(quality ?? (value == null ? 'UNAVAILABLE' : 'VALID')).toUpperCase();
  if (!QUALITY_STATES.has(state)) throw new Error(`invalid metric quality: ${state}`);
  return state;
}

function normalizeReason(value, quality, qualityNote) {
  if (quality === 'VALID') return null;
  const text = String(qualityNote ?? '').toLowerCase();
  if (text.includes('access')) return 'NOT_ACCESSIBLE';
  if (text.includes('provided') || text.includes('reported')) return 'NOT_PROVIDED';
  if (quality === 'SUSPECT') return 'SOURCE_ERROR';
  return QUALITY_REASONS.has(String(quality).toUpperCase()) ? String(quality).toUpperCase() : 'INVALID_VALUE';
}

function metricEntry(entry) {
  const value = entry && typeof entry === 'object' && !Array.isArray(entry) ? entry.value : entry;
  const quality = qualityState(value, entry && typeof entry === 'object' ? entry.quality ?? entry.state : undefined);
  if (value != null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
    throw new Error('metric value must be a finite non-negative number or null');
  }
  if (quality === 'VALID' && value == null) throw new Error('VALID metric requires a value');
  if (quality !== 'VALID' && value != null && quality === 'UNAVAILABLE') throw new Error('UNAVAILABLE metric cannot contain a value');
  return { value: value ?? null, quality, reason: normalizeReason(value, quality, entry && typeof entry === 'object' ? entry.qualityNote : undefined) };
}

function usable(snapshot, name) {
  const quality = snapshot.qualityByMetric[name];
  return quality?.state === 'VALID' && typeof snapshot.rawMetrics[name] === 'number' ? snapshot.rawMetrics[name] : null;
}

export function deriveMetrics(rawMetrics, qualityByMetric) {
  const inputs = ['likes', 'comments', 'shares', 'saves', 'views'];
  const values = inputs.map((name) => qualityByMetric[name]?.state === 'VALID' && typeof rawMetrics[name] === 'number' ? rawMetrics[name] : null);
  const value = values.every((item) => item != null) && values[4] > 0
    ? (values[0] + values[1] + values[2] + values[3]) / values[4]
    : null;
  return {
    engagement_rate: {
      value,
      formulaVersion: METRICS_RULE_VERSION,
      sourceMetricNames: inputs,
    },
  };
}

export function normalizeMetricSnapshot(input) {
  assertDistribution(input.distribution);
  const rawMetrics = {};
  const qualityByMetric = {};
  for (const [name, entry] of Object.entries(input.rawMetrics ?? {})) {
    if (DERIVED_RAW_KEYS.has(name)) throw new Error(`raw metrics cannot contain derived metric: ${name}`);
    const normalized = metricEntry(entry);
    rawMetrics[name] = normalized.value;
    qualityByMetric[name] = { state: normalized.quality, reason: normalized.reason };
  }
  const derivedMetrics = deriveMetrics(rawMetrics, qualityByMetric);
  const states = Object.values(qualityByMetric).map((item) => item.state);
  const quality = states.includes('SUSPECT') ? 'SUSPECT'
    : states.some((item) => item === 'VALID') ? 'VALID'
      : states.includes('UNAVAILABLE') ? 'UNAVAILABLE' : 'MISSING';
  return {
    id: input.id,
    contentId: input.contentId,
    distribution: input.distribution,
    source: input.source ?? null,
    capturedAt: input.capturedAt ?? null,
    contentAgeHours: input.contentAgeHours ?? null,
    rawMetrics,
    qualityByMetric,
    quality,
    derivedMetrics,
  };
}

function metricValue(snapshot, metric) {
  if (metric === 'engagement_rate') return snapshot.derivedMetrics.engagement_rate?.value ?? null;
  return usable(snapshot, metric);
}

function isApproved(config) {
  return config?.approvalState === 'APPROVED' && typeof config.id === 'string' && Number.isInteger(config.version);
}

function directionValue(direction) {
  return String(direction ?? 'DESC').toUpperCase() === 'ASC' ? 1 : -1;
}

function labelFor(metric, direction) {
  const title = metric.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  return `${direction === 'ASC' ? 'Lowest' : 'Best'} by ${title}`;
}

export function rankBatch(snapshots, config) {
  if (!isApproved(config)) {
    return { status: 'UNCONFIGURED', reason: config?.unconfiguredReason ?? 'brand ranking config is not approved', ranked: [], excluded: [], ruleVersion: RANKING_RULE_VERSION };
  }
  const rule = config.rankingRule ?? {};
  const distribution = rule.distribution;
  if (distribution !== 'ORGANIC' && distribution !== 'PAID') {
    return { status: 'UNCONFIGURED', reason: 'approved ranking config must name one distribution context', ranked: [], excluded: [], ruleVersion: RANKING_RULE_VERSION };
  }
  const minimumSampleSize = Number.isInteger(rule.minimumSampleSize) ? rule.minimumSampleSize : 1;
  if (minimumSampleSize < 1) throw new Error('minimumSampleSize must be positive');
  const metric = config.primaryMetric;
  const fallback = config.fallbackRule?.metric;
  const direction = String(rule.direction ?? 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  const ranked = [];
  const excluded = [];
  const eligible = snapshots.filter((snapshot) => {
    if (snapshot.distribution !== distribution) {
      excluded.push({ contentId: snapshot.contentId, reason: `distribution ${snapshot.distribution} does not match ${distribution}` });
      return false;
    }
    const primaryValue = metricValue(snapshot, metric);
    if (primaryValue != null && snapshot.qualityByMetric[metric]?.state !== 'SUSPECT') {
      ranked.push({ snapshot, value: primaryValue, metric, fallbackUsed: false });
      return true;
    }
    const fallbackValue = fallback ? metricValue(snapshot, fallback) : null;
    if (fallbackValue != null && snapshot.qualityByMetric[fallback]?.state !== 'SUSPECT') {
      ranked.push({ snapshot, value: fallbackValue, metric: fallback, fallbackUsed: true });
      return true;
    }
    excluded.push({ contentId: snapshot.contentId, reason: `primary metric ${metric} unavailable and no eligible fallback` });
    return false;
  });
  if (eligible.length < minimumSampleSize) {
    return { status: 'INSUFFICIENT_DATA', reason: `eligible sample ${eligible.length} is below configured minimum ${minimumSampleSize}`, ranked: [], excluded, ruleVersion: RANKING_RULE_VERSION };
  }
  ranked.sort((left, right) => Number(left.fallbackUsed) - Number(right.fallbackUsed) || (left.value - right.value) * directionValue(direction) || left.snapshot.contentId.localeCompare(right.snapshot.contentId));
  return {
    status: 'READY',
    ranked: ranked.map((item) => ({ contentId: item.snapshot.contentId, snapshotId: item.snapshot.id, value: item.value, basis: { metric: item.metric, label: labelFor(item.metric, direction), fallbackUsed: item.fallbackUsed, configId: config.id, configVersion: config.version, ruleVersion: RANKING_RULE_VERSION } })),
    excluded,
    ruleVersion: RANKING_RULE_VERSION,
    distribution,
  };
}

function compare(actual, target, comparator) {
  if (comparator === 'GT') return actual > target;
  if (comparator === 'LTE') return actual <= target;
  if (comparator === 'LT') return actual < target;
  return actual >= target;
}

export function assessKpi(definition, snapshots, options = {}) {
  if (definition.targetValue == null || !definition.comparator || !definition.aggregationMethod) {
    return { status: 'UNCONFIGURED', actualValue: null, sourceSnapshotIds: [], qualityState: 'UNAVAILABLE', ruleVersion: KPI_RULE_VERSION, formulaVersion: definition.formulaVersion ?? null };
  }
  const candidates = snapshots.filter((snapshot) => !definition.distribution || snapshot.distribution === definition.distribution);
  const values = candidates.map((snapshot) => metricValue(snapshot, definition.metricName)).filter((value) => value != null);
  const minimumSampleSize = Number.isInteger(options.minimumSampleSize) ? options.minimumSampleSize : 1;
  if (values.length < minimumSampleSize) {
    return { status: 'INSUFFICIENT_DATA', actualValue: null, sourceSnapshotIds: candidates.map((snapshot) => snapshot.id), qualityState: 'MISSING', ruleVersion: KPI_RULE_VERSION, formulaVersion: definition.formulaVersion ?? null };
  }
  const actualValue = definition.aggregationMethod === 'SUM' ? values.reduce((sum, value) => sum + value, 0) : values.reduce((sum, value) => sum + value, 0) / values.length;
  return { status: compare(actualValue, definition.targetValue, definition.comparator) ? 'ACHIEVED' : 'NOT_ACHIEVED', actualValue, sourceSnapshotIds: candidates.map((snapshot) => snapshot.id), qualityState: 'VALID', ruleVersion: KPI_RULE_VERSION, formulaVersion: definition.formulaVersion ?? null };
}
