# Implementation Plan v0.1 — Content Intelligence Copilot MVP

**Status:** READY TO BUILD  
**Target:** 1-day hackathon MVP  
**Primary goal:** complete one working vertical slice from TikTok URL to analyst-reviewed, evidence-backed hypothesis  
**Canonical app:** Next.js + TypeScript + Supabase/Postgres  
**Worker:** one processing worker; no Redis/Kafka/microservices  
**Source of truth:** Frozen MVP Contract v0.1 + Data Contract v0.1 Candidate + Frozen Donor Map v0.1

---

# 0. Hackathon success condition

The build is successful when this flow works end-to-end on real content:

```text
Existing Batch
→ Paste TikTok URL
→ Acquire playable media
→ Process actual video
→ Transcript + hook/representative frames
→ Structured fingerprint
→ Attach metrics
→ Objective-aware performance analysis
→ Controlled Compare
→ Why / Evidence
→ Analyst Approve / Edit / Reject
→ Analyst Notes
→ Next Test
→ Reload and state persists
```

The MVP is NOT considered complete if only the dashboard/UI works.

---

# 1. Non-negotiable invariants

Every implementation story must preserve these rules:

1. Provider response never becomes the domain model directly.
2. Raw metrics and derived metrics are separate.
3. Organic and Paid remain separate observation contexts.
4. Batch membership is never invented by AI.
5. AI-extracted features are not ground truth.
6. Human corrections preserve the original AI value.
7. Unreviewed extracted evidence caps hypothesis confidence at LOW.
8. SUSPECT metrics cannot support strong hypotheses.
9. Comparison freezes the exact snapshot IDs used.
10. Evidence must point back to source observations / transcript segments / frames / features.
11. Hypothesis must cite evidence.
12. LLM cannot override deterministic confidence/sample/data-quality guards.
13. No universal `Best Overall`.
14. Donor repo domain logic must not replace canonical product logic.

---

# 2. MVP cut line

## P0 — MUST SHIP

- canonical app shell
- workspace / brand / pillar / objective / batch / content
- TikTok URL ingestion
- acquisition adapter
- actual video processing
- transcript segments
- hook + representative frames
- structured content fingerprint
- metric snapshots
- objective-aware labels
- data quality
- sample guards
- controlled comparison
- Why / Evidence
- analyst review
- feature correction / golden labels
- hypothesis persistence
- analyst notes
- minimal Next Test
- real E2E test

## P1 — SHIP IF P0 STABLE

- Ads CSV/manual paid enrichment
- Consumer Says Lite
- Brand Overview polish
- provider fallback
- richer retry UI

## P2 — DO NOT BUILD TODAY

- PPT/PDF export
- automatic Pattern Memory discovery
- competitor intelligence
- multi-platform
- realtime monitoring
- scheduled crawling
- direct TikTok/Meta Ads API
- vector DB
- client portal
- enterprise permissions
- advanced experiment manager

---

# 3. Repository target structure

Recommended minimal structure:

```text
/
├── app/
│   ├── batch/[id]/
│   ├── content/[id]/
│   ├── compare/
│   ├── review/
│   └── api/
│       ├── content/
│       ├── comparisons/
│       ├── hypotheses/
│       └── imports/
│
├── components/
│   ├── shell/
│   ├── content/
│   ├── compare/
│   ├── evidence/
│   ├── review/
│   └── status/
│
├── lib/
│   ├── acquisition/
│   ├── metrics/
│   ├── rules/
│   ├── comparison/
│   ├── evidence/
│   ├── hypothesis/
│   └── db/
│
├── worker/
│   ├── jobs/
│   ├── processing/
│   └── prompts/
│
├── config/rules/
│   ├── sample-size-v1.json
│   ├── comparison-v1.json
│   ├── confidence-v1.json
│   ├── snapshot-v1.json
│   └── metrics-v1.json
│
├── fixtures/
│   ├── tiktok-post.json
│   ├── metric-snapshot.json
│   ├── transcript.json
│   ├── extraction.json
│   └── comments.json
│
└── tests/
    ├── unit/
    ├── integration/
    └── e2e/
```

---

# 4. Agent lanes

Use three parallel agents where possible.

## Agent A — DATA / ENGINE

