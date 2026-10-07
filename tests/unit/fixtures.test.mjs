// Unit tests for canonical fixtures + validator.
// Uses Node's built-in test runner only (node --test). No dependencies.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadAllFixtures,
  validateFixtures,
  checkDistributionIsolation,
  checkEvidenceOntology,
  checkExtractionState,
  checkTranscriptOrdering,
  checkNoProviderPayload,
  checkGoldenLabels,
  EVIDENCE_TYPES,
} from '../../scripts/validate-fixtures.mjs';

const fixtures = loadAllFixtures();
const post = fixtures['tiktok-post.json'];
const snapshot = fixtures['metric-snapshot.json'];
const transcript = fixtures['transcript.json'];
const extraction = fixtures['extraction.json'];

test('all five fixtures load as JSON objects', () => {
  for (const [name, f] of Object.entries(fixtures)) {
    assert.equal(typeof f, 'object', `${name} must be an object`);
    assert.notEqual(f, null, `${name} must not be null`);
  }
});

test('full validation passes on canonical fixtures', () => {
  const errors = validateFixtures(fixtures);
  assert.deepEqual(errors, [], `expected clean validation, got:\n${errors.join('\n')}`);
});

// --- Invariant: distribution only in metric snapshot ----------------------

test('distribution lives only in metric snapshot, never on content', () => {
  const errors = checkDistributionIsolation(post, snapshot);
  assert.deepEqual(errors, []);

  // Negative cases: validator must reject the violation shape.
  const badPost = structuredClone(post);
  badPost.content.distribution = 'organic';
  assert.ok(
    checkDistributionIsolation(badPost, snapshot).some((e) => e.includes('distribution')),
    'validator must reject distribution on content',
  );

  const badSnapshot = structuredClone(snapshot);
  badSnapshot.metric_snapshot.distribution = 'viral';
  assert.ok(
    checkDistributionIsolation(post, badSnapshot).some((e) => e.includes('distribution')),
    'validator must reject invalid distribution value',
  );

  const derivedInRaw = structuredClone(snapshot);
  derivedInRaw.metric_snapshot.raw_metrics.er = 0.19;
  assert.ok(
    checkDistributionIsolation(post, derivedInRaw).some((e) => e.includes('derived metric')),
    'validator must reject derived metric inside raw_metrics',
  );
});

// --- Invariant: evidence ontology values ----------------------------------

test('evidence uses only OBSERVED/DERIVED/EXTRACTED/INFERRED', () => {
  for (const [name, f] of Object.entries(fixtures).filter(([name]) => name !== 'golden-labels.json')) {
    const errors = checkEvidenceOntology(f, name);
    assert.deepEqual(errors, [], `${name}: ${errors.join('; ')}`);
    assert.ok(Array.isArray(f.evidence) && f.evidence.length > 0, `${name} must carry evidence`);
    for (const ev of f.evidence) {
      assert.ok(EVIDENCE_TYPES.has(ev.evidence_type), `${name}: invalid evidence_type ${ev.evidence_type}`);
      assert.ok(ev.source_ref && ev.source_ref.entity, `${name}: evidence must reference a source entity`);
    }
  }

  // Negative: donor taxonomy must be rejected.
  const bad = structuredClone(post);
  bad.evidence[0].evidence_type = 'CONFIRMED';
  assert.ok(
    checkEvidenceOntology(bad, 'bad').some((e) => e.includes('CONFIRMED') || e.includes('evidence_type')),
    'validator must reject donor taxonomy CONFIRMED',
  );

  const layerCollapse = structuredClone(extraction);
  layerCollapse.evidence[0].source_ref = { entity: 'metric_snapshot', id: 'x', field: 'raw_metrics.views' };
  assert.ok(
    checkEvidenceOntology(layerCollapse, 'bad').some((e) => e.includes('EXTRACTED')),
    'validator must reject EXTRACTED evidence pointing at metric_snapshot',
  );
});

test('golden labels preserve AI originals and stability partitions', () => {
  const golden = fixtures['golden-labels.json'];
  assert.deepEqual(checkGoldenLabels(golden, extraction), []);

  const collapsed = structuredClone(golden);
  collapsed.score = 0.9;
  assert.ok(checkGoldenLabels(collapsed, extraction).some((error) => error.includes('collapsed quality')));

  const uncertain = structuredClone(golden);
  uncertain.labels.find((label) => label.field_key === 'emotional_trigger').ai_comparison.reason_code = null;
  assert.ok(checkGoldenLabels(uncertain, extraction).some((error) => error.includes('requires a reason_code')));

  const unstable = structuredClone(golden);
  unstable.stability_runs[0].stable_fields.push('cta_type');
  assert.ok(checkGoldenLabels(unstable, extraction).some((error) => error.includes('partition') || error.includes('listed stable')));
});


