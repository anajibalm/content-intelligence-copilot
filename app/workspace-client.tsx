"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import ProcessingForm, { type ProcessingJobSummary } from "./processing-form";
import { rankingExtremes } from "../lib/workspace/presentation.ts";
import ComparePanel from "./compare-panel";
import HypothesisPanel from "./hypothesis-panel";
import { FeatureReviewPanel } from "./review-panel";
import HypothesisQueue from './hypothesis-queue';
import { formatMetricId } from '../lib/hypothesis/presentation.ts';
import { VIEW_LABELS, labelId, metricTextId } from '../lib/workspace/labels-id.ts';
type Snapshot = {
  id: string;
  distribution: "ORGANIC" | "PAID";
  rawMetrics: Record<string, number | null>;
  quality: string;
  qualityByMetric: Record<string, { state: string; reason: string | null }>;
  derivedMetrics: { engagement_rate?: { value: number | null } };
};
type Content = {
  id: string;
  hasFrameEvidence: boolean;
  externalId: string;
  title: string | null;
  permalink: string;
  processingState: string;
  acquisitionState: string;
  acquisitionError: string | null;
  processingError: string | null;
  attemptCount: number;
  error: string | null;
  durationSeconds: number | null;
  snapshots: Snapshot[];
};
type ExtractionFeature = { id: string; extractionRunId: string; fieldName: string; aiValue: string; reviewedValue: string | null; reviewState: string; provider: string; model: string; promptVersion: string; schemaVersion: string; inputHash: string };
type Detail = Content & {
  hasFrameEvidence: boolean;
  frames: Array<{ id: string; type: string; timestampMs: number; url: string | null; available: boolean }>;
  audio: { url: string | null; available: boolean };
  transcript: Array<{ id: string; startMs: number; endMs: number; text: string; role: string | null }>;
  anchors: Array<{ id: string; type: string; timestampMs: number; reviewState: string; note: string | null; frameId: string | null; transcriptSegmentId: string | null }>;
  extraction: ExtractionFeature[];
};
type RankingItem = { contentId: string; value: number; snapshotId?: string; basis: { label: string; metric: string; fallbackUsed?: boolean } };
type RankingGroup = { basis: string; direction: string; items: RankingItem[] };
type Batch = { id: string; name: string; brandName: string; brandId: string; createdAt: string; contentCount: number; contractedVideoCount: number | null };
type WorkspaceData = {
  synthetic?: boolean;
  batches: Batch[];
  selectedBatch: Batch | null;
  contents: Content[];
  selectedContent: Detail | null;
  analysis: {
    synthetic: boolean;
    ranking: { status: string; reason: string | null; rankedGroups: RankingGroup[]; excluded: Array<{ contentId: string; reason: string }> };
    kpis: Array<{ definition: { id: string; metric_name: string; distribution: string | null; target_value: number | null }; assessment: { status: string; actualValue: number | null; excludedSnapshotIds: string[] } }>;
    snapshots: Snapshot[];
  } | null;
};

type MetricName = "views" | "awt_seconds" | "wfv_pct" | "engagement_rate";

function metricValue(snapshot: Snapshot, metric: MetricName) {
  if (metric === "engagement_rate") return snapshot.derivedMetrics.engagement_rate?.value ?? null;
  return snapshot.rawMetrics[metric] ?? null;
}

function metricText(content: Content, distribution: "ORGANIC" | "PAID") {
  const snapshot = content.snapshots.find((item) => item.distribution === distribution);
  if (!snapshot) return '–';
  const values = (["views", "awt_seconds", "wfv_pct", "engagement_rate"] as MetricName[]).map((metric) => {
    const value = metricValue(snapshot, metric);
    return `${labelId(metric)} ${formatMetricId(value, metric)}`;
  });
  return `${values.join(' · ')} · ${labelId(snapshot.quality)}`;
}

function statusLabel(value: string) {
  return labelId(value);
}

