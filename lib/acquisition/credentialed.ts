// Credentialed provider adapters (spike routes: TikHub, Apify).
// Called ONLY when credentials exist (createDefaultAcquirer gate). Secrets never logged.
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ProviderRawPayload } from '../domain/types.ts';
import type { AcquireInput, AcquireOutcome, VideoAcquirer } from './types.ts';
import { AcquisitionError, classifyProviderFailure } from './types.ts';

export interface FetchResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export type FetchLike = (url: string, init?: Record<string, unknown>) => Promise<FetchResponseLike>;

export interface MediaCandidate {
  key: string;
  url: string;
  score: number;
}

/**
 * Spike-compatible media URL candidate scoring: recursively walk provider
 * payloads, score download/play/video keys and .mp4 URLs, best first.
 */
export function walkMediaCandidates(payload: unknown, found: MediaCandidate[] = []): MediaCandidate[] {
  if (Array.isArray(payload)) {
    for (const value of payload) {
      walkMediaCandidates(value, found);
    }
  } else if (payload !== null && typeof payload === 'object') {
    for (const [key, value] of Object.entries(payload)) {
      if (typeof value === 'string' && /^https?:\/\//.test(value)) {
        const lowerKey = key.toLowerCase();
        let score = 0;
        if (lowerKey.includes('download')) score += 5;
        if (lowerKey.includes('playaddr') || lowerKey.includes('play_addr')) score += 4;
        if (lowerKey.includes('video')) score += 2;
        if (value.toLowerCase().includes('.mp4')) score += 3;
        found.push({ key, url: value, score });
      } else {
        walkMediaCandidates(value, found);
      }
    }
  }
  return found;
}

/**
 * Fetch wrapper for credentialed providers. Network errors become NETWORK_ERROR
 * with sanitized messages — request URLs can carry tokens (Apify query string).
 */
async function providerFetch(
  provider: string,
  fetchImpl: FetchLike,
  url: string,
  init?: Record<string, unknown>,
): Promise<FetchResponseLike> {
  try {
    return await fetchImpl(url, init);
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { cause?: { code?: string } };
    const code = err.cause?.code ?? err.code ?? err.name ?? 'Error';
    throw new AcquisitionError('NETWORK_ERROR', `${provider}: request failed (${code})`, provider);
  }
}

