# Plan Coverage

Status labels reflect evidence available at tracking checkpoint, not historical intent.

| Key | Scope | Priority | Milestone | Proposed status | Evidence / acceptance gate |
|---|---|---:|---|---|---|
| S0 | Bootstrap and source-of-truth lock | P0 | Core MVP | Done | `docs/decisions/S0_S1_VERIFICATION.md`; canonical app/contracts/fixtures present |
| S1 | Schema, canonical types, candidate persistence | P0 | Core MVP | Done | Disposable PostgreSQL migration, idempotent seed, positive/negative probes |
| S2 | TikTok URL normalization and acquisition adapters | P0 | Core MVP | Done (bounded) | 12/12 adapter tests; spike yt-dlp 10/10; runtime wiring now staging-proven, durable DB/worker remains open in R1 |
| S3 | Actual media processing and temporal evidence | P0 | Core MVP | Partial / Review | PR #25; actual-media staging: ffprobe, audio, 33 transcript segments, hook/representative/per-second frames, anchors, cleanup; AWT not proven |
| S4 | Fingerprint extraction and correction | P0 | Core MVP | Blocked by S3 | AI originals immutable; review/correction history; no extracted fact before processing |
| S5 | Metrics, KPI, ranking, and rules | P0 | Core MVP | Ready | Organic/Paid separation, quality reasons, brand-approved ranking, KPI target assessment |
| S6 | Batch Workspace UI | P0 | Core MVP | Partial | Existing fixture shell only; runtime data surface remains open |
| S7 | Controlled Compare | P0 | Core MVP | Blocked by S4,S5,S6 | Pair/group/batch scope, frozen snapshot IDs, explicit variables |
| S8 | Evidence and hypothesis | P0 | Core MVP | Blocked by S4,S5,S7 | Provenance-linked evidence, deterministic confidence caps, cited hypotheses |
| S9 | Analyst review and golden labels | P0 | Core MVP | Blocked by S4,S8 | Approve/edit/reject, append-only history, preserved AI originals |
| S10 | Notes and Next Test | P0 | Core MVP | Blocked by S8,S9 | Structured data, owner/success metric/measurement window, persistence |
| S11 | Ads CSV / paid enrichment | P1 | P1 Enhancements | Blocked by S5 | Import raw observations with Organic/Paid isolation and quality handling |
| S12 | Consumer Says Lite | P1 | P1 Enhancements | Blocked by S6 | Positive/negative/neutral sentiment, sample guards, counts, quotes, empty state |
| S13 | Core E2E and freeze | P0 | Core MVP | Blocked by S1–S10 and R1 | Real URL to reviewed hypothesis, reload persistence, final acceptance gates |
| A0 | Architecture delivery retrospective | P2 | P2 | Review | Automated Archify/browser evidence passed; human perceptual review pending |
| R1 | Application runtime integration | P0 | Core MVP | Blocked | Runtime DB connection, Next.js ingestion API/command, durable dispatch/state, worker handoff |
| C1 | Candidate contract conflict audit and product decision | P0 | Core MVP | Review | Decide v0.2 candidate deltas before freeze; do not block S3 without evidence |
| E1 | Durable sanitized S1/S2 receipts | P1 | P1 Enhancements | Ready | Preserve safe summary/hash outside `/tmp`; mark unavailable if source receipt is gone |
| P1-UI | Brand Overview polish | P1 | P1 Enhancements | Later | Product decision and acceptance needed |
| P1-FALLBACK | Provider fallback | P1 | P1 Enhancements | Later | Provider policy and credential boundary needed |
| P1-RETRY | Richer retry UI | P1 | P1 Enhancements | Later | Runtime acquisition state contract needed |
| P2 | Later backlog | P2 | P2 | Backlog | PPT/PDF, Pattern Memory, competitor intelligence, multi-platform, realtime, scheduled crawling, direct Ads API, vector DB, client portal, enterprise permissions, advanced experiment manager |

## Test matrix and acceptance gates

| Concern | Covered by / required | Gate |
|---|---|---|
| URL boundary | S2 unit tests | Invalid/private-ish URLs reject; canonical public TikTok identity stable |
| Provider isolation | S2 unit tests | Raw payload stays acquisition layer; domain packet normalized |
| Retry and cleanup | S2 unit tests | Reason-aware attempts; only explicitly temporary media deleted |
| Credential hygiene | S2 unit tests | TikHub/Apify gated; secrets never logged |
| Schema invariants | `scripts/probe-s1.sql` | FK, raw/derived, config reason, AI immutability, temporal source checks |
| Organic/Paid | fixtures, S1 schema, S5 | Distribution only on metric snapshot; no shared baseline |
| Evidence ontology | fixture validator and S8 | OBSERVED/DERIVED/EXTRACTED/INFERRED remain distinct |
| Temporal evidence | S3 | Timestamped frames/transcripts; AWT never treated as retention or causal proof |
| Ranking/KPI | S5 | Brand-approved config; no universal `Best Overall`; target separate from benchmark; missing access distinct from data error |
| Controlled comparison | S7 | Explicit pair/group/batch scope; exact snapshot IDs and variables frozen |
| AI review | S4/S9 | AI original preserved; corrections append-only; unreviewed extracted evidence caps confidence |
| Consumer Says | S12 | Sentiment classes, sample guards, counts, quotes, empty state |
| Golden set | S9/S13 | Analyst-approved labels and review decisions become regression fixtures before final freeze |
| Runtime failure scenarios | R1/S13 | DB unavailable, provider unavailable, malformed URL, retry, worker handoff loss, partial processing, reload persistence |
| Architecture evidence | A0 | Archify 9/9 and browser automated evidence; human visual review separate |

## Handoffs

- S1 → S2: canonical content/source/acquisition ledger and status vocabulary.
- S2 → R1/S3: normalized acquisition packet, attempt history, temporary-media boundary.
- R1 → S3/S6: durable job state and worker handoff; no fixture shortcut.
- S3 → S4: processing outputs, transcript segments, frames, temporal anchors.
- S4 + S5 + S6 → S7: extracted features, quality metrics, UI selection context.
- S7 → S8 → S9 → S10: frozen comparisons, evidence-linked hypotheses, review history, Next Test.
- S1–S10 + R1 → S13: real E2E and reload persistence.

## Dependency graph

```text
S1 <- S0
S2 <- S1
S3 <- S2
S4 <- S3
S5 <- S1
S6 <- S1
S7 <- S4, S5, S6
S8 <- S4, S5, S7
S9 <- S4, S8
S10 <- S8, S9
S11 <- S5
S12 <- S6
S13 <- S1–S10, R1
R1 <- S1, S2
```

P1/P2 backlog does not block Core MVP except where explicitly listed.
