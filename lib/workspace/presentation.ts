export interface RankingPresentationItem {
  contentId: string;
  value: number;
  snapshotId?: string;
  basis: { metric: string; label: string; [key: string]: unknown };
}
export interface RankingPresentationGroup {
  basis: string;
  direction: string;
  items: RankingPresentationItem[];
}

export function rankingExtremes(group: RankingPresentationGroup) {
  const ordered = [...group.items].sort((left, right) => left.value - right.value || left.contentId.localeCompare(right.contentId));
  const lowestValue = ordered[0]?.value ?? null;
  const highestValue = ordered.at(-1)?.value ?? null;
  const lowest = ordered.filter((item) => item.value === lowestValue);
  const highest = ordered.filter((item) => item.value === highestValue);
  const bestIsHighest = String(group.direction).toUpperCase() !== 'ASC';
  return {
    best: { value: bestIsHighest ? highestValue : lowestValue, items: bestIsHighest ? highest : lowest },
    lowest: { value: bestIsHighest ? lowestValue : highestValue, items: bestIsHighest ? lowest : highest },
  };
}

export function selectionRequestKey(batchId: string | null, contentId: string | null, requestVersion: number) {
  return `${batchId ?? ''}:${contentId ?? ''}:${requestVersion}`;
}
