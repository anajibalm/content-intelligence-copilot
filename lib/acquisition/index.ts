// S2 acquisition library barrel + orchestration (plan S2).
// Pure functions + injectable providers. No DB client; tests use fakes, no network.

import type { ProviderRawPayload } from '../domain/types.ts';
import type {
  AcquisitionAttempt,
  AcquisitionFailureReason,
  AcquisitionPacket,
  AcquireInput,
  AcquireOutcome,
  CanonicalIdentity,
  TemporaryMediaRef,
  VideoAcquirer,
} from './types.ts';
import { AcquisitionError } from './types.ts';
import { normalizeTikTokUrl } from './normalize.ts';
import { nextAttemptNumber } from './state.ts';
import type { AttemptHistory } from './state.ts';
import { createYtDlpAcquirer } from './ytdlp.ts';
import type { YtDlpAcquirerOptions } from './ytdlp.ts';
import { createApifyAcquirer, createTikHubAcquirer } from './credentialed.ts';
import type { ApifyAcquirerOptions, TikHubAcquirerOptions } from './credentialed.ts';

export * from './types.ts';
export * from './normalize.ts';
export * from './state.ts';
export * from './media.ts';
export * from './fake.ts';
export * from './ytdlp.ts';
export * from './credentialed.ts';

export interface RunAcquisitionOptions {
  attemptHistory?: AttemptHistory;
  /** Epoch ms clock. Latency = now() - start; timestamps derived from it. */
  now?: () => number;
}

export interface RunAcquisitionResult {
  /** Null when URL invalid — no canonical identity derivable. */
  identity: CanonicalIdentity | null;
  attempt: AcquisitionAttempt;
  packet: AcquisitionPacket | null;
  error: AcquisitionError | null;
}

function buildAttempt(input: {
  attemptNumber: number;
  provider: string;
  status: AcquisitionAttempt['status'];
  startedAt: number;
  finishedAt: number;
  failureReason?: AcquisitionFailureReason | null;
  errorMessage?: string | null;
  media?: TemporaryMediaRef | null;
  rawPayload?: ProviderRawPayload;
}): AcquisitionAttempt {
  return {
    attemptNumber: input.attemptNumber,
    provider: input.provider,
    status: input.status,
    createdAt: new Date(input.startedAt).toISOString(),
    updatedAt: new Date(input.finishedAt).toISOString(),
    latencyMs: input.finishedAt - input.startedAt,
    mediaPath: input.media?.path ?? null,
    mediaBytes: input.media?.bytes ?? null,
    failureReason: input.failureReason ?? null,
    errorMessage: input.errorMessage ?? null,
    rawPayload: input.rawPayload ?? {},
  };
}

/**
 * Orchestrate one acquisition attempt: normalize URL → provider → attempt record.
 * Provider failures never throw; they return FAILED attempt + reason-aware error.
 * Provider raw payload recorded on the attempt only, never the packet (contract §10.1).
 */
export async function runAcquisition(
  acquirer: VideoAcquirer,
  rawUrl: string,
  options: RunAcquisitionOptions = {},
): Promise<RunAcquisitionResult> {
  const now = options.now ?? Date.now;
  const attemptNumber = options.attemptHistory ? nextAttemptNumber(options.attemptHistory) : 1;
  const startedAt = now();

  let identity: CanonicalIdentity;
  try {
    identity = normalizeTikTokUrl(rawUrl);
  } catch (error) {
    const failure =
      error instanceof AcquisitionError
        ? error
        : new AcquisitionError('INVALID_URL', String((error as Error)?.message ?? error), acquirer.provider);
    return {
      identity: null,
      packet: null,
      error: failure,
      attempt: buildAttempt({
        attemptNumber,
        provider: acquirer.provider,
        status: 'FAILED',
        startedAt,
        finishedAt: now(),
        failureReason: failure.reasonCode,
        errorMessage: failure.message,
      }),
    };
  }

  try {
    const outcome = await acquirer.acquire({ url: identity.permalink, identity });
    return {
      identity,
      packet: outcome.packet,
      error: null,
      attempt: buildAttempt({
        attemptNumber,
        provider: acquirer.provider,
        status: 'SUCCEEDED',
        startedAt,
        finishedAt: now(),
        media: outcome.packet.media,
        rawPayload: outcome.rawPayload,
      }),
    };
  } catch (error) {
    const failure =
      error instanceof AcquisitionError
        ? error
        : new AcquisitionError('PROVIDER_ERROR', String((error as Error)?.message ?? error), acquirer.provider);
    return {
      identity,
      packet: null,
      error: failure,
      attempt: buildAttempt({
        attemptNumber,
        provider: acquirer.provider,
        status: 'FAILED',
        startedAt,
        finishedAt: now(),
        failureReason: failure.reasonCode,
        errorMessage: failure.message,
      }),
    };
  }
}

// --- Failover chain + credential-gated registry ----------------------------

export interface AcquirerRegistry extends VideoAcquirer {
  /** Providers in failover order; exposes the credential gate for inspection. */
  readonly providers: readonly VideoAcquirer[];
}

export function createFailoverAcquirer(providers: readonly VideoAcquirer[]): AcquirerRegistry {
  const chain = [...providers];
  return {
    provider: chain.map((p) => p.provider).join('+') || 'failover',
    providers: chain,
    async acquire(input: AcquireInput): Promise<AcquireOutcome> {
      if (chain.length === 0) {
        throw new AcquisitionError('PROVIDER_ERROR', 'No acquisition providers configured', null);
      }
      let lastError: AcquisitionError | null = null;
      for (const provider of chain) {
        try {
          return await provider.acquire(input);
        } catch (error) {
          lastError =
            error instanceof AcquisitionError
              ? error
              : new AcquisitionError(
                  'PROVIDER_ERROR',
                  String((error as Error)?.message ?? error),
                  provider.provider,
                );
        }
      }
      throw lastError ?? new AcquisitionError('PROVIDER_ERROR', 'All acquisition providers failed', null);
    },
  };
}

export interface AcquirerEnv {
  TIKHUB_API_KEY?: string | undefined;
  APIFY_TOKEN?: string | undefined;
  APIFY_ACTOR?: string | undefined;
}

export interface DefaultAcquirerOptions {
  ytdlp?: YtDlpAcquirerOptions;
  tikhub?: Omit<TikHubAcquirerOptions, 'apiKey'>;
  apify?: Omit<ApifyAcquirerOptions, 'token'>;
}

/**
 * Default registry: yt-dlp first (no credentials); credentialed providers
 * appended ONLY when their credential env vars exist (spike auto route).
 * Credentials are presence-gated — never read into logs or error messages.
 */
export function createDefaultAcquirer(
  env: AcquirerEnv = {
    TIKHUB_API_KEY: process.env.TIKHUB_API_KEY,
    APIFY_TOKEN: process.env.APIFY_TOKEN,
    APIFY_ACTOR: process.env.APIFY_ACTOR,
  },
  options: DefaultAcquirerOptions = {},
): AcquirerRegistry {
  const chain: VideoAcquirer[] = [createYtDlpAcquirer(options.ytdlp)];
  if (env.TIKHUB_API_KEY) {
    chain.push(createTikHubAcquirer({ ...(options.tikhub ?? {}), apiKey: env.TIKHUB_API_KEY }));
  }
  if (env.APIFY_TOKEN) {
    chain.push(
      createApifyAcquirer({
        ...(options.apify ?? {}),
        token: env.APIFY_TOKEN,
        ...(env.APIFY_ACTOR ? { actor: env.APIFY_ACTOR } : {}),
      }),
    );
  }
  return createFailoverAcquirer(chain);
}
