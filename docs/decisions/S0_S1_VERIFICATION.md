# S0 / S1 Verification

Date: 2026-10-05

## S0

PASS for repository bootstrap and source-of-truth lock.

- Canonical Next.js + TypeScript app initialized.
- Supabase/Postgres migration and seed paths present.
- Frozen contracts copied under `docs/contracts/`.
- Source references and missing standalone Data Contract recorded.
- Canonical fixtures load through `scripts/validate-fixtures.mjs`.
- No commit, push, remote, or paid provider call made.

Commands:

```text
npm run lint                 PASS
npm run typecheck            PASS
npm test                     PASS (7/7)
npm run validate:fixtures    PASS
npm run build                PASS
python3 -m py_compile spikes/video-acquisition/video-acquisition-spike/spike_acquisition.py  PASS
```

The UI smoke response from `http://127.0.0.1:3000/` returned HTTP 200 and rendered `Batch 8 / Barakat`, `METRIC SNAPSHOT`, and `Fixture workspace`.

## S1

PASS for candidate persistence and database execution.

- `lib/domain/types.ts` now includes versioned brand analysis config, KPI definitions/assessments, reason-aware metric quality, comparison scope, and temporal anchor metadata.
- `supabase/migrations/0001_canonical_schema.sql` applies cleanly, followed by `0002_discovery_candidate.sql`.
- `supabase/seed.sql` applies cleanly and idempotently. Seed produced 12 canonical Batch 8 contents and sources, plus explicit `UNCONFIGURED` Barakat analysis config with reason `brand approval and ranking precedence not supplied`.
- Isolated disposable PostgreSQL: Docker `postgres:16-alpine`, database `cic_s1`, host port `55432`; no production or other project database touched.
- `scripts/probe-s1.sql` positive checks passed: seeded content/source counts, four candidate tables, candidate metric columns, and `UNAVAILABLE` acquisition state.
- Negative database probes passed: invalid FK rejected; derived `er` rejected from raw metrics; unconfigured config requires reason; AI original update rejected by trigger; temporal anchor requires frame or transcript source.
- v0.2 remains candidate, not frozen. Discovery delta: `docs/decisions/DISCOVERY_DELTA_2026-10-05.md`.

## S2

Deterministic implementation PASS; live gate PASS.

- Provider-neutral TypeScript adapter under `lib/acquisition/` supports strict URL normalization, canonical identity, repeat-ingestion ledger, attempt history, reason-aware failures, raw payload isolation, temporary media cleanup, fake provider, yt-dlp, and credential-gated TikHub/Apify adapters.
- `node --test tests/unit/acquisition.test.mjs`: 12/12 PASS.
- Live gate: first 10 normal public URLs from `barakat_batch8_urls.csv`; yt-dlp acquired and processed 10/10, success rate 100%, human handoffs 0, median latency 9.404s. Output was written outside repository to `/tmp/cic-s2-live`; transient media was deleted by spike cleanup.
- Live provider: yt-dlp. No secrets or paid provider calls used.

## Verification commands

```text
npm run lint                 PASS
npm run typecheck            PASS
npm test                     PASS (19/19)
npm run build                PASS
node --test tests/unit/acquisition.test.mjs  PASS (12/12)
python3 -m py_compile spikes/video-acquisition/video-acquisition-spike/spike_acquisition.py  PASS
```

## Remaining scope

- S3 will implement temporal media processing and per-second frame inventory.
- S5 will implement metrics/KPI calculations and ranking/compare behavior.
- S4 extraction, S6/S7 UI, evidence/hypothesis/review, notes, and Next Test remain later plan stories.
