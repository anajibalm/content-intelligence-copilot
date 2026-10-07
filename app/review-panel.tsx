"use client";

import { useEffect, useRef, useState } from "react";
import { REVIEW_REASONS, type ReviewReason } from "../lib/domain/types.ts";

type Feature = { id: string; extractionRunId: string; fieldName: string; aiValue: string; reviewedValue: string | null; reviewState: string };
type FeatureReviewRecord = { id: string; contentFeatureId: string; extractionRunId: string; fieldName: string; decision: string; reasonCode: ReviewReason | null; goldenLabel: boolean; reviewer: string; note: string | null; createdAt: string };
type FeatureCorrectionRecord = { id: string; contentFeatureId: string; extractionRunId: string; fieldName: string; originalAiValue: string; correctedValue: string; reasonCode: ReviewReason; reviewer: string; note: string | null; createdAt: string };
type ContentReviewHistory = { contentId: string; reviews: FeatureReviewRecord[]; corrections: FeatureCorrectionRecord[] };
type HypothesisReviewRecord = { id: string; hypothesisId: string; decision: string; reasonCode: ReviewReason | null; editedStatement: string | null; goldenLabel: boolean; reviewer: string; note: string | null; createdAt: string };

/** Reviewer identity, note, and golden-label consent are required on every decision for traceability. */
function ReviewMeta({ reviewer, setReviewer, note, setNote, goldenLabel, setGoldenLabel }: {
  reviewer: string;
  setReviewer: (value: string) => void;
  note: string;
  setNote: (value: string) => void;
  goldenLabel: boolean;
  setGoldenLabel: (value: boolean) => void;
}) {
  return <div className="review-meta">
    <label>Reviewer<input value={reviewer} onChange={(event) => setReviewer(event.target.value)} placeholder="Analyst identity" /></label>
    <label>Note<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} placeholder="Optional note, preserved with the decision" /></label>
    <label className="review-golden"><input type="checkbox" checked={goldenLabel} onChange={(event) => setGoldenLabel(event.target.checked)} />Mark as golden label (analyst ground truth)</label>
  </div>;
}

function ReasonSelect({ label, value, onChange }: { label: string; value: ReviewReason | ""; onChange: (value: ReviewReason | "") => void }) {
  return <label>{label}<select value={value} onChange={(event) => onChange(event.target.value as ReviewReason | "")}><option value="">Select reason…</option>{REVIEW_REASONS.map((reason) => <option value={reason} key={reason}>{reason}</option>)}</select></label>;
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
  const blocked = pending || reviewer.trim().length === 0 || unreviewed.length === 0;

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
  return <>
    <p className="muted">AI originals remain separate from reviewed values. Unreviewed extraction caps confidence at LOW.</p>
    <dl>{features.map((feature) => <div id={`content-feature-${feature.id}`} key={feature.id}>
      <dt>{feature.fieldName}</dt>
      <dd>AI original: {feature.aiValue} · Reviewed: {feature.reviewedValue ?? "unreviewed"} · State: {feature.reviewState}</dd>
      {mode === "CORRECT" && feature.reviewState === "UNREVIEWED" && <dd className="review-correction">
        <label>Corrected value<input value={corrections[feature.id] ?? ""} onChange={(event) => setCorrections((current) => ({ ...current, [feature.id]: event.target.value }))} placeholder="Leave empty to confirm the AI original" /></label>
        <ReasonSelect label="Correction reason" value={correctionReasons[feature.id] ?? ""} onChange={(value) => setCorrectionReasons((current) => ({ ...current, [feature.id]: value }))} />
      </dd>}
    </div>)}</dl>
    <div className="review-panel">
      <div className="section-heading"><div><p className="eyebrow">S9 / ANALYST REVIEW</p><h3>Feature review</h3></div><span className="status">{unreviewed.length} unreviewed · {features.length} extracted</span></div>
      <ReviewMeta reviewer={reviewer} setReviewer={setReviewer} note={note} setNote={setNote} goldenLabel={goldenLabel} setGoldenLabel={setGoldenLabel} />
      <ReasonSelect label="Reject reason (required for Reject All)" value={reasonCode} onChange={setReasonCode} />
      <div className="review-actions">
        <button type="button" onClick={() => submit("CONFIRM")} disabled={blocked}>{pending ? "Saving…" : "Confirm All"}</button>
        <button type="button" onClick={() => setMode(mode === "CORRECT" ? "IDLE" : "CORRECT")} disabled={blocked}>{mode === "CORRECT" ? "Cancel corrections" : "Correct fields"}</button>
        {mode === "CORRECT" && <button type="button" onClick={() => submit("CORRECT")} disabled={blocked || correctionEntries.length === 0}>{pending ? "Saving…" : "Save corrections"}</button>}
        <button type="button" onClick={() => submit("REJECT")} disabled={blocked || reasonCode === ""}>{pending ? "Saving…" : "Reject All"}</button>
      </div>
      <p className="muted">Rejection never becomes a golden label. Corrections keep the AI original and append review history.</p>
      {error && <p className="error-state" role="alert">{error}</p>}
      {history && (history.reviews.length > 0 || history.corrections.length > 0) && <div className="review-history" aria-live="polite">
        <h3>Review history (append-only)</h3>
        <ul>
          {history.reviews.map((review) => <li key={review.id}><span className="status">{review.decision}{review.goldenLabel ? " · GOLDEN" : ""}</span> {review.fieldName} · reason {review.reasonCode ?? "—"} · reviewer {review.reviewer} · {new Date(review.createdAt).toLocaleString()}{review.note ? ` · ${review.note}` : ""}</li>)}
          {history.corrections.map((correction) => <li key={correction.id}><span className="status">CORRECTION</span> {correction.fieldName}: AI original {correction.originalAiValue} → corrected {correction.correctedValue} · reason {correction.reasonCode} · reviewer {correction.reviewer}</li>)}
        </ul>
      </div>}
    </div>
  </>;
}

