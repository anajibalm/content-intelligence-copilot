#!/usr/bin/env node
// Fixture validator — validates canonical fixtures against frozen MVP Contract invariants.
// Zero dependencies; Node built-ins only. Run: node scripts/validate-fixtures.mjs

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

export const FIXTURE_FILES = [
  'tiktok-post.json',
  'metric-snapshot.json',
  'transcript.json',
  'extraction.json',
];

export const EVIDENCE_TYPES = new Set(['OBSERVED', 'DERIVED', 'EXTRACTED', 'INFERRED']);
export const FORBIDDEN_EVIDENCE_TYPES = new Set(['CONFIRMED', 'UNKNOWN']); // donor taxonomy
export const DISTRIBUTION_VALUES = new Set(['organic', 'paid']);
export const METRIC_QUALITY_VALUES = new Set(['VALID', 'MISSING', 'SUSPECT', 'UNAVAILABLE']);
export const AI_REVIEW_STATES = new Set(['unreviewed', 'confirmed', 'corrected', 'rejected']);

// Keys that would indicate a provider raw payload leaked into a domain fixture.
const PROVIDER_PAYLOAD_KEYS = new Set([
  'raw_payload',
  'rawPayload',
  'provider_payload',
  'providerPayload',
  'raw_provider_response',
  'rawProviderResponse',
  'aweme_id',
  'authorStats',
  'author_stats',
  'playAddr',
  'play_addr',
  'downloadAddr',
  'download_addr',
  'videoApiInfo',
  'itemInfo',
]);
// Keys that would indicate derived metrics stored inside raw metrics.
const DERIVED_METRIC_KEYS = new Set([
  'er',
  'engagement_rate',
  'engagementRate',
  'ctr',
  'watch_rate',
  'relative_difference',
  'duration_bucket',
]);
// AI features that must never be extracted (contract: S4 must-NOT list).
const FORBIDDEN_AI_FEATURE_KEYS = new Set([
  'pillar',
  'duration',
  'duration_bucket',
  'metrics',
  'performance_rating',
]);
// Content fields that would place distribution on content.
const CONTENT_DISTRIBUTION_KEYS = new Set([
  'distribution',
  'distribution_context',
  'performance_context',
  'organic',
  'paid',
]);

export function loadFixture(name) {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, name), 'utf8'));
}

