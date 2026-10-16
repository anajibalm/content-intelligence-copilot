"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Hypothesis } from './hypothesis-panel';
import { HypothesisReviewControls } from './review-panel';
import { S10Panel } from './s10-panel';
import { KeyValueView } from './key-value-view';
import { labelId } from '../lib/workspace/labels-id.ts';
import { classifyHypothesisNote, comparisonChecklist, formatDateTimeId, formatMetricId, groupHypotheses, parseSnapshotStatement, presentStatement, snapshotTimeDelta, statementSegments, summarizeStatement, type QueueHypothesis } from '../lib/hypothesis/presentation.ts';

type QueueItem = QueueHypothesis & { comparisons?: Array<{ comparison_id: string; role: string }> };
type ContentSummary = { id: string; title: string | null; externalId: string; snapshots?: Array<{ id: string; distribution: string; capturedAt?: string; source?: string | null; rawMetrics: Record<string, number | null>; derivedMetrics?: { engagement_rate?: { value: number | null } }; qualityByMetric?: Record<string, { state: string; reason: string | null }> }> };
type Evidence = { id: string; layer: string; statement: string; source_type: string; source_id: string; content_id: string; role: string; link: string | null; basis?: Record<string, unknown>; captured_at?: string | null; currentSource?: { aiValue: string | null; reviewedValue: string | null; reviewState: string | null } | null };
type HypothesisDetailData = Hypothesis & { state: string; comparisons: Array<{ comparison_id: string; role: string }>; provider: string | null; model: string | null; promptVersion: string | null; schemaVersion: string | null; ruleVersion: string | null; inputHash: string | null; rawOutput: Record<string, unknown> };

function contentLabel(ids: string[], contents: ContentSummary[]) {
  const labels = ids.map((id) => { const content = contents.find((item) => item.id === id); return content ? content.title ?? `TikTok ${content.externalId.slice(0, 8)}` : `TikTok ${id.slice(0, 8)}`; });
  return labels.length ? labels.join(' + ') : 'Konten tidak terhubung';
}

function snapshotEvidence(group: { rows: Evidence[] }) {
  const basis = (group.rows.find((item) => item.basis)?.basis ?? {}) as Record<string, unknown>;
  const observed = group.rows.find((item) => item.layer === 'OBSERVED');
  const derived = group.rows.find((item) => item.layer === 'DERIVED');
  const observedStatement = parseSnapshotStatement(observed?.basis?.statement);
  const derivedStatement = parseSnapshotStatement(derived?.basis?.statement);
  const raw = observedStatement?.rawMetrics ?? basis.rawObservations ?? {};
  const derivedMetrics = derivedStatement ?? {};
  const qualitySource = observedStatement?.qualityByMetric ?? basis.qualityJson ?? {};
  const qualities = qualitySource && typeof qualitySource === 'object' ? qualitySource as Record<string, { state?: string; reason?: string | null }> : {};
  return { basis, observed, derived, raw: raw && typeof raw === 'object' ? raw as Record<string, { value?: number | null } | number | null> : {}, derivedMetrics: derivedMetrics && typeof derivedMetrics === 'object' ? derivedMetrics as Record<string, { value?: number | null }> : {}, qualities };
}

function snapshotValue(group: { rows: Evidence[] }, metric: string) {
  const snapshot = snapshotEvidence(group);
  const derived = metric === 'engagement_rate';
  const entry = derived ? snapshot.derivedMetrics[metric] : snapshot.raw[metric];
  const value = entry && typeof entry === 'object' ? entry.value : entry;
  return { value: typeof value === 'number' ? value : null, quality: snapshot.qualities[metric], layer: derived ? 'DERIVED' : 'OBSERVED' };
}
function QueueClaim({ statement, contentIds, contents }: { statement: string; contentIds: string[]; contents: ContentSummary[] }) {
  const names = new Map<string, string>();
  for (const id of contentIds) {
    const content = contents.find((item) => item.id === id);
    if (content) names.set(id, content.title ?? `TikTok ${content.externalId.slice(0, 8)}`);
  }
  const presentation = presentStatement(summarizeStatement(statement), names);
  return <>{presentation.segments.map((segment, index) => <span key={`${index}-${segment.text}`}>{segment.text}</span>)}{presentation.unknown.length > 0 && <span className="unknown-id-warning" aria-label={`ID tidak dikenal: ${presentation.unknown.join(', ')}`}> ⚠ ID tidak dikenal</span>}</>;
}

