"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { labelId, metricTextId } from '../lib/workspace/labels-id.ts';
import { KeyValueView } from './key-value-view';

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


function contentLabel(content: Content) {
  return content.title ?? `TikTok ${content.externalId}`;
}

function metricValue(value: number | null, name: string) {
  return metricTextId(value, name);
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
      <h2 id="compare-heading">Pilih konten untuk dibandingkan</h2>
      <span className="status">{selected.length} dari minimal 2 dipilih</span>
    </div>
    <div className="compare-controls">
      <label>Distribusi<select value={distribution} onChange={(event) => changeDistribution(event.target.value as 'ORGANIC' | 'PAID')}><option value="ORGANIC">Organik</option><option value="PAID">Iklan</option></select></label>
      <label>Mode<select value={mode} onChange={(event) => changeMode(event.target.value as typeof mode)}>{['CONTROLLED', 'PERFORMANCE_CONTRAST', 'MANUAL'].map((value) => <option value={value} key={value}>{labelId(value)}</option>)}</select></label>
      <div className="compare-actions"><button type="button" onClick={compare} disabled={pending || selected.length < 2}>{pending ? 'Membandingkan…' : 'Buat perbandingan'}</button>{pending ? <span className="muted">Perbandingan sedang dibuat.</span> : selected.length < 2 ? <span className="muted">Pilih minimal dua konten</span> : null}</div>
    </div>
    <button className="secondary" type="button" onClick={() => { invalidate(); setFullBatch(true); setSelected(contents.map((content) => content.id)); }} disabled={pending || contents.length < 2}>Pilih semua anggota batch</button>
    {available.length ? <div className="compare-selection" role="list" aria-label="Pilihan konten perbandingan">{available.map((content) => <button className={`compare-choice ${selected.includes(content.id) ? 'selected' : ''}`} aria-pressed={selected.includes(content.id)} type="button" key={content.id} onClick={() => toggle(content.id)}><strong>{selected.includes(content.id) ? `${selected.indexOf(content.id) + 1}. ` : ''}{contentLabel(content)}</strong><span>{content.externalId}</span></button>)}</div> : <p className="empty-state">Belum ada snapshot metrik untuk distribusi terpilih.</p>}
    {status && <p className="error-state" role="alert">{status}</p>}
    {result && <div className="compare-result" aria-live="polite">
      <div className="compare-result-heading"><h3>{labelId(result.mode)}</h3><span className="state">Kualitas {labelId(result.quality)}</span></div>
      <details><summary>Detail teknis perbandingan</summary><KeyValueView value={{ id: result.id, distribution: result.distribution, scope: result.scope, ruleVersion: result.ruleVersion, snapshotIds: result.snapshotIds, qualityReasons: result.qualityReasons }} /></details>
      {result.metricDerivationVersion && <p className="muted">Metrik: {result.metricDerivationVersion}, derivasi saat ini dari input snapshot beku. Kesimpulan historis tetap memakai {result.ruleVersion}.</p>}
      <div className="compare-cards">{result.metricRows.map((row) => <article className="compare-card" key={row.contentId}><h4>{contentLabel(contents.find((content) => content.id === row.contentId) ?? { id: row.contentId, title: null, externalId: row.contentId, snapshots: [] })}</h4><p className="muted">Snapshot beku: {row.metricSnapshotId ?? 'Belum tersedia'}</p><dl className="compare-metrics">{row.metrics.map((metric) => <div key={metric.name}><dt>{labelId(metric.name)}</dt><dd>{metricValue(metric.value, metric.name)}</dd><small title={`${metric.state}: ${metric.reason ?? ''}`}>{labelId(metric.state)}{metric.reason ? ` · ${labelId(metric.reason)}` : ''}</small></div>)}</dl></article>)}</div>
      <div className="compare-variables"><div><strong>Variabel terkontrol</strong><KeyValueView value={result.controlledVariables} /></div><div><strong>Variabel tidak terkontrol</strong><KeyValueView value={result.uncontrolledVariables} /></div></div>
      {result.qualityReasons.length > 0 && <p className="notice">Kualitas perbandingan terbatas. Sampel, kontrol, dan kualitas sumber belum cukup untuk klaim kausal; alasan asli tersedia di detail teknis.</p>}
    </div>}
  </section>;
}