/**
 * S9 hypothesis review (plan: Approve / Edit / Reject with persisted reasons).
 * The hypothesis row and its evidence links are immutable, so an edit is stored on the
 * append-only review record and the existing evidence links stay untouched.
 */
export function HypothesisReviewControls({ hypothesisId }: { hypothesisId: string }) {
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

  return <div className="review-panel">
    <div className="section-heading"><div><p className="eyebrow">S9 / HYPOTHESIS REVIEW</p><h3>Review hypothesis</h3></div><span className="status">{reviews.length} review record{reviews.length === 1 ? "" : "s"}</span></div>
    <ReviewMeta reviewer={reviewer} setReviewer={setReviewer} note={note} setNote={setNote} goldenLabel={goldenLabel} setGoldenLabel={setGoldenLabel} />
    <ReasonSelect label="Reject reason (required for Reject)" value={reasonCode} onChange={setReasonCode} />
    {mode === "EDIT" && <label>Edited statement<textarea value={editedStatement} onChange={(event) => setEditedStatement(event.target.value)} rows={3} placeholder="Rewritten working insight; evidence links stay untouched" /></label>}
    <div className="review-actions">
      <button type="button" onClick={() => submit("APPROVE")} disabled={blocked}>{pending ? "Saving…" : "Approve"}</button>
      <button type="button" onClick={() => setMode(mode === "EDIT" ? "IDLE" : "EDIT")} disabled={blocked}>{mode === "EDIT" ? "Cancel edit" : "Edit"}</button>
      {mode === "EDIT" && <button type="button" onClick={() => submit("EDIT")} disabled={blocked || editedStatement.trim().length === 0}>{pending ? "Saving…" : "Save edit"}</button>}
      <button type="button" onClick={() => submit("REJECT")} disabled={blocked || reasonCode === ""}>{pending ? "Saving…" : "Reject"}</button>
    </div>
    <p className="muted">An edit is stored on the review record; the hypothesis and its evidence links stay immutable.</p>
    {error && <p className="error-state" role="alert">{error}</p>}
    {reviews.length > 0 && <div className="review-history" aria-live="polite">
      <h4>Review history (append-only)</h4>
      <ul>
        {reviews.map((review) => <li key={review.id}><span className="status">{review.decision}{review.goldenLabel ? " · GOLDEN" : ""}</span> reason {review.reasonCode ?? "—"} · reviewer {review.reviewer} · {new Date(review.createdAt).toLocaleString()}{review.editedStatement ? ` · edited: ${review.editedStatement}` : ""}{review.note ? ` · ${review.note}` : ""}</li>)}
      </ul>
    </div>}
  </div>;
}