function HypothesisDetail({ batchId, hypothesisId, contents, onReviewed, onBack }: { batchId: string; hypothesisId: string; contents: ContentSummary[]; onReviewed: () => void; onBack: () => void }) {
  const [result, setResult] = useState<HypothesisDetailData | null>(null);
  const [comparison, setComparison] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/hypotheses?batchId=${encodeURIComponent(batchId)}&hypothesisId=${encodeURIComponent(hypothesisId)}`, { signal: controller.signal }).then(async (response) => {
      const body = await response.json() as HypothesisDetailData & { error?: string };
      if (controller.signal.aborted) return;
      if (!response.ok) throw new Error(body.error ?? 'Detail hipotesis gagal dimuat');
      if (body.batchId !== batchId || body.id !== hypothesisId) throw new Error('Hipotesis tidak sesuai batch terpilih');
      setResult(body);
      const origin = body.comparisons.find((item) => item.role === 'ORIGIN');
      if (origin) {
        const comparisonResponse = await fetch(`/api/comparisons?comparisonId=${encodeURIComponent(origin.comparison_id)}`, { signal: controller.signal });
        const comparisonBody = await comparisonResponse.json() as Record<string, unknown> & { error?: string };
        if (!controller.signal.aborted && comparisonResponse.ok) setComparison({ ...comparisonBody, roles: body.comparisons.map((item) => item.role) });
      }
    }).catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Detail hipotesis gagal dimuat'); });
    return () => controller.abort();
  }, [batchId, hypothesisId, version]);
  const contentNames = useMemo(() => new Map(contents.map((content) => [content.id, content.title ?? `TikTok ${content.externalId.slice(0, 8)}`])), [contents]);
  const [copyMessage, setCopyMessage] = useState('');
  const evidence = result?.evidence as Evidence[] | undefined;
  const byContent = new Map<string, Evidence[]>();
  for (const item of evidence ?? []) { const group = byContent.get(item.content_id) ?? []; group.push(item); byContent.set(item.content_id, group); }
  const snapshotGroups = [...byContent].flatMap(([contentId, items]) => [...new Map(items.filter((item) => item.source_type === 'METRIC_SNAPSHOT').map((item) => [String(item.basis?.sourceSnapshotId ?? item.source_id), items.filter((candidate) => candidate.source_type === 'METRIC_SNAPSHOT' && String(candidate.basis?.sourceSnapshotId ?? candidate.source_id) === String(item.basis?.sourceSnapshotId ?? item.source_id))])).entries()].map(([snapshotId, rows]) => ({ contentId, snapshotId, content: contents.find((item) => item.id === contentId), rows })));
  const snapshots = [...new Map(snapshotGroups.map((group) => [group.snapshotId, group])).values()];
  const metricNames: Record<string, string> = { views: 'Tayangan', likes: 'Suka', saves: 'Simpan', shares: 'Bagikan', comments: 'Komentar', engagement_rate: 'Engagement rate' };
  const originTimes = [...(evidence ?? []).filter((item) => item.source_type === 'METRIC_SNAPSHOT' && item.basis?.sourceSnapshotId).reduce((map, item) => map.set(String(item.basis?.sourceSnapshotId), typeof item.basis?.capturedAt === 'string' ? item.basis.capturedAt : null), new Map<string, string | null>())];
  const timeDelta = snapshotTimeDelta(originTimes.map(([, value]) => value));
  const metricRows = Object.keys(metricNames);
  const statement = result ? statementSegments(result.statement) : null;
  const presentation = result && statement ? presentStatement(statement.statement, contentNames) : null;
  const checklist = comparison ? comparisonChecklist(comparison, byContent.size) : null;
  return <section className="hypothesis-detail" aria-label="Detail hipotesis" data-hypothesis-id={hypothesisId}>
    <button className="secondary review-back" type="button" onClick={onBack}>Kembali ke antrean</button>
    {error ? <div role="alert"><p className="error-state">{error}</p><button className="secondary" type="button" onClick={() => { setError(null); setVersion((value) => value + 1); }}>Coba lagi detail</button></div> : !result ? <p role="status">Memuat detail hipotesis…</p> : <>
      <div className="hypothesis-claim"><p className="eyebrow">Klaim asli, tanpa perubahan</p>{presentation && <p className="statement-presentation">{statement?.layer && <span className="ontology-chip">{labelId(statement.layer)}</span>}{presentation.segments.map((segment, index) => <span key={`${index}-${segment.text}`}>{segment.text}</span>)}</p>}{presentation && presentation.unknown.length > 0 && <p className="unknown-id-warning" role="status">⚠ ID tidak dikenal, verifikasi di Detail teknis: {[...new Set(presentation.unknown)].join(', ')}</p>}<p className="hypothesis-confidence">Confidence {labelId(result.confidence)}</p><p className="muted">Confidence ditetapkan engine dari bukti dan batas yang berlaku; kualitas perbandingan ditampilkan terpisah.</p></div>
      <section className="hypothesis-evidence" aria-labelledby="evidence-heading"><h3 id="evidence-heading">Bukti terhubung</h3>{snapshots.length === 0 ? <p className="muted">Snapshot metrik tidak dirujuk sebagai bukti hipotesis.</p> : <table className="snapshot-table"><thead><tr><th scope="col">Metrik</th>{snapshots.map((group) => <th scope="col" key={group.snapshotId}>{contentNames.get(group.contentId) ?? `TikTok ${group.contentId.slice(0, 8)}`}</th>)}</tr></thead><tbody>{metricRows.map((metric) => <tr key={metric}><th scope="row">{metricNames[metric]}</th>{snapshots.map((group) => { const result = snapshotValue(group, metric); const state = result.quality?.state ?? (result.value === null ? 'UNAVAILABLE' : 'VALID'); const label = contentNames.get(group.contentId) ?? `TikTok ${group.contentId.slice(0, 8)}`; return <td key={group.snapshotId} data-label={label}>{result.value === null ? 'Belum tersedia' : formatMetricId(result.value, metric)} <span className="ontology-chip">{labelId(result.layer)}</span>{state !== 'VALID' && state !== 'UNAVAILABLE' && <span>{labelId(state)}{result.quality?.reason ? ` · ${labelId(result.quality.reason)}` : ''}</span>}</td>; })}</tr>)}{snapshots.length === 2 && (() => { const [left, right] = snapshots.map((group) => snapshotValue(group, 'engagement_rate')); return left.value !== null && right.value !== null && left.quality?.state === 'VALID' && right.quality?.state === 'VALID' ? <tr><th scope="row">Selisih engagement rate</th><td colSpan={2} data-label="Delta dari snapshot beku">{formatMetricId(Math.abs(left.value - right.value) * 100, 'views')} poin persentase · dihitung dari nilai snapshot sebelum pembulatan</td></tr> : null; })()}<tr><th scope="row">Sumber & waktu</th>{snapshots.map((group) => { const { basis, observed, derived } = snapshotEvidence(group); const source = String(basis.source ?? 'Sumber tidak tersedia'); const label = contentNames.get(group.contentId) ?? `TikTok ${group.contentId.slice(0, 8)}`; return <td key={group.snapshotId} data-label={label}>TikTok · {labelId(String(basis.distribution ?? 'Distribusi tidak tersedia'))} · {formatDateTimeId(typeof basis.capturedAt === 'string' ? basis.capturedAt : null)} {/(?:demo|unverified|asumsi|belum diverifikasi)/i.test(source) && <strong className="source-warning">Belum diverifikasi</strong>}<br />{[observed, derived].filter((item) => item?.link).map((item) => <a className="source-link" href={item!.link!} key={item!.id}>Buka {labelId(item!.layer)} exact</a>)}</td>; })}</tr></tbody></table>}{timeDelta !== null && timeDelta > 3_600_000 && <p className="snapshot-time-warning">Selisih waktu snapshot lebih dari 1 jam: {formatMetricId(timeDelta / 3_600_000, 'awt_seconds').replace(' dtk', ' jam')}</p>}{(evidence ?? []).some((item) => item.source_type !== 'METRIC_SNAPSHOT') && <details className="evidence-features"><summary>Ekstraksi AI · {(evidence ?? []).filter((item) => item.source_type !== 'METRIC_SNAPSHOT').length} bukti</summary>{(evidence ?? []).filter((item) => item.source_type !== 'METRIC_SNAPSHOT').map((item) => <article className="evidence-source" key={item.id}><strong>{labelId(item.layer)} · {contentNames.get(item.content_id) ?? 'Konten tidak dikenal'} · {labelId(item.role)}</strong><p>{statementSegments(item.statement).statement}</p>{item.currentSource && <p>Nilai sumber saat ini: AI {item.currentSource.aiValue ?? 'Belum tersedia'}; hasil review {item.currentSource.reviewedValue ?? 'Belum tersedia'} ({labelId(item.currentSource.reviewState ?? 'UNAVAILABLE')}). Evidence tersimpan tetap menjadi basis hipotesis.</p>}{item.link && <a href={item.link}>Buka sumber exact</a>}<details><summary>Basis bukti</summary><KeyValueView value={item.basis ?? item} /></details></article>)}</details>}</section>
      {checklist && <section className="comparison-checks"><h3>Kriteria perbandingan</h3><ul>{checklist.checks.map((item) => <li key={item.label}><strong>{item.label}:</strong> {item.value}</li>)}</ul>{checklist.reasons.length > 0 && <details><summary>Alasan engine</summary><ul>{checklist.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></details>}</section>}
      <details className="hypothesis-technical"><summary>Detail teknis</summary><p className="preserve-text">{result.statement}</p><KeyValueView value={{ id: result.id, batchId: result.batchId, state: result.state, confidence: result.confidence, confidenceCaps: result.confidenceCaps, comparisons: result.comparisons, provider: result.provider, model: result.model, promptVersion: result.promptVersion, schemaVersion: result.schemaVersion, ruleVersion: result.ruleVersion, inputHash: result.inputHash, rawOutput: result.rawOutput, evidence }} /><button className="secondary" type="button" onClick={async () => { try { await navigator.clipboard.writeText(JSON.stringify({ id: result.id, statement: result.statement, evidence }, null, 2)); setCopyMessage('Detail tersalin'); } catch { setCopyMessage('Gagal menyalin detail'); } }}>{copyMessage === 'Detail tersalin' ? 'Detail tersalin' : 'Salin detail teknis'}</button><p role="status">{copyMessage}</p></details>
      <details className="s10-disclosure"><summary>Catatan dan rencana uji</summary><p className="muted">ⓘ Catatan memberi konteks manusia; status rencana bukan hasil hipotesis.</p><S10Panel hypothesisId={result.id} targetBatchId={result.batchId} /></details>
      <div className="decision-region"><HypothesisReviewControls key={result.id} hypothesisId={result.id} onReviewed={onReviewed} /></div>
    </>}
  </section>;
}

export default function HypothesisQueue({ batchId, hypothesisId, onSelect, revision, contents }: { batchId: string; hypothesisId: string | null; onSelect: (id: string) => void; revision: number; contents: ContentSummary[] }) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [all, setAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const detailOpen = Boolean(hypothesisId);
  const queueRef = useRef<HTMLElement>(null);
  const router = useRouter();
  function refreshQueue() { setLoading(true); setError(null); setVersion((value) => value + 1); }
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/hypotheses?batchId=${encodeURIComponent(batchId)}`, { signal: controller.signal }).then(async (response) => {
      const body = await response.json() as { items?: QueueItem[]; error?: string };
      if (controller.signal.aborted) return;
      if (!response.ok) throw new Error(body.error ?? 'Antrean review gagal dimuat');
      if (!Array.isArray(body.items) || body.items.some((item) => item.batchId !== batchId)) throw new Error('Antrean tidak sesuai batch terpilih');
      const source = body.items;
      const enriched = new Array<QueueItem>(source.length);
      let index = 0;
      await Promise.all(Array.from({ length: Math.min(3, source.length) }, async () => {
        while (index < source.length && !controller.signal.aborted) {
          const current = index++;
          const item = source[current];
          const detailResponse = await fetch(`/api/hypotheses?batchId=${encodeURIComponent(batchId)}&hypothesisId=${encodeURIComponent(item.id)}`, { signal: controller.signal });
          const detail = await detailResponse.json() as HypothesisDetailData & { error?: string };
          if (!detailResponse.ok || detail.batchId !== batchId || detail.id !== item.id) throw new Error(detail.error ?? 'Data kelompok hipotesis tidak sesuai');
          enriched[current] = { ...item, contentIds: [...new Set((detail.evidence as Evidence[]).map((entry) => entry.content_id).filter(Boolean))], evidenceCount: detail.evidence.length, comparisons: detail.comparisons };
        }
      }));
      if (!controller.signal.aborted) { setItems(enriched); setError(null); }
    }).catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Antrean review gagal dimuat'); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [batchId, version, revision]);
  const visible = items.filter((item) => all || !item.reviewDecision);
  const groups = groupHypotheses(visible);
  const pendingCount = items.filter((item) => !item.reviewDecision).length;
  const completedCount = items.length - pendingCount;
  function backToQueue() {
    const url = new URL(window.location.href);
    url.searchParams.delete('hypothesisId');
    url.searchParams.set('view', 'review');
    window.history.pushState({}, '', url);
    router.refresh();
    window.dispatchEvent(new PopStateEvent('popstate'));
    queueRef.current?.focus();
  }
  return <div className={`review-workspace${detailOpen ? ' review-detail-open' : ''}`}>
    <section className="review-queue" aria-label="Antrean hipotesis" tabIndex={-1} ref={queueRef}><h2>Antrean hipotesis</h2><p className="queue-progress">{completedCount} dari {items.length} hipotesis sudah direview · {pendingCount} menunggu review</p><div className="queue-filters"><button className="secondary" type="button" aria-pressed={!all} onClick={() => setAll(false)}>Menunggu review ({pendingCount})</button><button className="secondary" type="button" aria-pressed={all} onClick={() => setAll(true)}>Semua ({items.length})</button></div>
      {loading ? <p role="status">Memuat antrean review…</p> : error ? <div role="alert"><p className="error-state">{error}</p><button className="secondary" type="button" onClick={refreshQueue}>Coba lagi</button></div> : groups.length === 0 ? <p className="empty-state">{all ? 'Belum ada hipotesis tersimpan pada batch ini. Buat dari Compare.' : 'Tidak ada hipotesis menunggu review. Pilih Semua untuk membuka hasil review tersimpan.'}</p> : <ul>{groups.map((group) => {
        const item = group.representative;
        const note = classifyHypothesisNote(item.reviewedStatement ?? item.statement);
        const title = contentLabel(item.contentIds, contents);
        return <li key={group.key} className={note ? 'queue-note-item' : ''}><button className="queue-choice secondary" type="button" aria-pressed={item.id === hypothesisId} onClick={() => onSelect(item.id)}><strong>{note ? 'Catatan batasan' : <QueueClaim statement={item.reviewedStatement ?? item.statement} contentIds={item.contentIds} contents={contents} />}</strong><span>{title} · {labelId(item.confidence)} · {group.hypothesisCount === 1 ? '1 hipotesis' : `${group.hypothesisCount} hipotesis`} · {item.evidenceCount} bukti · {item.reviewDecision ? labelId(item.reviewDecision) : 'Menunggu review'}</span></button>{group.variants.length > 0 && <><button className="queue-variants-toggle secondary" type="button" aria-expanded={expandedGroups.includes(group.key)} onClick={() => setExpandedGroups((current) => current.includes(group.key) ? current.filter((key) => key !== group.key) : [...current, group.key])}>+{group.variants.length} varian</button>{expandedGroups.includes(group.key) && <ul className="queue-variants">{group.variants.map((variant) => <li key={variant.id}><button className="queue-variant secondary" type="button" aria-pressed={variant.id === hypothesisId} onClick={() => onSelect(variant.id)}><strong><QueueClaim statement={variant.reviewedStatement ?? variant.statement} contentIds={variant.contentIds} contents={contents} /></strong><span>{labelId(variant.confidence)} · {variant.evidenceCount} bukti · {variant.reviewDecision ? labelId(variant.reviewDecision) : 'Menunggu review'}</span></button></li>)}</ul>}</>}</li>;
      })}</ul>}
    </section>
    <div className="review-detail-pane">{!hypothesisId ? <p className="empty-state">Pilih satu hipotesis untuk melihat klaim, bukti, keputusan, catatan, dan rencana uji.</p> : <HypothesisDetail key={`${batchId}:${hypothesisId}`} batchId={batchId} hypothesisId={hypothesisId} contents={contents} onReviewed={refreshQueue} onBack={backToQueue} />}</div>
  </div>;
}
