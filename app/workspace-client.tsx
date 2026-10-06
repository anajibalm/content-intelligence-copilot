"use client";

import { useEffect, useMemo, useState } from "react";

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
  attemptCount: number;
  error: string | null;
  durationSeconds: number | null;
  snapshots: Snapshot[];
};
type Detail = Content & {
  frames: Array<{ id: string; type: string; timestampMs: number; url: string | null; available: boolean }>;
  audio: { url: string | null; available: boolean };
  transcript: Array<{ id: string; startMs: number; endMs: number; text: string; role: string | null }>;
  anchors: Array<{ id: string; type: string; timestampMs: number; reviewState: string; note: string | null; frameId: string | null; transcriptSegmentId: string | null }>;
};
type WorkspaceData = {
  batches: Array<{ id: string; name: string; brandName: string; createdAt: string; contentCount: number; contractedVideoCount: number | null }>;
  selectedBatch: { id: string; name: string; brandName: string; createdAt: string; contentCount: number; contractedVideoCount: number | null } | null;
  contents: Content[];
  selectedContent: Detail | null;
  analysis: {
    synthetic: boolean;
    ranking: { status: string; reason: string | null; rankedGroups: Array<{ basis: string; direction: string; items: Array<{ contentId: string; value: number; basis: { label: string; metric: string } }> }>; excluded: Array<{ contentId: string; reason: string }> };
    kpis: Array<{ definition: { id: string; metric_name: string; distribution: string | null; target_value: number | null }; assessment: { status: string; actualValue: number | null; excludedSnapshotIds: string[] } }>;
    snapshots: Snapshot[];
  } | null;
};

function metricText(content: Content, distribution: "ORGANIC" | "PAID") {
  const snapshot = content.snapshots.find((item) => item.distribution === distribution);
  if (!snapshot) return "unavailable";
  const views = snapshot.rawMetrics.views;
  const er = snapshot.derivedMetrics.engagement_rate?.value;
  return `Views ${views ?? "—"} · ER ${er == null ? "—" : `${(er * 100).toFixed(1)}%`} · ${snapshot.quality}`;
}

function statusLabel(value: string) {
  return value.replaceAll("_", " ");
}

