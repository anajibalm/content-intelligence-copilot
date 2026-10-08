"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Content = {
  id: string;
  title: string | null;
  externalId: string;
  snapshots: Array<{ id: string; distribution: "ORGANIC" | "PAID"; quality: string }>;
};

type MetricRow = {
  contentId: string;
  metricSnapshotId: string | null;
  metrics: Array<{ name: string; value: number | null; state: string; reason: string | null }>;
};

type CompareResult = {
  id: string;
  ruleVersion: string;
  metricDerivationVersion?: string;
  metricBasis?: string;
  mode: string;
  scope: string;
  distribution: string;
  quality: string;
  qualityReasons: string[];
  snapshotIds: string[];
  controlledVariables: Record<string, string | number | boolean | null>;
  uncontrolledVariables: Record<string, string | number | boolean | null>;
  items: Array<{ contentId: string; position: number; metricSnapshotId: string | null }>;
  metricRows: MetricRow[];
};

const METRIC_LABELS: Record<string, string> = { views: "Views", awt_seconds: "AWT", wfv_pct: "WFV", engagement_rate: "ER" };

function contentLabel(content: Content) {
  return content.title ?? `TikTok ${content.externalId}`;
}

function metricValue(value: number | null, name: string) {
  if (value == null) return "unavailable";
  if (name === "engagement_rate" || name === "wfv_pct") return `${(value * 100).toFixed(1)}%`;
  if (name === "awt_seconds") return `${value.toFixed(2)} s`;
  return `${value}`;
}

