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

type FrozenEr = { value: number; formulaVersion?: string; sourceMetricNames?: string[] };

function frozenErValue(value: unknown): FrozenEr | null {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !('value' in value) || typeof value.value !== 'number') return null;
  const formulaVersion = 'formulaVersion' in value && typeof value.formulaVersion === 'string' ? value.formulaVersion : undefined;
  const sourceMetricNames = 'sourceMetricNames' in value && Array.isArray(value.sourceMetricNames) && value.sourceMetricNames.every((item) => typeof item === 'string') ? value.sourceMetricNames : undefined;
  return { value: value.value, formulaVersion, sourceMetricNames };
}

function frozenEr(item: ReviewEvidenceItem): FrozenEr | null {
  if (item.layer !== 'DERIVED' || item.source_type !== 'METRIC_SNAPSHOT') return null;
  const marker = item.statement.lastIndexOf(': ');
  if (marker < 0) return null;
  try {
    const parsed: unknown = JSON.parse(item.statement.slice(marker + 2));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !('engagement_rate' in parsed)) return null;
    return frozenErValue(parsed.engagement_rate);
  } catch {
    return null;
  }
}

function SourceLink({ link }: { link: string | null }) {
  return link ? <a href={link}>Buka sumber exact</a> : null;
}

function EvidenceCard({ item }: { item: ReviewEvidenceItem }) {
  const er = frozenEr(item);
  const isMetric = item.source_type === 'METRIC_SNAPSHOT';
  return <article className="review-evidence-card">
    <header><span className="status">{labelId(item.role)} · {labelId(item.layer)}</span><span>{labelId(item.source_type)}</span></header>
    {er ? <>
      <strong>Rasio interaksi</strong><span className="review-evidence-value">{metricTextId(er.value, 'engagement_rate')}</span><span>Perhitungan</span><span className="status">Basis beku</span>
      <details><summary>Basis snapshot dan input</summary><KeyValueView value={item.basis} /></details>
    </> : isMetric && item.layer === 'DERIVED' ? <>
      <p className="muted">Format bukti historis tidak dikenali untuk ringkasan tampilan.</p>
      <details><summary>Isi bukti asli</summary><KeyValueView value={item.statement} /></details>
    </> : <>
      <p className="preserve-text">{item.statement}</p>
      {item.basis != null && <details><summary>Basis dan provenance</summary><KeyValueView value={item.basis} /></details>}
      {item.currentSource && <details open><summary>Nilai sumber kini</summary><KeyValueView value={item.currentSource} /></details>}
    </>}
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
