import { createHash } from 'node:crypto';
import type { ProcessingOutput } from '../processing/index.ts';

export const EXTRACTION_PROVIDER = 'cic-deterministic-fingerprint';
export const EXTRACTION_MODEL = 'fingerprint-v0.1';
export const EXTRACTION_PROMPT_VERSION = 'fingerprint-v0.1';
export const EXTRACTION_SCHEMA_VERSION = 'fingerprint-v0.1';

export const FINGERPRINT_FIELDS = [
  'topic', 'format', 'hook_type', 'hook_subject', 'talent_type', 'talent_familiarity',
  'opening_style', 'pacing', 'narrative_structure', 'emotional_trigger', 'tension_type',
  'product_placement', 'cta_type',
] as const;
export type FingerprintField = (typeof FINGERPRINT_FIELDS)[number];

export interface ExtractedFeature { fieldName: FingerprintField; aiValue: string; }
export interface FingerprintExtraction {
  inputHash: string;
  rawOutput: Record<string, unknown>;
  features: ExtractedFeature[];
  confidence: 'LOW';
  confidenceReason: string;
}

function hash(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function text(output: ProcessingOutput): string {
  return output.transcript.segments.map((segment) => segment.text).join(' ').trim().toLowerCase();
}

function classify(output: ProcessingOutput, fieldName: FingerprintField): string {
  const transcript = text(output);
  const has = (...terms: string[]) => terms.some((term) => transcript.includes(term));
  if (fieldName === 'topic') return has('obat', 'produk', 'supplement', 'vitamin') ? 'product_education' : 'general_information';
  if (fieldName === 'format') return output.hookFrames.length > 0 ? 'short_form_demonstration' : 'talking_head';
  if (fieldName === 'hook_type') return has('tunggu', 'jangan', 'ternyata', '?') ? 'direct_attention' : 'opening_statement';
  if (fieldName === 'hook_subject') return transcript.slice(0, 80) || 'unavailable';
  if (fieldName === 'talent_type') return 'single_presenter';
  if (fieldName === 'talent_familiarity') return 'unclassified';
  if (fieldName === 'opening_style') return has('kamu', 'anda') ? 'direct_address' : 'direct_claim';
  if (fieldName === 'pacing') return output.transcript.segments.length > 10 ? 'fast' : 'moderate';
  if (fieldName === 'narrative_structure') return has('karena', 'jadi', 'maka') ? 'claim_explanation' : 'single_claim';
  if (fieldName === 'emotional_trigger') return has('bahaya', 'salah', 'jangan') ? 'concern' : 'curiosity';
  if (fieldName === 'tension_type') return has('masalah', 'solusi', 'atasi') ? 'problem_solution' : 'none_observed';
  if (fieldName === 'product_placement') return has('produk', 'beli', 'gunakan') ? 'verbal_reference' : 'not_observed';
  return has('follow', 'ikuti', 'beli', 'komen') ? 'direct_action' : 'none_observed';
}

export function extractFingerprint(output: ProcessingOutput): FingerprintExtraction {
  const input = {
    transcript: output.transcript,
    hookFrames: output.hookFrames.map(({ id, timestampMs }) => ({ id, timestampMs })),
    representativeFrames: output.representativeFrames.map(({ id, timestampMs }) => ({ id, timestampMs })),
  };
  const features = FINGERPRINT_FIELDS.map((fieldName) => ({ fieldName, aiValue: classify(output, fieldName) }));
  return {
    inputHash: hash(input),
    rawOutput: { input, features },
    features,
    confidence: 'LOW',
    confidenceReason: 'EXTRACTED evidence remains unreviewed until analyst confirmation.',
  };
}
