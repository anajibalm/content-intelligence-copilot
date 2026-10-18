export type QueueHypothesis = { id: string; batchId: string; statement: string; confidence: string; reviewDecision: string | null; reviewedStatement: string | null; reviewedAt?: string | null; createdAt: string; contentIds: string[]; evidenceCount: number };
export function engagementCalculation(raw: Record<string, number | null>, qualities: Record<string, { state?: string }>, derivedValue: number | null, formulaVersion: unknown) {
  const inputs = ['likes', 'comments', 'shares', 'saves', 'views'] as const;
  if (formulaVersion !== 'metrics-v2' || inputs.some((key) => qualities[key]?.state !== 'VALID' || typeof raw[key] !== 'number') || raw.views! <= 0) return null;
  const interactions = raw.likes! + raw.comments! + raw.shares! + raw.saves!;
  const value = interactions / raw.views!;
  return value === derivedValue ? { interactions, views: raw.views!, value } : null;
}

export function groupFeatureEvidence<T extends { content_id: string; source_id: string; statement?: string; basis?: Record<string, unknown> }>(items: T[]) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const statementField = /^EXTRACTED\s+([^:]+):/i.exec(item.statement ?? '')?.[1]?.trim();
    const fieldName = typeof item.basis?.fieldName === 'string' ? item.basis.fieldName : statementField ?? item.source_id;
    const key = `${item.content_id}:${fieldName}`;
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return [...groups.values()];
}

export type QueueGroup = { key: string; contentIds: string[]; representative: QueueHypothesis; variants: QueueHypothesis[]; hypothesisCount: number };

const UUID_LIKE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f-]{3,5}-[0-9a-f-]{8,14}/gi
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DISCLAIMER = /\b(?:tidak|belum|tanpa|bukan|perlu|butuh|catatan|keterbatasan|belum dapat|belum bisa|tidak dapat|tidak bisa|tidak cukup|belum cukup|tidak membuktikan|belum membuktikan|bukan bukti|tidak mendukung|belum mendukung|tidak tersedia|belum tersedia)\b/i;
const ASSERTION = /\b(?:lebih tinggi|lebih rendah|selisih|meningkat|menurun|unggul|kalah|berbeda|dibanding|versus|vs\.?|\d+(?:[,.]\d+)?\s*(?:%|poin|kali|x))\b/i;
const TIME = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const PERCENT = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const NUMBER = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });
const CONFIDENCE_CAP_SUMMARIES: Record<string, string> = {
  INSUFFICIENT_SAMPLE: 'Sampel kurang',
  ONE_COMPARISON: 'Satu perbandingan',
  LEGACY_ONLY: 'Bukti lama',
  COMPARISON_QUALITY: 'Kualitas perbandingan',
  SUSPECT_PRIMARY_METRIC: 'Metrik perlu diperiksa',
  UNAVAILABLE_PERFORMANCE: 'Bukti performa belum tersedia',
  UNREVIEWED_EXTRACTED: 'Ekstraksi belum direview',
};

export function confidenceCapSummary(caps: Array<{ rule: string }>) {
  if (!caps.length) return 'Batas confidence berlaku';
  const first = CONFIDENCE_CAP_SUMMARIES[caps[0]!.rule] ?? 'Batas confidence berlaku';
  return caps.length === 1 ? first : `${first} · +${caps.length - 1} batas`;
}

export function summarizeStatement(statement: string, max = 105) {
  const sentence = statement.replace(/^\s*(?:OBSERVED|DERIVED|EXTRACTED|INFERRED)\s*:\s*/i, '').trim().split(/(?<=[.!?])\s+/u)[0]?.trim() ?? '';
  return sentence.length <= max ? sentence : `${sentence.slice(0, max - 1).trimEnd()}…`;
}

export type StatementSegment = { layer: string | null; text: string };