export default function WorkspaceClient() {
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [batchId, setBatchId] = useState<string | null>(() => typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("batchId"));
  const [contentId, setContentId] = useState<string | null>(() => typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("contentId"));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
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
        setData(body);
        if (body.selectedBatch && body.selectedBatch.id !== batchId) setBatchId(body.selectedBatch.id);
        if (body.selectedContent && body.selectedContent.id !== contentId) setContentId(body.selectedContent.id);
        setError(null);
      })
      .catch((reason: unknown) => {
        if ((reason as Error).name !== "AbortError") setError(String((reason as Error).message ?? reason));
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [batchId, contentId]);

  function navigate(nextBatchId: string | null, nextContentId: string | null) {
    const query = new URLSearchParams();
    if (nextBatchId) query.set("batchId", nextBatchId);
    if (nextContentId) query.set("contentId", nextContentId);
    window.history.pushState({}, "", `${window.location.pathname}${query.size ? `?${query}` : ""}`);
    setBatchId(nextBatchId);
    setContentId(nextContentId);
  }

  const rankedByContent = useMemo(() => {
    const map = new Map<string, string>();
    for (const group of data?.analysis?.ranking.rankedGroups ?? []) for (const item of group.items) map.set(item.contentId, item.basis.label);
    return map;
  }, [data]);

  if (loading && !data) return <main className="workspace"><p className="eyebrow">S6 / BATCH WORKSPACE</p><h1>Loading canonical workspace…</h1><p className="muted">Loading batches, metrics, and evidence from Postgres.</p></main>;
  if (error) return <main className="workspace"><p className="eyebrow">S6 / BATCH WORKSPACE</p><h1>Workspace unavailable</h1><p className="error-state">{error}</p><p className="muted">Check workspace database configuration, then reload.</p></main>;
  if (!data?.selectedBatch) return <main className="workspace"><p className="eyebrow">S6 / BATCH WORKSPACE</p><h1>No batches available</h1><p className="muted">No contract-defined batch exists in current workspace. Create or select batch before analysis.</p></main>;

  const detail = data.selectedContent;
  return (
    <main className="workspace">
      <header className="topbar">
        <div><p className="eyebrow">CONTENT INTELLIGENCE COPILOT</p><h1>Batch workspace</h1></div>
        <span className="status">Canonical Postgres data</span>
      </header>
      <section className="workspace-context" aria-labelledby="workspace-heading">
        <div>
          <p className="eyebrow">S6 / BATCH WORKSPACE</p>
          <h2 id="workspace-heading">{data.selectedBatch.name}</h2>
          <p className="muted">{data.selectedBatch.brandName} · {data.selectedBatch.contentCount} explicit members · {new Date(data.selectedBatch.createdAt).toLocaleDateString()}</p>
        </div>
        <label className="batch-picker">Batch
          <select aria-label="Select batch" value={data.selectedBatch.id} onChange={(event) => navigate(event.target.value, null)}>
            {data.batches.map((batch) => <option value={batch.id} key={batch.id}>{batch.name} · {batch.contentCount} contents</option>)}
          </select>
        </label>
      </section>
      {data.analysis?.synthetic && <p className="notice">Synthetic demo data · fixture approval is not real brand approval.</p>}
      <section className="workspace-summary" aria-labelledby="summary-heading">
        <div className="summary-block"><p className="eyebrow">KPI ASSESSMENT</p><h2 id="summary-heading">Targets by distribution</h2>{data.analysis?.kpis.length ? data.analysis.kpis.map((item) => <div className="summary-line" key={item.definition.id}><strong>{item.definition.distribution ?? "Unconfigured"} · {statusLabel(item.assessment.status)}</strong><span>target {item.definition.target_value ?? "—"} · actual {item.assessment.actualValue ?? "—"} · excluded {item.assessment.excludedSnapshotIds.length}</span></div>) : <p className="muted">No KPI target configured.</p>}</div>
        <div className="summary-block"><p className="eyebrow">BEST / LOWEST BY BASIS</p><h2>Configured ranking cohorts</h2>{data.analysis?.ranking.rankedGroups.length ? data.analysis.ranking.rankedGroups.map((group) => <div className="summary-line" key={group.basis}><strong>{group.direction === "ASC" ? "Lowest" : "Best"} by {group.basis}</strong><span>{group.items.length} eligible · {group.direction} · no cross-basis order</span></div>) : <p className="muted">{data.analysis?.ranking.reason ?? "Ranking unavailable."}</p>}</div>
      </section>
      <div className="workspace-columns">
        <section className="content-list" aria-labelledby="contents-heading">
          <div className="section-heading"><div><p className="eyebrow">EXPLICIT BATCH MEMBERSHIP</p><h2 id="contents-heading">All content</h2></div><span className="status">{data.contents.length} members</span></div>
          {data.contents.length === 0 ? <p className="empty-state">No content in selected batch. Add content through canonical acquisition.</p> : <div className="content-rows">{data.contents.map((content) => <button className={`content-row ${content.id === detail?.id ? "selected" : ""}`} type="button" key={content.id} onClick={() => navigate(data.selectedBatch!.id, content.id)}><span className="content-name"><strong>{content.title ?? `TikTok ${content.externalId}`}</strong><small>{content.externalId} · <span>{content.permalink}</span></small></span><span className="content-metrics"><small>Organic</small>{metricText(content, "ORGANIC")}<small>Paid</small>{metricText(content, "PAID")}</span><span className="content-state">{statusLabel(content.processingState)}<br />{statusLabel(content.acquisitionState)}</span>{rankedByContent.has(content.id) && <span className="basis-label">{rankedByContent.get(content.id)}</span>}</button>)}</div>}
        </section>
        <section className="content-detail" aria-labelledby="detail-heading">
          <div className="section-heading"><div><p className="eyebrow">CONTENT DETAIL</p><h2 id="detail-heading">{detail?.title ?? "Select content"}</h2></div>{detail && <span className="status">{statusLabel(detail.processingState)}</span>}</div>
          {!detail ? <p className="empty-state">Select one batch member to inspect metrics and evidence.</p> : <>
            <p className="muted"><a href={detail.permalink} target="_blank" rel="noreferrer">Open canonical TikTok permalink</a> · {detail.externalId}</p>
            <div className="detail-facts"><span>Acquisition <strong>{statusLabel(detail.acquisitionState)}</strong></span><span>Attempts <strong>{detail.attemptCount}</strong></span><span>Duration <strong>{detail.durationSeconds == null ? "unavailable" : `${detail.durationSeconds.toFixed(1)}s`}</strong></span></div>
            {detail.error && <p className="error-state">Source error: {detail.error}</p>}
            <div className="detail-metrics">{detail.snapshots.map((snapshot) => <div className="metric-card" key={snapshot.id}><strong>{snapshot.distribution}</strong><span>Views {snapshot.rawMetrics.views ?? "—"} · ER {snapshot.derivedMetrics.engagement_rate?.value == null ? "—" : `${(snapshot.derivedMetrics.engagement_rate.value * 100).toFixed(1)}%`}</span><small>Quality {snapshot.quality}</small>{Object.entries(snapshot.qualityByMetric).filter(([, value]) => value.state !== "VALID").map(([metric, value]) => <small className="quality-reason" key={metric}>{metric}: {value.state} · {value.reason ?? "no reason recorded"}</small>)}</div>)}</div>
            <div className="detail-evidence"><h3>Temporal evidence</h3>{detail.frames.length ? <div className="evidence-frames">{detail.frames.map((frame) => <figure key={frame.id}>{frame.available && frame.url ? <img src={frame.url} alt={`${frame.type} at ${frame.timestampMs}ms`} /> : <div className="unavailable-media">Frame unavailable</div>}<figcaption>{frame.type} · {frame.timestampMs}ms</figcaption></figure>)}</div> : <p className="empty-state">Frames unavailable for this content.</p>}{detail.audio.available && detail.audio.url ? <audio controls src={detail.audio.url}>Audio evidence</audio> : <p className="muted">Audio unavailable for this content.</p>}<h3>Timestamped transcript</h3>{detail.transcript.length ? <ol className="transcript-list">{detail.transcript.map((segment) => <li key={segment.id}><strong>{segment.startMs}–{segment.endMs}ms</strong> {segment.text}</li>)}</ol> : <p className="muted">Transcript unavailable for this content.</p>}<h3>Analyst entry annotations</h3>{detail.anchors.length ? detail.anchors.map((anchor) => <p className="annotation" key={anchor.id}>{anchor.type} · {anchor.timestampMs}ms · {anchor.reviewState} · {anchor.note ?? "No note"}</p>) : <p className="muted">No analyst annotation recorded for this content.</p>}</div>
          </>}
        </section>
      </div>
      <footer className="footer-note">OBSERVED metrics, DERIVED metrics, and temporal evidence remain separate. Missing or stale evidence is shown as unavailable.</footer>
    </main>
  );
}
