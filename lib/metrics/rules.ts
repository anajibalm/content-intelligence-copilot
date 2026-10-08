// @ts-nocheck
const DERIVED_RAW_KEYS = new Set(['er', 'engagement_rate', 'watch_percentage']);
const QUALITY_STATES = new Set(['VALID', 'MISSING', 'SUSPECT', 'UNAVAILABLE']);
const QUALITY_REASONS = new Set(['NOT_ACCESSIBLE', 'NOT_PROVIDED', 'SOURCE_ERROR', 'UNEXPLAINED_ZERO', 'INVALID_VALUE']);

/** Versioned deterministic metric rules. No ranking score or cross-distribution baseline exists here. */
export const METRICS_RULE_VERSION = 'metrics-v2';
export const RANKING_RULE_VERSION = 'ranking-v1';
export const KPI_RULE_VERSION = 'kpi-v1';

export function qualityDetailsFromRaw(rawMetrics, qualityJson) {
  return Object.fromEntries(Object.entries(rawMetrics ?? {}).map(([name, rawEntry]) => {
    const rawObject = rawEntry && typeof rawEntry === 'object' && !Array.isArray(rawEntry) ? rawEntry : {};
    const detail = qualityJson?.[name] && typeof qualityJson[name] === 'object' ? qualityJson[name] : {};
    return [name, {
      value: rawObject.value ?? null,
      quality: rawObject.quality ?? detail.state ?? (rawObject.value == null ? 'UNAVAILABLE' : rawObject.value === 0 ? undefined : 'VALID'),
      reason: rawObject.reason ?? detail.reason,
      qualityNote: detail.reason,
    }];
  }));
}

function assertDistribution(distribution) {
  if (distribution !== 'ORGANIC' && distribution !== 'PAID') throw new Error(`invalid distribution: ${distribution}`);
}

function qualityState(value, quality) {
  const state = String(quality ?? (value == null ? 'UNAVAILABLE' : 'VALID')).toUpperCase();
  if (!QUALITY_STATES.has(state)) throw new Error(`invalid metric quality: ${state}`);
  return state;
}

function normalizeReason(value, quality, qualityNote, explicitReason) {
  if (quality === 'VALID') return null;
  if (explicitReason && QUALITY_REASONS.has(String(explicitReason).toUpperCase())) return String(explicitReason).toUpperCase();
  const text = String(qualityNote ?? '').toLowerCase();
  if (text.includes('access')) return 'NOT_ACCESSIBLE';
  if (text.includes('provided') || text.includes('reported')) return 'NOT_PROVIDED';
  if (quality === 'SUSPECT') return 'SOURCE_ERROR';
  return QUALITY_REASONS.has(String(quality).toUpperCase()) ? String(quality).toUpperCase() : 'INVALID_VALUE';
}

