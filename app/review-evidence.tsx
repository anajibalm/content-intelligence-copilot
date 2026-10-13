"use client";

import { useEffect, useState } from 'react';
import { KeyValueView } from './key-value-view';
import { labelId, metricTextId, reasonId } from '../lib/workspace/labels-id.ts';

export type ReviewEvidenceItem = {
  id: string;
  layer: string;
  statement: string;
  source_type: string;
  role: string;
  link: string | null;
  basis?: unknown;
  currentSource?: { aiValue: string; reviewedValue: string | null; reviewState: string } | null;
};

type ComparisonLink = { comparison_id: string; role: string };
type Comparison = { id: string; quality: string; qualityReasons?: string[] };

type FrozenMetric = { name: string; value: number | null; kind: 'Observasi' | 'Perhitungan'; quality: string | null; reason: string | null };

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function canonicalMetric(item: ReviewEvidenceItem): FrozenMetric | null {
  if (item.source_type !== 'METRIC_SNAPSHOT' || (item.layer !== 'OBSERVED' && item.layer !== 'DERIVED')) return null;
  const marker = item.statement.lastIndexOf(': ');
  if (marker < 0) return null;
  try {
    const values = record(JSON.parse(item.statement.slice(marker + 2)));
    if (!values) return null;
    const name = item.layer === 'DERIVED' ? 'engagement_rate' : Object.keys(values).find((key) => values[key] === null || typeof values[key] === 'number');
    const derived = name ? record(values[name]) : null;
    const value = item.layer === 'DERIVED' ? derived?.value : name ? values[name] : undefined;
    if (!name || (value !== null && typeof value !== 'number')) return null;
    const basis = record(item.basis);
    const quality = record(record(basis?.qualityJson)?.[name]);
    return { name, value, kind: item.layer === 'DERIVED' ? 'Perhitungan' : 'Observasi', quality: typeof quality?.state === 'string' ? quality.state : typeof basis?.quality === 'string' ? basis.quality : null, reason: typeof quality?.reason === 'string' ? quality.reason : null };
  } catch {
    return null;
  }
}

function SourceLink({ link }: { link: string | null }) {
  return link ? <a href={link}>Buka sumber exact</a> : null;
}

function MetricSummary({ metric }: { metric: FrozenMetric }) {
  return <><span className="metric-summary-label">Ringkasan tampilan</span><strong>{labelId(metric.name)} · {metric.kind}</strong><span className="review-evidence-value">{metricTextId(metric.value, metric.name)}</span><span>{metric.kind}</span><span className="status">Basis beku</span><span className="metric-quality">{metric.quality ? `${labelId(metric.quality)}${metric.reason ? ` · ${reasonId(metric.reason)}` : ''}` : 'Kualitas belum tersedia'}</span></>;
}

function EvidenceCard({ item }: { item: ReviewEvidenceItem }) {
  const metric = canonicalMetric(item);
  const isMetric = item.source_type === 'METRIC_SNAPSHOT';
  return <article className="review-evidence-card">
    <header><span className="status">{labelId(item.role)} · {labelId(item.layer)}</span><span>{labelId(item.source_type)}</span></header>
    {metric ? <><MetricSummary metric={metric} /><details><summary>Basis snapshot dan input</summary><KeyValueView value={item.basis} /></details></> : isMetric ? <><p className="muted">Format bukti historis tidak dikenali untuk ringkasan tampilan.</p><details><summary>Isi bukti asli</summary><KeyValueView value={item.statement} /></details></> : <><p className="preserve-text">{item.statement}</p>{item.basis != null && <details><summary>Basis dan provenance</summary><KeyValueView value={item.basis} /></details>}{item.currentSource && <details open><summary>Nilai sumber kini</summary><KeyValueView value={item.currentSource} /></details>}</>}
    <SourceLink link={item.link} />
    <details><summary>Provenance dan isi asli</summary><KeyValueView value={item} /></details>
  </article>;
}

function ComparisonQuality({ links }: { links: ComparisonLink[] }) {
  const [items, setItems] = useState<Comparison[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!links.length) return;
    const controller = new AbortController();
    Promise.all(links.map(async (link) => {
      const response = await fetch(`/api/comparisons?comparisonId=${encodeURIComponent(link.comparison_id)}`, { signal: controller.signal });
      const body = await response.json() as Comparison & { error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Kualitas perbandingan gagal dimuat');
      return body;
    })).then((next) => { if (!controller.signal.aborted) setItems(next); }).catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Kualitas perbandingan gagal dimuat'); });
    return () => controller.abort();
  }, [links]);
  return <section className="comparison-quality" aria-label="Kualitas perbandingan"><h3>Kualitas perbandingan</h3>
    {!links.length ? <p className="muted">Belum tersedia. Hipotesis legacy tidak merujuk ID perbandingan tersimpan.</p> : error ? <p className="error-state" role="alert">{error}</p> : !items ? <p role="status">Memuat kualitas perbandingan…</p> : <ul>{items.map((item, index) => <li key={item.id}><strong>{labelId(item.quality)}</strong> · {labelId(links[index].role)}{item.qualityReasons?.length ? <span> · {item.qualityReasons.map(reasonId).join(' ')}</span> : null}</li>)}</ul>}
  </section>;
}

export function ReviewEvidence({ evidence, comparisons }: { evidence: ReviewEvidenceItem[]; comparisons: ComparisonLink[] }) {
  const metrics = evidence.filter((item) => item.source_type === 'METRIC_SNAPSHOT');
  const media = evidence.filter((item) => item.source_type !== 'METRIC_SNAPSHOT');
  return <>
    <div className="review-claim-facts"><section><span>Dugaan</span><span>Confidence ditentukan engine, bukan kualitas perbandingan atau keputusan reviewer.</span></section><ComparisonQuality links={comparisons} /></div>
    <section className="review-evidence" aria-label="Bukti hipotesis"><h3>Bukti</h3>
      {metrics.length > 0 && <div className="review-provenance-rail" aria-label="Jalur bukti metrik">Sumber · Snapshot beku · Metrik · Dugaan</div>}
      {metrics.map((item) => <EvidenceCard item={item} key={item.id} />)}
      {media.length > 0 && <div className="review-provenance-rail" aria-label="Jalur bukti media">Media · Frame atau transkrip · Ekstraksi AI</div>}
      {media.map((item) => <EvidenceCard item={item} key={item.id} />)}
      {!evidence.length && <p className="empty-state">Belum ada bukti tersimpan untuk hipotesis ini.</p>}
    </section>
  </>;
}
