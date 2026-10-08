"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { labelId } from '../lib/workspace/labels-id.ts';

type ProcessingJob = { id: string; contentId: string; sourceUrl: string; status: string; attemptCount: number; error: string | null };

function terminal(status: string) {
  return status === "COMPLETED" || status === "FAILED";
}

export default function ProcessingForm({ batchId, onAccepted, onSettled }: { batchId: string; onAccepted: (contentId: string) => void; onSettled: () => void }) {
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
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
    await enqueue(url);
  }

  async function enqueue(sourceUrl: string, retryId: string | null = null) {
    if (busy) return;
    const controller = submitController.current;
    if (!controller || controller.signal.aborted) return;
    const active = () => !controller.signal.aborted && currentBatch.current === batchId && new URLSearchParams(window.location.search).get('batchId') === batchId;
    setBusy(true);
    setRetryingId(retryId);
    setMessage('Mengirim ke antrean durable…');
    try {
      const response = await fetch("/api/processing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: sourceUrl, batchId }),
        signal: controller.signal,
      });
      const body = await response.json() as ProcessingJob & { error?: string };
      if (!active()) return;
      if (!response.ok) throw new Error(body.error ?? "Processing submission failed");
      jobsRef.current = [body, ...jobsRef.current.filter((job) => job.id !== body.id)];
      setJobs(jobsRef.current);
      setMessage(`Diterima · ${labelId(body.status)}`);
      if (!retryId) setUrl('');
      setRefreshVersion((version) => version + 1);
      callbacks.current.onAccepted(body.contentId);
    } catch (error) {
      if (active()) setMessage(String((error as Error).message));
    } finally {
      if (active()) { setBusy(false); setRetryingId(null); }
    }
  }

  return (
    <form className="ingest-form" onSubmit={submit}>
      <label htmlFor="tiktok-url">URL TikTok publik</label>
      <div className="form-row">
        <input id="tiktok-url" name="url" type="url" required value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://www.tiktok.com/@.../video/..." />
        <button type="submit" disabled={busy}>{busy ? 'Mengirim…' : 'Proses video'}</button>
      </div>
      <p className="form-message" aria-live="polite">{message}</p>
      {statusError && <div role="alert"><p>{statusError}</p><button className="secondary" type="button" onClick={() => setRefreshVersion((version) => version + 1)}>Coba lagi status</button></div>}
      <div className="batch-processing" aria-label="Status processing batch"><h2>Status processing</h2><p className="muted">{jobs.length} job pada ledger processing. Anggota konten dihitung terpisah; konten impor atau seed tidak selalu memiliki job.</p>{jobs.length === 0 ? <p>{statusLoaded ? 'Belum ada job processing pada batch ini.' : 'Memuat status processing…'}</p> : jobs.map((job) => <article key={job.id}><a href={`/?batchId=${encodeURIComponent(batchId)}&contentId=${encodeURIComponent(job.contentId)}&view=library`} title={job.sourceUrl}>Buka konten</a> <a className="job-source" href={job.sourceUrl} target="_blank" rel="noreferrer" title={job.sourceUrl}>URL TikTok</a> · {labelId(job.status)}{job.error && <p className="error-state">{job.error}</p>}{job.status === 'FAILED' && <button className="secondary" type="button" disabled={busy} onClick={() => enqueue(job.sourceUrl, job.id)}>{retryingId === job.id ? 'Mengirim ulang…' : 'Coba lagi'}</button>}<details><summary>Detail job</summary><p>{job.id} · {job.sourceUrl} · {job.status} · Percobaan {job.attemptCount}</p></details></article>)}</div>
    </form>
  );
}
