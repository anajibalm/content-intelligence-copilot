"use client";

import { useEffect, useRef, useState } from 'react';
import { labelId } from '../lib/workspace/labels-id.ts';

export type Hypothesis = {
  batchId: string; statement: string; id: string; confidence: string;
  confidenceCaps: Array<{ rule: string; reason: string }>;
  suggestedNextTest: unknown;
  evidence: Array<{ id: string; layer: string; statement: string; source_type: string; role: string; link: string | null; basis?: unknown }>;
};

export default function HypothesisPanel({ batchId, comparisonId, onReview, onGenerated }: { batchId: string; comparisonId: string | null; onReview: (id: string) => void; onGenerated: () => void }) {
  const [result, setResult] = useState<Hypothesis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const operationId = useRef<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function generate(regenerate = false) {
    if (!comparisonId || pending) return;
    const nextController = new AbortController();
    controller.current = nextController;
    setPending(true); setError(null);
    const requestOperationId = regenerate ? crypto.randomUUID() : (operationId.current ??= crypto.randomUUID());
    try {
      const response = await fetch('/api/hypotheses', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': requestOperationId }, body: JSON.stringify({ batchId, comparisonId, regenerate, operationId: requestOperationId }), signal: nextController.signal });
      const body = await response.json() as Hypothesis & { error?: string };
      if (nextController.signal.aborted) return;
      if (!response.ok) throw new Error(body.error ?? 'Generation hipotesis gagal');
      setResult(body);
      onGenerated();
    } catch (reason) { if (!nextController.signal.aborted) setError(reason instanceof Error ? reason.message : 'Generation hipotesis gagal'); }
    finally { if (!nextController.signal.aborted) setPending(false); }
  }
  return <section className="hypothesis-panel" aria-labelledby="hypothesis-heading">
    <div className="section-heading"><h2 id="hypothesis-heading">Buat hipotesis</h2><span className="status">{comparisonId ? 'Perbandingan terpilih' : 'Perbandingan belum tersedia'}</span></div>
    <div className="review-actions"><button type="button" onClick={() => generate()} disabled={!comparisonId || pending}>{pending ? 'Membuat hipotesis…' : 'Buat hipotesis'}</button><button className="secondary" type="button" onClick={() => generate(true)} disabled={!comparisonId || !result || pending}>Buat ulang hipotesis</button></div>
    {!comparisonId && <p className="muted">Buat perbandingan valid sebelum generation hipotesis atau regeneration.</p>}
    {error && <p className="error-state" role="alert">{error}</p>}
    {result && <div className="hypothesis-result" aria-live="polite"><p>{result.statement}</p><p>Confidence: {labelId(result.confidence)}</p><a href={`?batchId=${batchId}&view=review&hypothesisId=${result.id}`} onClick={(event) => { event.preventDefault(); onReview(result.id); }}>Buka review</a></div>}
  </section>;
}
