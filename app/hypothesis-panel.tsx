"use client";

import { useState } from "react";

type Hypothesis = {
  id: string;
  statement: string;
  confidence: string;
  confidenceCaps: Array<{ rule: string; reason: string }>;
  suggestedNextTest: Record<string, unknown> | null;
  evidence: Array<{ id: string; layer: string; statement: string; source_type: string; role: string }>;
};

export default function HypothesisPanel({ batchId, comparisonId }: { batchId: string; comparisonId: string | null }) {
  const [result, setResult] = useState<Hypothesis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function generate() {
    if (!comparisonId || pending) return;
    setPending(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch('/api/hypotheses', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ batchId, comparisonId }) });
      const body = await response.json() as Hypothesis & { error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Hypothesis unavailable');
      setResult(body);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Hypothesis request failed');
    } finally {
      setPending(false);
    }
  }

  return <section className="hypothesis-panel" aria-labelledby="hypothesis-heading">
    <div className="section-heading"><div><p className="eyebrow">S8 / WHY · EVIDENCE</p><h2 id="hypothesis-heading">Evidence-backed working insight</h2></div><span className="status">{comparisonId ? 'Comparison selected' : 'Generate comparison first'}</span></div>
    <button type="button" onClick={generate} disabled={!comparisonId || pending}>{pending ? 'Generating…' : 'Generate hypothesis'}</button>
    {error && <p className="error-state" role="alert">{error}</p>}
    {result && <div className="hypothesis-result" aria-live="polite">
      <p className="muted">Artifact {result.id} · confidence {result.confidence}</p>
      <p>{result.statement}</p>
      {result.confidenceCaps.length > 0 && <p className="notice">{result.confidenceCaps.map((cap) => `${cap.rule}: ${cap.reason}`).join(' · ')}</p>}
      {result.suggestedNextTest && <div><strong>Suggested next test</strong><pre>{JSON.stringify(result.suggestedNextTest, null, 2)}</pre></div>}
      <div><strong>Evidence</strong><ul>{result.evidence.map((item) => <li key={item.id}><span className="status">{item.role} · {item.layer} · {item.source_type}</span> {item.statement}</li>)}</ul></div>
    </div>}
  </section>;
}
