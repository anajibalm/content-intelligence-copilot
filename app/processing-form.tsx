"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { labelId } from '../lib/workspace/labels-id.ts';

export type ProcessingJobSummary = { count: number | null; active: number; failed: number; state: 'loading' | 'loaded' | 'error' };

type ProcessingJob = { id: string; contentId: string | null; sourceUrl: string; status: string; attemptCount: number; error: string | null };

function terminal(status: string) {
  return status === 'COMPLETED' || status === 'FAILED';
}

function jobSummary(items: ProcessingJob[], state: ProcessingJobSummary['state'], count: number | null = items.length): ProcessingJobSummary {
  return { count, active: items.filter((job) => !terminal(job.status)).length, failed: items.filter((job) => job.status === 'FAILED').length, state };
}

export default function ProcessingForm({ batchId, onAccepted, onSettled, onJobSummaryChange }: { batchId: string; onAccepted: (contentId: string) => void; onSettled: () => void; onJobSummaryChange: (summary: ProcessingJobSummary) => void }) {
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
  const callbacks = useRef({ onAccepted, onSettled, onJobSummaryChange });
  const submitController = useRef<AbortController | null>(null);

  useEffect(() => {
    currentBatch.current = batchId;
    callbacks.current = { onAccepted, onSettled, onJobSummaryChange };
  }, [batchId, onAccepted, onSettled, onJobSummaryChange]);

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
    callbacks.current.onJobSummaryChange(jobSummary([], 'loading', null));
    const refresh = async () => {
      try {
        const response = await fetch(`/api/processing?batchId=${encodeURIComponent(batchId)}`, { signal: controller.signal });
        if (!response.ok) throw new Error(`Batch job status unavailable (HTTP ${response.status})`);
        const body = await response.json() as { items: ProcessingJob[] };
        if (!active()) return;
        const settled = body.items.some((job) => terminal(job.status) && jobsRef.current.some((previous) => previous.id === job.id && !terminal(previous.status)));
        jobsRef.current = body.items;
        setJobs(body.items);
        callbacks.current.onJobSummaryChange(jobSummary(body.items, 'loaded'));
        setStatusLoaded(true);
        setStatusError(null);
        failures = 0;
        if (settled) callbacks.current.onSettled();
        if (body.items.some((job) => !terminal(job.status))) timer = window.setTimeout(() => void refresh(), 2000);
      } catch (error) {
        if (!active()) return;
        failures++;
        setStatusError(`${String((error as Error).message)} · attempt ${failures}/3`);
        callbacks.current.onJobSummaryChange(jobSummary([], 'error', null));
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
      callbacks.current.onJobSummaryChange(jobSummary(jobsRef.current, 'loaded'));
      if (!retryId) setUrl('');
      setRefreshVersion((version) => version + 1);
      if (body.contentId) callbacks.current.onAccepted(body.contentId);
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
        <button className="primary" type="submit" disabled={busy}>{busy ? 'Mengirim…' : 'Proses video'}</button>
      </div>
      <p className="form-message" aria-live="polite">{message}</p>
      <details className="processing-drawer" role="region" aria-label="Status processing batch" open={statusError !== null || (statusLoaded && jobs.length === 0) || jobs.some((job) => job.status === 'FAILED' || !terminal(job.status))}><summary><span>Processing</span><span className="processing-summary">{statusError ? 'Status gagal dimuat' : !statusLoaded ? 'Memuat...' : `${jobs.length} job pada ledger processing · ${jobs.filter((job) => !terminal(job.status)).length} aktif · ${jobs.filter((job) => job.status === 'FAILED').length} gagal`}{statusLoaded && jobs.length === 0 && !statusError && <span> · Belum ada job processing pada batch ini.</span>}</span></summary><div className="processing-drawer-content">{statusError && <div role="alert"><p>{statusError}</p><button className="secondary" type="button" onClick={() => setRefreshVersion((version) => version + 1)}>Coba lagi status</button></div>}<p className="muted">{statusError ? 'Status job gagal dimuat.' : !statusLoaded ? 'Memuat status job...' : 'Anggota konten dihitung terpisah; konten impor atau seed tidak selalu memiliki job.'}</p>{statusError || !statusLoaded || jobs.length === 0 ? null : jobs.map((job) => <article key={job.id}><div className="processing-job-head">{job.contentId && <a href={`/?batchId=${encodeURIComponent(batchId)}&contentId=${encodeURIComponent(job.contentId)}&view=library`}>Buka konten</a>}<span className="processing-job-status">{labelId(job.status)}</span></div><a className="job-source" href={job.sourceUrl} target="_blank" rel="noreferrer">{job.sourceUrl}</a>{job.error && <p className="error-state">{job.error}</p>}{job.status === 'FAILED' && <button className="secondary" type="button" disabled={busy} onClick={() => enqueue(job.sourceUrl, job.id)}>{retryingId === job.id ? 'Mengirim ulang...' : 'Coba lagi'}</button>}<details><summary>Detail job</summary><p>{job.id} · {job.sourceUrl} · {job.status} · Percobaan {job.attemptCount}</p></details></article>)}</div></details>
    </form>
  );
}