function metricEntry(entry, name) {
  const objectEntry = entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : {};
  const value = Object.keys(objectEntry).length > 0 ? objectEntry.value : entry;
  let quality = qualityState(value, Object.keys(objectEntry).length > 0 ? objectEntry.quality ?? objectEntry.state : undefined);
  if (value != null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
    throw new Error('metric value must be a finite non-negative number or null');
  }
  if (QUALITY_STATES.has(String(objectEntry.quality ?? objectEntry.state).toUpperCase()) && (objectEntry.quality ?? objectEntry.state).toUpperCase() === 'VALID') quality = 'VALID';
  else if (value === 0 && quality === 'VALID' && objectEntry.quality === undefined && objectEntry.state === undefined) quality = 'SUSPECT';
  if (quality === 'VALID' && value == null) throw new Error('VALID metric requires a value');
  if (quality !== 'VALID' && value != null && quality === 'UNAVAILABLE') throw new Error('UNAVAILABLE metric cannot contain a value');
  const reason = quality === 'SUSPECT' && value === 0 && objectEntry.quality === undefined && objectEntry.state === undefined
    ? 'UNEXPLAINED_ZERO'
    : normalizeReason(value, quality, objectEntry.qualityNote, objectEntry.reason);
  if (name === 'wfv_pct' && value != null && value > 1) throw new Error('WFV percentage must be between 0 and 1');
  return { value: value ?? null, quality, reason };
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
    const normalized = metricEntry(entry, name);
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
    return { status: 'UNCONFIGURED', reason: config?.unconfiguredReason ?? 'brand ranking config is not approved', ranked: [], rankedGroups: [], excluded: [], ruleVersion: RANKING_RULE_VERSION };
  }
  if (config.configuredBy === 'synthetic_s5_fixture' && snapshots.some((snapshot) => snapshot.source !== 'synthetic_s5_demo')) {
    return { status: 'UNCONFIGURED', reason: 'synthetic ranking approval cannot be used with non-demo observations', ranked: [], rankedGroups: [], excluded: [], ruleVersion: RANKING_RULE_VERSION };
  }
  const rule = config.rankingRule ?? {};
  const distribution = rule.distribution;
  if (distribution !== 'ORGANIC' && distribution !== 'PAID') {
    return { status: 'UNCONFIGURED', reason: 'approved ranking config must name one distribution context', ranked: [], rankedGroups: [], excluded: [], ruleVersion: RANKING_RULE_VERSION };
  }
  const minimumSampleSize = Number.isInteger(rule.minimumSampleSize) ? rule.minimumSampleSize : 1;
  if (minimumSampleSize < 1) throw new Error('minimumSampleSize must be positive');
  const metric = config.primaryMetric;
  if (!metric) return { status: 'UNCONFIGURED', reason: 'approved ranking config must name a primary metric', ranked: [], rankedGroups: [], excluded: [], ruleVersion: RANKING_RULE_VERSION };
  const fallback = config.fallbackRule?.metric;
  const primaryDirection = String(rule.direction ?? 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  const fallbackDirection = String(config.fallbackRule?.direction ?? primaryDirection).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  const excluded = [];
  const primaryItems = [];
  const fallbackItems = [];
  for (const snapshot of snapshots) {
    if (snapshot.distribution !== distribution) {
      excluded.push({ contentId: snapshot.contentId, reason: `distribution ${snapshot.distribution} does not match ${distribution}` });
      continue;
    }
    const primaryValue = metricValue(snapshot, metric);
    if (primaryValue != null && snapshot.qualityByMetric[metric]?.state !== 'SUSPECT') {
      primaryItems.push({ snapshot, value: primaryValue, metric, fallbackUsed: false });
      continue;
    }
    const fallbackValue = fallback ? metricValue(snapshot, fallback) : null;
    if (fallbackValue != null && snapshot.qualityByMetric[fallback]?.state !== 'SUSPECT') {
      fallbackItems.push({ snapshot, value: fallbackValue, metric: fallback, fallbackUsed: true });
      continue;
    }
    excluded.push({ contentId: snapshot.contentId, reason: `primary metric ${metric} unavailable and no eligible fallback` });
  }
  const sortItems = (items, direction) => [...items].sort((left, right) => (left.value - right.value) * directionValue(direction) || left.snapshot.contentId.localeCompare(right.snapshot.contentId));
  const groups = [];
  if (primaryItems.length >= minimumSampleSize) groups.push({ basis: metric, direction: primaryDirection, minimumSampleSize, items: sortItems(primaryItems, primaryDirection) });
  else if (primaryItems.length > 0) excluded.push(...primaryItems.map((item) => ({ contentId: item.snapshot.contentId, reason: `primary cohort ${primaryItems.length} is below configured minimum ${minimumSampleSize}` })));
  if (fallbackItems.length >= minimumSampleSize) groups.push({ basis: fallback, direction: fallbackDirection, minimumSampleSize, items: sortItems(fallbackItems, fallbackDirection) });
  else if (fallbackItems.length > 0) excluded.push(...fallbackItems.map((item) => ({ contentId: item.snapshot.contentId, reason: `fallback cohort ${fallbackItems.length} is below configured minimum ${minimumSampleSize}` })));
  if (groups.length === 0) return { status: 'INSUFFICIENT_DATA', reason: `no ranking cohort meets configured minimum ${minimumSampleSize}`, ranked: [], rankedGroups: [], excluded, ruleVersion: RANKING_RULE_VERSION, distribution };
  const rankedGroups = groups.map((group) => ({ basis: group.basis, direction: group.direction, minimumSampleSize: group.minimumSampleSize, items: group.items.map((item) => ({ contentId: item.snapshot.contentId, snapshotId: item.snapshot.id, value: item.value, basis: { metric: item.metric, label: labelFor(item.metric, group.direction), fallbackUsed: item.fallbackUsed, configId: config.id, configVersion: config.version, ruleVersion: RANKING_RULE_VERSION } })) }));
  const mixedBases = rankedGroups.length > 1;
  return { status: 'READY', ranked: mixedBases ? [] : rankedGroups[0].items, rankedGroups, reason: mixedBases ? 'fallback basis is not approved for cross-basis ordering' : null, excluded, ruleVersion: RANKING_RULE_VERSION, distribution };
}

