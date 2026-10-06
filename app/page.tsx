import ProcessingForm from "./processing-form";
import { createDefaultAcquirer } from "../lib/acquisition/index.ts";
import { createRuntimeService } from "../lib/runtime/service.ts";
import { join } from "node:path";
import { tmpdir } from "node:os";

export const dynamic = "force-dynamic";

function runtimeService() {
  const root = process.env.CIC_RUNTIME_ROOT ?? join(tmpdir(), "cic-staging-runtime");
  return createRuntimeService({
    storePath: join(root, "runtime.json"),
    outputRoot: join(root, "outputs"),
    acquirer: createDefaultAcquirer(),
  });
}

export default function Home() {
  const records = runtimeService().list();

  return (
    <main className="workspace">
      <header className="topbar">
        <div>
          <p className="eyebrow">CONTENT INTELLIGENCE COPILOT</p>
          <h1>Staging processing</h1>
        </div>
        <span className="status">Actual media path</span>
      </header>
      <section className="summary" aria-labelledby="summary-heading">
        <div>
          <p className="eyebrow">R1 / S3 CHECKPOINT</p>
          <h2 id="summary-heading">Paste public TikTok URL</h2>
          <p className="muted">Acquisition, processing state, transcript, audio, and temporal frames persist in staging state.</p>
        </div>
        <div className="summary-value">
          <strong>{records.length}</strong>
          <span>processed content</span>
        </div>
      </section>
      <ProcessingForm />
      <section className="results" aria-label="Processing results">
        {records.length === 0 ? <p className="muted">No processing jobs yet.</p> : records.map((record) => (
          <article className="result-card" key={record.id}>
            <div className="card-heading">
              <div>
                <p className="eyebrow">{record.externalId}</p>
                <h2>{record.permalink}</h2>
              </div>
              <span className="state">{record.status}</span>
            </div>
            {record.processing?.output ? (
              <>
                <div className="result-grid">
                  <div><dt>Duration</dt><dd>{record.processing.output.observed.ffprobe.format.duration}s OBSERVED</dd></div>
                  <div><dt>Transcript</dt><dd>{record.processing.output.transcript.segments.length} timestamped segments</dd></div>
                  <div><dt>Audio</dt><dd>{record.processing.output.audio.storagePath}</dd></div>
                  <div><dt>Frames / second</dt><dd>{record.processing.output.perSecondFrames.length}</dd></div>
                  <div><dt>Hook frames</dt><dd>{record.processing.output.hookFrames.map((frame) => `${frame.timestampMs}ms`).join(", ") || "—"}</dd></div>
                  <div><dt>Representative frames</dt><dd>{record.processing.output.representativeFrames.map((frame) => `${frame.timestampMs}ms`).join(", ") || "—"}</dd></div>
                </div>
                <details className="transcript-details">
                  <summary>Inspect timestamped transcript</summary>
                  <ol>{record.processing.output.transcript.segments.map((segment, index) => <li key={`${record.id}-segment-${index}`}><strong>{segment.startMs}–{segment.endMs}ms</strong> {segment.text}</li>)}</ol>
                </details>
              </>
            ) : <p className="muted">{record.error ?? "Processing pending."}</p>}
          </article>
        ))}
      </section>
      <footer className="footer-note">OBSERVED ffprobe facts stay separate from transcript and frame evidence. Temporary MP4 is removed after derivatives persist.</footer>
    </main>
  );
}
