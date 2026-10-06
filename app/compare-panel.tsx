"use client";

import { useMemo, useState } from "react";

type Content = {
  id: string;
  title: string | null;
  externalId: string;
  snapshots: Array<{ id: string; distribution: "ORGANIC" | "PAID"; quality: string }>;
};

type CompareResult = {
  id?: string;
  mode: string;
  scope: string;
  distribution: string;
  quality: string;
  qualityReasons: string[];
  snapshotIds: string[];
  controlledVariables: Record<string, string | number | boolean | null>;
  uncontrolledVariables: Record<string, string | number | boolean | null>;
  items: Array<{ contentId: string; position: number; metricSnapshotId: string | null }>;
};

function label(content: Content) {
  return content.title ?? `TikTok ${content.externalId}`;
}

export default function ComparePanel({ batchId, contents }: { batchId: string; contents: Content[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [distribution, setDistribution] = useState<"ORGANIC" | "PAID">("ORGANIC");
  const [mode, setMode] = useState<"CONTROLLED" | "PERFORMANCE_CONTRAST" | "MANUAL">("CONTROLLED");
  const [result, setResult] = useState<CompareResult | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const available = useMemo(() => contents.filter((content) => content.snapshots.some((snapshot) => snapshot.distribution === distribution)), [contents, distribution]);

  function toggle(contentId: string) {
    setSelected((current) => current.includes(contentId) ? current.filter((id) => id !== contentId) : [...current, contentId]);
    setResult(null);
    setStatus(null);
  }

  async function compare() {
    setStatus(null);
    if (selected.length < 2) {
      setStatus("Select at least two content items in order.");
      return;
    }
    const response = await fetch("/api/comparisons", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ batchId, contentIds: selected, mode, scope: selected.length === 2 ? "PAIR" : "GROUP", distribution }),
    });
    const body = await response.json() as CompareResult & { error?: string };
    if (!response.ok) {
      setStatus(body.error ?? "Comparison unavailable");
      return;
    }
    setResult(body);
  }

  return <section className="compare-panel" aria-labelledby="compare-heading">
    <div className="section-heading">
      <div><p className="eyebrow">S7 / CONTROLLED COMPARE</p><h2 id="compare-heading">Compare selected content</h2></div>
      <span className="status">{selected.length} selected · order preserved</span>
    </div>
    <div className="compare-controls">
      <label>Distribution<select value={distribution} onChange={(event) => { setDistribution(event.target.value as "ORGANIC" | "PAID"); setSelected([]); setResult(null); }}>{["ORGANIC", "PAID"].map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Mode<select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}><option value="CONTROLLED">Controlled</option><option value="PERFORMANCE_CONTRAST">Performance contrast</option><option value="MANUAL">Manual</option></select></label>
      <button type="button" onClick={compare} disabled={selected.length < 2}>Generate comparison</button>
    </div>
    {available.length ? <div className="compare-selection" role="list" aria-label="Comparison content selection">{available.map((content) => <button className={`compare-choice ${selected.includes(content.id) ? "selected" : ""}`} type="button" key={content.id} onClick={() => toggle(content.id)}><strong>{selected.includes(content.id) ? `${selected.indexOf(content.id) + 1}. ` : ""}{label(content)}</strong><span>{content.externalId}</span></button>)}</div> : <p className="empty-state">No content has metric snapshot for selected distribution.</p>}
    {status && <p className="error-state" role="alert">{status}</p>}
    {result && <div className="compare-result" aria-live="polite">
      <div className="compare-result-heading"><h3>{result.mode === "PERFORMANCE_CONTRAST" ? "Exploratory performance contrast" : "Controlled comparison"}</h3><span className="state">Quality {result.quality}</span></div>
      <p className="muted">{result.distribution} · snapshots frozen: {result.snapshotIds.length}/{result.items.length} · rule {result.id ? result.id : "not persisted"}</p>
      <div className="compare-cards">{result.items.map((item) => <article className="compare-card" key={item.contentId}><p className="eyebrow">Position {item.position}</p><h4>{label(contents.find((content) => content.id === item.contentId) ?? { id: item.contentId, title: null, externalId: item.contentId, snapshots: [] })}</h4><p className="muted">Snapshot {item.metricSnapshotId ?? "unavailable"}</p></article>)}</div>
      <div className="compare-variables"><div><strong>Controlled variables</strong><pre>{JSON.stringify(result.controlledVariables, null, 2)}</pre></div><div><strong>Uncontrolled variables</strong><pre>{JSON.stringify(result.uncontrolledVariables, null, 2)}</pre></div></div>
      {result.qualityReasons.length > 0 && <p className="notice">{result.qualityReasons.join(" · ")}</p>}
    </div>}
  </section>;
}
