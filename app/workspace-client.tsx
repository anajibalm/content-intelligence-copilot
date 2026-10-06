"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { rankingExtremes, selectionRequestKey } from "../lib/workspace/presentation.ts";
import ComparePanel from "./compare-panel";

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
type WorkspaceData = {
  batches: Array<{ id: string; name: string; brandName: string; createdAt: string; contentCount: number; contractedVideoCount: number | null }>;
  selectedBatch: { id: string; name: string; brandName: string; createdAt: string; contentCount: number; contractedVideoCount: number | null } | null;
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
  const [batchId, setBatchId] = useState<string | null>(() => typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("batchId"));
  const [contentId, setContentId] = useState<string | null>(() => typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("contentId"));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestNumber = useRef(0);
  const [selectionVersion, setSelectionVersion] = useState(0);
  const requestKeyRef = useRef("");
  function setSelection(nextBatchId: string | null, nextContentId: string | null, replace = false) {
    const query = new URLSearchParams();
    if (nextBatchId) query.set("batchId", nextBatchId);
    if (nextContentId) query.set("contentId", nextContentId);
    const nextUrl = `${window.location.pathname}${query.size ? `?${query}` : ""}`;
    window.history[replace ? "replaceState" : "pushState"]({}, "", nextUrl);
    setBatchId(nextBatchId);
    setContentId(nextContentId);
    setData((current) => current ? { ...current, selectedContent: null } : current);
    setSelectionVersion((version) => version + 1);
    setLoading(true);
    setError(null);
  }

  useEffect(() => {
    const onPopState = () => {
      const params = new URLSearchParams(window.location.search);
      setBatchId(params.get("batchId"));
      setContentId(params.get("contentId"));
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
        if (currentRequest !== requestNumber.current) return;
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
    <main className="workspace">
      <header className="topbar"><div><p className="eyebrow">CONTENT INTELLIGENCE COPILOT</p><h1>Batch workspace</h1></div><span className="status">Canonical Postgres data</span></header>
      <section className="workspace-context" aria-labelledby="workspace-heading"><div><p className="eyebrow">S6 / BATCH WORKSPACE</p><h2 id="workspace-heading">{data.selectedBatch.name}</h2><p className="muted">{data.selectedBatch.brandName} · {data.selectedBatch.contentCount} explicit members · {new Date(data.selectedBatch.createdAt).toLocaleDateString()}</p></div><label className="batch-picker">Batch<select aria-label="Select batch" value={data.selectedBatch.id} onChange={(event) => setSelection(event.target.value, null)}>{data.batches.map((batch) => <option value={batch.id} key={batch.id}>{batch.name} · {batch.contentCount} contents</option>)}</select></label></section>
      {data.analysis?.synthetic && <p className="notice">Synthetic demo data · fixture approval is not real brand approval.</p>}
      {loading && <p className="notice" role="status">Loading selected workspace state…</p>}
      <section className="workspace-summary" aria-labelledby="summary-heading">
        <div className="summary-block"><p className="eyebrow">KPI ASSESSMENT</p><h2 id="summary-heading">Targets by distribution</h2>{data.analysis?.kpis.length ? data.analysis.kpis.map((item) => <div className="summary-line" key={item.definition.id}><strong>{item.definition.distribution ?? "Unconfigured"} · {statusLabel(item.assessment.status)}</strong><span>target {item.definition.target_value ?? "—"} · actual {item.assessment.actualValue ?? "—"} · excluded {item.assessment.excludedSnapshotIds.length}</span></div>) : <p className="muted">No KPI target configured.</p>}</div>
        <div className="summary-block"><p className="eyebrow">BEST / LOWEST BY BASIS</p><h2>Configured ranking cohorts</h2>{data.analysis?.ranking.rankedGroups.length ? data.analysis.ranking.rankedGroups.map((group) => { const extremes = rankingExtremes(group); const linkItems = (items: RankingItem[], value: number | null, label: string) => <span className="extreme-line"><strong>{label}</strong>{items.map((item) => <button className="inline-link" type="button" key={`${label}-${item.contentId}`} onClick={() => setSelection(data.selectedBatch!.id, item.contentId)}>{contentLabel(data.contents.find((content) => content.id === item.contentId))} · {value == null ? "unavailable" : formatMetric(value, group.basis)}</button>)}</span>; return <div className="summary-line" key={`${group.basis}-${group.direction}`}><strong>{group.basis} · {group.direction}</strong>{linkItems(extremes.best.items, extremes.best.value, "Best")}{linkItems(extremes.lowest.items, extremes.lowest.value, "Lowest")}<span>{group.items.length} eligible · no cross-basis comparison</span></div>; }) : <p className="muted">{data.analysis?.ranking.reason ?? "Ranking unavailable."}</p>}</div>
      </section>
      <ComparePanel batchId={data.selectedBatch.id} contents={data.contents} />
      <div className="workspace-columns">
        <section className="content-list" aria-labelledby="contents-heading"><div className="section-heading"><div><p className="eyebrow">EXPLICIT BATCH MEMBERSHIP</p><h2 id="contents-heading">All content</h2></div><span className="status">{data.contents.length} members</span></div>{data.contents.length === 0 ? <p className="empty-state">No content in selected batch. Add content through canonical acquisition.</p> : <div className="content-rows">{data.contents.map((content) => { const rank = rankedByContent.get(content.id); return <button className={`content-row ${content.id === detail?.id ? "selected" : ""}`} type="button" key={content.id} onClick={() => setSelection(data.selectedBatch!.id, content.id)}><span className="content-name"><strong>{contentLabel(content)}</strong><small>{content.externalId} · <span>{content.permalink}</span></small></span><span className="content-metrics"><small>Organic</small>{metricText(content, "ORGANIC")}<small>Paid</small>{metricText(content, "PAID")}</span><span className="content-state">Acquisition {statusLabel(content.acquisitionState)}<br />Processing {statusLabel(content.processingState)}</span>{rank && <span className="basis-label">{rank.label} · {formatMetric(rank.value, rank.metric)}</span>}</button>; })}</div>}</section>
        <section className="content-detail" aria-labelledby="detail-heading"><div className="section-heading"><div><p className="eyebrow">CONTENT DETAIL</p><h2 id="detail-heading">{detail ? contentLabel(detail) : "Select content"}</h2></div>{detail && <span className="status">Processing {statusLabel(detail.processingState)}</span>}</div>{!detail ? <p className="empty-state">Select one batch member to inspect metrics and evidence.</p> : <><p className="muted"><a href={detail.permalink} target="_blank" rel="noreferrer">Open canonical TikTok permalink</a> · {detail.externalId}</p><div className="detail-facts"><span>Acquisition <strong>{statusLabel(detail.acquisitionState)}</strong></span><span>Processing <strong>{statusLabel(detail.processingState)}</strong></span><span>Attempts <strong>{detail.attemptCount}</strong></span><span>Duration <strong>{detail.durationSeconds == null ? "unavailable" : `${detail.durationSeconds.toFixed(1)}s`}</strong></span></div>{detail.acquisitionError && <p className="error-state">Acquisition source error: {detail.acquisitionError}</p>}{detail.processingError && <p className="error-state">Processing error: {detail.processingError}</p>}<div className="detail-metrics">{detail.snapshots.map((snapshot) => <div className="metric-card" key={snapshot.id}><strong>{snapshot.distribution}</strong><span>Views {snapshot.rawMetrics.views == null ? "unavailable" : snapshot.rawMetrics.views} · AWT {snapshot.rawMetrics.awt_seconds == null ? "unavailable" : `${snapshot.rawMetrics.awt_seconds} s`} · WFV {snapshot.rawMetrics.wfv_pct == null ? "unavailable" : formatMetric(snapshot.rawMetrics.wfv_pct, "wfv_pct")} · ER {snapshot.derivedMetrics.engagement_rate?.value == null ? "unavailable" : formatMetric(snapshot.derivedMetrics.engagement_rate.value, "engagement_rate")}</span><small>Quality {snapshot.quality}</small>{Object.entries(snapshot.qualityByMetric).filter(([, value]) => value.state !== "VALID").map(([metric, value]) => <small className="quality-reason" key={metric}>{metric}: {value.state} · {value.reason ?? "no reason recorded"}</small>)}</div>)}</div><div className="detail-evidence"><h3>Temporal evidence</h3>{detail.frames.length ? <div className="evidence-frames">{detail.frames.map((frame) => <figure key={frame.id}>{frame.available && frame.url ? <img src={frame.url} alt={`${frame.type} at ${frame.timestampMs}ms`} onError={(event) => { event.currentTarget.replaceWith(Object.assign(document.createElement("div"), { className: "unavailable-media", textContent: "Frame unavailable" })); }} /> : <div className="unavailable-media">Frame unavailable</div>}<figcaption>{frame.type} · {frame.timestampMs}ms</figcaption></figure>)}</div> : <p className="empty-state">Frames unavailable for this content.</p>}{detail.audio.available && detail.audio.url ? <audio controls src={detail.audio.url} onError={(event) => { event.currentTarget.replaceWith(Object.assign(document.createElement("p"), { className: "muted", textContent: "Audio unavailable" })); }}>Audio evidence</audio> : <p className="muted">Audio unavailable for this content.</p>}<h3>Timestamped transcript</h3>{detail.transcript.length ? <ol className="transcript-list">{detail.transcript.map((segment) => <li key={segment.id}><strong>{segment.startMs}–{segment.endMs}ms</strong> {segment.text}</li>)}</ol> : <p className="muted">Transcript unavailable for this content.</p>}<h3>Analyst entry annotations</h3>{detail.anchors.length ? detail.anchors.map((anchor) => <p className="annotation" key={anchor.id}>{anchor.type} · {anchor.timestampMs}ms · {anchor.reviewState} · {anchor.note ?? "No note"}</p>) : <p className="muted">No analyst annotation recorded for this content.</p>}</div></>}</section>
      </div>
      {detail && <section className="detail-evidence" aria-labelledby="fingerprint-heading"><h2 id="fingerprint-heading">Fingerprint extraction</h2>{detail.extraction.length ? <><p className="muted">AI originals remain separate from reviewed values. Unreviewed extraction caps confidence at LOW.</p><dl>{detail.extraction.map((feature) => <div key={feature.id}><dt>{feature.fieldName}</dt><dd>AI original: {feature.aiValue} · Reviewed: {feature.reviewedValue ?? "unreviewed"} · State: {feature.reviewState}</dd></div>)}</dl></> : <p className="muted">Fingerprint unavailable.</p>}</section>}
      <footer className="footer-note">OBSERVED metrics, DERIVED metrics, and temporal evidence remain separate. Missing or stale evidence is shown as unavailable.</footer>
    </main>
  );
}
