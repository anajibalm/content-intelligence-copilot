import { createHash } from 'node:crypto';
import type { ProcessingOutput } from '../processing/index.ts';

export const EXTRACTION_PROVIDER = 'unconfigured';
export const EXTRACTION_MODEL = 'unconfigured';
export const EXTRACTION_PROMPT_VERSION = 'fingerprint-v0.1';
export const EXTRACTION_SCHEMA_VERSION = 'fingerprint-v0.1';

export const FINGERPRINT_FIELDS = [
  'topic', 'format', 'hook_type', 'hook_subject', 'talent_type', 'talent_familiarity',
  'opening_style', 'pacing', 'narrative_structure', 'emotional_trigger', 'tension_type',
  'product_placement', 'cta_type',
] as const;
export type FingerprintField = (typeof FINGERPRINT_FIELDS)[number];

export interface ExtractionInput {
  metadata: { contentId: string; title: string | null; caption: string | null };
  transcript: ProcessingOutput['transcript'];
  hookFrames: ProcessingOutput['hookFrames'];
  representativeFrames: ProcessingOutput['representativeFrames'];
}
export interface ModelFeature { fieldName: FingerprintField; value: string; }
export interface ModelOutput { features: ModelFeature[]; rawOutput: Record<string, unknown>; provider: string; model: string; promptVersion: string; schemaVersion: string; inputHash?: string; }
export interface FingerprintExtraction { inputHash: string; rawOutput: Record<string, unknown>; features: ModelFeature[]; confidence: 'LOW'; confidenceReason: string; provider: string; model: string; promptVersion: string; schemaVersion: string; }

function hash(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

export function buildExtractionInput(output: ProcessingOutput, metadata: ExtractionInput['metadata']): ExtractionInput {
  return {
    metadata,
    transcript: output.transcript,
    hookFrames: output.hookFrames,
    representativeFrames: output.representativeFrames,
  };
}

export function extractFingerprint(input: ExtractionInput, modelOutput: ModelOutput | null): FingerprintExtraction {
  if (!modelOutput) throw new Error('S4 extraction blocked: no multimodal fingerprint provider/model is configured');
  const fields: Record<FingerprintField, boolean> = Object.fromEntries(FINGERPRINT_FIELDS.map((field) => [field, false])) as Record<FingerprintField, boolean>;
  for (const feature of modelOutput.features) fields[feature.fieldName] = true;
  if (modelOutput.features.length !== FINGERPRINT_FIELDS.length || FINGERPRINT_FIELDS.some((field) => !fields[field])) throw new Error('multimodal extraction output does not contain complete fingerprint schema');
  if (modelOutput.features.some((feature) => !feature.value.trim())) throw new Error('multimodal extraction output contains empty feature value');
  if (modelOutput.inputHash !== undefined && !/^sha256:[0-9a-f]{64}$/.test(modelOutput.inputHash)) throw new Error('invalid multimodal request input hash');
  const inputHash = modelOutput.inputHash ?? hash(input);
  return {
    inputHash,
    rawOutput: { input, inputHashBasis: modelOutput.inputHash ? 'multimodal_request' : 'metadata', modelOutput: modelOutput.rawOutput },
    features: modelOutput.features,
    confidence: 'LOW',
    confidenceReason: 'EXTRACTED evidence remains unreviewed until analyst confirmation.',
    provider: modelOutput.provider,
    model: modelOutput.model,
    promptVersion: modelOutput.promptVersion,
    schemaVersion: modelOutput.schemaVersion,
  };
}
