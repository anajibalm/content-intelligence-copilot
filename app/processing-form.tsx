"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type ProcessingJob = { id: string; contentId: string; sourceUrl: string; status: string; attemptCount: number; error: string | null };

function terminal(status: string) {
  return status === "COMPLETED" || status === "FAILED";
}

export default function ProcessingForm({ batchId, onAccepted }: { batchId: string; onAccepted: (contentId: string) => void }) {
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [jobs, setJobs] = useState<ProcessingJob[]>([]);
  const generation = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let timer: number | undefined;
    const generationId = ++generation.current;
    const refresh = async () => {
      const response = await fetch(`/api/processing?batchId=${encodeURIComponent(batchId)}`, { signal: controller.signal });
      if (!response.ok) throw new Error("Batch job status unavailable");
      const body = await response.json() as { items: ProcessingJob[] };
      if (!active || generation.current !== generationId) return;
      setJobs(body.items);
      if (!body.items.every((job) => terminal(job.status))) timer = window.setTimeout(() => void refresh().catch(() => {}), 2000);
    };
    void refresh().catch(() => {});
    return () => { active = false; controller.abort(); if (timer !== undefined) window.clearTimeout(timer); };
  }, [batchId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("Submitting to durable queue…");
    try {
      const response = await fetch("/api/processing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, batchId }),
      });
      const body = await response.json() as ProcessingJob & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Processing submission failed");
      setMessage(`Accepted · ${body.status}`);
      setUrl("");
      onAccepted(body.contentId);
    } catch (error) {
      setMessage(String((error as Error).message));
    } finally {
      setBusy(false);
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
      <div className="batch-processing" aria-label="Batch processing status"><h2>Processing status</h2>{jobs.length === 0 ? <p>No processing jobs for this batch.</p> : jobs.map((job) => <article key={job.id}><a href={`/?batchId=${encodeURIComponent(batchId)}&contentId=${encodeURIComponent(job.contentId)}`}>{job.sourceUrl}</a> · {job.status}{terminal(job.status) ? "" : " · queued or processing"}{job.error ? ` · ${job.error}` : ""}</article>)}</div>
    </form>
  );
}
