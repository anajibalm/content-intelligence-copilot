# Donor Map v0.1 — FROZEN

Status: FROZEN
Date: 2026-10-05
Applies to: Content Intelligence Copilot MVP
Authority: PRD v0.1 Implementation Candidate + Data Contract v0.1 Candidate + Donor Repo Audit v0.1

## Freeze decision

The MVP will be built as a **clean canonical application**.

No donor repository may be forked wholesale and treated as the product base.

Donors are limited to the exact capability boundaries below.

Any change to this map requires an explicit donor-map revision and decision note.

---

## Canonical architecture ownership

### Ours / canonical

The following are product IP / canonical behavior and MUST NOT be inherited from donors:

- workspace / brand / batch / content model
- contract-defined batch semantics
- pillar + objective model
- Organic vs Paid separation
- metric normalization
- metric snapshot semantics
- snapshot selection policy
- derived metric formulas
- sample-size guards
- data-quality states
- controlled comparison logic
- comparison-quality rules
- evidence ontology
- evidence provenance
- multimodal fingerprint schema
- AI extraction review state
- human correction / golden-label model
- confidence caps
- hypothesis lifecycle
- hypothesis-evidence linking
- Next Test lifecycle
- test result lifecycle
- future Pattern Memory logic
- analyst review workflow

Canonical rule:

> Donor UI follows our product architecture.  
> Donor code never defines our domain architecture.

---

# Frozen donor map

## D1 — gntrs/swipefile

Role:
**Primary UX interaction donor**

Allowed source targets:

- `src/pages/Library.jsx`
- `src/pages/Compare.jsx`
- `src/pages/AdDetail.jsx`
- narrowly related helper/component files required to understand or port those interactions

Allowed to adapt:

- content browsing interaction
- filtering interaction
- multi-select interaction
- user-selected comparison ordering
- side-by-side content comparison layout
- media presentation
- missing-item / invalid-item states
- notes/tags/detail layout patterns
- horizontal comparison table behavior

Forbidden to inherit:

- winner / loser ontology
- `bestIndex` semantics
- CTR/CPC/ROAS domain assumptions
- ad-verdict logic
- ad-specific DB model
- automatic ranking logic
- donor AI reasoning as product truth

Implementation policy:

**Port interaction patterns into our Next.js + TypeScript canonical app.  
Do not embed Swipefile as a sub-app.  
Do not retain donor metric semantics.**

---

## D2 — ScrapeCreators/social-media-research-skills

Role:
**Primary research-workflow / prompt donor**

Allowed source targets:

- `skills/transcript-intelligence/SKILL.md`
- `skills/comment-mining/SKILL.md`
- `skills/outlier-post-finder/SKILL.md` — inspiration only

### Transcript Intelligence

Allowed to adapt:

- source traceability
- transcript timestamp preservation
- segmentation:
  - hook/opening
  - setup/context
  - main claim
  - evidence/examples
  - payoff
  - CTA
- preserving exact wording where useful
- approximate/garbled transcript warning
- multi-content pattern synthesis with source traceability

Required modification:

Transcript logic must be extended with our visual analysis:

- on-screen text
- visual hook
- talent
- opening style
- pacing
- narrative structure
- emotional trigger
- tension type
- product placement
- CTA type

### Comment Mining

Allowed to adapt:

- questions
- objections
- praise
- confusion
- representative quotes
- repeated themes
- sample-size disclosure
- one-off vs repeated-pattern distinction

MVP canonical subset:

- Questions
- Objections
- Praise
- Confusion
- Repeated phrases
- Representative comments

Forbidden to inherit:

- ScrapeCreators API as mandatory architecture
- transcript-only reasoning
- donor outlier thresholds
- donor confidence semantics
- donor report format as our product model

`outlier-post-finder` rule:

**Methodological reference only.**
Do not port 1.5x / 2x / 5x thresholds or raw-view winner logic.

---

## D3 — thereisno-tomorrow/competitive-intel-engine

