# Donor Repo Audit v0.1 — Content Intelligence Copilot

Status: AUDITED / candidate for donor-map freeze
Date: 2026-10-04
Basis: Frozen MVP Contract v0.1 + Data Contract v0.1 Candidate

## Executive decision

Use a **clean canonical app** that obeys our frozen contract. Do not fork any donor wholesale.

Primary donors:
1. `gntrs/swipefile` — UI/workflow donor for library + side-by-side compare.
2. `ScrapeCreators/social-media-research-skills` — prompt/workflow donor for transcript intelligence + Consumer Says.
3. `thereisno-tomorrow/competitive-intel-engine` — engine-pattern donor for deterministic validators, versioned rubrics, fail-closed judging patterns, and connector isolation.
4. `tenfoldmarc/content-dashboard` — shallow scaffold/component donor only.
5. `HunterSUNSUN/social-media-research-ops` — defer to Pattern Memory phase; concept/template donor, not Day-1 code.

Do NOT inherit any donor's domain model, scoring rules, confidence semantics, evidence ontology, or database schema.

---

## Scorecard

Scored 0–2 each:
Extractability, Framework Fit, Contract Fit, Code/Design Quality, Tests, License, Maintenance Signal, Time Saved.
Hard license failure would override the score.

| Repo | Score | Verdict | Day-1 role |
|---|---:|---|---|
| gntrs/swipefile | 14/16 | STRONG SELECTIVE DONOR | Library + Compare UX |
| ScrapeCreators/social-media-research-skills | 14/16 | STRONG WORKFLOW DONOR | Transcript + Consumer Says prompts/workflow |
| thereisno-tomorrow/competitive-intel-engine | 13/16 | STRONG ENGINE-PATTERN DONOR | Validators + rubric/versioning + trust patterns |
| tenfoldmarc/content-dashboard | 9/16 | SHALLOW DONOR | Next/Supabase shell + media-card presentation |
| HunterSUNSUN/social-media-research-ops | 10/16 | LATER / CONCEPT DONOR | Longitudinal memory templates |

Scores are implementation heuristics, not repo-quality rankings.

---

# 1. gntrs/swipefile

## Take / adapt

### `src/pages/Compare.jsx`
Use as the primary interaction donor for:
- selecting multiple contents
- preserving user-selected ordering
- side-by-side media presentation
- comparison-row rendering
- missing/invalid item states
- horizontal overflow behavior

Replace:
- CTR/CPC/ROAS row definitions
- `bestIndex` winner semantics
- all winner/loser presentation logic

with our:
- objective-aware metrics
- sample/data-quality guards
- controlled-variable matrix
- Evidence panel
- comparison quality

### `src/pages/Library.jsx`
Use as UX reference / selective extraction for:
- content browsing
- selection
- filters
- bulk interaction
- state in URL where useful

Do not port the entire page blindly; it is large and coupled to Swipefile's ad domain.

### `src/pages/AdDetail.jsx`
Inspect/borrow media + notes + tag/detail layout patterns if cheaper than rebuilding.

### `src/features/ai/*`
Use only for invocation UX patterns if useful. Do not inherit AI semantics.

## Why selected

- React + Tailwind + Supabase.
- Dedicated Compare page already exists.
- Library supports media, tags, notes, multi-select and compare.
- Has Vitest/test scripts.
- Human-set verdicts are designed not to be overwritten by importers, directionally aligned with our immutable AI-original + human-correction rule.
- MIT.

## Mismatch

- Vite/React Router, while our canonical app should be Next/TypeScript.
- Ad-domain metrics and winner/loser model conflict with frozen objective-aware performance contract.

## Decision

**ADAPT components/interactions; do not use as base app.**

---

# 2. ScrapeCreators/social-media-research-skills

## Take / adapt

### `skills/transcript-intelligence/SKILL.md`
Port workflow ideas:
- preserve timestamps + source URL
- segment hook/opening → setup → main claim → evidence/examples → payoff → CTA
- keep exact wording where useful
- mark garbled transcript as approximate
- synthesize patterns only with source traceability

Map into our fingerprint/evidence pipeline rather than their Markdown report.