Owns:
- schema/migrations
- acquisition adapter
- processing worker
- ffmpeg / ffprobe
- faster-whisper
- extraction packet
- metrics normalization
- rules
- comparison engine
- evidence creation
- hypothesis engine backend

Must NOT:
- invent UI fields not in contract
- import donor DB/domain models
- hardcode provider response shapes into domain entities

---

## Agent B — PRODUCT UI

Owns:
- canonical Next.js shell
- Batch Workspace
- content cards/library
- processing states
- content detail
- Compare UI
- Evidence panel
- review UI
- notes
- Next Test UI
- light Ads/Consumer Says surfaces if time remains

Donor sources:
- Swipefile: `Library.jsx`, `Compare.jsx`, `AdDetail.jsx`
- Content Dashboard: `ClientLayout.tsx`, `PostCard.tsx`, optional progress/skeleton components

Must NOT:
- copy donor winner/loser scoring
- copy `computeTier`
- create business logic in React components

---

## Agent C — QA / CONTRACT

Owns:
- fixtures
- contract tests
- unit tests
- integration tests
- E2E / Playwright
- data integrity assertions
- failure-state tests
- golden-set evaluation sheet/fixture
- acceptance checklist

Must continuously block regressions against the frozen invariants.

---

# 5. Dependency graph

```text
S0 Repo + contracts + fixtures
│
├── S1 Schema / canonical types
│   ├── S2 URL ingestion + acquisition
│   │   └── S3 Video processing
│   │       └── S4 Multimodal extraction
│   │
│   ├── S5 Metrics + rules
│   │   └── S7 Controlled Compare
│   │
│   └── S6 Batch Workspace UI
│       └── S7 Controlled Compare UI
│
S4 + S5 + S7
│
└── S8 Evidence + hypothesis
    └── S9 Review + golden labels
        └── S10 Next Test
            └── S13 E2E freeze
```

P1:

```text
S11 Ads CSV
S12 Consumer Says Lite
```

They must never block S13 core E2E.

---

# 6. Story plan

# S0 — Repo Bootstrap + Source-of-Truth Lock

**Priority:** P0  
**Owner:** Lead / Agent C  
**Target:** 30–45 min

## Scope

- initialize canonical Next.js + TypeScript app
- configure Supabase/Postgres
- add `/docs` copies/references of:
  - MVP Contract FROZEN
  - Data Contract v0.1 Candidate
  - Donor Map FROZEN
  - Acquisition Spike Spec
- add `/config/rules`
- add `/fixtures`
- add lint/test/typecheck scripts
- install Playwright or chosen E2E harness

## Required commands

```text
npm run lint
npm run typecheck
npm test
npm run build
```

## Acceptance

- clean app boots
- environment template exists
- no donor repo is used as canonical base
- contracts are visible to coding agents in repo
- fixture loading path works

---

# S1 — Canonical Schema + Types

**Priority:** P0  
**Owner:** Agent A  
**Depends on:** S0

## Implement Day-1 tables

Must:

```text
workspace
brand
objective
pillar
batch
content
content_source
acquisition_run
content_processing
metric_snapshot
transcript
transcript_segment
video_frame
extraction_run
content_feature
feature_review
feature_correction
comparison
comparison_item
comparison_snapshot
evidence
evidence_source
hypothesis
hypothesis_comparison
hypothesis_evidence
review
next_test
analyst_note
```

Conditional later today:

```text
test_result
comment
comment_theme
```

## Types

Create canonical TypeScript types for:

- Content
- MetricSnapshot
- ProcessingState
- ContentFeature
- FeatureReview
- Comparison
- Evidence
- Hypothesis
- Review
- NextTest

## Critical constraints

- `content` has no Organic/Paid distribution field
- distribution lives in `metric_snapshot`
- original AI feature cannot be overwritten
- comparison stores/fixes selected snapshot IDs
- provider raw payload stays in acquisition layer

## Acceptance

- migration applies from clean DB
- seed creates one workspace + Barakat brand + Batch 8 fixture
- DB constraints reject invalid foreign references
- content and metric snapshot can be inserted independently

---

# S2 — TikTok URL Ingestion + Acquisition Adapter

**Priority:** P0  
**Owner:** Agent A  
**Depends on:** S1  
**Spike dependency:** provider implementation selected after acquisition spike

## Interface

Implement a provider-neutral interface conceptually equivalent to:

