import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import type { ExtractionInput, FingerprintField, ModelOutput } from './index.ts';
import { EXTRACTION_PROMPT_VERSION, EXTRACTION_SCHEMA_VERSION, FINGERPRINT_FIELDS } from './index.ts';

export interface MultimodalExtractorOptions {
  endpoint: string;
  apiKey: string;
  model: string;
  provider?: string;
  fetchImpl?: typeof fetch;
}

const MIME_TYPES: Record<string, string> = {
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

function mimeType(path: string): string {
  const extension = path.slice(path.lastIndexOf('.')).toLowerCase();
  return MIME_TYPES[extension] ?? 'application/octet-stream';
}

function prompt(): string {
  return [
    'Extract video fingerprint fields from supplied metadata, transcript, and timestamped frames.',
    'Use only observable evidence. If uncertain, write a concise uncertainty value; never omit a field.',
    'Return JSON only with this exact shape: {"features":[{"fieldName":"topic","value":"..."}]}',
    `Required field names: ${JSON.stringify(FINGERPRINT_FIELDS)}.`,
    'Each required field must appear exactly once with a non-empty string value.',
  ].join('\n');
}

function parseContent(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) throw new Error('multimodal provider returned no text content');
  return value.map((part) => typeof part === 'string' ? part : part && typeof part === 'object' && 'text' in part ? String(part.text) : '').join('');
}

function parseJson(value: string): Record<string, unknown> {
  const trimmed = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const parsed: unknown = JSON.parse(trimmed);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('multimodal provider returned a non-object JSON value');
  return parsed as Record<string, unknown>;
}

function featuresFromPayload(payload: Record<string, unknown>): Array<{ fieldName: FingerprintField; value: string }> {
  const raw = Array.isArray(payload.features)
    ? payload.features
    : FINGERPRINT_FIELDS.map((fieldName) => ({ fieldName, value: payload[fieldName] }));
  return raw.map((feature) => {
    if (!feature || typeof feature !== 'object' || Array.isArray(feature)) throw new Error('multimodal provider returned an invalid feature');
    const fieldName = 'fieldName' in feature ? feature.fieldName : undefined;
    const value = 'value' in feature ? feature.value : undefined;
    if (typeof fieldName !== 'string' || !FINGERPRINT_FIELDS.includes(fieldName as FingerprintField) || typeof value !== 'string') {
      throw new Error('multimodal provider returned an invalid fingerprint feature');
    }
    return { fieldName: fieldName as FingerprintField, value };
  });
}

export function createMultimodalFingerprintExtractor(options: MultimodalExtractorOptions): (input: ExtractionInput) => Promise<ModelOutput> {
  if (!options.endpoint.trim() || !options.apiKey.trim() || !options.model.trim()) throw new Error('multimodal endpoint, API key, and model are required');
  const fetchImpl = options.fetchImpl ?? fetch;
  return async (input) => {
    const frames = [...input.hookFrames, ...input.representativeFrames];
    const images = await Promise.all(frames.map(async (frame) => ({
      type: 'image_url',
      image_url: { url: `data:${mimeType(frame.storagePath)};base64,${(await readFile(frame.storagePath)).toString('base64')}` },
    })));
    const requestBody = JSON.stringify({
      model: options.model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: `${prompt()}\nInput JSON:\n${JSON.stringify({ metadata: input.metadata, transcript: input.transcript, frames: frames.map(({ timestampMs, frameType }) => ({ timestampMs, frameType })) })}` },
          ...images,
        ],
      }],
    });
    // Hash the exact model input, including the frame bytes already read for this request.
    const inputHash = `sha256:${createHash('sha256').update(requestBody).digest('hex')}`;
    const response = await fetchImpl(options.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${options.apiKey}` },
      body: requestBody,
    });
    const bodyText = await response.text();
    if (!response.ok) throw new Error(`multimodal provider request failed (${response.status}): ${bodyText.slice(0, 500)}`);
    const body: unknown = JSON.parse(bodyText);
    if (!body || typeof body !== 'object' || !('choices' in body) || !Array.isArray(body.choices)) throw new Error('multimodal provider returned invalid chat response');
    const message = body.choices[0] && typeof body.choices[0] === 'object' && 'message' in body.choices[0] ? body.choices[0].message : null;
    if (!message || typeof message !== 'object' || !('content' in message)) throw new Error('multimodal provider returned no assistant message');
    const payload = parseJson(parseContent(message.content));
    return {
      features: featuresFromPayload(payload),
      rawOutput: body as Record<string, unknown>,
      provider: options.provider ?? 'openai-compatible',
      model: options.model,
      promptVersion: EXTRACTION_PROMPT_VERSION,
      schemaVersion: EXTRACTION_SCHEMA_VERSION,
      inputHash,
    };
  };
}