Role:
**Primary engine-pattern donor**

Allowed source targets:

- `src/lib/synthesis/validators.ts`
- `src/lib/llm/rubric.ts`
- `src/lib/synthesis/trust-pipeline.ts`
- `src/lib/ingestion/connector.ts`

Optional / later:

- `src/lib/synthesis/judge.ts`
- `src/worker/attempts.ts`

### Validators

Allowed to adapt:

- deterministic validation before expensive AI evaluation
- machine-readable validation reasons
- downgrade-only / monotonic evidence logic
- explicit output rejection on structural failure

Must be rewritten around our ontology:

- OBSERVED
- DERIVED
- EXTRACTED
- INFERRED

Canonical hard-cap rules remain ours.

Examples:

- unreviewed extracted feature → max LOW
- insufficient sample → max LOW
- one comparison only → max LOW
- suspect primary metric → max LOW
- legacy-only evidence → capped according to our rule config

Forbidden:

- CONFIRMED / INFERRED / UNKNOWN evidence taxonomy as our canonical model

### Versioned Rubric / Rules

Allowed to adapt:

- owner-editable versioned rule files
- fail loudly on missing version
- record rule version on generated analytical artifacts

Canonical config candidates:

- `sample-size-v1`
- `comparison-v1`
- `confidence-v1`
- `snapshot-v1`
- `metrics-v1`

### Trust Pipeline

Allowed Day-1 pattern:

`generate -> deterministic validators -> analyst review`

Optional later:

`generate -> deterministic validators -> adversarial judge -> analyst review`

Forbidden Day-1:

- autonomous publish
- judge as replacement for analyst
- mandatory extra model call

### Connector Pattern

Allowed to adapt:

- provider-neutral connector interface
- injected transport
- isolated provider failure
- normalized downstream output
- explicit acquisition budget
- provider cannot assign analytical confidence

Map to our provider adapters, e.g.:

- TikTok public URL provider A
- fallback provider B
- manual upload emergency fallback

Forbidden:

- donor source types
- donor trust assignment
- donor GTM intelligence domain

### Worker

Reference only:

- persistent attempt counter
- retryable infra fault vs analytical rejection
- idempotent job behavior

Forbidden Day-1:

- pg-boss adoption unless independently required
- scheduler complexity
- worker stack copied wholesale

---

## D4 — tenfoldmarc/content-dashboard

Role:
**Shallow shell + presentation donor**

Allowed source targets:

- `components/ClientLayout.tsx`
- `components/PostCard.tsx`
- `components/RefreshProgress.tsx`
- directly related skeleton/loading presentation components if required

Allowed to adapt:

- sidebar/main shell
- page layout
- thumbnail/media card
- compact metric presentation
- loading state
- processing progress state
- image failure state

Mandatory deletion / replacement:

- `computeTier`
- `viral`
- `hot`
- `strong`
- `mid`
- `low`
- 3x-median outlier logic
- view/median performance scoring
- donor performance taxonomy

Forbidden:

- use as base repo
- reuse of broad command-center domain
- inheritance of donor DB/API model

---

## D5 — HunterSUNSUN/social-media-research-ops

Role:
**Later Pattern Memory concept donor**

Day-1 status:
**DO NOT INTEGRATE**

Allowed later references:

- `social-media-research-ops/references/templates.md`
- explicit next research breakpoint
- known / unresolved distinction
- repeated-pattern-over-single-example principle
- durable longitudinal research notes

Forbidden Day-1:

- Obsidian dependency
- agent-skill integration
- memory architecture derived from Markdown notes

Revisit target:
**Pattern Memory v1.1+**

---

# Day-1 implementation order

