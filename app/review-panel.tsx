"use client";

import { useEffect, useRef, useState } from "react";
import { REVIEW_REASONS, type ReviewReason } from "../lib/domain/types.ts";
import { labelId, reasonId } from '../lib/workspace/labels-id.ts';

type Feature = { id: string; extractionRunId: string; fieldName: string; aiValue: string; reviewedValue: string | null; reviewState: string };
type FeatureReviewRecord = { id: string; contentFeatureId: string; extractionRunId: string; fieldName: string; decision: string; reasonCode: ReviewReason | null; reviewedValue: string | null; goldenLabel: boolean; reviewer: string; note: string | null; createdAt: string };
type FeatureCorrectionRecord = { id: string; contentFeatureId: string; extractionRunId: string; fieldName: string; originalAiValue: string; correctedValue: string; reasonCode: ReviewReason; reviewer: string; note: string | null; createdAt: string };
type ContentReviewHistory = { contentId: string; reviews: FeatureReviewRecord[]; corrections: FeatureCorrectionRecord[] };
type HypothesisReviewRecord = { id: string; hypothesisId: string; decision: string; reasonCode: ReviewReason | null; editedStatement: string | null; reviewedStatement: string; goldenLabel: boolean; reviewer: string; note: string | null; createdAt: string };
function ReviewMeta({ reviewer, setReviewer, note, setNote, goldenLabel, setGoldenLabel }: {
  reviewer: string;
  setReviewer: (value: string) => void;
  note: string;
  setNote: (value: string) => void;
  goldenLabel: boolean;
  setGoldenLabel: (value: boolean) => void;
}) {
  return <div className="review-meta">
    <label>Reviewer<input value={reviewer} onChange={(event) => setReviewer(event.target.value)} placeholder="Identitas analyst" /></label>
    <label>Catatan keputusan<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} placeholder="Opsional, disimpan bersama keputusan" /></label>
    <label className="review-golden"><input type="checkbox" checked={goldenLabel} onChange={(event) => setGoldenLabel(event.target.checked)} />Tandai golden label (ground truth analyst)</label>
  </div>;
}

function ReasonSelect({ label, value, onChange }: { label: string; value: ReviewReason | ""; onChange: (value: ReviewReason | "") => void }) {
  return <label>{label}<select value={value} onChange={(event) => onChange(event.target.value as ReviewReason | "")}><option value="">Pilih alasan…</option>{REVIEW_REASONS.map((reason) => <option value={reason} key={reason}>{reasonId(reason)}</option>)}</select></label>;
}