export function loadAllFixtures() {
  const out = {};
  for (const f of FIXTURE_FILES) out[f] = loadFixture(f);
  return out;
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function walkKeys(value, visit, path = '') {
  if (Array.isArray(value)) {
    value.forEach((v, i) => walkKeys(v, visit, `${path}[${i}]`));
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [k, v] of Object.entries(value)) {
    visit(k, v, path ? `${path}.${k}` : k);
    walkKeys(v, visit, path ? `${path}.${k}` : k);
  }
}

// --- Check 1: distribution only in metric snapshot -------------------------

export function checkDistributionIsolation(tiktokPost, metricSnapshot) {
  const errors = [];
  const content = tiktokPost.content;
  if (!isPlainObject(content)) {
    errors.push('tiktok-post: missing content object');
    return errors;
  }
  for (const key of Object.keys(content)) {
    if (CONTENT_DISTRIBUTION_KEYS.has(key)) {
      errors.push(`content must not carry distribution field "${key}" (distribution lives in metric_snapshot)`);
    }
  }
  const snap = metricSnapshot.metric_snapshot;
  if (!isPlainObject(snap)) {
    errors.push('metric-snapshot: missing metric_snapshot object');
    return errors;
  }
  if (!DISTRIBUTION_VALUES.has(snap.distribution)) {
    errors.push(`metric_snapshot.distribution must be one of ${[...DISTRIBUTION_VALUES].join('|')}, got ${JSON.stringify(snap.distribution)}`);
  }
  if (!isPlainObject(snap.raw_metrics)) {
    errors.push('metric_snapshot.raw_metrics missing');
  } else {
    for (const key of Object.keys(snap.raw_metrics)) {
      if (DERIVED_METRIC_KEYS.has(key)) {
        errors.push(`raw_metrics must not contain derived metric "${key}" (raw and derived stay separate)`);
      }
    }
  }
  if (!isPlainObject(snap.derived_metrics)) {
    errors.push('metric_snapshot.derived_metrics missing (raw/derived separation requires an explicit derived block)');
  } else if (isPlainObject(snap.raw_metrics)) {
    for (const key of Object.keys(snap.derived_metrics)) {
      if (key in snap.raw_metrics) {
        errors.push(`metric "${key}" present in both raw_metrics and derived_metrics`);
      }
    }
  }
  if (snap.derived_metrics && isPlainObject(snap.derived_metrics.engagement_rate)) {
    const er = snap.derived_metrics.engagement_rate;
    if (typeof er.formula_version !== 'string' || er.formula_version.length === 0) {
      errors.push('derived engagement_rate must record formula_version');
    }
  }
  // Metric quality states must be from the contract set; value 0 is never auto-valid.
  if (isPlainObject(snap.raw_metrics)) {
    for (const [name, m] of Object.entries(snap.raw_metrics)) {
      if (!isPlainObject(m) || !('value' in m) || !METRIC_QUALITY_VALUES.has(m.quality)) {
        errors.push(`raw metric "${name}" must be { value, quality } with quality in ${[...METRIC_QUALITY_VALUES].join('|')}`);
        continue;
      }
      if (m.value === 0 && m.quality === 'VALID' && !m.quality_note) {
        errors.push(`raw metric "${name}" is 0 with VALID quality but no quality_note; 0 never automatically means a valid zero`);
      }
    }
  }
  return errors;
}

// --- Check 2: evidence ontology values ------------------------------------

export function checkEvidenceOntology(fixture, label) {
  const errors = [];
  const evidence = fixture.evidence;
  if (!Array.isArray(evidence) || evidence.length === 0) {
    errors.push(`${label}: missing non-empty evidence array`);
    return errors;
  }
  evidence.forEach((ev, i) => {
    if (!isPlainObject(ev)) {
      errors.push(`${label}.evidence[${i}] must be an object`);
      return;
    }
    if (!EVIDENCE_TYPES.has(ev.evidence_type)) {
      const hint = FORBIDDEN_EVIDENCE_TYPES.has(ev.evidence_type)
        ? ' (donor taxonomy CONFIRMED/UNKNOWN is forbidden)'
        : '';
      errors.push(`${label}.evidence[${i}].evidence_type must be one of ${[...EVIDENCE_TYPES].join('|')}, got ${JSON.stringify(ev.evidence_type)}${hint}`);
    }
    if (!isPlainObject(ev.source_ref) || typeof ev.source_ref.entity !== 'string') {
      errors.push(`${label}.evidence[${i}].source_ref must reference an immutable source entity`);
    }
    // Layer separation: EXTRACTED evidence must point at AI features, not metrics.
    if (ev.evidence_type === 'EXTRACTED' && ev.source_ref && ev.source_ref.entity === 'metric_snapshot') {
      errors.push(`${label}.evidence[${i}]: EXTRACTED evidence must not point at metric_snapshot (layers must not collapse)`);
    }
    if (ev.evidence_type === 'DERIVED' && ev.source_ref && ev.source_ref.entity === 'content_feature') {
      errors.push(`${label}.evidence[${i}]: DERIVED evidence must not point at content_feature (layers must not collapse)`);
    }
  });
  return errors;
}

// --- Check 3: extraction AI-original / unreviewed state --------------------

export function checkExtractionState(extraction) {
  const errors = [];
  const run = extraction.extraction_run;
  if (!isPlainObject(run)) {
    errors.push('extraction: missing extraction_run object');
    return errors;
  }
  if (run.review_state !== 'unreviewed') {
    errors.push(`extraction_run.review_state must be "unreviewed" in a fresh fixture, got ${JSON.stringify(run.review_state)}`);
  }
  if (typeof run.schema_version !== 'string' || run.schema_version.length === 0) {
    errors.push('extraction_run must record schema_version');
  }
  const features = extraction.content_features;
  if (!Array.isArray(features) || features.length === 0) {
    errors.push('extraction: missing non-empty content_features array');
    return errors;
  }
  features.forEach((f, i) => {
    if (!isPlainObject(f)) {
      errors.push(`content_features[${i}] must be an object`);
      return;
    }
    if (typeof f.feature_key !== 'string' || f.feature_key.length === 0) {
      errors.push(`content_features[${i}].feature_key must be a non-empty string`);
    }
    if (FORBIDDEN_AI_FEATURE_KEYS.has(f.feature_key)) {
      errors.push(`content_features[${i}]: "${f.feature_key}" must not be an AI-extracted feature (contract S4 must-NOT list)`);
    }
    if (f.ai_original_value === undefined || f.ai_original_value === null) {
      errors.push(`content_features[${i}]: ai_original_value missing; AI original must be preserved`);
    }
    if (!AI_REVIEW_STATES.has(f.review_state)) {
      errors.push(`content_features[${i}].review_state must be one of ${[...AI_REVIEW_STATES].join('|')}, got ${JSON.stringify(f.review_state)}`);
    }
    if (f.review_state === 'unreviewed' && f.corrected_value !== null && f.corrected_value !== undefined) {
      errors.push(`content_features[${i}]: unreviewed feature must not carry corrected_value`);
    }
  });
  return errors;
}

// --- Check 4: transcript timestamps ordered --------------------------------

export function checkTranscriptOrdering(transcriptFixture) {
  const errors = [];
  const t = transcriptFixture.transcript;
  if (!isPlainObject(t)) {
    errors.push('transcript: missing transcript object');
    return errors;
  }
  const segments = t.segments;
  if (!Array.isArray(segments) || segments.length === 0) {
    errors.push('transcript: missing non-empty segments array');
    return errors;
  }
  let prevStart = -1;
  let prevEnd = -1;
  segments.forEach((s, i) => {
    if (!isPlainObject(s)) {
      errors.push(`segments[${i}] must be an object`);
      return;
    }
    const { start_ms: start, end_ms: end } = s;
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      errors.push(`segments[${i}]: start_ms/end_ms must be finite numbers`);
      return;
    }
    if (start < 0 || end < 0) {
      errors.push(`segments[${i}]: timestamps must be non-negative`);
    }
    if (end <= start) {
      errors.push(`segments[${i}]: end_ms (${end}) must be greater than start_ms (${start})`);
    }
    if (start < prevStart) {
      errors.push(`segments[${i}]: start_ms (${start}) is before previous segment start (${prevStart}); timestamps must be ordered`);
    }
    if (start < prevEnd) {
      errors.push(`segments[${i}]: overlaps previous segment (starts ${start} < previous end ${prevEnd})`);
    }
    prevStart = start;
    prevEnd = end;
  });
  return errors;
}