```ts
interface VideoAcquirer {
  acquire(url: string): Promise<AcquisitionResult>
}
```

Output must normalize to canonical acquisition packet.

## Persist

- content source
- acquisition run
- provider raw payload
- failure reason
- attempt number
- latency/cost when available
- transient media location

## Rules

- canonical identity = TikTok permalink + external ID
- CDN/download URL is transient
- provider cannot assign confidence
- provider failure does not mutate analytical data
- retry creates/updates acquisition attempt history safely

## Acceptance

- fixture provider works without network
- real selected provider adapter exists
- invalid TikTok URL fails clearly
- duplicate URL does not create duplicate canonical content
- provider-specific payload is not exposed as domain model

---

# S3 — Video Processing Worker

**Priority:** P0  
**Owner:** Agent A  
**Depends on:** S2

## Pipeline

```text
MP4
→ ffprobe
→ audio extraction
→ hook frames
→ representative frames
→ faster-whisper
→ transcript segments
→ cleanup temp MP4
```

## Minimum frames

```text
0.0 sec
1.5 sec
3.0 sec
25%
50%
75%
final
```

Hook frames must preserve readable resolution.

## Processing state

Each stage:

```text
pending
running
completed
failed
unavailable
```

Stages must be retryable independently.

## Acceptance

- known fixture MP4 produces duration and dimensions
- audio WAV produced
- transcript segments stored with timestamps
- hook frames stored
- representative frames stored
- temp MP4 deleted by default
- retrying transcription does not rerun acquisition
- processing failure records actionable error

---

# S4 — Multimodal Fingerprint Extraction

**Priority:** P0  
**Owner:** Agent A  
**Depends on:** S3

## Input packet

Model receives:

- canonical metadata
- caption
- timestamped transcript
- 0s / 1.5s / 3s hook frames
- representative frames
- no performance conclusions

## Output schema v0.1

```text
topic
format
hook_type
hook_subject
talent_type
talent_familiarity
opening_style
pacing
narrative_structure
emotional_trigger
tension_type
product_placement
cta_type
```

## Must NOT extract as AI features

- pillar
- duration
- duration bucket
- metrics
- performance rating

## Versioning

Store:

- model provider
- model name
- prompt version
- schema version
- input hash
- raw output
- cost estimate if available

## Donor adaptation

Use ScrapeCreators transcript-intelligence workflow for:
- hook segmentation
- setup/context
- claim/payoff/CTA
- source traceability

Extend with our visual features.

## Acceptance

- output validates against structured schema
- malformed output fails safely
- all features are stored as AI-original/unreviewed
- same fixture can be processed twice without destroying previous run
- no free-text performance claim leaks into extraction layer

---

# S5 — Metrics + Objective + Rules Engine

**Priority:** P0  
**Owner:** Agent A  
**Depends on:** S1

## Implement

- raw metric snapshot
- metric quality
- Organic/Paid distinction
- derived metric service
- pillar objective mapping
- sample guard
- snapshot selector
- objective-aware labels

## Config files

```text
metrics-v1
sample-size-v1
snapshot-v1
confidence-v1
comparison-v1
```

## Initial provisional sample config

```text
engagement interactions <20 → insufficient
20–49 → directional
>=50 → eligible

comments <30 → counts + quotes only

pillar contents <5 → directional benchmark
```

These are config values, not statistical truths.

## Derived metric rule

ER is deterministic and versioned.

Do NOT store ER as raw provider fact unless source explicitly reports an ER field and it is preserved under a different source-specific name.

## Acceptance

Tests pass for:

- ER formula
- missing metric
- suspect zero metric
- Organic vs Paid separation
- sample guard
- pillar/objective label
- snapshot selection
- formula version recorded

---

# S6 — Batch Workspace UI

**Priority:** P0  
**Owner:** Agent B  
**Depends on:** S1  
**Can use fixtures before backend is complete**

## Screen

Primary page = Batch Workspace.

Must show:

- brand
- batch name
- contracted SV count
- content count
- URL add field
- content processing state
- objective-aware labels
- content cards/table
- Organic/Paid indicator
- data-quality state
- review state

## Donor adaptation

Use:
- `content-dashboard/components/ClientLayout.tsx` only as shell reference
- `content-dashboard/components/PostCard.tsx` presentation only
- Swipefile Library interaction for selection/filtering

