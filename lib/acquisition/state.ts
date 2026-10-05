// Pure acquisition state: ingestion ledger + attempt history. No DB client.
import type { ContentId } from '../domain/types.ts';
import type { AcquisitionAttempt, CanonicalIdentity } from './types.ts';
import { canonicalContentId, canonicalIdentityKey } from './normalize.ts';

/** Deterministic ledger: canonical identity key → content id. */
export interface IngestionLedger {
  readonly byKey: Readonly<Record<string, ContentId>>;
}

export interface IngestionResolution {
  contentId: ContentId;
  isRepeat: boolean;
  createdContent: boolean;
}

export interface IngestionOutcome {
  ledger: IngestionLedger;
  resolution: IngestionResolution;
}

export function createLedger(
  entries: Iterable<readonly [string, ContentId]> = [],
): IngestionLedger {
  const byKey: Record<string, ContentId> = {};
  for (const [key, contentId] of entries) {
    byKey[key] = contentId;
  }
  return { byKey };
}

/**
 * Resolve repeat-ingestion semantics deterministically.
 * Same canonical identity → same content id; ledger records provenance only.
 * Duplicate URL never creates duplicate canonical content (plan S2 acceptance).
 */
export function resolveIngestion(
  ledger: IngestionLedger,
  identity: CanonicalIdentity,
): IngestionOutcome {
  const key = canonicalIdentityKey(identity);
  const existing = ledger.byKey[key];
  if (existing !== undefined) {
    return { ledger, resolution: { contentId: existing, isRepeat: true, createdContent: false } };
  }
  const contentId = canonicalContentId(identity);
  return {
    ledger: { byKey: { ...ledger.byKey, [key]: contentId } },
    resolution: { contentId, isRepeat: false, createdContent: true },
  };
}

/** Append-only attempt history (mirrors acquisition_run rows). */
export interface AttemptHistory {
  readonly attempts: readonly AcquisitionAttempt[];
}

export function emptyHistory(): AttemptHistory {
  return { attempts: [] };
}

export function recordAttempt(history: AttemptHistory, attempt: AcquisitionAttempt): AttemptHistory {
  return { attempts: [...history.attempts, attempt] };
}

export function nextAttemptNumber(history: AttemptHistory): number {
  return history.attempts.length + 1;
}

export function latestAttempt(history: AttemptHistory): AcquisitionAttempt | null {
  return history.attempts[history.attempts.length - 1] ?? null;
}