1. Create canonical Next.js + TypeScript + Supabase application.
2. Implement our canonical data contract first.
3. Port shell/presentation selectively from `content-dashboard` only where it clearly saves time.
4. Port Library + Compare interaction model from `swipefile`.
5. Implement our objective / metric / sample / comparison logic independently.
6. Adapt versioned-rule + deterministic-validator pattern from `competitive-intel-engine`.
7. Implement provider-neutral acquisition interface using connector-pattern principles.
8. Adapt transcript workflow from ScrapeCreators into our multimodal extractor.
9. Add analyst review + corrections / golden labels.
10. Add hypothesis + evidence + Next Test.
11. Add Consumer Says Lite only after core analysis flow passes.
12. Ignore Pattern Memory automation until MVP core is functioning.

---

# Mandatory no-import list

Coding agents MUST NOT copy or preserve the following donor concepts as canonical product behavior:

- Swipefile winner / loser scoring
- Swipefile `bestIndex` business semantics
- Content Dashboard `computeTier`
- Content Dashboard viral/hot/strong/mid/low taxonomy
- Content Dashboard 3x-median outlier rule
- ScrapeCreators 1.5x/2x/5x outlier thresholds
- ScrapeCreators API dependency as architecture
- Competitive Intel evidence-tier taxonomy
- Competitive Intel positioning-claim domain
- Competitive Intel autonomous publishing
- Competitive Intel pg-boss stack by default
- any donor DB schema
- any provider-generated confidence value
- Obsidian as MVP memory store

---

# Context-budget rule for coding agents

Agents must not ingest entire donor repositories unless explicitly authorized.

Default reading set:

### Swipefile
- `src/pages/Library.jsx`
- `src/pages/Compare.jsx`
- `src/pages/AdDetail.jsx`

### Content Dashboard
- `components/ClientLayout.tsx`
- `components/PostCard.tsx`
- `components/RefreshProgress.tsx` if needed

### Social Media Research Skills
- `skills/transcript-intelligence/SKILL.md`
- `skills/comment-mining/SKILL.md`

### Competitive Intel Engine
- `src/lib/llm/rubric.ts`
- `src/lib/synthesis/validators.ts`
- `src/lib/synthesis/trust-pipeline.ts`
- `src/lib/ingestion/connector.ts`

Optional:
- `src/lib/synthesis/judge.ts`
- `src/worker/attempts.ts`

---

# Change control

This donor map is FROZEN for MVP implementation.

A donor-map change requires all of:

1. identify the capability gap,
2. identify the exact donor file/module,
3. show why existing frozen donors cannot satisfy it cheaply,
4. verify license,
5. state what is being adapted vs what remains canonical,
6. update this document version.

Allowed without donor-map revision:

- implementation detail changes inside our canonical app
- replacing a donor-derived UI component with our own implementation
- rejecting a donor component after testing
- adding tests around a donor-adapted module

Not allowed without donor-map revision:

- introducing a new donor repository
- promoting a later donor into MVP
- inheriting a donor domain model
- changing canonical ownership boundaries
- replacing analyst review with donor automation

---

# Final frozen map

```text
CANONICAL APP — OURS
│
├── Shell / presentation
│   └── content-dashboard — shallow donor
│
├── Library interaction
│   └── swipefile — primary UX donor
│
├── Compare interaction
│   └── swipefile — primary UX donor
│       └── comparison intelligence — OURS
│
├── Video understanding
│   ├── ScrapeCreators transcript workflow — donor
│   └── multimodal fingerprint + evidence — OURS
│
├── Consumer Says Lite
│   ├── ScrapeCreators comment workflow — donor
│   └── sample guards + canonical output — OURS
│
├── Rule engine
│   ├── competitive-intel-engine patterns — donor
│   └── metric/sample/confidence/comparison rules — OURS
│
├── Acquisition
│   ├── competitive-intel-engine connector pattern — donor
│   └── TikTok provider adapters + policy — OURS
│
├── Analyst review / golden labels — OURS
├── Hypothesis lifecycle — OURS
├── Next Test lifecycle — OURS
└── Pattern Memory
    └── social-media-research-ops — LATER reference only
```

## Freeze declaration

**DONOR MAP v0.1 IS FROZEN.**

Implementation may begin against this map without further donor-research work.