export default function ComparePanel({ batchId, contents, onCreated, onInvalidated }: { batchId: string; contents: Content[]; onCreated: (comparisonId: string) => void; onInvalidated: () => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [fullBatch, setFullBatch] = useState(false);
  const [distribution, setDistribution] = useState<"ORGANIC" | "PAID">("ORGANIC");
  const [mode, setMode] = useState<"CONTROLLED" | "PERFORMANCE_CONTRAST" | "MANUAL">("CONTROLLED");
  const [result, setResult] = useState<CompareResult | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const requestId = useRef(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => {
    requestId.current += 1;
    controller.current?.abort();
  }, []);
  const available = useMemo(() => contents.filter((content) => content.snapshots.some((snapshot) => snapshot.distribution === distribution)), [contents, distribution]);

  function invalidate() {
    requestId.current += 1;
    controller.current?.abort();
    controller.current = null;
    setResult(null);
    setStatus(null);
    setPending(false);
    onInvalidated();
  }

  function changeDistribution(value: "ORGANIC" | "PAID") {
    setDistribution(value);
    setSelected([]);
    setFullBatch(false);
    invalidate();
  }

  function changeMode(value: "CONTROLLED" | "PERFORMANCE_CONTRAST" | "MANUAL") {
    setMode(value);
    invalidate();
  }

  function toggle(contentId: string) {
    invalidate();
    setFullBatch(false);
    setSelected((current) => current.includes(contentId) ? current.filter((id) => id !== contentId) : [...current, contentId]);
  }

  async function compare() {
    invalidate();
    if (selected.length < 2) {
      setStatus("Select at least two content items in order.");
      return;
    }
    const currentRequest = ++requestId.current;
    const nextController = new AbortController();
    controller.current = nextController;
    setPending(true);
    try {
      const response = await fetch("/api/comparisons", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ batchId, contentIds: selected, mode, scope: fullBatch ? "BATCH" : selected.length === 2 ? "PAIR" : "GROUP", distribution }),
        signal: nextController.signal,
      });
      const body = await response.json() as CompareResult & { error?: string };
      if (currentRequest !== requestId.current) return;
      if (!response.ok) throw new Error(body.error ?? "Comparison unavailable");
      setResult(body);
      onCreated(body.id);
    } catch (error) {
      if (nextController.signal.aborted || currentRequest !== requestId.current) return;
      setStatus(error instanceof Error ? error.message : "Comparison request failed");
    } finally {
      if (currentRequest === requestId.current) {
        controller.current = null;
        setPending(false);
      }
    }
  }

  return <section className="compare-panel" aria-labelledby="compare-heading">
    <div className="section-heading">
      <div><p className="eyebrow">S7 / CONTROLLED COMPARE</p><h2 id="compare-heading">Compare selected content</h2></div>
      <span className="status">{selected.length} selected · order preserved</span>
    </div>
    <div className="compare-controls">
      <label>Distribution<select value={distribution} onChange={(event) => changeDistribution(event.target.value as "ORGANIC" | "PAID")}><option>ORGANIC</option><option>PAID</option></select></label>
      <label>Mode<select value={mode} onChange={(event) => changeMode(event.target.value as typeof mode)}><option value="CONTROLLED">Controlled</option><option value="PERFORMANCE_CONTRAST">Performance contrast</option><option value="MANUAL">Manual</option></select></label>
      <button type="button" onClick={compare} disabled={pending}>{pending ? "Comparing…" : "Generate comparison"}</button>
    </div>
      <button type="button" onClick={() => { invalidate(); setFullBatch(true); setSelected(contents.map((content) => content.id)); }} disabled={pending || contents.length < 2}>Select all batch</button>
    {available.length ? <div className="compare-selection" role="list" aria-label="Comparison content selection">{available.map((content) => <button className={`compare-choice ${selected.includes(content.id) ? "selected" : ""}`} type="button" key={content.id} onClick={() => toggle(content.id)}><strong>{selected.includes(content.id) ? `${selected.indexOf(content.id) + 1}. ` : ""}{contentLabel(content)}</strong><span>{content.externalId}</span></button>)}</div> : <p className="empty-state">No content has metric snapshot for selected distribution.</p>}
    {status && <p className="error-state" role="alert">{status}</p>}
    {result && <div className="compare-result" aria-live="polite">
      <div className="compare-result-heading"><h3>{result.mode === "PERFORMANCE_CONTRAST" ? "Exploratory performance contrast" : result.mode === "MANUAL" ? "Manual comparison" : "Controlled comparison"}</h3><span className="state">Quality {result.quality}</span></div>
      <p className="muted">Artifact {result.id} · {result.distribution} · {result.scope} · rule {result.ruleVersion} · snapshots frozen {result.snapshotIds.length}/{result.items.length}</p>
      {result.metricDerivationVersion && <p className="muted">Metric rows: {result.metricDerivationVersion} · current derivation from frozen snapshot inputs. Stored artifact conclusion remains rule {result.ruleVersion}.</p>}
      <div className="compare-cards">{result.metricRows.map((row) => <article className="compare-card" key={row.contentId}><p className="eyebrow">Position {result.items.find((item) => item.contentId === row.contentId)?.position}</p><h4>{contentLabel(contents.find((content) => content.id === row.contentId) ?? { id: row.contentId, title: null, externalId: row.contentId, snapshots: [] })}</h4><p className="muted">Frozen snapshot {row.metricSnapshotId ?? "unavailable"}</p><dl className="compare-metrics">{row.metrics.map((metric) => <div key={metric.name}><dt>{METRIC_LABELS[metric.name] ?? metric.name}</dt><dd>{metricValue(metric.value, metric.name)}</dd><small>{metric.state}{metric.reason ? ` · ${metric.reason}` : ""}</small></div>)}</dl></article>)}</div>
      <div className="compare-variables"><div><strong>Controlled variables</strong><pre>{JSON.stringify(result.controlledVariables, null, 2)}</pre></div><div><strong>Uncontrolled variables</strong><pre>{JSON.stringify(result.uncontrolledVariables, null, 2)}</pre></div></div>
      {result.qualityReasons.length > 0 && <p className="notice">{result.qualityReasons.join(" · ")}</p>}
    </div>}
  </section>;
}