/**
 * S9 content-level feature review (plan: Confirm All / Correct fields / Reject All).
 * AI originals stay visible and untouched; a correction appends history and becomes the
 * canonical reviewed value, so a reload renders the persisted review rather than local state.
 */
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
  const [pending, setPending] = useState(false);
  const requestId = useRef(0);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    const currentRequest = ++requestId.current;
    const nextController = new AbortController();
    controller.current = nextController;
    fetch(`/api/workspace/contents/${contentId}/review`, { signal: nextController.signal })
      .then(async (response) => {
        const body = await response.json() as ContentReviewHistory & { error?: string };
        if (currentRequest !== requestId.current) return;
        if (!response.ok) throw new Error(body.error ?? "Review history unavailable");
        setHistory(body);
      })
      .catch((reason: unknown) => {
        if (nextController.signal.aborted || currentRequest !== requestId.current) return;
        setError(reason instanceof Error ? reason.message : "Review history unavailable");
      });
    return () => {
      requestId.current += 1;
      controller.current?.abort();
    };
  }, [contentId]);

  const unreviewed = features.filter((feature) => feature.reviewState === "UNREVIEWED");
  const correctionEntries = Object.entries(corrections).filter(([, value]) => value.trim().length > 0);
  const blocked = pending || reviewer.trim().length === 0 || features.length === 0;
  const confirmBlocked = blocked || unreviewed.length === 0;
  async function submit(decision: "CONFIRM" | "CORRECT" | "REJECT") {
    if (blocked) return;
    const currentRequest = ++requestId.current;
    const nextController = new AbortController();
    controller.current = nextController;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/workspace/contents/${contentId}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          extractionRunId: features[0]?.extractionRunId,
          decision,
          reviewer: reviewer.trim(),
          note: note.trim() || undefined,
          reasonCode: decision === "REJECT" ? reasonCode : undefined,
          goldenLabel: decision === "REJECT" ? false : goldenLabel,
          corrections: decision === "CORRECT"
            ? correctionEntries.map(([contentFeatureId, value]) => ({ contentFeatureId, value: value.trim(), reasonCode: correctionReasons[contentFeatureId] || undefined }))
            : undefined,
        }),
        signal: nextController.signal,
      });
      const body = await response.json() as { error?: string };
      if (currentRequest !== requestId.current) return;
      if (!response.ok) throw new Error(body.error ?? "Review unavailable");
      setMode("IDLE");
      setCorrections({});
      setCorrectionReasons({});
      setGoldenLabel(false);
      const refreshed = await fetch(`/api/workspace/contents/${contentId}/review`, { signal: nextController.signal });
      const nextHistory = await refreshed.json() as ContentReviewHistory & { error?: string };
      if (currentRequest !== requestId.current) return;
      if (refreshed.ok) setHistory(nextHistory);
      onReviewed();
    } catch (reason) {
      if (nextController.signal.aborted || currentRequest !== requestId.current) return;
      setError(reason instanceof Error ? reason.message : "Review request failed");
    } finally {
      if (currentRequest === requestId.current) {
        controller.current = null;
        setPending(false);
      }
    }

  }
  const historyGroups: FeatureReviewRecord[][] = [];
  for (const review of history?.reviews ?? []) {
    const last = historyGroups.at(-1);
    if (review.decision === 'CONFIRM' && last?.[0].decision === 'CONFIRM') last.push(review);
    else historyGroups.push([review]);
  }
  return <>
    <p className="muted">AI asli tidak berubah. Ekstraksi belum direview membatasi confidence ke Rendah.</p>
    <table className="fingerprint-table"><thead><tr><th>Field</th><th>AI asli</th><th>Hasil review</th><th>Status</th></tr></thead><tbody>{features.map((feature) => <tr id={`content-feature-${feature.id}`} key={feature.id} className={feature.reviewState === 'CORRECTED' || feature.reviewState === 'REJECTED' ? 'review-changed' : ''}>
      <th scope="row" title={feature.fieldName}>{labelId(feature.fieldName)}<small>{feature.fieldName}</small></th>
      <td data-label="AI asli">{feature.aiValue}</td>
      <td data-label="Hasil review">{feature.reviewedValue ?? 'Belum direview'}{mode === 'CORRECT' && <div className="review-correction"><label>Nilai koreksi<input value={corrections[feature.id] ?? ''} onChange={(event) => setCorrections((current) => ({ ...current, [feature.id]: event.target.value }))} placeholder="Kosong berarti tidak diubah" /></label><ReasonSelect label="Alasan koreksi" value={correctionReasons[feature.id] ?? ''} onChange={(value) => setCorrectionReasons((current) => ({ ...current, [feature.id]: value }))} /></div>}</td>
      <td data-label="Status">{labelId(feature.reviewState)}</td>
    </tr>)}</tbody></table>
    <div className="review-panel">
      <div className="section-heading"><h3>Review fingerprint</h3><span className="status">{unreviewed.length} menunggu review · {features.length} field</span></div>
      <ReviewMeta reviewer={reviewer} setReviewer={setReviewer} note={note} setNote={setNote} goldenLabel={goldenLabel} setGoldenLabel={setGoldenLabel} />
      <ReasonSelect label="Alasan penolakan (wajib untuk Tolak semua)" value={reasonCode} onChange={setReasonCode} />
      <div className="review-actions">
        <button type="button" onClick={() => submit('CONFIRM')} disabled={confirmBlocked}>{pending ? 'Menyimpan…' : 'Konfirmasi semua'}</button>
        <button className="secondary" type="button" onClick={() => setMode(mode === 'CORRECT' ? 'IDLE' : 'CORRECT')} disabled={pending}>{mode === 'CORRECT' ? 'Tutup koreksi' : 'Koreksi field'}</button>
        {mode === 'CORRECT' && <button type="button" onClick={() => submit('CORRECT')} disabled={blocked || correctionEntries.length === 0 || correctionEntries.some(([id]) => !correctionReasons[id])}>{pending ? 'Menyimpan…' : 'Simpan koreksi'}</button>}
        <button className="destructive" type="button" onClick={() => submit('REJECT')} disabled={blocked || reasonCode === ''}>{pending ? 'Menyimpan…' : 'Tolak semua'}</button>
      </div>
      <p className="muted">{pending ? 'Sedang menyimpan.' : !reviewer.trim() ? 'Isi reviewer untuk menyimpan keputusan.' : !unreviewed.length ? 'Tidak ada field belum direview untuk Konfirmasi semua.' : 'Konfirmasi semua hanya untuk field belum direview.'} {mode === 'CORRECT' && 'Setiap koreksi memerlukan nilai dan alasan.'} {!reasonCode && 'Alasan wajib sebelum penolakan.'}</p>
      {error && <p className="error-state" role="alert">{error}</p>}
      {history && (history.reviews.length > 0 || history.corrections.length > 0) && <div className="review-history" aria-live="polite">
        <h3>Riwayat review (append-only)</h3>
        {historyGroups.map((group) => group[0].decision === 'CONFIRM' ? <details key={group[0].id}><summary>Konfirmasi {group.length} field</summary><p className="muted">Event terpisah dalam urutan tersimpan, bukan klaim satu aksi bersama.</p><ul>{group.map((review) => <li key={review.id}>{labelId(review.fieldName)} · {review.reviewer} · {new Date(review.createdAt).toLocaleString()}{review.note ? ` · ${review.note}` : ''}<details><summary>Metadata event</summary><pre>{JSON.stringify(review, null, 2)}</pre></details></li>)}</ul></details> : <ul key={group[0].id}>{group.map((review) => <li className="review-changed" key={review.id}><strong>{labelId(review.decision)} · {labelId(review.fieldName)}</strong> · {review.reasonCode ? reasonId(review.reasonCode) : 'Tanpa alasan'} · {review.reviewer} · {new Date(review.createdAt).toLocaleString()}{review.note ? ` · ${review.note}` : ''}<details><summary>Metadata event</summary><pre>{JSON.stringify(review, null, 2)}</pre></details></li>)}</ul>)}
        <h4>Koreksi tersimpan</h4><ul>{history.corrections.map((correction) => <li className="review-changed" key={correction.id}><strong>{labelId(correction.fieldName)}</strong>: AI asli {correction.originalAiValue} · Hasil review {correction.correctedValue} · {reasonId(correction.reasonCode)} · {correction.reviewer}<details><summary>Metadata koreksi</summary><pre>{JSON.stringify(correction, null, 2)}</pre></details></li>)}</ul>
      </div>}
    </div>
  </>;
}

