import { createHash } from 'node:crypto';

const METRIC_FIELDS = { views: 'view_count', likes: 'like_count', comments: 'comment_count', shares: 'repost_count', saves: 'save_count' } as const;
const YT_DLP_RELEASE = '594bd50c2c78ac432f81600d309fdc4e0a92d82c';

type AcquisitionReceipt = {
  id: string;
  provider: string;
  status: string;
  createdAt: string;
  rawPayload: Record<string, unknown>;
};

export function actualTikTokReceiptSnapshot(receipt: AcquisitionReceipt, contentId: string) {
  const version = receipt.rawPayload._version as Record<string, unknown> | undefined;
  if (receipt.provider !== 'yt-dlp' || receipt.status !== 'SUCCEEDED' || receipt.rawPayload.extractor !== 'TikTok' || receipt.rawPayload.extractor_key !== 'TikTok' || version?.version !== '2026.08.19' || version.release_git_head !== YT_DLP_RELEASE) throw new Error('receipt is not a verified TikTok yt-dlp capture');
  if (!receipt.id || !contentId || !Number.isFinite(Date.parse(receipt.createdAt))) throw new Error('receipt identity, content ID, and capture timestamp are required');
  const rawMetrics = Object.fromEntries(Object.entries(METRIC_FIELDS).map(([name, field]) => {
    const value = receipt.rawPayload[field];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(`verified receipt is missing valid ${field}`);
    return [name, { value, quality: 'VALID' }];
  }));
  const source = `yt-dlp:TikTok@2026.08.19#${receipt.id};distribution=ORGANIC (demo assumption; unverified)`;
  const id = createHash('sha256').update(`${contentId}:${receipt.id}`).digest('hex').slice(0, 32).replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
  return { id, contentId, distribution: 'ORGANIC' as const, capturedAt: receipt.createdAt, source, rawMetrics, quality: 'VALID' as const };
}
