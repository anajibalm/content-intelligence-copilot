"use client";

import { useEffect, useState } from 'react';
import type { Hypothesis } from './hypothesis-panel';
import { HypothesisReviewControls } from './review-panel';
import { S10Panel } from './s10-panel';
import { KeyValueView } from './key-value-view';
import { labelId, reasonId } from '../lib/workspace/labels-id.ts';

type QueueItem = { id: string; batchId: string; statement: string; confidence: string; reviewDecision: string | null; reviewedStatement: string | null };

function HypothesisDetail({ batchId, hypothesisId, onReviewed }: { batchId: string; hypothesisId: string; onReviewed: () => void }) {
  const [result, setResult] = useState<Hypothesis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/hypotheses?batchId=${encodeURIComponent(batchId)}&hypothesisId=${encodeURIComponent(hypothesisId)}`, { signal: controller.signal }).then(async (response) => {
      const body = await response.json() as Hypothesis & { error?: string };
      if (controller.signal.aborted) return;
      if (!response.ok) throw new Error(body.error ?? 'Detail hipotesis gagal dimuat');
      if (body.batchId !== batchId || body.id !== hypothesisId) throw new Error('Hipotesis tidak sesuai batch terpilih');
      setResult(body);
    }).catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Detail hipotesis gagal dimuat'); });
    return () => controller.abort();
  }, [batchId, hypothesisId, version]);
  return <section className="hypothesis-detail" aria-label="Detail hipotesis" data-hypothesis-id={hypothesisId}>
    {error ? <div role="alert"><p className="error-state">{error}</p><button className="secondary" type="button" onClick={() => { setError(null); setVersion((value) => value + 1); }}>Coba lagi detail</button></div> : !result ? <p role="status">Memuat detail hipotesis…</p> : <>
      <h2>Detail hipotesis</h2><p className="muted">Confidence: {labelId(result.confidence)}</p>
      <h3>AI asli</h3><p className="preserve-text">{result.statement}</p>
      {result.confidenceCaps.length > 0 && <div className="notice"><strong>Batas confidence</strong><ul>{result.confidenceCaps.map((cap) => <li key={cap.rule}>{reasonId(cap.rule)}</li>)}</ul></div>}
      <details><summary>Detail teknis hipotesis</summary><KeyValueView value={{ id: result.id, confidence: result.confidence, confidenceCaps: result.confidenceCaps }} /></details>
      <h3>Bukti</h3><ul className="evidence-list">{result.evidence.map((item) => <li key={item.id}><span className="status">{labelId(item.role)} · {labelId(item.layer)} · {labelId(item.source_type)}</span>{item.basis && typeof item.basis === 'object' ? <KeyValueView value={item.basis} /> : <details><summary>Isi bukti asli (struktur historis tidak lengkap)</summary><KeyValueView value={item.statement} /></details>}{item.link && <a href={item.link}>Buka sumber exact</a>}<details><summary>Provenance dan isi asli</summary><KeyValueView value={item} /></details></li>)}</ul>
      {result.suggestedNextTest != null && <details><summary>Saran AI untuk uji berikutnya</summary><p className="muted">Saran, bukan record eksperimen tersimpan.</p><KeyValueView value={result.suggestedNextTest} /></details>}
      <HypothesisReviewControls hypothesisId={result.id} onReviewed={onReviewed} />
      <S10Panel hypothesisId={result.id} targetBatchId={result.batchId} />
    </>}
  </section>;
}

export default function HypothesisQueue({ batchId, hypothesisId, onSelect, revision }: { batchId: string; hypothesisId: string | null; onSelect: (id: string) => void; revision: number }) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [all, setAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [opened, setOpened] = useState<string[]>(() => hypothesisId ? [hypothesisId] : []);
  if (hypothesisId && !opened.includes(hypothesisId)) setOpened([...opened, hypothesisId]);
  function refreshQueue() { setLoading(true); setError(null); setVersion((value) => value + 1); }
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/hypotheses?batchId=${encodeURIComponent(batchId)}`, { signal: controller.signal }).then(async (response) => {
      const body = await response.json() as { items?: QueueItem[]; error?: string };
      if (controller.signal.aborted) return;
      if (!response.ok) throw new Error(body.error ?? 'Antrean review gagal dimuat');
      if (!Array.isArray(body.items) || body.items.some((item) => item.batchId !== batchId)) throw new Error('Antrean tidak sesuai batch terpilih');
      setItems(body.items);
      setError(null);
    }).catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Antrean review gagal dimuat'); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [batchId, version, revision]);
  const visible = items.filter((item) => all || !item.reviewDecision);
  return <div className="review-workspace">
    <section className="review-queue" aria-label="Antrean hipotesis"><h2>Antrean hipotesis</h2><div className="queue-filters"><button className="secondary" type="button" aria-pressed={!all} onClick={() => setAll(false)}>Menunggu review</button><button className="secondary" type="button" aria-pressed={all} onClick={() => setAll(true)}>Semua</button></div>
      {loading ? <p role="status">Memuat antrean review…</p> : error ? <div role="alert"><p className="error-state">{error}</p><button className="secondary" type="button" onClick={refreshQueue}>Coba lagi</button></div> : visible.length === 0 ? <p className="empty-state">{all ? 'Belum ada hipotesis tersimpan pada batch ini. Buat dari Compare.' : 'Tidak ada hipotesis menunggu review. Pilih Semua untuk membuka hasil review tersimpan.'}</p> : <ul>{visible.map((item) => <li key={item.id}><button className="queue-choice secondary" type="button" aria-pressed={item.id === hypothesisId} onClick={() => onSelect(item.id)}><strong>{item.reviewedStatement ?? item.statement}</strong><span>{item.reviewDecision ? labelId(item.reviewDecision) : 'Menunggu review'} · Confidence {labelId(item.confidence)}</span></button></li>)}</ul>}
    </section>
    {!hypothesisId && <p className="empty-state">Pilih satu hipotesis untuk melihat bukti, review, Notes, dan Next Test.</p>}
    {opened.map((id) => <div key={id} hidden={id !== hypothesisId}><HypothesisDetail batchId={batchId} hypothesisId={id} onReviewed={refreshQueue} /></div>)}
  </div>;
}
