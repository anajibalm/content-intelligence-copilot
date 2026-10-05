import { readFile } from "node:fs/promises";
import path from "node:path";

type TikTokPost = {
  external_id: string;
  permalink: string;
  caption: string;
  duration_seconds: number;
};

type TikTokFixture = { content: TikTokPost };

type MetricSnapshot = {
  metric_snapshot: {
    distribution: "organic" | "paid";
    raw_metrics: Record<string, { value: number | null; quality: "VALID" | "MISSING" | "SUSPECT" | "UNAVAILABLE" }>;
  };
};

async function fixture<T>(name: string): Promise<T> {
  const raw = await readFile(path.join(process.cwd(), "fixtures", name), "utf8");
  return JSON.parse(raw) as T;
}

export default async function Home() {
  const [postFixture, metricsFixture] = await Promise.all([
    fixture<TikTokFixture>("tiktok-post.json"),
    fixture<MetricSnapshot>("metric-snapshot.json"),
  ]);
  const post = postFixture.content;
  const metrics = metricsFixture.metric_snapshot;

  return (
    <main className="workspace">
      <header className="topbar">
        <div>
          <p className="eyebrow">CONTENT INTELLIGENCE COPILOT</p>
          <h1>Batch 8 / Barakat</h1>
        </div>
        <span className="status">Fixture workspace</span>
      </header>
      <section className="summary" aria-labelledby="summary-heading">
        <div>
          <p className="eyebrow">CURRENT BATCH</p>
          <h2 id="summary-heading">Existing contractual batch</h2>
          <p className="muted">TikTok-first analysis. Organic and paid observations stay separate.</p>
        </div>
        <div className="summary-value">
          <strong>1</strong>
          <span>fixture content</span>
        </div>
      </section>
      <section className="content-grid" aria-label="Content evidence">
        <article className="content-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">CONTENT</p>
              <h2>{post.caption}</h2>
            </div>
            <span className="state">Acquired</span>
          </div>
          <dl className="facts">
            <div><dt>External ID</dt><dd>{post.external_id}</dd></div>
            <div><dt>Duration</dt><dd>{post.duration_seconds}s</dd></div>
            <div><dt>Source</dt><dd><a href={post.permalink}>TikTok permalink</a></dd></div>
          </dl>
        </article>
        <article className="metric-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">METRIC SNAPSHOT</p>
              <h2>{metrics.distribution}</h2>
            </div>
            <span className="state">{metrics.raw_metrics.views.quality}</span>
          </div>
          <dl className="metrics">
            <div><dt>Views</dt><dd>{metrics.raw_metrics.views.value?.toLocaleString("id-ID") ?? "—"}</dd></div>
            <div><dt>Likes</dt><dd>{metrics.raw_metrics.likes.value?.toLocaleString("id-ID") ?? "—"}</dd></div>
            <div><dt>Comments</dt><dd>{metrics.raw_metrics.comments.value?.toLocaleString("id-ID") ?? "—"}</dd></div>
            <div><dt>Shares</dt><dd>{metrics.raw_metrics.shares.value?.toLocaleString("id-ID") ?? "—"}</dd></div>
          </dl>
        </article>
      </section>
      <footer className="footer-note">Observed facts and metric snapshots remain separate from derived, extracted, and inferred evidence.</footer>
    </main>
  );
}