async function downloadToFile(
  provider: string,
  fetchImpl: FetchLike,
  mediaUrl: string,
  target: string,
): Promise<number> {
  let res: FetchResponseLike;
  try {
    res = await fetchImpl(mediaUrl, {});
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { cause?: { code?: string } };
    const code = err.cause?.code ?? err.code ?? err.name ?? 'Error';
    throw new AcquisitionError('NETWORK_ERROR', `${provider}: media download failed (${code})`, provider);
  }
  if (!res.ok) {
    throw classifyProviderFailure(provider, `media download HTTP ${res.status}`, { status: res.status });
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  await writeFile(target, buffer);
  return buffer.byteLength;
}

export interface TikHubAcquirerOptions {
  apiKey: string;
  fetchImpl?: FetchLike;
  tempDirBase?: string;
  region?: string;
}

export function createTikHubAcquirer(options: TikHubAcquirerOptions): VideoAcquirer {
  // Native fetch coerced to the injectable FetchLike shape (structural at runtime).
  const fetchImpl: FetchLike = options.fetchImpl ?? ((url, init) => fetch(url, init) as unknown as Promise<FetchResponseLike>);
  const tempDirBase = options.tempDirBase ?? tmpdir();
  const region = options.region ?? 'ID';
  const { apiKey } = options;

  return {
    provider: 'tikhub',
    async acquire(input: AcquireInput): Promise<AcquireOutcome> {
      const endpoint =
        'https://api.tikhub.io/api/v1/tiktok/web/fetch_post_detail' +
        `?itemId=${encodeURIComponent(input.identity.externalId)}&region=${encodeURIComponent(region)}`;
      const res = await providerFetch('tikhub', fetchImpl, endpoint, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) {
        throw classifyProviderFailure('tikhub', `TikHub HTTP ${res.status}`, { status: res.status });
      }
      const payload = (await res.json()) as ProviderRawPayload;
      const candidates = walkMediaCandidates(payload)
        .filter((candidate) => candidate.score > 0)
        .sort((a, b) => b.score - a.score);
      if (candidates.length === 0) {
        throw new AcquisitionError('MEDIA_NOT_FOUND', 'TikHub response contained no media URL', 'tikhub');
      }
      const dir = await mkdtemp(join(tempDirBase, 'cic-tikhub-'));
      const target = join(dir, `${input.identity.externalId}.mp4`);
      const bytes = await downloadToFile('tikhub', fetchImpl, candidates[0].url, target);
      return {
        packet: {
          provider: 'tikhub',
          identity: input.identity,
          media: { path: target, bytes, temporary: true },
          acquiredAt: new Date().toISOString(),
        },
        rawPayload: payload,
      };
    },
  };
}

export interface ApifyAcquirerOptions {
  token: string;
  actor?: string;
  fetchImpl?: FetchLike;
  tempDirBase?: string;
}

export function createApifyAcquirer(options: ApifyAcquirerOptions): VideoAcquirer {
  // Native fetch coerced to the injectable FetchLike shape (structural at runtime).
  const fetchImpl: FetchLike = options.fetchImpl ?? ((url, init) => fetch(url, init) as unknown as Promise<FetchResponseLike>);
  const tempDirBase = options.tempDirBase ?? tmpdir();
  const actor = options.actor ?? 'spider_studio~tiktok-video-resolver';
  const { token } = options;

  return {
    provider: 'apify',
    async acquire(input: AcquireInput): Promise<AcquireOutcome> {
      const endpoint =
        `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items` +
        `?token=${encodeURIComponent(token)}`;
      const res = await providerFetch('apify', fetchImpl, endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: [input.url] }),
      });
      if (!res.ok) {
        throw classifyProviderFailure('apify', `Apify HTTP ${res.status}`, { status: res.status });
      }
      const parsed = await res.json();
      const rows: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
      const first = rows[0];
      if (first === undefined || first === null || typeof first !== 'object') {
        throw new AcquisitionError('NOT_FOUND', 'Apify returned no rows', 'apify');
      }
      const row = first as Record<string, unknown>;
      if (row.success === false) {
        throw new AcquisitionError(
          'PROVIDER_ERROR',
          `Apify resolver failed: ${String(row.error ?? 'unknown error').slice(0, 200)}`,
          'apify',
        );
      }
      const meta =
        row.videoMeta !== null && typeof row.videoMeta === 'object'
          ? (row.videoMeta as Record<string, unknown>)
          : null;
      const direct = [row.downloadUrl, meta?.downloadUrl, row.playUrl].find(
        (value): value is string => typeof value === 'string' && /^https?:\/\//.test(value),
      );
      const fromWalk = walkMediaCandidates(row).sort((a, b) => b.score - a.score)[0]?.url;
      const mediaUrl = direct ?? fromWalk;
      if (mediaUrl === undefined) {
        throw new AcquisitionError('MEDIA_NOT_FOUND', 'Apify row contained no download URL', 'apify');
      }
      const dir = await mkdtemp(join(tempDirBase, 'cic-apify-'));
      const target = join(dir, `${input.identity.externalId}.mp4`);
      const bytes = await downloadToFile('apify', fetchImpl, mediaUrl, target);
      return {
        packet: {
          provider: 'apify',
          identity: input.identity,
          media: { path: target, bytes, temporary: true },
          acquiredAt: new Date().toISOString(),
        },
        // Rows array stored verbatim; single-row payloads stay a record (contract §10.1).
        rawPayload: (Array.isArray(parsed) ? { rows } : parsed) as ProviderRawPayload,
      };
    },
  };
}