function compare(actual, target, comparator) {
  if (comparator === 'GT') return actual > target;
  if (comparator === 'GTE') return actual >= target;
  if (comparator === 'LTE') return actual <= target;
  if (comparator === 'LT') return actual < target;
  if (comparator === 'EQ') return actual === target;
  return null;
}

export function assessKpi(definition, snapshots, options = {}) {
  const supportedAggregations = new Set(['SUM', 'AVERAGE']);
  const supportedComparators = new Set(['GT', 'GTE', 'LTE', 'LT', 'EQ']);
  if (definition.targetValue == null || !Number.isFinite(Number(definition.targetValue)) || !definition.metricName || !definition.distribution || !supportedAggregations.has(definition.aggregationMethod) || !supportedComparators.has(definition.comparator)) {
    return { status: 'UNCONFIGURED', reason: 'KPI metric, target, distribution, aggregation, and comparator must use supported values', actualValue: null, sourceSnapshotIds: [], excludedSnapshotIds: [], qualityState: 'UNAVAILABLE', ruleVersion: KPI_RULE_VERSION, formulaVersion: definition.formulaVersion ?? null };
  }
  const candidates = snapshots.filter((snapshot) => snapshot.distribution === definition.distribution);
  const contributing = [];
  const excluded = [];
  for (const snapshot of candidates) {
    const value = metricValue(snapshot, definition.metricName);
    const quality = definition.metricName === 'engagement_rate' ? (value == null ? 'MISSING' : 'VALID') : snapshot.qualityByMetric[definition.metricName]?.state;
    if (value != null && quality === 'VALID') contributing.push({ snapshot, value });
    else excluded.push({ snapshot, reason: `${definition.metricName} is ${quality ?? 'MISSING'}` });
  }
  const minimumSampleSize = Number.isInteger(options.minimumSampleSize) ? options.minimumSampleSize : 1;
  if (contributing.length < minimumSampleSize) {
    return { status: 'INSUFFICIENT_DATA', reason: `contributing sample ${contributing.length} is below configured minimum ${minimumSampleSize}`, actualValue: null, sourceSnapshotIds: contributing.map((item) => item.snapshot.id), excludedSnapshotIds: excluded.map((item) => item.snapshot.id), excluded, qualityState: contributing.length ? 'SUSPECT' : 'MISSING', ruleVersion: KPI_RULE_VERSION, formulaVersion: definition.formulaVersion ?? null };
  }
  const values = contributing.map((item) => item.value);
  const actualValue = definition.aggregationMethod === 'SUM' ? values.reduce((sum, value) => sum + value, 0) : values.reduce((sum, value) => sum + value, 0) / values.length;
  const achieved = compare(actualValue, Number(definition.targetValue), definition.comparator);
  return { status: achieved ? 'ACHIEVED' : 'NOT_ACHIEVED', actualValue, sourceSnapshotIds: contributing.map((item) => item.snapshot.id), excludedSnapshotIds: excluded.map((item) => item.snapshot.id), excluded, qualityState: excluded.length ? 'SUSPECT' : 'VALID', ruleVersion: KPI_RULE_VERSION, formulaVersion: definition.formulaVersion ?? null };
}
