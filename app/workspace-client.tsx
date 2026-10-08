"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ProcessingForm from "./processing-form";
import { rankingExtremes, selectionRequestKey } from "../lib/workspace/presentation.ts";
import ComparePanel from "./compare-panel";
import HypothesisPanel from "./hypothesis-panel";
import { FeatureReviewPanel } from "./review-panel";
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

function formatMetric(value: number, metric: string) {
  if (metric === "engagement_rate" || metric === "wfv_pct") return `${(value * 100).toFixed(1)}%`;
  if (metric === "awt_seconds") return `${value.toFixed(2)} s`;
  return `${value}`;
}

function metricValue(snapshot: Snapshot, metric: MetricName) {
  if (metric === "engagement_rate") return snapshot.derivedMetrics.engagement_rate?.value ?? null;
  return snapshot.rawMetrics[metric] ?? null;
}

function metricText(content: Content, distribution: "ORGANIC" | "PAID") {
  const snapshot = content.snapshots.find((item) => item.distribution === distribution);
  if (!snapshot) return "unavailable";
  const values = (["views", "awt_seconds", "wfv_pct", "engagement_rate"] as MetricName[]).map((metric) => {
    const value = metricValue(snapshot, metric);
    return `${metric} ${value == null ? "unavailable" : formatMetric(value, metric)}`;
  });
  return `${values.join(" · ")} · ${snapshot.quality}`;
}

function statusLabel(value: string) {
  return value.replaceAll("_", " ");
}

function contentLabel(content: Content | undefined) {
  return content?.title ?? (content ? `TikTok ${content.externalId}` : "Unknown content");
}

