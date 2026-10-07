"use client";

import { useEffect, useRef, useState } from "react";
import { HypothesisReviewControls } from "./review-panel";
import { S10Panel } from "./s10-panel";

type Hypothesis = {
  batchId: string;
  statement: string;
  id: string;
  confidence: string;
  confidenceCaps: Array<{ rule: string; reason: string }>;
  suggestedNextTest: Record<string, unknown> | null;
  evidence: Array<{ id: string; layer: string; statement: string; source_type: string; role: string; link: string | null }>;
};

export default function HypothesisPanel({ batchId, comparisonId }: { batchId: string; comparisonId: string | null }) {
  const [result, setResult] = useState<Hypothesis | null>(null);
  const [resultComparisonId, setResultComparisonId] = useState<string | null>(null);
  const [persistedHypothesisId] = useState(() => typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("hypothesisId"));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const operationId = useRef<string | null>(null);
  const requestVersion = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const isPending = pending;

  useEffect(() => {
    if (!persistedHypothesisId) return;
    const nextController = new AbortController();
    fetch(`/api/hypotheses?hypothesisId=${persistedHypothesisId}`, { signal: nextController.signal })
      .then(async (response) => {
        const body = await response.json() as Hypothesis & { error?: string };
        if (!response.ok) throw new Error(body.error ?? "Persisted hypothesis unavailable");
        setResult(body);
        setResultComparisonId(null);
      })
      .catch((reason: unknown) => { if (!nextController.signal.aborted) setError(reason instanceof Error ? reason.message : "Persisted hypothesis unavailable"); });
    return () => nextController.abort();
  }, [persistedHypothesisId]);
  useEffect(() => {
    requestVersion.current += 1;
    return () => {
      controller.current?.abort();
      requestVersion.current += 1;
    };
  }, []);

  async function generate(regenerate = false) {
    if (!comparisonId || isPending) return;
    const version = requestVersion.current;
    const activeComparisonId = comparisonId;
    const nextController = new AbortController();
    controller.current = nextController;
    setPending(true);
    setError(null);
    setResult(null);
    const requestOperationId = regenerate ? crypto.randomUUID() : (operationId.current ??= crypto.randomUUID());
    try {
      const response = await fetch('/api/hypotheses', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': requestOperationId }, body: JSON.stringify({ batchId, comparisonId: activeComparisonId, regenerate, operationId: requestOperationId }), signal: nextController.signal });
      const body = await response.json() as Hypothesis & { error?: string };
      if (version !== requestVersion.current || nextController.signal.aborted) return;
      if (!response.ok) throw new Error(body.error ?? 'Hypothesis unavailable');
      setResult(body);
      setResultComparisonId(activeComparisonId);
    } catch (reason) {
      if (nextController.signal.aborted || version !== requestVersion.current) return;
      setError(reason instanceof Error ? reason.message : 'Hypothesis request failed');
    } finally {
      if (version === requestVersion.current) {
        controller.current = null;
        setPending(false);
      }
    }
  }

  const visibleResult = result && (resultComparisonId === comparisonId || result.id === persistedHypothesisId);
  return <section className="hypothesis-panel" aria-labelledby="hypothesis-heading">
    <div className="section-heading"><div><p className="eyebrow">S8 / WHY · EVIDENCE</p><h2 id="hypothesis-heading">Evidence-backed working insight</h2></div><span className="status">{comparisonId ? 'Comparison selected' : persistedHypothesisId ? 'Persisted hypothesis' : 'Generate comparison first'}</span></div>
    <button type="button" onClick={() => generate(false)} disabled={!comparisonId || isPending}>{isPending ? 'Generating…' : 'Generate hypothesis'}</button>{result && resultComparisonId === comparisonId && <button type="button" onClick={() => generate(true)} disabled={isPending}>Regenerate hypothesis</button>}
    {error && <p className="error-state" role="alert">{error}</p>}
    {visibleResult && <div className="hypothesis-result" aria-live="polite">
      <p className="muted">Artifact {result.id} · confidence {result.confidence}</p>
      <p>AI original statement: {result.statement}</p>
      {result.confidenceCaps.length > 0 && <p className="notice">{result.confidenceCaps.map((cap) => `${cap.rule}: ${cap.reason}`).join(' · ')}</p>}
      {result.suggestedNextTest && <div><strong>Uji berikutnya yang disarankan</strong><pre>{JSON.stringify(result.suggestedNextTest, null, 2)}</pre></div>}
      <div><strong>Bukti</strong><ul>{result.evidence.map((item) => <li key={item.id}><span className="status">{item.role} · {item.layer} · {item.source_type}</span> {item.statement} {item.link && <a href={item.link}>Buka sumber exact</a>}</li>)}</ul></div>
      <HypothesisReviewControls hypothesisId={result.id} />
      <S10Panel hypothesisId={result.id} targetBatchId={result.batchId} />
    </div>}
  </section>;
}
