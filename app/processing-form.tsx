"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type ProcessingJob = { id: string; contentId: string; sourceUrl: string; status: string; attemptCount: number; error: string | null };

function terminal(status: string) {
  return status === "COMPLETED" || status === "FAILED";
}

export default function ProcessingForm({ batchId, onAccepted, onSettled }: { batchId: string; onAccepted: (contentId: string) => void; onSettled: () => void }) {
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [jobs, setJobs] = useState<ProcessingJob[]>([]);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const jobsRef = useRef<ProcessingJob[]>([]);
  const currentBatch = useRef(batchId);
  const callbacks = useRef({ onAccepted, onSettled });
  const submitController = useRef<AbortController | null>(null);

  useEffect(() => {
    currentBatch.current = batchId;
    callbacks.current = { onAccepted, onSettled };
  }, [batchId, onAccepted, onSettled]);

  useEffect(() => {
    const controller = new AbortController();
    submitController.current = controller;
    return () => controller.abort();
  }, [batchId]);

  useEffect(() => {
    const controller = new AbortController();
    let timer: number | undefined;
    let failures = 0;
    const active = () => !controller.signal.aborted && currentBatch.current === batchId;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/processing?batchId=${encodeURIComponent(batchId)}`, { signal: controller.signal });
        if (!response.ok) throw new Error(`Batch job status unavailable (HTTP ${response.status})`);
        const body = await response.json() as { items: ProcessingJob[] };
        if (!active()) return;
        const settled = body.items.some((job) => terminal(job.status) && jobsRef.current.some((previous) => previous.id === job.id && !terminal(previous.status)));
        jobsRef.current = body.items;
        setJobs(body.items);
        setStatusLoaded(true);
        setStatusError(null);
        failures = 0;
        if (settled) callbacks.current.onSettled();
        if (body.items.some((job) => !terminal(job.status))) timer = window.setTimeout(() => void refresh(), 2000);
      } catch (error) {
        if (!active()) return;
        failures++;
        setStatusError(`${String((error as Error).message)} · attempt ${failures}/3`);
        if (failures < 3) timer = window.setTimeout(() => void refresh(), 2000);
      }
    };
    void refresh();
    return () => { controller.abort(); if (timer !== undefined) window.clearTimeout(timer); };
  }, [batchId, refreshVersion]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const controller = submitController.current;
    if (!controller || controller.signal.aborted) return;
    const active = () => !controller.signal.aborted && currentBatch.current === batchId && new URLSearchParams(window.location.search).get('batchId') === batchId;
    setBusy(true);
    setMessage("Submitting to durable queue…");
    try {
      const response = await fetch("/api/processing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, batchId }),
        signal: controller.signal,
      });
      const body = await response.json() as ProcessingJob & { error?: string };
      if (!active()) return;
      if (!response.ok) throw new Error(body.error ?? "Processing submission failed");
      jobsRef.current = [body, ...jobsRef.current.filter((job) => job.id !== body.id)];
      setJobs(jobsRef.current);
      setMessage(`Accepted · ${body.status}`);
      setUrl("");
      setRefreshVersion((version) => version + 1);
      callbacks.current.onAccepted(body.contentId);
    } catch (error) {
      if (active()) setMessage(String((error as Error).message));
    } finally {
      if (active()) setBusy(false);
    }
  }

  return (
    <form className="ingest-form" onSubmit={submit}>
      <label htmlFor="tiktok-url">Public TikTok URL</label>
      <div className="form-row">
        <input id="tiktok-url" name="url" type="url" required value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://www.tiktok.com/@.../video/..." />
        <button type="submit" disabled={busy}>{busy ? "Processing…" : "Process video"}</button>
      </div>
      <p className="form-message" aria-live="polite">{message}</p>
      {statusError && <div role="alert"><p>{statusError}</p><button type="button" onClick={() => setRefreshVersion((version) => version + 1)}>Retry status</button></div>}
      <div className="batch-processing" aria-label="Batch processing status"><h2>Processing status</h2>{jobs.length === 0 ? <p>{statusLoaded ? "No processing jobs for this batch." : "Loading processing status…"}</p> : jobs.map((job) => <article key={job.id}><a href={`/?batchId=${encodeURIComponent(batchId)}&contentId=${encodeURIComponent(job.contentId)}&view=library`}>{job.sourceUrl}</a> · {job.status}{terminal(job.status) ? "" : " · queued or processing"}{job.error ? ` · ${job.error}` : ""}</article>)}</div>
    </form>
  );
}