/**
 * S9 hypothesis review (plan: Approve / Edit / Reject with persisted reasons).
 * The hypothesis row and its evidence links are immutable, so an edit is stored on the
 * append-only review record and the existing evidence links stay untouched.
 */
export function HypothesisReviewControls({ hypothesisId, onReviewed }: { hypothesisId: string; onReviewed?: () => void }) {
  const [mode, setMode] = useState<"IDLE" | "EDIT">("IDLE");
  const [reviewer, setReviewer] = useState("");
  const [note, setNote] = useState("");
  const [goldenLabel, setGoldenLabel] = useState(false);
  const [reasonCode, setReasonCode] = useState<ReviewReason | "">("");
  const [editedStatement, setEditedStatement] = useState("");
  const [reviews, setReviews] = useState<HypothesisReviewRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const requestId = useRef(0);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    const currentRequest = ++requestId.current;
    const nextController = new AbortController();
    controller.current = nextController;
    fetch(`/api/hypotheses/review?hypothesisId=${hypothesisId}`, { signal: nextController.signal })
      .then(async (response) => {
        const body = await response.json() as { reviews?: HypothesisReviewRecord[]; error?: string };
        if (currentRequest !== requestId.current) return;
        if (!response.ok) throw new Error(body.error ?? "Review history unavailable");
        setReviews(body.reviews ?? []);
      })
      .catch((reason: unknown) => {
        if (nextController.signal.aborted || currentRequest !== requestId.current) return;
        setError(reason instanceof Error ? reason.message : "Review history unavailable");
      });
    return () => {
      requestId.current += 1;
      controller.current?.abort();
    };
  }, [hypothesisId]);

  const blocked = pending || reviewer.trim().length === 0;

  async function submit(decision: "APPROVE" | "EDIT" | "REJECT") {
    if (blocked) return;
    const currentRequest = ++requestId.current;
    const nextController = new AbortController();
    controller.current = nextController;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/hypotheses/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          hypothesisId,
          decision,
          reviewer: reviewer.trim(),
          note: note.trim() || undefined,
          reasonCode: decision === "REJECT" ? reasonCode : undefined,
          editedStatement: decision === "EDIT" ? editedStatement.trim() : undefined,
          goldenLabel: decision === "REJECT" ? false : goldenLabel,
        }),
        signal: nextController.signal,
      });
      const body = await response.json() as HypothesisReviewRecord & { error?: string };
      if (currentRequest !== requestId.current) return;
      if (!response.ok) throw new Error(body.error ?? "Hypothesis review unavailable");
      setMode("IDLE");
      setEditedStatement("");
      setGoldenLabel(false);
      setReviews((current) => [...current, body]);
      onReviewed?.();
    } catch (reason) {
      if (nextController.signal.aborted || currentRequest !== requestId.current) return;
      setError(reason instanceof Error ? reason.message : "Hypothesis review request failed");
    } finally {
      if (currentRequest === requestId.current) {
        controller.current = null;
        setPending(false);
      }
    }
  }

  const latestReviewedStatement = reviews.reduce<string | null>((value, review) => review.reviewedStatement || review.editedStatement || value, null);
  return <div className="review-panel">
    <div className="section-heading"><h3>Review hipotesis</h3><span className="status">{reviews.length} keputusan tersimpan · {reviews.length ? labelId(reviews[reviews.length - 1].decision) : 'Menunggu review'}</span></div>
    {latestReviewedStatement && <p className="notice">Hasil review terbaru: {latestReviewedStatement}</p>}
    <ReviewMeta reviewer={reviewer} setReviewer={setReviewer} note={note} setNote={setNote} goldenLabel={goldenLabel} setGoldenLabel={setGoldenLabel} />
    <ReasonSelect label="Alasan penolakan (wajib untuk Tolak)" value={reasonCode} onChange={setReasonCode} />
    {mode === 'EDIT' && <label>Pernyataan hasil edit<textarea value={editedStatement} onChange={(event) => setEditedStatement(event.target.value)} rows={3} placeholder="Bukti dan AI asli tetap tidak berubah" /></label>}
    <div className="review-actions">
      <button type="button" onClick={() => submit('APPROVE')} disabled={blocked}>{pending ? 'Menyimpan…' : 'Setujui'}</button>
      <button className="secondary" type="button" onClick={() => setMode(mode === 'EDIT' ? 'IDLE' : 'EDIT')} disabled={pending}>{mode === 'EDIT' ? 'Tutup edit' : 'Edit'}</button>
      {mode === 'EDIT' && <button type="button" onClick={() => submit('EDIT')} disabled={blocked || !editedStatement.trim()}>{pending ? 'Menyimpan…' : 'Simpan edit'}</button>}
      <button className="destructive" type="button" onClick={() => submit('REJECT')} disabled={blocked || !reasonCode}>{pending ? 'Menyimpan…' : 'Tolak'}</button>
    </div>
    <p className="muted">{pending ? 'Sedang menyimpan.' : !reviewer.trim() ? 'Isi reviewer untuk menyimpan keputusan.' : 'Edit disimpan terpisah dari AI asli.'} {!reasonCode && 'Alasan wajib sebelum penolakan.'} {mode === 'EDIT' && !editedStatement.trim() && 'Isi pernyataan hasil edit.'}</p>
    {error && <p className="error-state" role="alert">{error}</p>}
    {reviews.length > 0 && <div className="review-history" aria-live="polite">
      <h4>Riwayat review (append-only)</h4>
      <ul>
        {reviews.map((review) => <li className={review.decision !== 'APPROVE' ? 'review-changed' : ''} key={review.id}><span className="status">{labelId(review.decision)}{review.goldenLabel ? ' · GOLDEN' : ''}</span> · {review.reasonCode ? reasonId(review.reasonCode) : 'Tanpa alasan'} · {review.reviewer} · {new Date(review.createdAt).toLocaleString()}{review.editedStatement ? ` · ${review.editedStatement}` : ''}{review.note ? ` · ${review.note}` : ''}<details><summary>Metadata event</summary><pre>{JSON.stringify(review, null, 2)}</pre></details></li>)}
      </ul>
    </div>}
  </div>;
}
