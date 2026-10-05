# MVP CONTRACT v0.1 — FROZEN

**Product:** Content Intelligence Copilot  
**Status:** FROZEN  
**Freeze date:** 2026-10-04  
**Purpose:** Hackathon MVP / vertical slice

## 1. Primary user

Agency content / social-media analyst.

The workspace may be technical. Client / brand teams are downstream readers of approved insight, not the primary operator.

## 2. Canonical input

Primary input is a **public TikTok video URL**.

Secondary enrichment:
- CSV / spreadsheet for owned metrics
- Ads export / manual paid metrics
- TikTok account URL only as a convenience for discovering video URLs

Manual MP4 upload is an emergency fallback, not the happy path.

## 3. Batch semantics

A Batch is **contract-defined** from the agency quotation / scope of work.

The system must not invent batches based on date, clustering, or AI grouping.

## 4. MVP platform and scope

### Platform
- TikTok first

### Performance contexts
- Organic
- Ads / paid

Organic and Paid observations must remain distinct and must not silently share the same baseline or score.

## 5. Core MVP capabilities

1. Existing contractual Batch workspace
2. Add content from TikTok public URL
3. Actual video acquisition and processing
4. Timestamped transcript
5. First-3-second visual evidence
6. Representative frames
7. Structured content fingerprint
8. Organic metric snapshot
9. Private / owned metric enrichment
10. Paid metric enrichment via CSV/manual import
11. Objective-aware performance labels
12. Per-content breakdown
13. Controlled Compare
14. Why / Evidence
15. Data-quality guards
16. AI extraction review
17. Hypothesis review
18. Analyst Notes
19. Minimal structured Next Test

## 6. Light MVP

### Consumer Says Lite

If comments are available:
- Questions
- Objections
- Praise
- Confusion
- Repeated phrases
- Representative comments

Small samples must use counts + quotes + warning, not misleading theme percentages.

Consumer Says must not block the main workflow.

## 7. Explicitly later / non-MVP

- PPT / PDF export
- Automatic Pattern Memory discovery
- Competitor intelligence
- Multi-platform
- Realtime monitoring
- Scheduled crawling
- Direct TikTok Ads / Meta Ads API
- Full autonomous reporting
- Autonomous strategist
- Vector DB
- Enterprise permission system
- Complex experiment-management UI

## 8. Performance contract

There is no universal `Best Overall` in MVP.

Allowed labels are objective-specific, for example:
- Best by Reach
- Best by Engagement
- Best by Watch Quality
- Lowest by Reach
- Lowest by Engagement

Every relative label must state its comparison basis.

Pillars are human-defined and may map to primary / secondary objectives.

## 9. Evidence ontology

Every analytical claim must distinguish:

- **OBSERVED** — direct source fact
- **DERIVED** — deterministic calculation
- **EXTRACTED** — AI interpretation of content
- **INFERRED** — hypothesis / reasoning

These layers must not be silently collapsed.

## 10. Data integrity invariants

1. Provider responses never become the domain model directly.
2. Raw metrics never contain derived metrics such as ER.
3. Organic and Paid never silently share a performance baseline.
4. Value `0` never automatically means a valid zero.
5. Metric quality states include at least VALID / MISSING / SUSPECT / UNAVAILABLE.
6. SUSPECT metrics cannot act as strong evidence.
7. Comparison freezes the snapshot IDs actually used.
8. Evidence points back to immutable source observations / segments / frames / features.
9. Historical analytical artifacts are versioned, not silently recomputed.

## 11. AI / human-review invariants

1. AI extraction is not ground truth.
2. AI-extracted content features support Confirm All / Correct / Reject.
3. Human corrections never overwrite or delete the original AI output.
4. Unreviewed EXTRACTED evidence caps hypothesis confidence at LOW.
5. Analyst edits and rejection reasons are preserved as evaluation data.
6. Analyst Notes are first-class human context but are not automatically treated as objective evidence.

## 12. Compare contract

Default mode: **Controlled Compare**.

The system should prefer pairs sharing as many relevant variables as possible:
- same pillar
- similar duration
- similar format
- comparable content age
- same distribution context