### `skills/comment-mining/SKILL.md`
Primary donor for Consumer Says Lite categories and workflow:
- questions
- objections
- complaints/pain points
- praise
- confusion
- requests
- buying intent
- controversy/debate
- jokes/culture

For Day-1, retain only our agreed light subset:
Questions / Objections / Praise / Confusion / repeated phrases / representative comments.

Keep their useful guardrails:
- label sample size
- distinguish loud one-off from repeated pattern
- preserve exact audience language
- avoid broad sentiment claims from one post

### `skills/outlier-post-finder/SKILL.md`
Use only as methodological reference:
- preserve raw metrics before combined scores
- median is often safer than mean for baseline
- separate platforms/formats
- small sample is directional

Do NOT copy:
- 1.5x / 2x / 5x thresholds
- view-first winner logic
- their confidence semantics

## Mismatch

- Skills are designed around ScrapeCreators API.
- Transcript-only reasoning is insufficient for our MVP because we require actual visual evidence too.
- No canonical app/data model for us to reuse.

## Decision

**ADAPT prompt/workflow logic; no app-code dependency.**

---

# 3. thereisno-tomorrow/competitive-intel-engine

This repo is a stronger donor than initially expected, but only below the domain layer.

## Take / adapt

### `src/lib/synthesis/validators.ts`
Primary code-pattern donor for:
- cheap deterministic validation before expensive reasoning
- explicit machine-readable failure reasons
- evidence strength monotonicity

Reimplement with our ontology:
OBSERVED / DERIVED / EXTRACTED / INFERRED
and our hard caps:
unreviewed extraction / insufficient sample / suspect metric / one comparison.

Do not copy their CONFIRMED/INFERRED/UNKNOWN semantics.

### `src/lib/llm/rubric.ts`
Good donor for:
- versioned owner-editable rule/rubric files
- fail loudly when version is missing
- runtime artifact recording of rule version

Adapt to:
`sample-size-v1`, `comparison-v1`, `confidence-v1`, `snapshot-v1`, `metrics-v1`.

### `src/lib/synthesis/trust-pipeline.ts`
Borrow architecture:
`generate -> deterministic validators -> optional judge -> retry with specific errors`.

For MVP:
- deterministic validators are P0
- external adversarial LLM judge is OPTIONAL/LATER
- human analyst remains final gate

### `src/lib/synthesis/judge.ts`
Keep as future pattern:
- judge may refute but cannot rewrite
- malformed judge response fails closed
- infrastructure failure is distinct from analytical rejection

Do not add the extra model call unless core flow is already complete.

### `src/lib/ingestion/connector.ts`
Borrow design discipline:
- injected transport
- provider-specific connector cannot assign trust/evidence quality
- provider failures are isolated
- provider output is normalized downstream
- cost/fetch budget can be explicit

Adapt into our VideoAcquirer/provider interface.

### `src/worker/*`
Do NOT port pg-boss / scheduling wholesale Day-1.
Borrow only:
- persistent attempts
- retry/error distinction
- idempotent-job mindset

Our one-worker + Postgres-state model remains simpler for the hackathon.

## Major mismatch

Their product auto-publishes after machine trust gates.
Our frozen MVP requires:
AI proposes -> analyst reviews.

Their positioning-claim domain, evidence tiers, Prisma schema, Neon/pg-boss stack are NOT donors.

## Decision

**SELECTIVE CODE/PATTERN DONOR for engine infrastructure, not domain intelligence.**

---

# 4. tenfoldmarc/content-dashboard

## Take / adapt

### `components/ClientLayout.tsx`
Potential shell donor:
- sidebar + main layout
- page-level access state

Strip its role/access model if it slows Day-1.

### `components/PostCard.tsx`
Use presentation only:
- thumbnail/media area
- compact content metrics
- loading/image behavior
- content-card visual hierarchy

DELETE/REPLACE its:
- `computeTier`
- viral/hot/strong/mid/low taxonomy
- 3x-median outlier rule
- percentage-vs-median winner presentation

Those directly violate our frozen performance contract.

### Other component references
Potentially inspect:
- `RefreshProgress.tsx` for processing state
- skeleton/loading components
- basic overview/table patterns

## Why not base/fork wholesale

- Very broad content command center.
- Repo is young and has low adoption signal.
- Many unrelated APIs/features increase cleanup surface.
- Its outlier model is views/median based and conflicts with our objective/sample-guard model.

