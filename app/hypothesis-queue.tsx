"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Hypothesis } from './hypothesis-panel';
import { HypothesisReviewControls } from './review-panel';
import { S10Panel } from './s10-panel';
import { KeyValueView } from './key-value-view';
import { labelId } from '../lib/workspace/labels-id.ts';
import { classifyHypothesisNote, comparisonChecklist, confidenceCapSummary, engagementCalculation, formatDateTimeId, formatMetricId, groupFeatureEvidence, groupHypotheses, parseSnapshotStatement, presentStatement, snapshotTimeDelta, statementSegments, summarizeStatement, type QueueHypothesis } from '../lib/hypothesis/presentation.ts';
import { ClaimSummary } from './claim-summary';

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
  const derivedMetrics = (derivedStatement?.values ?? derivedStatement ?? {}) as Record<string, unknown>;
  const qualitySource = observedStatement?.qualityByMetric ?? basis.qualityJson ?? {};
  const qualities = qualitySource && typeof qualitySource === 'object' ? qualitySource as Record<string, { state?: string; reason?: string | null }> : {};
  return { basis, observed, derived, raw: raw && typeof raw === 'object' ? raw as Record<string, { value?: number | null } | number | null> : {}, derivedMetrics: derivedMetrics && typeof derivedMetrics === 'object' ? derivedMetrics as Record<string, { value?: number | null }> : {}, qualities };
}