Explicitly remove:

- viral/hot/strong/mid/low
- `computeTier`
- winner/loser donor semantics

## Acceptance

- fixture contents render before live processing is ready
- processing updates can render pending/running/completed/failed
- no universal Best Overall appears
- user can select contents for compare
- empty batch state is usable

---

# S7 — Controlled Compare Engine + Compare UI

**Priority:** P0  
**Owners:** Agent A + Agent B  
**Depends on:** S4, S5, S6

## Engine input

- candidate contents
- reviewed/unreviewed features
- metric snapshots
- rule versions

## Engine evaluates

- same pillar
- duration delta
- same format
- talent similarity/class
- content age delta
- distribution match
- sample eligibility
- metric quality

## Modes

```text
controlled
performance_contrast
manual
```

Default = controlled.

## Persist

- comparison
- comparison items
- frozen snapshot IDs
- controlled variables
- uncontrolled variables
- comparison quality
- rule version

## UI donor

Adapt Swipefile `src/pages/Compare.jsx`:

Keep:
- selected ordering
- side-by-side cards
- metric rows
- horizontal overflow
- missing selection state

Replace:
- row winner highlighting logic
- ad metric semantics

Add:
- Controlled vs Uncontrolled variables
- Data quality
- Sample state
- Comparison Quality
- explicit distribution context

## Acceptance

- controlled pair can be selected/generated
- snapshot IDs are persisted
- Paid and Organic cannot be silently compared as equivalent
- comparison with suspect metric is visibly degraded
- performance contrast is labeled exploratory/non-causal

---

# S8 — Evidence + Hypothesis Engine

**Priority:** P0  
**Owner:** Agent A  
**Depends on:** S4, S5, S7

## Evidence objects

Create source-backed evidence from:

- metric snapshot
- derived metric
- transcript segment
- video frame
- reviewed/unreviewed content feature

## Hypothesis generation input

- comparison facts
- evidence IDs
- controlled/uncontrolled variables
- sample state
- metric quality
- reviewed/unreviewed feature state

## LLM output

Structured:

```text
statement
supporting_evidence_ids[]
contradicting_evidence_ids[]
contextual_evidence_ids[]
suggested_next_test
```

## Deterministic post-processing

Apply confidence caps AFTER generation.

## Donor adaptation

From Competitive Intel:
- deterministic validators
- versioned rubric/rules
- fail closed on invalid artifact
- machine-readable errors

Do NOT import:
- their evidence tiers
- auto-publish
- positioning claim model

## Acceptance

- hypothesis without evidence is rejected
- invalid evidence ID is rejected
- unreviewed extracted evidence forces max LOW
- suspect primary metric forces max LOW
- one comparison forces max LOW
- hypothesis wording avoids causal certainty

---

# S9 — Analyst Review + Golden Labels

**Priority:** P0  
**Owners:** Agent A + Agent B  
**Depends on:** S4, S8

## Feature review UX

At content level:

```text
Confirm All
Correct fields
Reject All
```

Do not force 13 individual confirm buttons.

## Correction storage

Persist:

- original AI value
- corrected value
- reason code
- note
- reviewer
- extraction run

## Hypothesis review

```text
Approve
Edit
Reject
```

Reasons:

```text
wrong_classification
missed_visual_context
missed_dialogue
wrong_metric_interpretation
overclaim
too_generic
missing_variable
bad_data
other
```

## Acceptance

- correction never deletes original AI feature
- reload preserves review
- corrected value becomes canonical reviewed value
- unreviewed state remains visible
- hypothesis rejection reason persists
- review history remains append-only

---

# S10 — Analyst Notes + Next Test

**Priority:** P0  
**Owner:** Agent B + Agent A  
**Depends on:** S8, S9

## Analyst Notes

Support targets:

- batch
- content
- comparison
- hypothesis

Notes are human context, not automatically objective evidence.

## Next Test

Minimum fields:

```text
hypothesis_id
variable_to_test
variant_a
variant_b
controls
target_batch_id
status
```

Statuses:

```text
proposed
accepted
running
completed
cancelled
```

## Acceptance

- Next Test can be created from hypothesis
- linked hypothesis is preserved
- notes persist on reload
- Next Test is structured data, not only free text

---

# S11 — Ads CSV / Paid Snapshot Import

