"use client";

import { useEffect, useId, useRef, useState } from "react";
import { REVIEW_REASONS, type ReviewReason } from "../lib/domain/types.ts";
import { labelId, reasonId } from '../lib/workspace/labels-id.ts';

type Feature = { id: string; extractionRunId: string; fieldName: string; aiValue: string; reviewedValue: string | null; reviewState: string };
type FeatureReviewRecord = { id: string; contentFeatureId: string; extractionRunId: string; fieldName: string; decision: string; reasonCode: ReviewReason | null; reviewedValue: string | null; goldenLabel: boolean; reviewer: string; note: string | null; createdAt: string };
type FeatureCorrectionRecord = { id: string; contentFeatureId: string; extractionRunId: string; fieldName: string; originalAiValue: string; correctedValue: string; reasonCode: ReviewReason; reviewer: string; note: string | null; createdAt: string };
type ContentReviewHistory = { contentId: string; reviews: FeatureReviewRecord[]; corrections: FeatureCorrectionRecord[] };
type HypothesisReviewRecord = { id: string; hypothesisId: string; decision: string; reasonCode: ReviewReason | null; editedStatement: string | null; reviewedStatement: string; goldenLabel: boolean; reviewer: string; note: string | null; createdAt: string };
type Validation = { reviewer: string | null; reason: string | null };

function ReviewMeta({ reviewer, setReviewer, note, setNote, goldenLabel, setGoldenLabel, error, reviewerRef }: { reviewer: string; setReviewer: (value: string) => void; note: string; setNote: (value: string) => void; goldenLabel: boolean; setGoldenLabel: (value: boolean) => void; error: string | null; reviewerRef: React.RefObject<HTMLInputElement | null> }) {
  const errorId = useId();
  return <div className="review-meta">
    <label>Reviewer<input ref={reviewerRef} value={reviewer} onChange={(event) => setReviewer(event.target.value)} placeholder="Identitas analyst" aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined} /></label>
    {error && <p className="inline-validation" id={errorId} role="alert">{error}</p>}
    <label>Catatan keputusan<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} placeholder="Opsional, disimpan bersama keputusan" /></label>
    <label className="review-golden"><input type="checkbox" checked={goldenLabel} onChange={(event) => setGoldenLabel(event.target.checked)} />Tandai golden label (ground truth analyst)</label>
  </div>;
}

function ReasonSelect({ label, value, onChange, error, reasonRef }: { label: string; value: ReviewReason | ""; onChange: (value: ReviewReason | "") => void; error?: string | null; reasonRef?: React.RefObject<HTMLSelectElement | null> }) {
  const errorId = useId();
  return <><label>{label}<select ref={reasonRef} value={value} onChange={(event) => onChange(event.target.value as ReviewReason | "")} aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined}><option value="">Pilih alasan…</option>{REVIEW_REASONS.map((reason) => <option value={reason} key={reason}>{reasonId(reason)}</option>)}</select></label>{error && <p className="inline-validation" id={errorId} role="alert">{error}</p>}</>;
}