// --- Check 5: no provider raw payload in domain fixtures -------------------

export function checkNoProviderPayload(fixture, label) {
  const errors = [];
  walkKeys(fixture, (key, _value, path) => {
    if (PROVIDER_PAYLOAD_KEYS.has(key)) {
      errors.push(`${label}: provider raw payload key "${key}" at ${path} (raw payload stays in acquisition layer, never in domain fixtures)`);
    }
  });
  // Transient CDN/download URLs must not appear; canonical permalink is allowed.
  const json = JSON.stringify(fixture);
  const cdnUrlMatch = json.match(/https?:\/\/(?!(www\.)?tiktok\.com)[^\s"]+/g);
  if (cdnUrlMatch) {
    errors.push(`${label}: non-canonical URL(s) found: ${cdnUrlMatch.join(', ')} (transient CDN URLs are not stored)`);
  }
  return errors;
}

// --- Orchestration ---------------------------------------------------------

export function validateFixtures(fixtures = loadAllFixtures()) {
  const errors = [];
  const required = FIXTURE_FILES;
  for (const f of required) {
    if (!fixtures[f]) errors.push(`missing fixture file: ${f}`);
  }
  if (errors.length > 0) return errors;

  errors.push(...checkDistributionIsolation(fixtures['tiktok-post.json'], fixtures['metric-snapshot.json']));
  errors.push(...checkExtractionState(fixtures['extraction.json']));
  errors.push(...checkTranscriptOrdering(fixtures['transcript.json']));

  for (const name of required) {
    errors.push(...checkEvidenceOntology(fixtures[name], name));
    errors.push(...checkNoProviderPayload(fixtures[name], name));
  }
  return errors;
}

// CLI entry
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const errors = validateFixtures();
  if (errors.length > 0) {
    console.error(`FIXTURE VALIDATION FAILED (${errors.length} error${errors.length === 1 ? '' : 's'}):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`fixtures OK: ${FIXTURE_FILES.join(', ')}`);
}