## Decision

**SHALLOW COMPONENT DONOR. Do not inherit business logic or schema.**

---

# 5. HunterSUNSUN/social-media-research-ops

## Useful later

Take conceptual patterns:
- evidence over generic theory
- repeated patterns over one viral example
- durable research notes
- explicit “next research breakpoint”
- current conclusion state vs unresolved question

`references/templates.md` is useful as inspiration for Pattern Memory and “resume from where analysis stopped”.

## Why not Day-1

It is fundamentally an agent-skill + Obsidian-note workflow, not an application/data engine.
Integrating it today does not reduce core MVP build time.

## Decision

**NO DAY-1 CODE. Revisit for Pattern Memory v1.1.**

---

# Frozen donor boundaries

## Donor / adapt

- shell/navigation presentation
- content cards/player presentation
- content library interactions
- side-by-side compare interaction
- transcript segmentation workflow
- comment-mining workflow
- deterministic validator pattern
- versioned rule loader
- provider/connector isolation pattern
- generic loading/error states
- test organization

## Original / protected

- Data Contract
- objective/pillar semantics
- metric normalization
- sample guard
- snapshot policy
- data-quality engine
- controlled-pair selection
- comparison-quality rules
- evidence ontology/provenance
- canonical fingerprint schema
- feature-review/golden-set semantics
- confidence caps
- hypothesis lifecycle
- Next Test state
- Organic/Paid semantics
- future Pattern Memory logic

---

# Day-1 extraction order

1. Start canonical **Next.js + TypeScript + Supabase** app.
2. Pull/adapt shell/media-card presentation from `content-dashboard` only if it saves time.
3. Port interaction design from Swipefile `Library.jsx` + `Compare.jsx` into our TypeScript/domain contract.
4. Adapt Competitive Intel deterministic-validator + versioned-rubric patterns into our rule engine.
5. Adapt ScrapeCreators transcript segmentation prompt into our multimodal extraction prompt.
6. Adapt ScrapeCreators comment-mining categories only if Consumer Says time remains.
7. Ignore Social Media Research Ops during hackathon.

---

# Critical implementation warnings

- Do not import Swipefile's winner/loser model.
- Do not import Content Dashboard's `computeTier`.
- Do not import ScrapeCreators outlier thresholds.
- Do not import Competitive Intel evidence-tier taxonomy.
- Do not import Competitive Intel auto-publish behavior.
- Do not import any donor database schema.
- Do not let a provider connector assign evidence confidence.
- Do not add pg-boss/Redis/extra queue infrastructure on Day-1.

---

# Candidate donor map

| Capability | Final candidate | Exact target | Action |
|---|---|---|---|
| App shell | content-dashboard | `components/ClientLayout.tsx` | selective port/adapt |
| Media/content card | content-dashboard | `components/PostCard.tsx` | presentation only |
| Content library | swipefile | `src/pages/Library.jsx` | adapt interaction |
| Side-by-side compare | swipefile | `src/pages/Compare.jsx` | adapt interaction, replace metrics/logic |
| Transcript analysis | social-media-research-skills | `skills/transcript-intelligence/SKILL.md` | adapt workflow/prompt |
| Consumer Says | social-media-research-skills | `skills/comment-mining/SKILL.md` | adapt taxonomy/guardrails |
| Baseline research inspiration | social-media-research-skills | `skills/outlier-post-finder/SKILL.md` | inspiration only |
| Rule/version loader | competitive-intel-engine | `src/lib/llm/rubric.ts` | adapt |
| Deterministic validators | competitive-intel-engine | `src/lib/synthesis/validators.ts` | adapt heavily |
| Trust/retry structure | competitive-intel-engine | `src/lib/synthesis/trust-pipeline.ts` | pattern only Day-1 |
| Adversarial judge | competitive-intel-engine | `src/lib/synthesis/judge.ts` | later/optional |
| Provider abstraction | competitive-intel-engine | `src/lib/ingestion/connector.ts` | adapt concept/interface |
| Worker retries | competitive-intel-engine | `src/worker/attempts.ts` | reference only |
| Pattern Memory | social-media-research-ops | `references/templates.md` | later |

