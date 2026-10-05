# Architecture Checkpoint — Through S2

Status: architecture documentation only. No application functionality changed. Data Contract v0.2 remains an implementation candidate, not frozen.

## Views

| View | Artifact | Meaning |
|---|---|---|
| Current | `current-through-s2.architecture.json` / `current-through-s2.html` | Actual repository components and verified boundaries through S2 |
| Target | `target-mvp.architecture.json` / `target-mvp.html` | Planned remaining MVP stories; pending edges are labeled |

## Truth boundaries

- `app/page.tsx` is fixture-backed. It reads JSON fixtures; no source-level connection to `lib/acquisition`, PostgreSQL, or a worker exists.
- `lib/acquisition/` is implemented and deterministic-tested. The live 10/10 gate used the Python spike runner, not Next.js application runtime wiring.
- `supabase/migrations/` and `supabase/seed.sql` apply to PostgreSQL. Verification used isolated disposable Docker PostgreSQL; it is not an application runtime database.
- `spikes/video-acquisition/.../spike_acquisition.py` directly runs yt-dlp, ffprobe, ffmpeg, and optional transcription. It is a live-tested runner, not a planned persistent worker.
- Temporary MP4s are deleted by the spike after derivative evidence. Canonical identity remains TikTok permalink + external ID; CDN URLs are transient.
- S3 processing, S4 extraction, S5 metric/KPI calculation, S7 comparison engine, and S8–S10 evidence/review workflow remain pending.

## Source references

- Frozen product boundaries: `docs/contracts/MVP_CONTRACT_v0.1_FROZEN.md`
- Frozen donor boundaries: `docs/contracts/DONOR_MAP_FROZEN_v0.1.md`
- Candidate data additions: `docs/contracts/DATA_CONTRACT_v0.2_CANDIDATE.md`
- Discovery conflicts and affected stories: `docs/decisions/DISCOVERY_DELTA_2026-10-05.md`
- Story dependency and target worker: `docs/source/IMPLEMENTATION_PLAN_v0.1.md`
- S1/S2 evidence: `docs/decisions/S0_S1_VERIFICATION.md`, `docs/decisions/S2_CHECKPOINT_2026-10-05.md`
- Current route: `app/page.tsx`
- Current domain model: `lib/domain/types.ts`
- Acquisition boundary: `lib/acquisition/index.ts`, `lib/acquisition/ytdlp.ts`, `lib/acquisition/credentialed.ts`
- Persistence: `supabase/migrations/0001_canonical_schema.sql`, `supabase/migrations/0002_discovery_candidate.sql`, `supabase/seed.sql`
- Verification: `scripts/probe-s1.sql`, `tests/unit/fixtures.test.mjs`, `tests/unit/acquisition.test.mjs`

## Regeneration

Run from repository root. Archify skill path:

```text
/home/anajibalm/.omp/agent/skills/archify/SKILL.md
```

Native commands:

```bash
ARCHIFY=/home/anajibalm/.omp/agent/skills/archify
node "$ARCHIFY/bin/archify.mjs" validate architecture docs/architecture/current-through-s2.architecture.json --quality showcase --json
node "$ARCHIFY/bin/archify.mjs" deliver architecture docs/architecture/current-through-s2.architecture.json docs/architecture/current-through-s2.html --quality showcase --json
node "$ARCHIFY/bin/archify.mjs" visual-check docs/architecture/current-through-s2.html --json

node "$ARCHIFY/bin/archify.mjs" validate architecture docs/architecture/target-mvp.architecture.json --quality showcase --json
node "$ARCHIFY/bin/archify.mjs" deliver architecture docs/architecture/target-mvp.architecture.json docs/architecture/target-mvp.html --quality showcase --json
node "$ARCHIFY/bin/archify.mjs" visual-check docs/architecture/target-mvp.html --json
```

`deliver` freezes each candidate specification into a same-directory private snapshot and creates trusted HTML. `visual-check` checks the delivered HTML in a real browser; it is not a substitute for human perceptual review.

## Next implementation checkpoint

S3: actual-media processing, per-second frame inventory, and product-entry anchors. S5: metrics/KPI calculations, configured ranking, and comparison execution. Do not treat target diagram edges as implemented runtime connections.