function statusTone(value: string) {
  return value === 'COMPLETED' || value === 'ACQUIRED' || value === 'SUCCEEDED' ? 'ok' : value === 'FAILED' ? 'bad' : 'warn';
}

function contentLabel(content: Content | undefined) {
  return content?.title ?? (content ? `TikTok ${content.externalId}` : "Unknown content");
}

function ContentRow({ content, selected, copiedContentId, onSelect, onCopy }: { content: Content; selected: boolean; copiedContentId: string | null; onSelect: () => void; onCopy: (event: React.MouseEvent<HTMLButtonElement>, content: Content) => void }) {
  return <div className={`content-row ${selected ? 'selected' : ''}`}><button className="content-row-select" type="button" onClick={onSelect}><span className="content-name"><strong>{content.title ?? 'Konten TikTok'}</strong><code>{content.externalId}</code></span><span className="content-status"><span>Organik: {metricText(content, 'ORGANIC')}</span><span>Iklan: {metricText(content, 'PAID')}</span><small>Frame belum tersedia</small>{content.snapshots.flatMap((snapshot) => Object.entries(snapshot.qualityByMetric).filter(([, value]) => value.state !== 'VALID').map(([metric, value]) => <small className="quality-reason" key={`${snapshot.id}-${metric}`}>{labelId(snapshot.distribution)} · {labelId(metric)}: {labelId(value.state)} · {value.reason ? labelId(value.reason) : 'Tanpa alasan tersimpan'}</small>))}<small>Akuisisi {statusLabel(content.acquisitionState)} · Processing {statusLabel(content.processingState)} · Percobaan {content.attemptCount}</small>{content.processingError && <small className="quality-reason">Gagal: {content.processingError}</small>}</span></button><span className="content-id"><button type="button" className="copy-id" aria-label={`Salin ID ${content.externalId}`} onClick={(event) => onCopy(event, content)}>Salin ID</button>{copiedContentId === content.id && <small role="status">ID disalin</small>}{copiedContentId === `error:${content.id}` && <small className="error-state" role="status">ID gagal disalin</small>}</span></div>;
}