export function statementSegments(statement: string) {
  const pattern = /\b(OBSERVED|DERIVED|EXTRACTED|INFERRED)\s*:\s*/gi;
  const matches = [...statement.matchAll(pattern)];
  if (!matches.length) return { layer: null, statement, segments: [{ layer: null, text: statement }] as StatementSegment[] };
  const segments: StatementSegment[] = [];
  let offset = 0;
  for (const [index, match] of matches.entries()) {
    const start = match.index ?? 0;
    if (start > offset) segments.push({ layer: null, text: statement.slice(offset, start) });
    const textStart = start + match[0].length;
    const end = matches[index + 1]?.index ?? statement.length;
    segments.push({ layer: match[1].toUpperCase(), text: statement.slice(textStart, end) });
    offset = end;
  }
  return { layer: segments.find((segment) => segment.layer)?.layer ?? null, statement, segments };
}
export function parseSnapshotStatement(statement: unknown) {
  if (typeof statement !== 'string') return null;
  const start = statement.indexOf('{');
  if (start < 0) return null;
  try {
    const value = JSON.parse(statement.slice(start)) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
}

export function snapshotTimeDelta(values: Array<string | null | undefined>) {
  const times = values.map((value) => value ? Date.parse(value) : Number.NaN);
  if (times.length < 2 || times.some((value) => !Number.isFinite(value))) return null;
  return Math.max(...times) - Math.min(...times);
}

export function groupHypotheses(items: QueueHypothesis[]): QueueGroup[] {
  const buckets = new Map<string, QueueHypothesis[]>();
  for (const item of items) {
    const contentIds = [...new Set(item.contentIds)].sort();
    const key = contentIds.join('|') || `unlinked:${item.id}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push({ ...item, contentIds });
    buckets.set(key, bucket);
  }
  return [...buckets].map(([key, members]) => {
    members.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    const representative = members[0];
    return { key, contentIds: representative.contentIds, representative, variants: members.slice(1), hypothesisCount: members.length };
  }).sort((a, b) => (a.contentIds[0] ?? '').localeCompare(b.contentIds[0] ?? '') || a.representative.id.localeCompare(b.representative.id));
}

export function classifyHypothesisNote(statement: string) {
  const text = statement.trim();
  if (!text || ASSERTION.test(text)) return false;
  return DISCLAIMER.test(text);
}

export function formatMetricId(value: number | null | undefined, metric: string) {
  if (value == null || !Number.isFinite(value)) return 'Belum tersedia';
  if (metric === 'engagement_rate' || metric === 'wfv_pct') return `${PERCENT.format(value * 100)}%`;
  if (metric === 'awt_seconds') return `${NUMBER.format(value)} dtk`;
  return NUMBER.format(value);
}

export function formatDateTimeId(value: string | null | undefined) {
  if (!value) return 'Waktu tidak tersedia';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Waktu tidak tersedia' : `${TIME.format(date).replace('.', '.')} WIB`;
}

export function presentStatement(statement: string, contentNames: Map<string, string>) {
  const segments: Array<{ text: string }> = [];
  const unknown: string[] = [];
  let offset = 0;
  for (const match of statement.matchAll(UUID_LIKE)) {
    const raw = match[0];
    const start = match.index ?? 0;
    if (start > offset) segments.push({ text: statement.slice(offset, start) });
    const token = raw.replace(/[.,;:!?]+$/u, '');
    if (UUID.test(token) && contentNames.has(token)) segments.push({ text: `${contentNames.get(token)!}${raw.slice(token.length)}` });
    else { unknown.push(raw); segments.push({ text: `ID tidak dikenal [${raw}]` });}
    offset = start + raw.length;
  }
  if (offset < statement.length) segments.push({ text: statement.slice(offset) });
  return { original: statement, segments, unknown };
}

export function comparisonChecklist(comparison: Record<string, unknown>, evidenceContentCount: number) {
  const controls = comparison.controlledVariables && typeof comparison.controlledVariables === 'object' ? comparison.controlledVariables as Record<string, unknown> : {};
  const items = Array.isArray(comparison.items) ? comparison.items as Array<{ contentId?: string }> : [];
  const sample = new Set(items.map((item) => item.contentId).filter((id): id is string => typeof id === 'string')).size || evidenceContentCount;
  const reasons = Array.isArray(comparison.qualityReasons) ? comparison.qualityReasons.filter((item): item is string => typeof item === 'string') : [];
  const threshold = reasons.find((reason) => /sample size/i.test(reason))?.match(/threshold\s*(?:of\s*)?(\d+)/i)?.[1];
  const min = threshold ? Number(threshold) : null;
  const checks: Array<{ label: string; value: string }> = [];
  if (comparison.metric) checks.push({ label: 'Metrik', value: formatMetricId(typeof comparison.metric === 'number' ? comparison.metric : null, String(comparison.metric)) });
  if (comparison.basis) checks.push({ label: 'Basis', value: String(comparison.basis) });
  if (comparison.direction) checks.push({ label: 'Arah', value: String(comparison.direction) });
  if (comparison.tiePolicy) checks.push({ label: 'Aturan seri', value: String(comparison.tiePolicy) });
  checks.push({ label: 'Sampel', value: `${sample} konten${min !== null && sample < min ? ` (minimum ${min})` : ''}` });
  for (const [key, label] of [['same_pillar', 'Pilar'], ['same_format', 'Format'], ['same_talent_class', 'Kelas talent'], ['duration_match', 'Durasi'], ['content_age_match', 'Umur konten'], ['distribution_match', 'Distribusi'], ['sample_eligibility', 'Kelayakan sampel'], ['metric_quality', 'Kualitas metrik'], ['feature_review_state', 'Status review']] as const) {
    if (!(key in controls)) continue;
    const value = controls[key];
    const status = value === true ? 'sesuai' : value === false ? 'berbeda' : value === 'VALID' || value === 'REVIEWED' ? 'sesuai' : value === 'LOW' ? 'rendah' : value === 'UNAVAILABLE' ? 'belum tersedia' : value === 'UNREVIEWED' ? 'belum direview' : value === null ? 'tidak diketahui' : 'belum tersedia';
    checks.push({ label, value: status });
  }
  for (const reason of reasons.filter((item) => !/^(sample size|same_|duration|content age|requested |missing, rejected|metric quality|performance contrast)/i.test(item))) checks.push({ label: 'Catatan engine', value: reason });
  const roles = Array.isArray(comparison.roles) ? comparison.roles as string[] : [];
  if (roles.includes('ORIGIN')) checks.push({ label: 'Peran', value: 'Perbandingan asal hipotesis' });
  return { checks, reasons };
}
