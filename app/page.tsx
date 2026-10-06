import ProcessingForm from "./processing-form";
import EvidenceFrames from "./evidence-frames";
import { createDefaultAcquirer } from "../lib/acquisition/index.ts";
import { createPostgresRuntimeFromEnv } from "../lib/runtime/postgres.ts";

export const dynamic = "force-dynamic";

async function runtimeJobs() {
  const runtime = createPostgresRuntimeFromEnv(createDefaultAcquirer());
  try {
    return (await runtime.list()).map(runtime.toPublic);
  } finally {
    await runtime.close();
  }
}

export default async function Home() {
  const jobs = await runtimeJobs();

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