Performance contrast (e.g. best vs lowest) remains available for exploration, but must not be presented as causal evidence.

Comparison quality is deterministic, not decided by LLM prose.

## 13. Confidence contract

Confidence labels:
- LOW
- MEDIUM
- HIGH

No numeric probability in MVP.

Comparison Quality and Effect Evidence are separate concepts.

Hard caps include:
- unreviewed extracted feature → max LOW
- insufficient sample → max LOW
- one comparison only → max LOW
- suspect primary metric → max LOW
- legacy narrative only → max MEDIUM

LLM cannot override deterministic caps.

## 14. Sample guard contract

Sample guards are mandatory and versioned.

The exact numerical thresholds are **PROVISIONAL** and may be calibrated during pilot without reopening the MVP contract.

Small-N output must be explicitly downgraded to directional / insufficient rather than presented as strong winner/loser evidence.

## 15. Hypothesis lifecycle

A hypothesis may move through:

`PROPOSED → ACCEPTED → TESTING → SUPPORTED / CONTRADICTED / INCONCLUSIVE → RETIRED`

One hypothesis may be connected to many comparisons across batches.

Relationship roles include:
- origin
- replication
- contradiction

## 16. Next Test contract

Next Test is structured data, not only recommendation prose.

Minimum fields:
- hypothesis
- variable to test
- variant A
- variant B
- controls
- target batch
- status

A completed test may link to a result comparison and update the hypothesis state.

## 17. Video-processing contract

Once media is acquired, the MVP processing path is locked to:

`MP4 → ffprobe → ffmpeg → faster-whisper → hook frames + representative frames → multimodal structured extraction`

Minimum opening frames:
- 0.0s
- 1.5s
- 3.0s

Actual media must be processed; caption-only analysis does not satisfy the MVP contract.

## 18. Acquisition contract

The happy path begins from a public TikTok URL and must avoid cross-division human file coordination.

Provider implementation stays replaceable behind an acquisition adapter.

The final choice among direct download / TikHub / Apify or another provider is **SPIKE-GATED** and does not reopen the MVP product contract.

Resolved CDN URLs are transient. TikTok permalink + external post ID remain canonical.

Downloaded public MP4 is temporary and is deleted after derivative analytical artifacts are created.

## 19. Primary MVP workflow

`Existing Batch → Paste URL → Acquire Video → Process Video → Extract Fingerprint → Attach Metrics → Performance Analysis → Controlled Compare → Why/Evidence → Analyst Review → Notes → Next Test`

## 20. Definition of Done

The MVP succeeds when an analyst can:

1. Open an existing batch.
2. Paste a public TikTok video URL.
3. Have the system acquire and process the actual video without normal human handoff.
4. See transcript / visual evidence / fingerprint / metrics.
5. See objective-aware performance analysis.
6. Compare relevant contents.
7. Receive a grounded Why / Evidence hypothesis.
8. See facts, derived calculations, AI extraction, and inference separately.
9. Approve, edit, or reject AI output with reason.
10. Save analyst notes.
11. Create a minimal Next Test.
12. Reload and preserve the state.

## 21. Frozen vs configurable

### Frozen
- primary user
- URL-first happy path
- contract-defined batch semantics
- TikTok-first MVP
- Organic + Ads scope
- actual video processing requirement
- core output set
- evidence ontology
- review philosophy
- objective-aware performance model
- controlled comparison
- quality guards
- hypothesis lifecycle
- hypothesis ↔ comparison many-to-many
- structured Next Test
- separation of raw / derived / extracted / inferred
- Organic / Paid separation

### Configurable without reopening this contract
- URL → MP4 provider
- fallback provider
- numerical sample thresholds
- canonical snapshot timing
- exact Ads CSV fields
- fingerprint enum vocabulary
- prompt / model versions
- UI polish
- cost / latency targets

## 22. Change-control rule

This contract may only be reopened if a spike or real pilot proves that a frozen requirement is technically impossible or materially wrong for the primary analyst workflow.

A donor repo, library, framework, or provider is **not** sufficient reason to change the frozen product contract.

The implementation must adapt to this contract, not the reverse.
