// Strict TikTok public URL validation + normalization (plan S2 rules).
import type { CanonicalIdentity } from './types.ts';
import { AcquisitionError } from './types.ts';

const TIKTOK_HOSTS: Record<string, true> = {
  'tiktok.com': true,
  'www.tiktok.com': true,
  'm.tiktok.com': true,
};
const TIKTOK_VIDEO_PATH = /^\/@([A-Za-z0-9._]{1,24})\/video\/(\d{1,20})\/?$/;

function invalidUrl(message: string): never {
  throw new AcquisitionError('INVALID_URL', message);
}

/**
 * Validate + normalize a public TikTok video URL to canonical identity.
 * Rejects: non-https, non-TikTok hosts, profile/photo/embed/live routes,
 * and short links (vm.tiktok.com, /t/) — unresolvable offline, not canonicalizable.
 * Handle is lowercased; query/fragment stripped for determinism.
 */
export function normalizeTikTokUrl(raw: string): CanonicalIdentity {
  if (typeof raw !== 'string' || raw.trim() === '') {
    invalidUrl('URL is empty');
  }
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    invalidUrl(`Not a URL: ${raw}`);
  }
  if (url.protocol !== 'https:') {
    invalidUrl('Only https TikTok URLs are accepted');
  }
  if (!TIKTOK_HOSTS[url.hostname.toLowerCase()]) {
    invalidUrl('Not a public TikTok host');
  }
  const match = url.pathname.match(TIKTOK_VIDEO_PATH);
  if (!match) {
    invalidUrl('Not a public TikTok video URL (profile, photo, embed, live, and short links are rejected)');
  }
  const handle = match[1].toLowerCase();
  const externalId = match[2];
  return {
    platform: 'TIKTOK',
    externalId,
    permalink: `https://www.tiktok.com/@${handle}/video/${externalId}`,
  };
}

/** Deterministic identity key: normalized permalink + numeric external ID. */
export function canonicalIdentityKey(identity: CanonicalIdentity): string {
  return `${identity.permalink}#${identity.externalId}`;
}

/**
 * Deterministic default content id from identity. Pure — no DB client.
 * Real DB ContentIds are mapped via a pre-seeded ingestion ledger.
 */
export function canonicalContentId(identity: CanonicalIdentity): string {
  return `content_tiktok_${identity.externalId}`;
}