**Priority:** P1  
**Owner:** Agent A + Agent B  
**Depends on:** S5

## Scope

- upload CSV
- map row to content by URL / external ID
- create `distribution=paid` metric snapshot
- show paid lane in UI

## Non-goals

- Ads API
- attribution
- ROAS optimization agent
- campaign automation

## Acceptance

- one content can hold Organic + Paid snapshots separately
- paid snapshot never replaces organic snapshot
- unmatched CSV rows are reported
- import does not silently guess ambiguous mappings

---

# S12 — Consumer Says Lite

**Priority:** P1  
**Owner:** Agent A + Agent B  
**Depends on:** S6  
**Must not block core E2E**

## Workflow

```text
comments
→ light cleaning
→ classify
→ group themes
→ counts
→ representative quotes
```

Canonical MVP themes:

- question
- objection
- praise
- confusion
- other

Display:
- comment count
- counts by theme
- representative comments
- repeated phrases
- small-N warning

## Donor adaptation

Use ScrapeCreators comment-mining workflow/guardrails.

## Acceptance

- <30 comments does not show misleading percentages
- exact audience wording is preserved
- empty/no-comment state completes workflow cleanly

---

# S13 — Core E2E + Freeze

**Priority:** P0  
**Owner:** Agent C + Lead  
**Depends on:** S1–S10

## Primary E2E

```text
Open Batch 8
→ paste TikTok URL
→ acquisition starts
→ processing state updates
→ content appears
→ transcript + frames visible
→ fingerprint visible
→ metrics visible
→ select compare
→ controlled comparison created
→ hypothesis generated
→ evidence opens
→ reject hypothesis
→ choose reason
→ save analyst note
→ create Next Test
→ reload
→ state preserved
```

## Failure E2E

At minimum test:

1. invalid URL
2. acquisition failure
3. transcription failure
4. suspect metric
5. low sample
6. unreviewed extraction
7. missing evidence
8. Organic/Paid mismatch
9. duplicate URL
10. model malformed JSON

## Exit criteria

- P0 vertical slice PASS
- build PASS
- unit PASS
- integration PASS
- E2E PASS
- no frozen invariant violated
- 5–10 real Barakat videos processed or queued through the same path
- known failures documented

---

# 7. Test matrix

## Unit tests

Mandatory:

```text
metric formula
sample guard
snapshot selector
objective-aware label
metric quality propagation
comparison quality
confidence cap
review canonical-value resolver
duplicate content identity
rule-version loader
```

## Integration tests

Mandatory:

```text
URL → normalized content
content → acquisition run
MP4 → transcript + frames
extraction run → content features
metric snapshot → derived metric
compare → frozen snapshot IDs
hypothesis → evidence links
review → corrected canonical value
```

## E2E

One real/happy path + failure states from S13.

---

# 8. Golden-set evaluation

Use the first 10 real Barakat videos.

Before analyst sees AI output:

- human labels fingerprint fields
- preserve as golden fixture

Compare AI:

```text
exact / acceptable
incorrect
uncertain
```

Track per field:

- hook_type
- topic
- format
- opening_style
- pacing
- narrative_structure
- emotional_trigger
- tension_type
- product_placement
- CTA

Run at least some videos twice to inspect extraction stability.

Do not collapse all quality into one opaque score.

---

# 9. Hackathon clock

Recommended 12-hour schedule.

## H0:00–0:45

- S0
- contracts in repo
- fixtures ready
- Agent lanes started

## H0:45–2:00

Agent A:
- S1 schema
- acquisition spike/provider adapter

Agent B:
- shell
- Batch Workspace from fixtures

Agent C:
- tests/fixtures/invariants

**Gate:** URL → media route must be known by ~H2.

## H2:00–4:00

Agent A:
- S2 + S3

Agent B:
- S6
- library/processing states

Agent C:
- schema/processing tests

## H4:00–6:00

Agent A:
- S4 + S5

Agent B:
- content detail + compare shell

Agent C:
- metric/rule tests
- extraction schema tests

**Scope freeze:** after H6, no new P1 feature starts until P0 E2E works.

## H6:00–8:00

Agent A:
- S7 engine + S8 backend

Agent B:
- S7 UI + evidence UI

Agent C:
- compare/evidence assertions

## H8:00–9:30