function snapshotValue(group: { rows: Evidence[] }, metric: string) {
  const snapshot = snapshotEvidence(group);
  const derived = metric === 'engagement_rate';
  const entry = derived ? snapshot.derivedMetrics[metric] : snapshot.raw[metric];
  const value = entry && typeof entry === 'object' ? entry.value : entry;
  const quality = snapshot.qualities[metric];
  const formulaVersion = snapshot.basis.formulaVersion;
  const calculation = derived ? engagementCalculation(
    Object.fromEntries(Object.entries(snapshot.raw).map(([key, raw]) => [key, raw && typeof raw === 'object' ? raw.value ?? null : raw])) as Record<string, number | null>,
    snapshot.qualities,
    typeof value === 'number' ? value : null,
    formulaVersion,
  ) : null;
  return { value: typeof value === 'number' ? value : null, quality: quality && typeof quality.state === 'string' ? quality : null, layer: derived ? 'DERIVED' : 'OBSERVED', calculation, formulaVersion };
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
  const [showNullMetrics, setShowNullMetrics] = useState(false);
  const [activeDetailTab, setActiveDetailTab] = useState<'metrics' | 'extraction' | 'criteria' | 'technical'>('metrics');
  const byContent = new Map<string, Evidence[]>();
  for (const item of evidence ?? []) { const group = byContent.get(item.content_id) ?? []; group.push(item); byContent.set(item.content_id, group); }
  const snapshotGroups = [...byContent].flatMap(([contentId, items]) => [...new Map(items.filter((item) => item.source_type === 'METRIC_SNAPSHOT').map((item) => [String(item.basis?.sourceSnapshotId ?? item.source_id), items.filter((candidate) => candidate.source_type === 'METRIC_SNAPSHOT' && String(candidate.basis?.sourceSnapshotId ?? candidate.source_id) === String(item.basis?.sourceSnapshotId ?? item.source_id))])).entries()].map(([snapshotId, rows]) => ({ contentId, snapshotId: `${contentId}:${snapshotId}`, rows })));
  const snapshots = [...new Map(snapshotGroups.map((group) => [group.snapshotId, group])).values()];
  const metricNames: Record<string, string> = { views: 'Tayangan', likes: 'Suka', saves: 'Simpan', shares: 'Bagikan', comments: 'Komentar', engagement_rate: 'Engagement rate' };
  const metricRows = Object.keys(metricNames);
  const missingMetrics = snapshots.reduce((count, group) => count + metricRows.filter((metric) => snapshotValue(group, metric).value === null).length, 0);
  const visibleMetricRows = metricRows.filter((metric) => showNullMetrics || snapshots.some((group) => snapshotValue(group, metric).value !== null));
  const allMetricsValid = snapshots.length > 0 && snapshots.every((group) => metricRows.every((metric) => snapshotValue(group, metric).quality?.state === 'VALID'));
  const originTimes = [...(evidence ?? []).filter((item) => item.source_type === 'METRIC_SNAPSHOT' && item.basis?.sourceSnapshotId).reduce((map, item) => map.set(String(item.basis?.sourceSnapshotId), typeof item.basis?.capturedAt === 'string' ? item.basis.capturedAt : null), new Map<string, string | null>())];
  const timeDelta = snapshotTimeDelta(originTimes.map(([, value]) => value));
  const metricRates = snapshots.map((group) => snapshotValue(group, 'engagement_rate'));
  const metricDelta = metricRates.length === 2 && metricRates.every((metric) => metric.value !== null && metric.quality?.state === 'VALID') ? Math.abs(metricRates[0].value! - metricRates[1].value!) * 100 : null;
  const statement = result ? statementSegments(result.statement) : null;
  const presentationSegments = statement?.segments;
  const checklist = comparison ? comparisonChecklist(comparison, byContent.size) : null;
  const confidenceReasons = result?.confidenceCaps.flatMap((cap) => typeof cap.reason === 'string' && cap.reason.trim() ? [cap.reason] : []) ?? [];
  const engineReasons = [...new Set([...(checklist?.reasons ?? []), ...confidenceReasons])];
  return <section className="hypothesis-detail" aria-label="Detail hipotesis" data-hypothesis-id={hypothesisId}>
    <button className="secondary review-back" type="button" onClick={onBack}>Kembali ke antrean</button>
    {error ? <div role="alert"><p className="error-state">{error}</p><button className="secondary" type="button" onClick={() => { setError(null); setVersion((value) => value + 1); }}>Coba lagi detail</button></div> : !result ? <p role="status">Memuat detail hipotesis…</p> : <>
      <section className="hypothesis-claim" aria-label="Ringkasan klaim"><div className="claim-heading"><h2>Klaim</h2>{statement?.segments.length === 1 && statement.segments[0]?.layer && <span className="ontology-chip">{labelId(statement.segments[0].layer)}</span>}</div><div className="claim-status"><span className={`confidence-badge confidence-${result.confidence.toLowerCase()}`}>Confidence {labelId(result.confidence)}</span><span className="review-state-badge">{result.state === 'PENDING' ? 'Menunggu review' : labelId(result.state)}</span></div>{presentationSegments && <ClaimSummary segments={presentationSegments} contentNames={contentNames} hideLayerLabel={presentationSegments.length === 1} />}<p className="muted claim-reason" title={confidenceReasons.join('\n') || undefined}>Alasan confidence: {confidenceCapSummary(result.confidenceCaps)}</p></section>
      <div className="review-detail-tabs" role="tablist" aria-label="Bagian detail hipotesis">
        {[{ id: 'metrics', label: 'Metrik' }, { id: 'extraction', label: 'Ekstraksi AI' }, { id: 'criteria', label: 'Kriteria' }, { id: 'technical', label: 'Teknis' }].map((tab) => <button key={tab.id} id={`review-tab-${tab.id}`} role="tab" type="button" aria-selected={activeDetailTab === tab.id} aria-controls={`review-panel-${tab.id}`} tabIndex={activeDetailTab === tab.id ? 0 : -1} onClick={() => setActiveDetailTab(tab.id as typeof activeDetailTab)}>{tab.label}</button>)}
      </div>
      <section id="review-panel-metrics" hidden={activeDetailTab !== 'metrics'} className="hypothesis-evidence" aria-label="Bukti metrik">
        <h3 id="evidence-heading">Bukti terhubung</h3>
        {snapshots.length === 0 ? <p className="muted">Snapshot metrik tidak dirujuk sebagai bukti hipotesis.</p> : <>
          {allMetricsValid && <p className="muted">Semua metrik valid.</p>}
          {missingMetrics > 0 && <p className="muted missing-metrics-notice"><span>{missingMetrics} field kosong disembunyikan.</span> <button className="secondary" type="button" aria-expanded={showNullMetrics} onClick={() => setShowNullMetrics((current) => !current)}>{showNullMetrics ? 'Sembunyikan field kosong' : 'Lihat field kosong'}</button></p>}
          {timeDelta !== null && timeDelta > 3_600_000 && <p className="snapshot-time-warning">Selisih waktu snapshot lebih dari 1 jam: {formatMetricId(timeDelta / 3_600_000, 'awt_seconds').replace(' dtk', ' jam')}</p>}
          <table className="snapshot-table">
            <thead><tr><th scope="col">Metrik</th>{snapshots.map((group) => <th scope="col" key={group.snapshotId}>{contentNames.get(group.contentId) ?? `TikTok ${group.contentId.slice(0, 8)}`}</th>)}<th scope="col">Sumber</th></tr></thead>
            <tbody>
              {visibleMetricRows.map((metric) => <tr className="metric-data-row" key={metric}>
                <th scope="row"><span className="snapshot-metric-name">{metricNames[metric]}</span><span className="snapshot-mobile-values">{snapshots.map((group) => {
                  const metricValue = snapshotValue(group, metric);
                  const label = contentNames.get(group.contentId) ?? `TikTok ${group.contentId.slice(0, 8)}`;
                  const hideNull = metricValue.value === null && !showNullMetrics;
                  return <span key={group.snapshotId}>{label}: {hideNull ? null : metricValue.value === null ? '–' : formatMetricId(metricValue.value, metric)}</span>;
                })}</span></th>
                {snapshots.map((group) => {
                  const metricValue = snapshotValue(group, metric);
                  const label = contentNames.get(group.contentId) ?? `TikTok ${group.contentId.slice(0, 8)}`;
                  const hideNull = metricValue.value === null && !showNullMetrics;
                  return <td className="snapshot-value" key={group.snapshotId} data-label={label}>
                    {!hideNull && <>{metricValue.value === null ? '–' : formatMetricId(metricValue.value, metric)}{metricValue.quality?.state === 'VALID' && metricValue.value !== null ? null : <span>{labelId(metricValue.quality?.state ?? 'UNAVAILABLE')}{metricValue.quality?.reason ? ` · ${labelId(metricValue.quality.reason)}` : ''}</span>}{metric === 'engagement_rate' && metricValue.calculation && <p>Rumus metrics-v2: {metricValue.calculation.interactions} ÷ {metricValue.calculation.views} = {formatMetricId(metricValue.calculation.value, metric)}</p>}</>}
                  </td>;
                })}
                <td className="snapshot-metric-source" data-label="Sumber"><span className={`ontology-chip snapshot-source-${metric === 'engagement_rate' ? 'derived' : 'observed'}`}>{labelId(metric === 'engagement_rate' ? 'DERIVED' : 'OBSERVED')}</span></td>
              </tr>)}
              {metricDelta !== null && <tr><th scope="row">Selisih engagement rate</th><td colSpan={snapshots.length + 1} data-label="Delta dari snapshot beku">{formatMetricId(metricDelta, 'number')} poin persentase · dihitung dari nilai snapshot sebelum pembulatan</td></tr>}
            </tbody>
          </table>
          <section className="snapshot-sources" aria-label="Sumber snapshot">{snapshots.map((group) => {
            const { basis, observed, derived } = snapshotEvidence(group);
            const source = typeof basis.source === 'string' && basis.source.trim() ? basis.source : null;
            const capturedAt = typeof basis.capturedAt === 'string' ? basis.capturedAt : null;
            const label = contentNames.get(group.contentId);
            const links = [observed, derived].filter((item) => item?.link);
            if (!source && !capturedAt && links.length === 0) return null;
            return <article className="snapshot-source-card" key={group.snapshotId}>{label && <h4>{label}</h4>}<p><span className="source-details">{source && <span>{source}</span>}{capturedAt && <time className="source-time" dateTime={capturedAt}>· {formatDateTimeId(capturedAt)}</time>}</span>{source && /(?:demo|unverified|asumsi|belum diverifikasi)/i.test(source) && <strong className="source-warning">Belum diverifikasi</strong>}</p>{links.map((item) => <a className="source-link" href={item!.link!} key={item!.id}>Buka {labelId(item!.layer)} exact</a>)}</article>;
          })}</section>
        </>}
      </section>
      <section id="review-panel-extraction" hidden={activeDetailTab !== 'extraction'} className="hypothesis-evidence" aria-label="Ekstraksi AI">
        {(evidence ?? []).some((item) => item.source_type !== 'METRIC_SNAPSHOT') ? <>
          {(evidence ?? []).filter((item) => item.source_type !== 'METRIC_SNAPSHOT' && item.source_type !== 'CONTENT_FEATURE').map((item) => <article className="evidence-source" key={item.id}><strong>{labelId(item.layer)} · {contentNames.get(item.content_id) ?? 'Konten tidak dikenal'} · {labelId(item.role)}</strong><p>{statementSegments(item.statement).statement}</p>{item.link && <a href={item.link}>Buka sumber exact</a>}<details><summary>Basis bukti</summary><KeyValueView value={item.basis ?? item} /></details></article>)}
          {groupFeatureEvidence((evidence ?? []).filter((item) => item.source_type === 'CONTENT_FEATURE')).map((group) => {
            const first = group[0];
            const label = contentNames.get(first.content_id) ?? 'Konten tidak dikenal';
            const field = String(first.basis?.fieldName ?? first.source_id);
            const currentValues = [...new Set(group.map((item) => JSON.stringify(item.currentSource)).filter((value) => value !== 'null' && value !== undefined))].map((value) => JSON.parse(value!)) as NonNullable<Evidence['currentSource']>[];
            const frozenValues = [...new Set(group.map((item) => String(item.basis?.aiValue ?? statementSegments(item.statement).statement)))];
            return <article className="evidence-source" key={`${first.content_id}:${field}`}>
              <strong>{labelId(first.layer)} · {label} · {labelId(first.role)} · {labelId(field)}</strong>
              {frozenValues.map((value) => <p key={value}>Basis saat hipotesis dibuat: {value}</p>)}
              {currentValues.map((value) => value.aiValue === value.reviewedValue ? <p key={JSON.stringify(value)}>Nilai sumber terkini: {value.aiValue ?? '–'} ({labelId(value.reviewState ?? 'UNAVAILABLE')})</p> : <p key={JSON.stringify(value)}>Nilai sumber terkini: AI {value.aiValue ?? '–'}; hasil review {value.reviewedValue ?? '–'} ({labelId(value.reviewState ?? 'UNAVAILABLE')})</p>)}
              <p>Evidence tersimpan tetap menjadi basis hipotesis.</p>
              {group.map((item) => item.link && <a key={item.id} href={item.link}>Buka sumber exact</a>)}
              <details><summary>Basis bukti dan provenance</summary><KeyValueView value={group.map((item) => ({ id: item.id, layer: item.layer, source_type: item.source_type, source_id: item.source_id, statement: item.statement, basis: item.basis, currentSource: item.currentSource, role: item.role }))} /></details>
            </article>;
          })}
        </> : <p className="muted">Tidak ada bukti ekstraksi AI pada hipotesis ini.</p>}
      </section>
      <section id="review-panel-criteria" hidden={activeDetailTab !== 'criteria'} className="comparison-checks" aria-label="Kriteria perbandingan">
        {checklist ? <><h3>Kriteria perbandingan</h3><ul>{checklist.checks.map((item) => <li key={item.label}><strong>{item.label}:</strong> {item.value}</li>)}</ul>{engineReasons.length > 0 && <details><summary>Alasan engine</summary><ul>{engineReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></details>}{result.comparisons.map((item) => <p className="muted" key={item.comparison_id}>Perbandingan asal hipotesis · {labelId(item.role)}</p>)}</> : engineReasons.length > 0 ? <details><summary>Alasan engine</summary><ul>{engineReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></details> : <p className="muted">Kriteria perbandingan tidak tersedia.</p>}
      </section>
      <section id="review-panel-technical" role="tabpanel" aria-labelledby="review-tab-technical" hidden={activeDetailTab !== 'technical'} className="hypothesis-technical" aria-label="Detail teknis"><p className="preserve-text">{result.statement}</p><KeyValueView value={{ id: result.id, batchId: result.batchId, state: result.state, confidence: result.confidence, confidenceCaps: result.confidenceCaps, comparisons: result.comparisons, provider: result.provider, model: result.model, promptVersion: result.promptVersion, schemaVersion: result.schemaVersion, ruleVersion: result.ruleVersion, inputHash: result.inputHash, rawOutput: result.rawOutput, evidence }} /><button className="secondary" type="button" onClick={async () => { try { await navigator.clipboard.writeText(JSON.stringify({ id: result.id, statement: result.statement, evidence }, null, 2)); setCopyMessage('Detail tersalin'); } catch { setCopyMessage('Gagal menyalin detail'); } }}>{copyMessage === 'Detail tersalin' ? 'Detail tersalin' : 'Salin detail teknis'}</button><p role="status" aria-live="polite">{copyMessage}</p></section>
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
    <section className="review-queue" aria-label="Antrean hipotesis" tabIndex={-1} ref={queueRef}><h2>Antrean hipotesis</h2><p className="queue-progress">{completedCount} dari {items.length} hipotesis sudah direview · {pendingCount} menunggu review</p><div className="queue-filters"><button className="secondary" type="button" aria-pressed={!all} onClick={() => setAll(false)}>Menunggu ({pendingCount})</button><button className="secondary" type="button" aria-pressed={all} onClick={() => setAll(true)}>Semua ({items.length})</button></div>
      {loading ? <p role="status">Memuat antrean review…</p> : error ? <div role="alert"><p className="error-state">{error}</p><button className="secondary" type="button" onClick={refreshQueue}>Coba lagi</button></div> : groups.length === 0 ? <p className="empty-state">{all ? 'Belum ada hipotesis tersimpan pada batch ini. Buat dari Compare.' : 'Tidak ada hipotesis menunggu review. Pilih Semua untuk membuka hasil review tersimpan.'}</p> : <ul>{groups.map((group) => {
        const item = group.representative;
        const note = classifyHypothesisNote(item.reviewedStatement ?? item.statement);
        const title = contentLabel(item.contentIds, contents);
        return <li key={group.key} className={note ? 'queue-note-item' : ''}><button className="queue-choice secondary" type="button" aria-pressed={item.id === hypothesisId} onClick={() => onSelect(item.id)}><strong>{note ? 'Catatan batasan' : <QueueClaim statement={item.reviewedStatement ?? item.statement} contentIds={item.contentIds} contents={contents} />}</strong><span className="queue-meta"><span>{title}</span><span className={`confidence-badge confidence-${item.confidence.toLowerCase()}`}>{labelId(item.confidence)}</span><span>{group.hypothesisCount === 1 ? '1 hipotesis' : `${group.hypothesisCount} hipotesis`}</span><span>{item.evidenceCount} bukti</span><span className="review-state-badge">{item.reviewDecision ? labelId(item.reviewDecision) : 'Menunggu review'}</span></span></button>{group.variants.length > 0 && <><button className="queue-variants-toggle secondary" type="button" aria-expanded={expandedGroups.includes(group.key)} onClick={() => setExpandedGroups((current) => current.includes(group.key) ? current.filter((key) => key !== group.key) : [...current, group.key])}>+{group.variants.length} varian</button>{expandedGroups.includes(group.key) && <ul className="queue-variants">{group.variants.map((variant) => { const variantNote = classifyHypothesisNote(variant.reviewedStatement ?? variant.statement); return <li key={variant.id} className={variantNote ? 'queue-note-item' : ''}><button className="queue-variant secondary" type="button" aria-pressed={variant.id === hypothesisId} onClick={() => onSelect(variant.id)}><strong>{variantNote ? 'Catatan batasan' : <QueueClaim statement={variant.reviewedStatement ?? variant.statement} contentIds={variant.contentIds} contents={contents} />}</strong><span>{labelId(variant.confidence)} · {variant.evidenceCount} bukti · {variant.reviewDecision ? labelId(variant.reviewDecision) : 'Menunggu review'}</span></button></li>; })}</ul>}</>}</li>;
      })}</ul>}
    </section>
    <div className="review-detail-pane">{!hypothesisId ? <p className="empty-state">Pilih satu hipotesis untuk melihat klaim, bukti, keputusan, catatan, dan rencana uji.</p> : <HypothesisDetail key={`${batchId}:${hypothesisId}`} batchId={batchId} hypothesisId={hypothesisId} contents={contents} onReviewed={refreshQueue} onBack={backToQueue} />}</div>
  </div>;
}