export function FeatureReviewPanel({ contentId, features, onReviewed }: { contentId: string; features: Feature[]; onReviewed: () => void }) {
  const [mode, setMode] = useState<"IDLE" | "CORRECT">("IDLE");
  const [reviewer, setReviewer] = useState("");
  const [note, setNote] = useState("");
  const [goldenLabel, setGoldenLabel] = useState(false);
  const [reasonCode, setReasonCode] = useState<ReviewReason | "">("");
  const [corrections, setCorrections] = useState<Record<string, string>>({});
  const [correctionReasons, setCorrectionReasons] = useState<Record<string, ReviewReason | "">>({});
  const [history, setHistory] = useState<ContentReviewHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validation, setValidation] = useState<Validation>({ reviewer: null, reason: null });
  const [pending, setPending] = useState(false);
  const reviewerRef = useRef<HTMLInputElement>(null);
  const reasonRef = useRef<HTMLSelectElement>(null);
  const requestId = useRef(0);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    const currentRequest = ++requestId.current;
    const nextController = new AbortController();
    controller.current = nextController;
    fetch(`/api/workspace/contents/${contentId}/review`, { signal: nextController.signal }).then(async (response) => {
      const body = await response.json() as ContentReviewHistory & { error?: string };
      if (currentRequest !== requestId.current) return;
      if (!response.ok) throw new Error(body.error ?? "Review history unavailable");
      setHistory(body);
    }).catch((reason: unknown) => {
      if (!nextController.signal.aborted && currentRequest === requestId.current) setError(reason instanceof Error ? reason.message : "Review history unavailable");
    });
    return () => { requestId.current += 1; nextController.abort(); };
  }, [contentId]);

  const extractionRunId = features[0]?.extractionRunId;
  const activeFeatures = features.filter((feature) => feature.extractionRunId === extractionRunId);
  const unreviewed = activeFeatures.filter((feature) => feature.reviewState === 'UNREVIEWED');
  const correctionEntries = Object.entries(corrections).filter(([, value]) => value.trim());
  function validate(decision: 'CONFIRM' | 'CORRECT' | 'REJECT') {
    const next = { reviewer: reviewer.trim() ? null : 'Isi nama reviewer untuk menyimpan keputusan', reason: decision === 'REJECT' && !reasonCode ? 'Pilih alasan penolakan untuk menyimpan keputusan' : null };
    setValidation(next);
    if (next.reviewer) { reviewerRef.current?.focus(); return false; }
    if (next.reason) { reasonRef.current?.focus(); return false; }
    return true;
  }
  async function submit(decision: 'CONFIRM' | 'CORRECT' | 'REJECT') {
    if (pending || !activeFeatures.length || !validate(decision)) return;
    const currentRequest = ++requestId.current;
    const nextController = new AbortController();
    controller.current = nextController;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/workspace/contents/${contentId}/review`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ extractionRunId, decision, reviewer: reviewer.trim(), note: note.trim() || undefined, reasonCode: decision === 'REJECT' ? reasonCode : undefined, goldenLabel: decision === 'REJECT' ? false : goldenLabel, corrections: decision === 'CORRECT' ? correctionEntries.map(([contentFeatureId, value]) => ({ contentFeatureId, value: value.trim(), reasonCode: correctionReasons[contentFeatureId] || undefined })) : undefined }), signal: nextController.signal });
      const body = await response.json() as { error?: string };
      if (currentRequest !== requestId.current) return;
      if (!response.ok) throw new Error(body.error ?? 'Review unavailable');
      setMode('IDLE'); setCorrections({}); setCorrectionReasons({}); setGoldenLabel(false);
      const refreshed = await fetch(`/api/workspace/contents/${contentId}/review`, { signal: nextController.signal });
      const nextHistory = await refreshed.json() as ContentReviewHistory;
      if (currentRequest === requestId.current && refreshed.ok) setHistory(nextHistory);
      onReviewed();
    } catch (reason) {
      if (!nextController.signal.aborted && currentRequest === requestId.current) setError(reason instanceof Error ? reason.message : 'Review request failed');
    } finally { if (currentRequest === requestId.current) { controller.current = null; setPending(false); } }
  }
  const historyGroups: FeatureReviewRecord[][] = [];
  for (const review of history?.reviews ?? []) {
    const last = historyGroups.at(-1);
    if (review.decision === 'CONFIRM' && last?.[0].decision === 'CONFIRM') last.push(review);
    else historyGroups.push([review]);
  }
  return <>
    <p className="muted">AI asli tidak berubah. Ekstraksi belum direview membatasi confidence ke Rendah.</p>
    <table className="fingerprint-table"><thead><tr><th>Field</th><th>AI asli</th><th>Hasil review</th><th>Status</th></tr></thead><tbody>{activeFeatures.map((feature) => <tr id={`content-feature-${feature.id}`} key={feature.id} className={feature.reviewState === 'CORRECTED' || feature.reviewState === 'REJECTED' ? 'review-changed' : ''}><th scope="row" title={feature.fieldName}>{labelId(feature.fieldName)}<small>{feature.fieldName}</small></th><td data-label="AI asli">{feature.aiValue}</td><td data-label="Hasil review">{feature.reviewedValue ?? 'Belum direview'}{mode === 'CORRECT' && <div className="review-correction"><label>Nilai koreksi<input value={corrections[feature.id] ?? ''} onChange={(event) => setCorrections((current) => ({ ...current, [feature.id]: event.target.value }))} placeholder="Kosong berarti tidak diubah" /></label><ReasonSelect label="Alasan koreksi" value={correctionReasons[feature.id] ?? ''} onChange={(value) => setCorrectionReasons((current) => ({ ...current, [feature.id]: value }))} /></div>}</td><td data-label="Status">{labelId(feature.reviewState)}</td></tr>)}</tbody></table>
    <div className="review-panel"><div className="section-heading"><h3>Review fingerprint</h3><span className="status">{unreviewed.length} menunggu review · {activeFeatures.length} field</span></div>
      <ReviewMeta reviewer={reviewer} setReviewer={(value) => { setReviewer(value); setValidation((current) => ({ ...current, reviewer: null })); }} note={note} setNote={setNote} goldenLabel={goldenLabel} setGoldenLabel={setGoldenLabel} error={validation.reviewer} reviewerRef={reviewerRef} />
      <ReasonSelect label="Alasan penolakan (wajib untuk Tolak semua)" value={reasonCode} onChange={(value) => { setReasonCode(value); setValidation((current) => ({ ...current, reason: null })); }} error={validation.reason} reasonRef={reasonRef} />
      <div className="review-actions"><button type="button" onClick={() => submit('CONFIRM')} disabled={pending || !unreviewed.length}>{pending ? 'Menyimpan…' : `Konfirmasi ${unreviewed.length} field yang belum direview`}</button><button className="secondary" type="button" onClick={() => setMode(mode === 'CORRECT' ? 'IDLE' : 'CORRECT')} disabled={pending}>{mode === 'CORRECT' ? 'Tutup koreksi' : 'Koreksi field'}</button>{mode === 'CORRECT' && <button type="button" onClick={() => submit('CORRECT')} disabled={pending || !correctionEntries.length || correctionEntries.some(([id]) => !correctionReasons[id])}>{pending ? 'Menyimpan…' : 'Simpan koreksi'}</button>}<button className="destructive" type="button" onClick={() => submit('REJECT')} disabled={pending || !activeFeatures.length}>{pending ? 'Menyimpan…' : 'Tolak semua'}</button></div>
      <p className="muted">{pending ? 'Sedang menyimpan.' : !unreviewed.length ? 'Tidak ada field yang dapat dikonfirmasi.' : 'Konfirmasi hanya untuk field belum direview pada run aktif.'}</p>{error && <p className="error-state" role="alert">{error}</p>}
      {history && (history.reviews.length > 0 || history.corrections.length > 0) && <div className="review-history" aria-live="polite"><h3>Riwayat review (append-only)</h3>{historyGroups.map((group) => group[0].decision === 'CONFIRM' ? <details key={group[0].id}><summary>Konfirmasi {group.length} field</summary><ul>{group.map((review) => <li key={review.id}>{labelId(review.fieldName)} · {review.reviewer}</li>)}</ul></details> : <ul key={group[0].id}>{group.map((review) => <li className="review-changed" key={review.id}>{labelId(review.decision)} · {review.reviewer}</li>)}</ul>)}<h4>Koreksi tersimpan</h4><ul>{history.corrections.map((correction) => <li className="review-changed" key={correction.id}>{labelId(correction.fieldName)}: AI asli {correction.originalAiValue} · Hasil review {correction.correctedValue}</li>)}</ul></div>}
    </div>
  </>;
}

export function HypothesisReviewControls({ hypothesisId, onReviewed }: { hypothesisId: string; onReviewed?: () => void }) {
  const [mode, setMode] = useState<"IDLE" | "EDIT">("IDLE");
  const [reviewer, setReviewer] = useState("");
  const [note, setNote] = useState("");
  const [goldenLabel, setGoldenLabel] = useState(false);
  const [reasonCode, setReasonCode] = useState<ReviewReason | "">("");
  const [editedStatement, setEditedStatement] = useState("");
  const [reviews, setReviews] = useState<HypothesisReviewRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [validation, setValidation] = useState<Validation>({ reviewer: null, reason: null });
  const [pending, setPending] = useState(false);
  const reviewerRef = useRef<HTMLInputElement>(null);
  const reasonRef = useRef<HTMLSelectElement>(null);
  const requestId = useRef(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const currentRequest = ++requestId.current;
    const nextController = new AbortController();
    controller.current = nextController;
    fetch(`/api/hypotheses/review?hypothesisId=${hypothesisId}`, { signal: nextController.signal }).then(async (response) => {
      const body = await response.json() as { reviews?: HypothesisReviewRecord[]; error?: string };
      if (currentRequest !== requestId.current) return;
      if (!response.ok) throw new Error(body.error ?? 'Review history unavailable');
      setReviews(body.reviews ?? []);
    }).catch((reason: unknown) => { if (!nextController.signal.aborted && currentRequest === requestId.current) setError(reason instanceof Error ? reason.message : 'Review history unavailable'); });
    return () => { requestId.current += 1; nextController.abort(); };
  }, [hypothesisId]);
  function validate(decision: 'APPROVE' | 'EDIT' | 'REJECT') {
    const next = { reviewer: reviewer.trim() ? null : 'Isi nama reviewer untuk menyimpan keputusan', reason: decision === 'REJECT' && !reasonCode ? 'Pilih alasan penolakan untuk menyimpan keputusan' : null };
    setValidation(next);
    if (next.reviewer) { reviewerRef.current?.focus(); return false; }
    if (next.reason) { reasonRef.current?.focus(); return false; }
    return true;
  }
  async function submit(decision: 'APPROVE' | 'EDIT' | 'REJECT') {
    if (pending || !validate(decision)) return;
    const currentRequest = ++requestId.current;
    const nextController = new AbortController();
    controller.current = nextController;
    setPending(true); setError(null);
    try {
      const response = await fetch('/api/hypotheses/review', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ hypothesisId, decision, reviewer: reviewer.trim(), note: note.trim() || undefined, reasonCode: decision === 'REJECT' ? reasonCode : undefined, editedStatement: decision === 'EDIT' ? editedStatement.trim() : undefined, goldenLabel: decision === 'REJECT' ? false : goldenLabel }), signal: nextController.signal });
      const body = await response.json() as HypothesisReviewRecord & { error?: string };
      if (currentRequest !== requestId.current) return;
      if (!response.ok) throw new Error(body.error ?? 'Hypothesis review unavailable');
      setMode('IDLE'); setEditedStatement(''); setGoldenLabel(false); setReviews((current) => [...current, body]); onReviewed?.();
    } catch (reason) { if (!nextController.signal.aborted && currentRequest === requestId.current) setError(reason instanceof Error ? reason.message : 'Hypothesis review request failed'); }
    finally { if (currentRequest === requestId.current) { controller.current = null; setPending(false); } }
  }
  const latestReviewedStatement = reviews.reduce<string | null>((value, review) => review.reviewedStatement || review.editedStatement || value, null);
  return <div className="review-panel"><div className="section-heading"><h3>Review hipotesis</h3><span className="status">{reviews.length} keputusan tersimpan · {reviews.length ? labelId(reviews.at(-1)!.decision) : 'Menunggu review'}</span></div>{latestReviewedStatement && <p className="notice">Hasil review terbaru: {latestReviewedStatement}</p>}<ReviewMeta reviewer={reviewer} setReviewer={(value) => { setReviewer(value); setValidation((current) => ({ ...current, reviewer: null })); }} note={note} setNote={setNote} goldenLabel={goldenLabel} setGoldenLabel={setGoldenLabel} error={validation.reviewer} reviewerRef={reviewerRef} /><ReasonSelect label="Alasan penolakan (wajib untuk Tolak)" value={reasonCode} onChange={(value) => { setReasonCode(value); setValidation((current) => ({ ...current, reason: null })); }} error={validation.reason} reasonRef={reasonRef} />{mode === 'EDIT' && <label>Pernyataan hasil edit<textarea value={editedStatement} onChange={(event) => setEditedStatement(event.target.value)} rows={3} placeholder="Bukti dan AI asli tetap tidak berubah" /></label>}<div className="review-actions"><button type="button" onClick={() => submit('APPROVE')} disabled={pending}>{pending ? 'Menyimpan…' : 'Setujui'}</button><button className="secondary" type="button" onClick={() => setMode(mode === 'EDIT' ? 'IDLE' : 'EDIT')} disabled={pending}>{mode === 'EDIT' ? 'Tutup edit' : 'Edit'}</button>{mode === 'EDIT' && <button type="button" onClick={() => submit('EDIT')} disabled={pending || !editedStatement.trim()}>{pending ? 'Menyimpan…' : 'Simpan edit'}</button>}<button className="destructive" type="button" onClick={() => submit('REJECT')} disabled={pending}>{pending ? 'Menyimpan…' : 'Tolak'}</button></div>{error && <p className="error-state" role="alert">{error}</p>}{reviews.length > 0 && <div className="review-history" aria-live="polite"><h4>Riwayat review (append-only)</h4><ul>{reviews.map((review) => <li className={review.decision !== 'APPROVE' ? 'review-changed' : ''} key={review.id}><span className="status">{labelId(review.decision)}{review.goldenLabel ? ' · GOLDEN' : ''}</span> · {review.reasonCode ? reasonId(review.reasonCode) : 'Tanpa alasan'} · {review.reviewer} · {review.editedStatement ?? ''}{review.note ? ` · ${review.note}` : ''}</li>)}</ul></div>}</div>;
}