Agent A:
- S9 backend

Agent B:
- review UI + notes + Next Test

Agent C:
- review persistence + confidence hard-gate tests

## H9:30–10:30

Core integration.

No new feature if E2E is red.

## H10:30–11:30

Real Barakat videos.

Fix:
- provider failures
- transcript issues
- unreadable frames
- schema mismatch
- UI dead ends

## H11:30–12:00

Only:
- bug fixes
- failure-state copy
- known-issues list
- final smoke test

No architecture changes.

---

# 10. Stop / cut rules

If behind schedule, cut in this order:

1. Brand Overview polish
2. Consumer Says
3. Ads CSV UI polish
4. content filters
5. fancy progress UI
6. Next Test advanced controls

Never cut:

- actual video processing
- transcript/frame evidence
- canonical fingerprint
- metric quality
- sample guard
- controlled comparison
- evidence provenance
- analyst review
- correction persistence
- hypothesis evidence links

---

# 11. Donor extraction instructions

Coding agents should read only the frozen donor targets.

## Swipefile

```text
src/pages/Library.jsx
src/pages/Compare.jsx
src/pages/AdDetail.jsx
```

Purpose:
interaction only.

## Content Dashboard

```text
components/ClientLayout.tsx
components/PostCard.tsx
components/RefreshProgress.tsx
```

Purpose:
presentation only.

Delete donor scoring semantics.

## Social Media Research Skills

```text
skills/transcript-intelligence/SKILL.md
skills/comment-mining/SKILL.md
```

Purpose:
workflow/prompt patterns.

## Competitive Intel Engine

```text
src/lib/llm/rubric.ts
src/lib/synthesis/validators.ts
src/lib/synthesis/trust-pipeline.ts
src/lib/ingestion/connector.ts
```

Purpose:
rule/version/validation/connector patterns.

Do not add adversarial judge until core flow is green.

---

# 12. Branch / worktree strategy

Recommended for 3 agents:

```text
main
│
├── agent-a-engine
├── agent-b-ui
└── agent-c-qa
```

Integration discipline:

- schema/type contract merged first
- fixture shapes treated as stable APIs
- UI may not invent backend fields
- backend may not rename fields without fixture/type update
- QA owns cross-lane contract failures
- merge small vertical pieces, not giant end-of-day branches

---

# 13. Handoff contract between agents

## Engine → UI

Must expose stable shapes for:

```text
BatchSummary
ContentListItem
ContentDetail
ProcessingState
MetricView
ComparisonView
EvidenceView
HypothesisView
ReviewView
NextTestView
```

## UI → Engine

UI sends only explicit commands:

```text
addContentUrl
createComparison
confirmFeatures
correctFeature
reviewHypothesis
saveNote
createNextTest
```

No UI-side analytical calculation beyond display formatting.

## QA → All

QA failures classified:

```text
CONTRACT
DATA_INTEGRITY
RULE
PROCESSING
UI
E2E
PROVIDER
MODEL_OUTPUT
```

---

# 14. Definition of implementation-ready

This plan is implementation-ready when coding agents receive:

- Frozen MVP Contract
- Data Contract v0.1 Candidate
- Frozen Donor Map
- Acquisition spike bundle
- this Implementation Plan
- environment keys/provider credentials if needed
- real Batch 8 test URLs

No further product ideation is required before beginning S0.

---

# 15. Final build sequence

```text
S0 Bootstrap
↓
S1 Canonical schema/types
↓
┌───────────────────────────────────────┐
│                                       │
S2 Acquisition                    S6 UI from fixtures
↓                                       │
S3 Video processing                     │
↓                                       │
S4 Fingerprint                S5 Metrics/rules
│                              │
└──────────────┬───────────────┘
               ↓
        S7 Controlled Compare
               ↓
        S8 Evidence/Hypothesis
               ↓
        S9 Analyst Review
               ↓
        S10 Notes + Next Test
               ↓
          S13 Core E2E
               ↓
        ┌──────┴──────┐
        S11 Ads      S12 Consumer Says
          P1             P1
```

## Build law

**After H6, nothing new enters scope until the P0 vertical slice is green.**

The target is not a broad product.

The target is:

> **one trustworthy analyst workflow that starts with a TikTok URL and ends with an evidence-backed, human-reviewed hypothesis.**