export default function WorkspaceClient() {
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [comparisonId, setComparisonId] = useState<string | null>(null);
  const [batchId, setBatchId] = useState<string | null>(() => typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("batchId"));
  const [contentId, setContentId] = useState<string | null>(() => typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("contentId"));
  const [view, setView] = useState(() => typeof window === 'undefined' ? 'batch' : new URLSearchParams(window.location.search).get('view') ?? (window.location.hash ? 'library' : new URLSearchParams(window.location.search).has('hypothesisId') ? 'review' : 'batch'));
  const [evidenceAnchor, setEvidenceAnchor] = useState(() => typeof window === 'undefined' ? '' : window.location.hash);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestNumber = useRef(0);
  const [selectionVersion, setSelectionVersion] = useState(0);
  const requestKeyRef = useRef("");
  function setSelection(nextBatchId: string | null, nextContentId: string | null, replace = false) {
    requestNumber.current++;
    const query = new URLSearchParams();
    if (nextBatchId) query.set("batchId", nextBatchId);
    if (nextContentId) query.set("contentId", nextContentId);
    const persistedHypothesisId = replace ? new URLSearchParams(window.location.search).get("hypothesisId") : null;
    if (persistedHypothesisId) query.set("hypothesisId", persistedHypothesisId);
    query.set('view', view);
    const nextUrl = `${window.location.pathname}${query.size ? `?${query}` : ''}${replace ? window.location.hash : ''}`;
    window.history[replace ? "replaceState" : "pushState"]({}, "", nextUrl);
    setBatchId(nextBatchId);
    setContentId(nextContentId);
    if (nextBatchId !== batchId || nextContentId !== contentId) setComparisonId(null);
    setData((current) => current ? { ...current, selectedContent: null } : current);
    setSelectionVersion((version) => version + 1);
    setLoading(true);
    setError(null);
  }

  /** Reload the selected content after a review so persisted state, not local state, is rendered. */
  function refreshDetail() {
    setSelectionVersion((version) => version + 1);
    setLoading(true);
  }

  function navigate(nextView: string) {
    const url = new URL(window.location.href);
    url.searchParams.set('view', nextView);
    url.hash = '';
    window.history.pushState({}, '', url);
    setView(nextView);
    setEvidenceAnchor('');
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
      setView(params.get('view') ?? (window.location.hash ? 'library' : 'batch'));
      setEvidenceAnchor(window.location.hash);
      setBatchId(params.get("batchId"));
      setContentId(params.get("contentId"));
      setComparisonId(null);
      setData((current) => current ? { ...current, selectedContent: null } : current);
      setSelectionVersion((version) => version + 1);
      setLoading(true);
      setError(null);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    requestKeyRef.current = selectionRequestKey(batchId, contentId, selectionVersion);
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

  const rankedByContent = useMemo(() => {
    const map = new Map<string, { label: string; metric: string; value: number; direction: string; winner: boolean }>();
    for (const group of data?.analysis?.ranking.rankedGroups ?? []) {
      const first = group.items[0];
      for (const item of group.items) {
        const winner = first?.value === item.value;
        if (winner) map.set(item.contentId, { label: item.basis.label, metric: item.basis.metric, value: item.value, direction: group.direction, winner });
      }
    }
    return map;
  }, [data]);

  if (loading && !data) return <main className="workspace"><p className="eyebrow">S6 / BATCH WORKSPACE</p><h1>Loading canonical workspace…</h1><p className="muted">Loading batches, metrics, and evidence from Postgres.</p></main>;
  if (error) return <main className="workspace"><p className="eyebrow">S6 / BATCH WORKSPACE</p><h1>Workspace unavailable</h1><p className="error-state">{error}</p><p className="muted">Requested batch/content was not found or workspace is unavailable. Check URL and reload.</p></main>;
  if (!data?.selectedBatch) return <main className="workspace"><p className="eyebrow">S6 / BATCH WORKSPACE</p><h1>No batches available</h1><p className="muted">No contract-defined batch exists in current workspace. Create or select batch before analysis.</p></main>;

  const detail = data.selectedContent;
  return (
    <div className="app-shell">
      <aside className="app-sidebar"><div className="app-brand"><strong>Content Intelligence</strong><span>Analyst Copilot</span></div><nav aria-label="Analyst workspace">{[['batch', 'Batch Workspace'], ['library', 'Content Library'], ['compare', 'Compare'], ['review', 'Insights Review']].map(([id, label]) => <a key={id} href={`?batchId=${data.selectedBatch!.id}${contentId ? `&contentId=${contentId}` : ''}&view=${id}`} aria-current={view === id ? 'page' : undefined} onClick={(event) => { event.preventDefault(); navigate(id); }}>{label}</a>)}</nav><p>AI mengusulkan. Analyst memvalidasi. Evidence dan hipotesis tetap terpisah.</p></aside>
      <main className={`workspace view-${view}`}>
      <header className="topbar"><div><p className="eyebrow">CONTENT INTELLIGENCE COPILOT</p><h1>{view === 'library' ? 'Content Library' : view === 'compare' ? 'Compare' : view === 'review' ? 'Insights Review' : 'Batch Workspace'}</h1></div><span className="status">Canonical Postgres data</span></header>
      <section className="workspace-context" aria-labelledby="workspace-heading"><div><p className="eyebrow">S6 / BATCH WORKSPACE</p><h2 id="workspace-heading">{data.selectedBatch.name}</h2><p className="muted">{data.selectedBatch.brandName} · {data.selectedBatch.contentCount} explicit members · {new Date(data.selectedBatch.createdAt).toLocaleDateString()}</p></div><label className="batch-picker">Batch<select aria-label="Select batch" value={data.selectedBatch.id} onChange={(event) => setSelection(event.target.value, null)}>{data.batches.map((batch) => <option value={batch.id} key={batch.id}>{batch.name} · {batch.contentCount} contents</option>)}</select></label></section>
      <div hidden={view !== 'batch'}>
      <ProcessingForm key={batchId ?? data.selectedBatch.id} batchId={batchId ?? data.selectedBatch.id} onAccepted={(acceptedContentId) => setSelection(batchId ?? data.selectedBatch!.id, acceptedContentId)} onSettled={refreshDetail} />
      </div>
      {data.analysis?.synthetic && <p className="notice">Synthetic demo data · fixture approval is not real brand approval.</p>}
      {loading && <p className="notice" role="status">Loading selected workspace state…</p>}
      <section className="workspace-summary" aria-labelledby="summary-heading" hidden={view !== 'batch'}>
        <div className="summary-block"><p className="eyebrow">KPI ASSESSMENT</p><h2 id="summary-heading">Targets by distribution</h2>{data.analysis?.kpis.length ? data.analysis.kpis.map((item) => <div className="summary-line" key={item.definition.id}><strong>{item.definition.distribution ?? "Unconfigured"} · {statusLabel(item.assessment.status)}</strong><span>target {item.definition.target_value ?? "—"} · actual {item.assessment.actualValue ?? "—"} · excluded {item.assessment.excludedSnapshotIds.length}</span></div>) : <p className="muted">No KPI target configured.</p>}</div>
        <div className="summary-block"><p className="eyebrow">BEST / LOWEST BY BASIS</p><h2>Configured ranking cohorts</h2>{data.analysis?.ranking.rankedGroups.length ? data.analysis.ranking.rankedGroups.map((group) => { const extremes = rankingExtremes(group); const linkItems = (items: RankingItem[], value: number | null, label: string) => <span className="extreme-line"><strong>{label}</strong>{items.map((item) => <button className="inline-link" type="button" key={`${label}-${item.contentId}`} onClick={() => setSelection(data.selectedBatch!.id, item.contentId)}>{contentLabel(data.contents.find((content) => content.id === item.contentId))} · {value == null ? "unavailable" : formatMetric(value, group.basis)}</button>)}</span>; return <div className="summary-line" key={`${group.basis}-${group.direction}`}><strong>{group.basis} · {group.direction}</strong>{linkItems(extremes.best.items, extremes.best.value, "Best")}{linkItems(extremes.lowest.items, extremes.lowest.value, "Lowest")}<span>{group.items.length} eligible · no cross-basis comparison</span></div>; }) : <p className="muted">{data.analysis?.ranking.reason ?? "Ranking unavailable."}</p>}</div>
      </section>
      <div hidden={view !== 'compare'}>
      <ComparePanel key={data.selectedBatch.id} batchId={data.selectedBatch.id} contents={data.contents} onCreated={setComparisonId} onInvalidated={() => setComparisonId(null)} />
      </div>
      <div hidden={view !== 'compare' && view !== 'review'}>
      <HypothesisPanel key={`${data.selectedBatch.id}:${contentId ?? "none"}:${comparisonId ?? "none"}`} batchId={data.selectedBatch.id} comparisonId={comparisonId} />
      </div>
      <div className="workspace-columns" hidden={view !== 'library' && view !== 'review'}>
        <section className="content-list" aria-labelledby="contents-heading"><div className="section-heading"><div><p className="eyebrow">EXPLICIT BATCH MEMBERSHIP</p><h2 id="contents-heading">All content</h2></div><span className="status">{data.contents.length} members</span></div>{data.contents.length === 0 ? <p className="empty-state">No content in selected batch. Add content through canonical acquisition.</p> : <div className="content-rows">{data.contents.map((content) => { const rank = rankedByContent.get(content.id); return <button className={`content-row ${content.id === detail?.id ? "selected" : ""}`} type="button" key={content.id} onClick={() => setSelection(data.selectedBatch!.id, content.id)}><span className="content-name"><strong>{contentLabel(content)}</strong><small>{content.externalId}</small></span><span className="content-status"><span>Organic: {rank ? `${rank.label} · ${formatMetric(rank.value, rank.metric)}` : metricText(content, "ORGANIC")}</span><span>Paid: {metricText(content, "PAID")}</span><small>Acquisition {statusLabel(content.acquisitionState)} · Processing {statusLabel(content.processingState)}</small></span></button>; })}</div>}</section>
        <section className="content-detail" aria-labelledby="detail-heading">
          <div className="section-heading"><div><p className="eyebrow">CONTENT DETAIL</p><h2 id="detail-heading">{detail ? contentLabel(detail) : 'Select content'}</h2></div>{detail && <span className="status">Processing {statusLabel(detail.processingState)}</span>}</div>
          {!detail ? <p className="empty-state">Select one batch member to inspect metrics and evidence.</p> : <>
            <p className="muted"><a href={detail.permalink} target="_blank" rel="noreferrer">Open canonical TikTok permalink</a> · {detail.externalId}</p>
            <div className="detail-facts"><span>Acquisition <strong>{statusLabel(detail.acquisitionState)}</strong></span><span>Processing <strong>{statusLabel(detail.processingState)}</strong></span><span>Attempts <strong>{detail.attemptCount}</strong></span><span>Duration <strong>{detail.durationSeconds == null ? 'unavailable' : `${detail.durationSeconds.toFixed(1)}s`}</strong></span></div>
            {detail.acquisitionError && <p className="error-state">Acquisition source error: {detail.acquisitionError}</p>}
            {detail.processingError && <p className="error-state">Processing error: {detail.processingError}</p>}
            <div className="detail-metrics">{detail.snapshots.map((snapshot) => <div id={`metric-snapshot-${snapshot.id}`} className="metric-card" key={snapshot.id}>
              <strong>{snapshot.distribution}</strong><span>Views {snapshot.rawMetrics.views ?? 'unavailable'} · AWT {snapshot.rawMetrics.awt_seconds == null ? 'unavailable' : `${snapshot.rawMetrics.awt_seconds} s`} · WFV {snapshot.rawMetrics.wfv_pct == null ? 'unavailable' : formatMetric(snapshot.rawMetrics.wfv_pct, 'wfv_pct')} · ER {snapshot.derivedMetrics.engagement_rate?.value == null ? 'unavailable' : formatMetric(snapshot.derivedMetrics.engagement_rate.value, 'engagement_rate')}</span><small>Quality {snapshot.quality}</small>
              {Object.entries(snapshot.qualityByMetric).filter(([, value]) => value.state !== 'VALID').map(([metric, value]) => <small className="quality-reason" key={metric}>{metric}: {value.state} · {value.reason ?? 'no reason recorded'}</small>)}
            </div>)}</div>
            <div className="evidence-review-grid">
              <div className="detail-evidence">
                <h3>Temporal evidence</h3>
                <p className="muted">{detail.frames.length} frames · {detail.transcript.length} transcript segments</p>
                {detail.frames.length ? <>
                  <div className="evidence-frames">{detail.frames.filter((frame) => frame.type === 'HOOK').map((frame) => <figure id={`video-frame-${frame.id}`} key={frame.id}>{frame.available && frame.url ? <img src={frame.url} alt={`${frame.type} at ${frame.timestampMs}ms`} /> : <div className="unavailable-media">Frame unavailable</div>}<figcaption>{frame.type} · {frame.timestampMs}ms</figcaption></figure>)}</div>
                  <details key={`frames-${detail.id}-${evidenceAnchor}`} open={evidenceAnchor.startsWith('#video-frame-') && detail.frames.some((frame) => frame.type !== 'HOOK' && evidenceAnchor === `#video-frame-${frame.id}`)}>
                    <summary>All remaining frames ({detail.frames.filter((frame) => frame.type !== 'HOOK').length})</summary>
                    <div className="evidence-frames">{detail.frames.filter((frame) => frame.type !== 'HOOK').map((frame) => <figure id={`video-frame-${frame.id}`} key={frame.id}>{frame.available && frame.url ? <img loading="lazy" src={frame.url} alt={`${frame.type} at ${frame.timestampMs}ms`} /> : <div className="unavailable-media">Frame unavailable</div>}<figcaption>{frame.type} · {frame.timestampMs}ms</figcaption></figure>)}</div>
                  </details>
                </> : <p className="empty-state">Frames unavailable for this content.</p>}
                {detail.audio.available && detail.audio.url ? <audio controls src={detail.audio.url}>Audio evidence</audio> : <p className="muted">Audio unavailable for this content.</p>}
                <details key={`transcript-${detail.id}-${evidenceAnchor}`} open={evidenceAnchor.startsWith('#transcript-segment-')}>
                  <summary>Timestamped transcript ({detail.transcript.length})</summary>
                  {detail.transcript.length ? <ol className="transcript-list">{detail.transcript.map((segment) => <li id={`transcript-segment-${segment.id}`} key={segment.id}><strong>{segment.startMs}–{segment.endMs}ms</strong> {segment.text}{segment.role ? ` · ${segment.role}` : ''}</li>)}</ol> : <p className="muted">Transcript unavailable for this content.</p>}
                </details>
                <h3>Analyst entry annotations</h3>
                {detail.anchors.length ? detail.anchors.map((anchor) => <p className="annotation" key={anchor.id}>{anchor.type} · {anchor.timestampMs}ms · {anchor.reviewState} · {anchor.note ?? 'No note'}</p>) : <p className="muted">No analyst annotation recorded for this content.</p>}
              </div>
              <section className="detail-evidence" aria-labelledby="fingerprint-heading"><h2 id="fingerprint-heading">Fingerprint extraction</h2>{detail.extraction.length ? <FeatureReviewPanel contentId={detail.id} features={detail.extraction} onReviewed={refreshDetail} /> : <p className="muted">Fingerprint unavailable.</p>}</section>
            </div>
          </>}
        </section>
      </div>
      {detail && view === 'review' && <p className="notice">Review fingerprint dengan media dan transcript di sebelahnya. Hypothesis tersimpan dapat dibuka melalui URL hypothesisId.</p>}
      <footer className="footer-note">OBSERVED metrics, DERIVED metrics, and temporal evidence remain separate. Missing or stale evidence is shown as unavailable.</footer>
    </main></div>
  );
}
