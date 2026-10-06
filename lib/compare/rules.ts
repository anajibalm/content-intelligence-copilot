const MODES = new Set(['CONTROLLED', 'PERFORMANCE_CONTRAST', 'MANUAL']);
const SCOPES = new Set(['PAIR', 'GROUP', 'BATCH']);
const DISTRIBUTIONS = new Set(['ORGANIC', 'PAID']);

export const COMPARE_RULE_VERSION = 'compare-v1';

function assertChoice(value, choices, name) {
  if (!choices.has(value)) throw new Error(`invalid ${name}: ${value}`);
}

function featureValue(features, name) {
  const feature = features?.[name];
  return feature?.reviewState === 'REJECTED' ? null : feature?.reviewedValue ?? feature?.aiValue ?? null;
}

function featureReviewState(features) {
  return Object.values(features ?? {}).some((feature) => feature?.reviewState === 'UNREVIEWED') ? 'UNREVIEWED' : 'REVIEWED';
}

function unique(values) {
  return [...new Set(values)];
}

function same(values) {
  return values.length > 0 && unique(values).length === 1;
}

function durationDelta(contents) {
  const values = contents.map((content) => content.durationSeconds).filter((value) => Number.isFinite(value));
  return values.length === contents.length ? Math.max(...values) - Math.min(...values) : null;
}

function ageDelta(snapshots) {
  const values = snapshots.map((snapshot) => snapshot.contentAgeHours).filter((value) => Number.isFinite(value));
  return values.length === snapshots.length ? Math.max(...values) - Math.min(...values) : null;
}

function selectedSnapshot(content, distribution) {
  return content.snapshots?.find((snapshot) => snapshot.distribution === distribution) ?? null;
}

export function compareContents(input) {
  assertChoice(input.mode, MODES, 'mode');
  assertChoice(input.scope, SCOPES, 'scope');
  assertChoice(input.distribution, DISTRIBUTIONS, 'distribution');
  if (!Array.isArray(input.contentIds) || input.contentIds.length < 2) throw new Error('comparison requires at least one pair of content IDs');
  if (unique(input.contentIds).length !== input.contentIds.length) throw new Error('comparison selection contains duplicate content IDs');
  if (input.scope === 'PAIR' && input.contentIds.length !== 2) throw new Error('PAIR comparison requires exactly two content IDs');
  if (!Array.isArray(input.contents)) throw new Error('comparison contents are required');

  const byId = new Map(input.contents.map((content) => [content.id, content]));
  const contents = input.contentIds.map((id) => byId.get(id)).map((content, index) => {
    if (!content) throw new Error(`content not found in comparison selection: ${input.contentIds[index]}`);
    return content;
  });
  const snapshots = contents.map((content) => selectedSnapshot(content, input.distribution));
  const items = contents.map((content, index) => ({
    contentId: content.id,
    position: index + 1,
    metricSnapshotId: snapshots[index]?.id ?? null,
  }));
  const formats = contents.map((content) => featureValue(content.features, 'format'));
  const talent = contents.map((content) => featureValue(content.features, 'talent_type'));
  const pillars = contents.map((content) => content.pillarId ?? null);
  const controlledVariables = {
    same_pillar: same(pillars),
    same_format: same(formats),
    same_talent_class: same(talent),
    distribution_match: snapshots.every((snapshot) => snapshot?.distribution === input.distribution),
    sample_eligibility: contents.length >= 2 && snapshots.every(Boolean),
    metric_quality: snapshots.every((snapshot) => snapshot?.quality === 'VALID') ? 'VALID' : snapshots.some((snapshot) => snapshot?.quality === 'SUSPECT') ? 'SUSPECT' : 'UNAVAILABLE',
    duration_delta_seconds: durationDelta(contents),
    content_age_delta_hours: ageDelta(snapshots.filter(Boolean)),
  };
  const uncontrolledVariables = {
    pillar: controlledVariables.same_pillar ? null : 'mixed',
    format: controlledVariables.same_format ? null : 'mixed',
    talent_class: controlledVariables.same_talent_class ? null : 'mixed',
    duration_delta_seconds: controlledVariables.duration_delta_seconds,
    content_age_delta_hours: controlledVariables.content_age_delta_hours,
    causal: input.mode === 'CONTROLLED' && controlledVariables.same_pillar && controlledVariables.same_format && controlledVariables.distribution_match,
    exploratory: input.mode === 'PERFORMANCE_CONTRAST',
  };
  const qualityReasons = [];
  if (!snapshots.every(Boolean)) qualityReasons.push('one or more selected contents has no snapshot for requested distribution');
  if (snapshots.some((snapshot) => snapshot?.quality === 'SUSPECT')) qualityReasons.push('suspect metric quality caps comparison quality');
  if (Object.values(contents.map((content) => featureReviewState(content.features))).includes('UNREVIEWED')) qualityReasons.push('unreviewed extracted feature caps comparison quality');
  if (input.mode === 'PERFORMANCE_CONTRAST') qualityReasons.push('performance contrast is exploratory and non-causal');
  if (input.mode === 'CONTROLLED' && !controlledVariables.same_pillar) qualityReasons.push('selected contents do not share pillar');
  const quality = !snapshots.every(Boolean) ? 'UNAVAILABLE' : qualityReasons.length > 0 || contents.length < 3 ? 'LOW' : 'HIGH';

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
    snapshotIds: items.map((item) => item.metricSnapshotId).filter(Boolean),
  };
}