// --- Invariant: extraction AI-original / unreviewed state -----------------

test('extraction features are AI-original and unreviewed', () => {
  const errors = checkExtractionState(extraction);
  assert.deepEqual(errors, []);

  assert.equal(extraction.extraction_run.review_state, 'unreviewed');
  for (const f of extraction.content_features) {
    assert.notEqual(f.ai_original_value, null, `${f.feature_key}: AI original must be preserved`);
    assert.equal(f.review_state, 'unreviewed', `${f.feature_key}: fresh fixture must be unreviewed`);
    assert.equal(f.corrected_value, null, `${f.feature_key}: unreviewed feature has no correction`);
  }

  // Negative: overwriting AI original must be caught.
  const bad = structuredClone(extraction);
  bad.content_features[0].ai_original_value = null;
  assert.ok(
    checkExtractionState(bad).some((e) => e.includes('ai_original_value')),
    'validator must reject missing AI original',
  );

  const forbidden = structuredClone(extraction);
  forbidden.content_features.push({
    content_feature_id: 'cfeat_bad',
    feature_key: 'pillar',
    ai_original_value: 'education',
    review_state: 'unreviewed',
    corrected_value: null,
  });
  assert.ok(
    checkExtractionState(forbidden).some((e) => e.includes('pillar')),
    'validator must reject forbidden AI feature key pillar',
  );

  const reviewed = structuredClone(extraction);
  reviewed.extraction_run.review_state = 'confirmed';
  assert.ok(
    checkExtractionState(reviewed).some((e) => e.includes('review_state')),
    'validator must reject non-unreviewed run state in fresh fixture',
  );
});

// --- Invariant: transcript timestamps ordered ------------------------------

test('transcript segment timestamps are ordered and non-overlapping', () => {
  const errors = checkTranscriptOrdering(transcript);
  assert.deepEqual(errors, []);

  const segments = transcript.transcript.segments;
  for (let i = 1; i < segments.length; i++) {
    assert.ok(
      segments[i].start_ms >= segments[i - 1].start_ms,
      `segment ${i} starts before segment ${i - 1}`,
    );
    assert.ok(
      segments[i].start_ms >= segments[i - 1].end_ms,
      `segment ${i} overlaps segment ${i - 1}`,
    );
  }

  // Negative: out-of-order and overlapping segments must be caught.
  const unordered = structuredClone(transcript);
  [unordered.transcript.segments[0], unordered.transcript.segments[2]] = [
    unordered.transcript.segments[2],
    unordered.transcript.segments[0],
  ];
  assert.ok(
    checkTranscriptOrdering(unordered).some((e) => e.includes('ordered')),
    'validator must reject out-of-order timestamps',
  );

  const overlapping = structuredClone(transcript);
  overlapping.transcript.segments[1].start_ms = overlapping.transcript.segments[0].end_ms - 500;
  assert.ok(
    checkTranscriptOrdering(overlapping).some((e) => e.includes('overlap')),
    'validator must reject overlapping segments',
  );

  const inverted = structuredClone(transcript);
  inverted.transcript.segments[0].end_ms = inverted.transcript.segments[0].start_ms;
  assert.ok(
    checkTranscriptOrdering(inverted).some((e) => e.includes('greater than')),
    'validator must reject end_ms <= start_ms',
  );
});

// --- Invariant: no provider raw payload in domain fixtures ----------------

test('domain fixtures contain no provider raw payload or transient URLs', () => {
  for (const [name, f] of Object.entries(fixtures)) {
    const errors = checkNoProviderPayload(f, name);
    assert.deepEqual(errors, [], `${name}: ${errors.join('; ')}`);
  }

  // Canonical permalink is allowed on the content fixture.
  assert.ok(post.content.canonical_url.includes('tiktok.com'), 'canonical TikTok permalink expected');

  // Negative: provider-shaped keys must be rejected.
  const badPost = structuredClone(post);
  badPost.acquisition_run.raw_payload = { aweme_id: '7420000000000000001' };
  assert.ok(
    checkNoProviderPayload(badPost, 'bad').length > 0,
    'validator must reject raw_payload in domain fixture',
  );

  const badUrl = structuredClone(post);
  badPost.content.cdn_url = 'https://cdn-tiktok.example.com/video/tos.mp4';
  const urlErrors = checkNoProviderPayload(badPost, 'bad');
  assert.ok(
    urlErrors.some((e) => e.includes('cdn_url') || e.includes('non-canonical')),
    'validator must reject transient CDN URLs',
  );
});