export default function WorkspaceClient() {
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [comparisonId, setComparisonId] = useState<string | null>(null);
  const [hypothesisId, setHypothesisId] = useState<string | null>(() => typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('hypothesisId'));
  const [batchId, setBatchId] = useState<string | null>(() => typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("batchId"));
  const [contentId, setContentId] = useState<string | null>(() => typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("contentId"));
  const [view, setView] = useState(() => typeof window === 'undefined' ? 'batch' : new URLSearchParams(window.location.search).get('view') ?? (window.location.hash ? 'library' : new URLSearchParams(window.location.search).has('hypothesisId') ? 'review' : 'batch'));
  const [queueRevision, setQueueRevision] = useState(0);
  const [copiedContentId, setCopiedContentId] = useState<string | null>(null);
  const [processingJobSummary, setProcessingJobSummary] = useState<ProcessingJobSummary | null>(null);
  const syntheticDialogRef = useRef<HTMLDialogElement>(null);
  const syntheticChipRef = useRef<HTMLButtonElement>(null);
  const [evidenceAnchor, setEvidenceAnchor] = useState(() => typeof window === 'undefined' ? '' : window.location.hash);
  const [activeLibraryTab, setActiveLibraryTab] = useState<'fingerprint' | 'bukti' | 'riwayat'>('fingerprint');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestNumber = useRef(0);
  const currentBatchId = useRef(batchId);
  const [selectionVersion, setSelectionVersion] = useState(0);
  useEffect(() => { currentBatchId.current = batchId; }, [batchId]);
  function setSelection(nextBatchId: string | null, nextContentId: string | null, replace = false, nextView?: string) {
    requestNumber.current++;
    const query = new URLSearchParams(window.location.search);
    query.delete('contentId');
    if (nextBatchId !== batchId && !replace) { query.delete('hypothesisId'); setHypothesisId(null); }
    if (nextBatchId) query.set("batchId", nextBatchId);
    if (nextContentId) query.set("contentId", nextContentId);
    const persistedHypothesisId = query.get('hypothesisId');
    if (persistedHypothesisId) setHypothesisId(persistedHypothesisId);
    query.set('view', nextView ?? view);
    const nextUrl = `${window.location.pathname}${query.size ? `?${query}` : ''}${replace ? window.location.hash : ''}`;
    window.history[replace ? "replaceState" : "pushState"]({}, "", nextUrl);
    setBatchId(nextBatchId);
    if (nextBatchId !== batchId) setProcessingJobSummary(null);
    setContentId(nextContentId);
    if (nextView) setView(nextView);
    if (nextBatchId !== batchId || nextContentId !== contentId) setComparisonId(null);
    setData((current) => nextBatchId !== current?.selectedBatch?.id ? null : current ? { ...current, selectedContent: nextContentId === current.selectedContent?.id ? current.selectedContent : null } : current);
    setSelectionVersion((version) => version + 1);
    setLoading(true);
    setError(null);
  }

  /** Reload the selected content after a review so persisted state, not local state, is rendered. */
  function refreshDetail() {
    setSelectionVersion((version) => version + 1);
    setLoading(true);
  }
  async function copyExternalId(event: React.MouseEvent<HTMLButtonElement>, content: Content) {
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(content.externalId);
      setCopiedContentId(content.id);
    } catch {
      setCopiedContentId(`error:${content.id}`);
    }
  }

  function navigate(nextView: string) {
    const url = new URL(window.location.href);
    url.searchParams.set('view', nextView);
    url.hash = '';
    window.history.pushState({}, '', url);
    setView(nextView);
    setEvidenceAnchor('');
  }

  function openReview(id: string) {
    const url = new URL(window.location.href);
    url.searchParams.set('hypothesisId', id);
    url.searchParams.set('view', 'review');
    url.hash = '';
    window.history.pushState({}, '', url);
    setHypothesisId(id);
    setView('review');
    setEvidenceAnchor('');
  }

  function openSource(event: React.MouseEvent<HTMLElement>) {
    const link = (event.target as HTMLElement).closest('a');
    if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
    const url = new URL(link.href, window.location.href);
    if (url.origin !== window.location.origin || !/^#(?:video-frame|transcript-segment|content-feature|metric-snapshot)-/.test(url.hash)) return;
    event.preventDefault();
    url.searchParams.set('view', 'library');
    if (hypothesisId) url.searchParams.set('hypothesisId', hypothesisId);
    window.history.pushState({}, '', url);
    requestNumber.current++;
    setBatchId(url.searchParams.get('batchId'));
    setContentId(url.searchParams.get('contentId'));
    setView('library');
    setEvidenceAnchor(url.hash);
    setSelectionVersion((value) => value + 1);
  }

  useEffect(() => {
    const reveal = () => {
      const hash = window.location.hash;
      setEvidenceAnchor(hash);
      if (!hash) return;
      setView('library');
      const target = document.getElementById(decodeURIComponent(hash.slice(1)));
      target?.closest('details')?.setAttribute('open', '');
      target?.scrollIntoView({ block: 'center' });
    };
    reveal();
    window.addEventListener('hashchange', reveal);
    return () => window.removeEventListener('hashchange', reveal);
  }, [data]);

  useEffect(() => {
    const onPopState = () => {
      const params = new URLSearchParams(window.location.search);
      requestNumber.current++;
      setView(params.get('view') ?? (window.location.hash ? 'library' : params.has('hypothesisId') ? 'review' : 'batch'));
      setEvidenceAnchor(window.location.hash);
      setBatchId(params.get("batchId"));
      if (currentBatchId.current !== params.get('batchId')) setProcessingJobSummary(null);
      setHypothesisId(params.get('hypothesisId'));
      setContentId(params.get("contentId"));
      setComparisonId(null);
      setData((current) => current?.selectedBatch?.id !== params.get('batchId') ? null : current ? { ...current, selectedContent: current.selectedContent?.id === params.get('contentId') ? current.selectedContent : null } : current);
      setSelectionVersion((version) => version + 1);
      setLoading(true);
      setError(null);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const currentRequest = ++requestNumber.current;
    const query = new URLSearchParams();
    if (batchId) query.set("batchId", batchId);
    if (contentId) query.set("contentId", contentId);
    fetch(`/api/workspace?${query}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as WorkspaceData & { error?: string };
        if (!response.ok) throw new Error(body.error ?? "Workspace unavailable");
        return body;
      })
      .then((body) => {
        if (controller.signal.aborted || currentRequest !== requestNumber.current) return;
        setData(body);
        if (body.selectedBatch && body.selectedBatch.id !== batchId) setSelection(body.selectedBatch.id, body.selectedContent?.id ?? null, true);
        else if (body.selectedContent && body.selectedContent.id !== contentId) setSelection(batchId, body.selectedContent.id, true);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted && currentRequest === requestNumber.current) setError(String((reason as Error).message ?? reason));
      })
      .finally(() => {
        if (!controller.signal.aborted && currentRequest === requestNumber.current) setLoading(false);
      });
    return () => controller.abort();
  }, [batchId, contentId, selectionVersion]);


  if (loading && !data) return <main className="workspace"><h1>Memuat workspace…</h1><p className="muted">Memuat batch, metrik, dan bukti tersimpan.</p></main>;
  if (error) return <main className="workspace"><h1>Workspace gagal dimuat</h1><p className="error-state">{error}</p><button type="button" onClick={refreshDetail}>Coba lagi</button></main>;
  if (!data?.selectedBatch) return <main className="workspace"><h1>Belum ada batch</h1><p className="muted">Pilih batch kontrak sebelum analisis.</p></main>;

  const detail = data.selectedContent;
  const hasPaidMetrics = data.contents.some((content) => content.snapshots.some((snapshot) => snapshot.distribution === 'PAID'));
  const hasFrameEvidence = data.contents.some((content) => content.hasFrameEvidence);
  const jobSummaryText = !processingJobSummary || processingJobSummary.state === 'loading' ? 'memuat status job' : processingJobSummary.state === 'error' ? 'status job gagal dimuat' : `${processingJobSummary.count} job${processingJobSummary.active ? ` · ${processingJobSummary.active} aktif` : ''}${processingJobSummary.failed ? ` · ${processingJobSummary.failed} gagal` : ''}`;
  return (
    <div className="app-shell">
      <aside className="app-sidebar"><div className="app-brand"><strong>Content Intelligence</strong><span>Analyst Copilot</span></div><nav aria-label="Workspace analyst">{Object.entries(VIEW_LABELS).map(([id, label]) => <a key={id} href={`?batchId=${data.selectedBatch!.id}${contentId ? `&contentId=${contentId}` : ''}&view=${id}${hypothesisId ? `&hypothesisId=${hypothesisId}` : ''}`} aria-current={view === id ? 'page' : undefined} onClick={(event) => { event.preventDefault(); navigate(id); }}>{label}</a>)}</nav><p>AI mengusulkan. Analyst memvalidasi. Bukti dan hipotesis tetap terpisah.</p></aside>
      <main className={`workspace view-${view}`} onClick={openSource}>
      <header className="topbar"><h1>{VIEW_LABELS[view as keyof typeof VIEW_LABELS] ?? 'Batch'}</h1>{(data.synthetic || data.analysis?.synthetic) && <button ref={syntheticChipRef} className="synthetic-chip" type="button" onClick={() => syntheticDialogRef.current?.showModal()}>Data uji synthetic</button>}</header>
      <section className="workspace-context" aria-labelledby="workspace-heading"><div><h2 id="workspace-heading">{data.selectedBatch.name}</h2><p className="muted">{data.selectedBatch.brandName} · {data.selectedBatch.contentCount} anggota konten</p></div><label className="batch-picker">Batch<select aria-label="Pilih batch" value={data.selectedBatch.id} onChange={(event) => setSelection(event.target.value, null)}>{data.batches.map((batch) => <option value={batch.id} key={batch.id}>{batch.name} · {batch.contentCount} konten</option>)}</select></label></section>
      <dialog ref={syntheticDialogRef} aria-labelledby="synthetic-title"><h2 id="synthetic-title">Data uji synthetic</h2><p>Data uji synthetic. Persetujuan di sini bukan persetujuan brand nyata. Batch dapat berisi campuran data synthetic dan data lain.</p><button type="button" onClick={() => { syntheticDialogRef.current?.close(); syntheticChipRef.current?.focus(); }}>Tutup</button></dialog>
      <div hidden={view !== 'batch'}>
      <ProcessingForm key={batchId ?? data.selectedBatch.id} batchId={batchId ?? data.selectedBatch.id} onAccepted={(acceptedContentId) => setSelection(batchId ?? data.selectedBatch!.id, acceptedContentId, false, view)} onSettled={refreshDetail} onJobSummaryChange={setProcessingJobSummary} />
      <section className="workspace-summary" aria-labelledby="summary-heading"><div className="summary-block"><h2 id="summary-heading">KPI menurut distribusi</h2>{data.analysis?.kpis.length ? data.analysis.kpis.map((item) => <p className="summary-line" key={item.definition.id}><strong>{labelId(item.definition.distribution ?? 'UNCONFIGURED')} · {statusLabel(item.assessment.status)}</strong><span>{labelId(item.definition.metric_name)} · target {metricTextId(item.definition.target_value, item.definition.metric_name)} · aktual {metricTextId(item.assessment.actualValue, item.definition.metric_name)} · {item.assessment.excludedSnapshotIds.length} snapshot dikecualikan</span></p>) : <p className="muted">Belum ada target KPI.</p>}</div><div className="summary-block"><h2>Ranking berdasarkan objective</h2>{data.analysis?.ranking.rankedGroups.length ? data.analysis.ranking.rankedGroups.map((group) => { const extremes = rankingExtremes(group); const linkItems = (items: RankingItem[], value: number | null, label: string) => <span className="extreme-line"><strong>{label}</strong>{items.map((item) => <button className="inline-link" type="button" key={`${label}-${item.contentId}`} onClick={() => { setSelection(data.selectedBatch!.id, item.contentId); navigate('library'); }}>{contentLabel(data.contents.find((content) => content.id === item.contentId))} · {metricTextId(value, group.basis)}</button>)}</span>; return <div className="summary-line" key={`${group.basis}-${group.direction}`}><strong>{labelId(group.basis)} · urutan {labelId(group.direction)}</strong>{linkItems(extremes.best.items, extremes.best.value, 'Terbaik pada basis ini')}{linkItems(extremes.lowest.items, extremes.lowest.value, 'Terendah pada basis ini')}<span>{group.items.length} memenuhi syarat · tidak dibandingkan lintas basis</span></div>; }) : <><p className="muted">Ranking belum tersedia atau belum dikonfigurasi.</p>{data.analysis?.ranking.reason && <details><summary>Alasan teknis ranking</summary>{data.analysis.ranking.reason}</details>}{data.analysis?.ranking.status === 'UNCONFIGURED' && <p className="muted">Atur objective melalui konfigurasi brand yang disetujui. Konfigurasi ranking bersifat append-only.</p>}</>}</div></section>
      <section className="batch-members" aria-label="Anggota batch"><div className="section-heading"><div><h2 id="batch-members-heading">Anggota batch</h2><p className="muted">{data.contents.length} anggota konten · {jobSummaryText}</p></div></div>{data.contents.length === 0 ? <p className="empty-state">Belum ada konten pada batch ini. Tambahkan URL dari Batch.</p> : <table className="batch-table"><thead><tr><th scope="col">Konten</th><th scope="col" className="num">Organik</th>{hasPaidMetrics && <th scope="col" className="num">Iklan</th>}{hasFrameEvidence && <th scope="col">Frame</th>}<th scope="col">Status</th><th scope="col" className="num batch-attempts">Percobaan</th><th scope="col" className="batch-copy-heading"><span className="visually-hidden">Salin ID</span></th></tr></thead><tbody>{data.contents.map((content) => { const organic = content.snapshots.find((snapshot) => snapshot.distribution === 'ORGANIC'); const paid = content.snapshots.find((snapshot) => snapshot.distribution === 'PAID'); const metric = (value: number | null | undefined, name: string) => value === null || value === undefined ? <span className="dash" aria-label="Tidak tersedia">–</span> : metricTextId(value, name); const metrics = (snapshot: Snapshot | undefined) => <div className="batch-metrics"><span className="batch-metric-line"><span>Tayangan</span><span>{metric(snapshot?.rawMetrics.views, 'views')}</span></span><span className="batch-metric-line"><span>Engagement rate</span><span>{metric(snapshot?.derivedMetrics.engagement_rate?.value, 'engagement_rate')}</span></span>{!snapshot && <small>Belum tersedia</small>}{snapshot && Object.entries(snapshot.qualityByMetric).filter(([, value]) => value.state !== 'VALID').map(([name, value]) => <small className="quality-reason" key={`${snapshot.id}-${name}`}><span className="badge badge--warn">Cek</span>{' '}<span className="quality-reason-text">{labelId(name)}: {labelId(value.state)} · {value.reason ? labelId(value.reason) : 'Tanpa alasan tersimpan'}</span></small>)}</div>; const acquisition = statusLabel(content.acquisitionState); const processing = statusLabel(content.processingState); const untitled = !content.title || content.title === 'Konten TikTok'; return <tr className="content-row" key={content.id}><td className="batch-cell batch-content-cell"><button className="content-row-select batch-content-link" type="button" onClick={() => setSelection(data.selectedBatch!.id, content.id, false, 'library')}><strong>{untitled ? 'Konten TikTok' : content.title}</strong><code>{content.externalId}</code></button></td><td className="batch-cell num batch-metric" data-label="Organik">{metrics(organic)}</td>{hasPaidMetrics && <td className="batch-cell num batch-metric" data-label="Iklan">{metrics(paid)}</td>}{hasFrameEvidence && <td className="batch-cell batch-frame" data-label="Frame">{content.hasFrameEvidence ? 'Frame tersedia' : <span className="dash" aria-label="Frame belum tersedia">–</span>}</td>}<td className="batch-cell batch-status-cell"><span className={`batch-status batch-status--${statusTone(content.acquisitionState)}`}>Akuisisi {acquisition}</span><span className={`batch-status batch-status--${statusTone(content.processingState)}`}>Processing {processing}</span>{content.processingError && <small className="quality-reason">{content.processingError}</small>}</td><td className="batch-cell num batch-attempts" data-label="Percobaan">{content.attemptCount}</td><td className="batch-cell batch-copy-cell"><button type="button" className="copy-id" aria-label={`Salin ID ${content.externalId}`} onClick={(event) => copyExternalId(event, content)}>Salin ID</button>{copiedContentId === content.id && <small role="status">ID disalin</small>}{copiedContentId === `error:${content.id}` && <small role="status">ID gagal disalin</small>}</td></tr>; })}</tbody></table>}</section>
      </div>
      {loading && <p className="notice" role="status">Memuat data terpilih…</p>}
      <div hidden={view !== 'compare'}>
      <ComparePanel key={data.selectedBatch.id} batchId={data.selectedBatch.id} contents={data.contents} onCreated={setComparisonId} onInvalidated={() => setComparisonId(null)} />
      </div>
      <div hidden={view !== 'compare'}>
      <div><HypothesisPanel key={`${data.selectedBatch.id}:${comparisonId ?? "none"}`} batchId={data.selectedBatch.id} comparisonId={comparisonId} onReview={openReview} onGenerated={() => setQueueRevision((value) => value + 1)} /></div>
      </div>
      <div hidden={view !== 'review'}><HypothesisQueue key={batchId ?? data.selectedBatch.id} batchId={batchId ?? data.selectedBatch.id} hypothesisId={hypothesisId} onSelect={openReview} revision={queueRevision} contents={data.contents} /></div>
      <div className="workspace-columns" hidden={view !== 'library'}>
        <section className="content-list" aria-labelledby="contents-heading"><div className="section-heading"><h2 id="contents-heading">Daftar konten</h2><span className="status">{data.contents.length} anggota</span></div>{data.contents.length === 0 ? <p className="empty-state">Belum ada konten pada batch ini. Tambahkan URL dari Batch.</p> : <div className="content-rows">{data.contents.map((content) => <ContentRow key={content.id} content={content} selected={content.id === detail?.id} copiedContentId={copiedContentId} onSelect={() => setSelection(data.selectedBatch!.id, content.id)} onCopy={copyExternalId} />)}</div>}</section>
        {data.contents.length > 0 && <section className="content-detail" aria-labelledby="detail-heading">
          {detail ? <>
            <label className="library-mobile-picker">Konten<select aria-label="Pilih konten" value={detail.id} onChange={(event) => setSelection(data.selectedBatch!.id, event.target.value)}>{data.contents.map((content) => <option value={content.id} key={content.id}>{contentLabel(content)} · {content.processingState === 'FAILED' ? 'Gagal diproses' : statusLabel(content.processingState)}</option>)}</select></label>
            <p className="library-mobile-hint">Konten terpilih ditampilkan di atas.</p>
            <div className="section-heading"><div><h2 id="detail-heading">{contentLabel(detail)}</h2><a href={detail.permalink} target="_blank" rel="noreferrer">Buka permalink TikTok</a></div><span className={`status ${detail.processingState === 'FAILED' ? 'library-status-failed' : ''}`}>{detail.processingState === 'FAILED' ? 'Gagal diproses' : statusLabel(detail.processingState)}</span></div>
            {detail.processingError && <p className="error-state">Gagal diproses: {detail.processingError}</p>}
            {detail.acquisitionError && <p className="error-state">Error sumber akuisisi: {detail.acquisitionError}</p>}
            <div className="detail-metrics" role="region" aria-label="Metrik Organik dan Iklan"><table><thead><tr><th scope="col">Metrik</th><th scope="col">Organik</th><th scope="col">Iklan</th></tr></thead><tbody>
              {(['OBSERVED', 'DERIVED'] as const).map((layer) => <Fragment key={layer}><tr className="library-metric-group"><th colSpan={3} scope="rowgroup">{layer === 'OBSERVED' ? 'Observasi' : 'Perhitungan'}</th></tr>{(layer === 'OBSERVED' ? ['views', 'awt_seconds', 'wfv_pct'] as const : ['engagement_rate'] as const).map((metric) => <tr key={metric}><th scope="row">{labelId(metric)}</th>{(['ORGANIC', 'PAID'] as const).map((distribution) => { const snapshot = detail.snapshots.find((item) => item.distribution === distribution); const value = snapshot ? metricValue(snapshot, metric) : null; return <td className="library-metric-value" key={distribution}>{value == null ? '–' : formatMetricId(value, metric)}</td>; })}</tr>)}</Fragment>)}
              <tr><th scope="row">Kualitas metrik</th>{(['ORGANIC', 'PAID'] as const).map((distribution) => { const snapshot = detail.snapshots.find((item) => item.distribution === distribution); return <td id={snapshot ? `metric-snapshot-${snapshot.id}` : undefined} key={distribution}>{snapshot ? <span className="library-quality">{labelId(snapshot.quality)}</span> : '–'}</td>; })}</tr>
            </tbody></table></div>
            <div className="detail-facts"><div><span>Akuisisi</span><strong>{statusLabel(detail.acquisitionState)}</strong></div>{detail.processingState !== 'FAILED' && <div><span>Pemrosesan</span><strong>{statusLabel(detail.processingState)}</strong></div>}<div><span>Percobaan</span><strong>{detail.attemptCount}</strong></div><div><span>Durasi video</span><strong>{detail.durationSeconds == null ? '–' : `${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(detail.durationSeconds)} s`}</strong></div></div>
            <div className="evidence-review-grid">
              <div className="detail-evidence">
                <h3>Bukti temporal</h3>
                <p className="muted">{detail.frames.length} frame · {detail.transcript.length} segmen transkrip</p>
                {detail.frames.length ? <>
                  <div className="evidence-frames">{detail.frames.filter((frame) => frame.type === 'HOOK').map((frame) => <figure id={`video-frame-${frame.id}`} key={frame.id}>{frame.available && frame.url ? <img src={frame.url} alt={`${labelId(frame.type)} ${frame.timestampMs}ms`} /> : <div className="unavailable-media">Frame belum tersedia</div>}<figcaption>{labelId(frame.type)} · {frame.timestampMs}ms</figcaption></figure>)}</div>
                  <details key={`frames-${detail.id}-${evidenceAnchor}`} open={evidenceAnchor.startsWith('#video-frame-') && detail.frames.some((frame) => frame.type !== 'HOOK' && evidenceAnchor === `#video-frame-${frame.id}`)}>
                    <summary>Frame lainnya ({detail.frames.filter((frame) => frame.type !== 'HOOK').length})</summary>
                    <div className="evidence-frames">{detail.frames.filter((frame) => frame.type !== 'HOOK').map((frame) => <figure id={`video-frame-${frame.id}`} key={frame.id}>{frame.available && frame.url ? <img loading="lazy" src={frame.url} alt={`${labelId(frame.type)} ${frame.timestampMs}ms`} /> : <div className="unavailable-media">Frame belum tersedia</div>}<figcaption>{labelId(frame.type)} · {frame.timestampMs}ms</figcaption></figure>)}</div>
                  </details>
                </> : <p className="empty-state">Frame belum tersedia untuk konten ini.</p>}
                {detail.audio.available && detail.audio.url ? <audio controls src={detail.audio.url}>Bukti audio</audio> : <p className="muted">Audio belum tersedia untuk konten ini.</p>}
                <details key={`transcript-${detail.id}-${evidenceAnchor}`} open={evidenceAnchor.startsWith('#transcript-segment-')}>
                  <summary>Transkrip bertimestamp ({detail.transcript.length})</summary>
                  {detail.transcript.length ? <ol className="transcript-list">{detail.transcript.map((segment) => <li id={`transcript-segment-${segment.id}`} key={segment.id}><strong>{segment.startMs}–{segment.endMs}ms</strong> {segment.text}{segment.role ? ` · ${labelId(segment.role)}` : ''}</li>)}</ol> : <p className="muted">Transkrip belum tersedia untuk konten ini.</p>}
                </details>
                <h3>Anotasi analyst</h3>
                {detail.anchors.length ? detail.anchors.map((anchor) => <p className="annotation" key={anchor.id}>{labelId(anchor.type)} · {anchor.timestampMs}ms · {labelId(anchor.reviewState)} · {anchor.note ?? 'Tanpa catatan'}</p>) : <p className="muted">Belum ada anotasi analyst.</p>}
              </div>
              <section className="detail-evidence" aria-labelledby="fingerprint-heading"><h2 id="fingerprint-heading">Fingerprint</h2>{detail.extraction.length ? <FeatureReviewPanel key={detail.id} contentId={detail.id} features={detail.extraction} onReviewed={refreshDetail} /> : <p className="muted">Fingerprint belum tersedia.</p>}</section>
            </div>
          </> : <><div className="section-heading"><h2 id="detail-heading">Pilih konten</h2></div><p className="empty-state">Pilih anggota batch untuk melihat metrik dan bukti.</p></>}
        </section>}
      </div>
      <footer className="footer-note">Observasi, perhitungan, ekstraksi AI, dan hipotesis tetap terpisah. Data yang hilang tidak dianggap nol.</footer>
    </main></div>
  );
}
