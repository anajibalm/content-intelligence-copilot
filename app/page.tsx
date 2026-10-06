import ProcessingForm from "./processing-form";
import EvidenceFrames from "./evidence-frames";
import { createDefaultAcquirer } from "../lib/acquisition/index.ts";
import { createPostgresRuntimeFromEnv, runtimeConfigFromEnv } from "../lib/runtime/postgres.ts";
import { createMetricsRepository } from "../lib/metrics/postgres.ts";

export const dynamic = "force-dynamic";

async function runtimeJobs() {
  const runtime = createPostgresRuntimeFromEnv(createDefaultAcquirer());
  try {
    return (await runtime.list()).map((job) => {
      try {
        return runtime.toPublic(job);
      } catch (error) {
        return { ...job, result: null, error: `Stored evidence unavailable: ${String((error as Error).message ?? error)}` };
      }
    });
  } finally {
    await runtime.close();
  }
}
async function batchMetrics() {
  const config = runtimeConfigFromEnv();
  const repository = createMetricsRepository(config);
  try {
    return await repository.batchAndPersist(config.batchId);
  } finally {
    await repository.close();
  }
}

export default async function Home() {
  const jobs = await runtimeJobs();
  const metrics = await batchMetrics();
  if (!metrics) throw new Error("batch analysis unavailable");
  return (
    <main className="workspace">
      <header className="topbar">
        <div>
          <p className="eyebrow">CONTENT INTELLIGENCE COPILOT</p>
          <h1>Durable staging</h1>
        </div>
        <span className="status">Postgres + one worker</span>
      </header>
      <section className="summary" aria-labelledby="summary-heading">
        <div>
          <p className="eyebrow">R1 / S3 CHECKPOINT</p>
          <h2 id="summary-heading">Paste public TikTok URL</h2>
          <p className="muted">DB job state, persistent audio, frames, and timestamped transcript. Worker runs separately.</p>
        </div>
        <div className="summary-value"><strong>{jobs.length}</strong><span>durable jobs</span></div>
      </section>
      {metrics ? (
        <section className="analysis-panel" aria-labelledby="analysis-heading">
          <div className="card-heading">
            <div>
              <p className="eyebrow">S5 / BATCH ANALYSIS</p>
              <h2 id="analysis-heading">{metrics.batch.name} metrics, quality, and ranking</h2>
            </div>
            <span className="status">{metrics.synthetic ? "Synthetic demo data" : "Source observations"}</span>
          </div>
          <p className="muted">Organic and Paid snapshots stay separate. Derived values use versioned rules. Unconfigured brand approval stays visible.</p>
          <div className="analysis-grid">
            <div className="metric-card">
              <h3>Ranking</h3>
              <p className="muted">{metrics.ranking.status === "READY" ? `${metrics.ranking.ranked.length} eligible results` : metrics.ranking.reason}</p>
              {metrics.ranking.ranked.map((item) => (
                <div className="analysis-row" key={item.contentId}>
                  <strong>{item.basis.label}</strong><span>{item.contentId} · {item.value}</span>
                </div>
              ))}
              {metrics.ranking.excluded.map((item) => <div className="analysis-row excluded" key={item.contentId}><strong>Excluded</strong><span>{item.contentId} · {item.reason}</span></div>)}
            </div>
            <div className="metric-card">
              <h3>KPI assessment</h3>
              {metrics.kpis.length === 0 ? <p className="muted">No brand KPI target configured.</p> : metrics.kpis.map((item) => <div className="analysis-row" key={item.definition.id}><strong>{item.definition.metric_name} · {item.assessment.status}</strong><span>{item.assessment.actualValue ?? "—"}</span></div>)}
            </div>
          </div>
          <div className="analysis-table" role="table" aria-label="Metric snapshots">
            <div className="analysis-row analysis-head" role="row"><strong>Content</strong><strong>Context</strong><strong>Views</strong><strong>ER</strong><strong>Quality</strong></div>
            {metrics.snapshots.map((snapshot) => <div className="analysis-row analysis-head" role="row" key={snapshot.id}><span>{snapshot.contentId}</span><span>{snapshot.distribution}</span><span>{(snapshot.rawMetrics as Record<string, number | null>).views ?? "—"}</span><span>{snapshot.derivedMetrics.engagement_rate?.value ?? "—"}</span><span>{snapshot.quality}</span></div>)}
          </div>
        </section>
      ) : <p className="muted">Batch analysis unavailable.</p>}
      <ProcessingForm />
      <section className="results" aria-label="Processing results">
        {jobs.length === 0 ? <p className="muted">No durable jobs yet.</p> : jobs.map((job) => (
          <article className="result-card" key={job.id}>
            <div className="card-heading"><div><p className="eyebrow">{job.contentId}</p><h2>{job.sourceUrl}</h2></div><span className="state">{job.status}</span></div>
            {job.result ? (
              <>
                <div className="result-grid">
                  <div><dt>Duration</dt><dd>{job.result.observed.ffprobe.format.duration}s OBSERVED</dd></div>
                  <div><dt>Transcript</dt><dd>{job.result.transcript.segments.length} timestamped segments</dd></div>
                  <div><dt>Audio</dt><dd><audio controls src={job.result.audio.storagePath}>Audio evidence</audio></dd></div>
                  <div><dt>Frames / second</dt><dd>{job.result.perSecondFrames.length}</dd></div>
                </div>
                <div className="evidence-frames">
                  <EvidenceFrames jobId={job.id} frames={[...job.result.hookFrames, ...job.result.representativeFrames]} />
                </div>
                <details className="transcript-details"><summary>Inspect timestamped transcript</summary><ol>{job.result.transcript.segments.map((segment, index) => <li key={`${job.id}-segment-${index}`}><strong>{segment.startMs}–{segment.endMs}ms</strong> {segment.text}</li>)}</ol></details>
                <p className="muted">Product-entry anchors: analyst annotation only; automatic hook frames are references, not anchors.</p>
              </>
            ) : <p className="muted">{job.error ?? "Queued for worker."}</p>}
          </article>
        ))}
      </section>
      <footer className="footer-note">OBSERVED ffprobe facts stay separate from temporal evidence. Temporary MP4 is removed after derivatives persist.</footer>
    </main>
  );
}
