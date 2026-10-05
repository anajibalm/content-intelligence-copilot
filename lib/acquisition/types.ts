// S2 acquisition-layer shared types.
// Canonical domain types live in lib/domain/types.ts (S1). Provider raw payloads
// stay acquisition-layer only — never the domain content packet (contract §10.1).

import type {
  AcquisitionStatus,
  ContentId,
  Platform,
  ProviderRawPayload,
} from '../domain/types.ts';

export type { ContentId, Platform, ProviderRawPayload };

/** Canonical identity: normalized TikTok permalink + numeric external ID. */
export interface CanonicalIdentity {
  platform: Platform;
  externalId: string;
  permalink: string;
}

/** Reason-aware acquisition failure vocabulary. */
export const ACQUISITION_FAILURE_REASONS = [
  'INVALID_URL',
  'NOT_FOUND',
  'PRIVATE_OR_REMOVED',
  'RATE_LIMITED',
  'NETWORK_ERROR',
  'TIMEOUT',
  'PROVIDER_ERROR',
  'MEDIA_NOT_FOUND',
  'YTDLP_NOT_INSTALLED',
] as const;
export type AcquisitionFailureReason = (typeof ACQUISITION_FAILURE_REASONS)[number];

const RETRYABLE_BY_REASON: Record<AcquisitionFailureReason, boolean> = {
  INVALID_URL: false,
  NOT_FOUND: false,
  PRIVATE_OR_REMOVED: false,
  RATE_LIMITED: true,
  NETWORK_ERROR: true,
  TIMEOUT: true,
  PROVIDER_ERROR: true,
  MEDIA_NOT_FOUND: true,
  YTDLP_NOT_INSTALLED: true,
};

export function isRetryableFailure(reason: AcquisitionFailureReason | null | undefined): boolean {
  return reason !== null && reason !== undefined && RETRYABLE_BY_REASON[reason];
}

/** Reason-aware acquisition error. Never carries secrets from provider config. */
export class AcquisitionError extends Error {
  readonly reasonCode: AcquisitionFailureReason;
  readonly provider: string | null;

  constructor(reasonCode: AcquisitionFailureReason, message: string, provider: string | null = null) {
    super(message);
    this.name = 'AcquisitionError';
    this.reasonCode = reasonCode;
    this.provider = provider;
  }

  get retryable(): boolean {
    return isRetryableFailure(this.reasonCode);
  }
}

/** Media reference. `temporary: true` is the only license for cleanup helpers. */
export interface TemporaryMediaRef {
  path: string;
  bytes: number;
  temporary: true;
}

/** Normalized canonical acquisition packet. NO provider raw payload (contract §10.1). */
export interface AcquisitionPacket {
  provider: string;
  identity: CanonicalIdentity;
  media: TemporaryMediaRef;
  acquiredAt: string;
}

/** Provider outcome: raw payload travels BESIDE the packet, never inside it. */
export interface AcquireOutcome {
  packet: AcquisitionPacket;
  rawPayload: ProviderRawPayload;
}

export interface AcquireInput {
  /** Canonical permalink from normalizeTikTokUrl. */
  url: string;
  identity: CanonicalIdentity;
}

/** Provider-neutral acquirer interface (plan S2). */
export interface VideoAcquirer {
  readonly provider: string;
  acquire(input: AcquireInput): Promise<AcquireOutcome>;
}

/** Acquisition attempt history entry (mirrors acquisition_run contract shape). */
export interface AcquisitionAttempt {
  attemptNumber: number;
  provider: string;
  status: AcquisitionStatus;
  createdAt: string;
  updatedAt: string;
  latencyMs: number | null;
  mediaPath: string | null;
  mediaBytes: number | null;
  failureReason: AcquisitionFailureReason | null;
  errorMessage: string | null;
  /** Provider raw payload isolated here — never the domain model (contract §10.1). */
  rawPayload: ProviderRawPayload;
}

/**
 * Classify a provider failure into a reason-aware AcquisitionError.
 * `status` takes precedence (HTTP status); message patterns cover CLI tools.
 * Callers must pass sanitized text — messages here never echo credentials.
 */
export function classifyProviderFailure(
  provider: string,
  message: string,
  hint?: { status?: number; code?: string },
): AcquisitionError {
  const status = hint?.status;
  const code = hint?.code;
  if (code === 'ENOENT') {
    return new AcquisitionError('YTDLP_NOT_INSTALLED', `${provider}: executable not found`, provider);
  }
  if (status === 429) {
    return new AcquisitionError('RATE_LIMITED', `${provider}: rate limited (HTTP 429)`, provider);
  }
  if (status === 404) {
    return new AcquisitionError('NOT_FOUND', `${provider}: resource not found (HTTP 404)`, provider);
  }
  if (status === 408 || status === 504) {
    return new AcquisitionError('TIMEOUT', `${provider}: request timed out (HTTP ${status})`, provider);
  }
  if (status === 401 || status === 403) {
    return new AcquisitionError('PROVIDER_ERROR', `${provider}: credentials rejected (HTTP ${status})`, provider);
  }
  if (status !== undefined && status >= 500) {
    return new AcquisitionError('PROVIDER_ERROR', `${provider}: upstream error (HTTP ${status})`, provider);
  }

  const text = message.toLowerCase();
  if (
    code === 'ETIMEDOUT' ||
    code === 'UND_ERR_HEADERS_TIMEOUT' ||
    code === 'UND_ERR_CONNECT_TIMEOUT' ||
    /timed? ?out|timeout/.test(text)
  ) {
    return new AcquisitionError('TIMEOUT', `${provider}: ${message}`, provider);
  }
  if (
    code === 'ENOTFOUND' ||
    code === 'ECONNREFUSED' ||
    code === 'ECONNRESET' ||
    /network|fetch failed|enotfound|econnrefused/.test(text)
  ) {
    return new AcquisitionError('NETWORK_ERROR', `${provider}: ${message}`, provider);
  }
  if (/429|rate limit|too many requests/.test(text)) {
    return new AcquisitionError('RATE_LIMITED', `${provider}: ${message}`, provider);
  }
  if (/private|removed|deleted/.test(text)) {
    return new AcquisitionError('PRIVATE_OR_REMOVED', `${provider}: ${message}`, provider);
  }
  if (/404|not found|not available|unavailable/.test(text)) {
    return new AcquisitionError('NOT_FOUND', `${provider}: ${message}`, provider);
  }
  return new AcquisitionError('PROVIDER_ERROR', `${provider}: ${message}`, provider);
}
