# PRD v0.1 — Content Intelligence Copilot

**Status:** Implementation Candidate  
**Target:** Hackathon MVP — 1 hari  
**Primary platform:** TikTok  
**Primary customer context:** Agency  
**Primary operator:** Content / social media analyst agency  
**Primary input:** Public TikTok video URL  
**Primary workflow unit:** Contract-defined Batch

---

## 1. Product Goal

Membantu analyst agency melakukan **first-pass content analysis yang usable** tanpa memulai dari blank page.

Sistem menerima video TikTok yang sudah tayang, benar-benar memproses isi videonya, menggabungkannya dengan metrik performa, lalu membantu analyst menjawab:

> Konten mana yang perform / underperform, apa yang berbeda di antara mereka, evidence-nya apa, dan apa hipotesis yang layak diuji berikutnya?

Produk bukan autonomous strategist.

```text
AI proposes
    ↓
Analyst validates / edits / rejects
    ↓
Approved intelligence
```

---

# 2. Problem

Workflow saat ini mengharuskan analyst:

```text
collect metrics
↓
watch videos
↓
identify best / lowest
↓
compare contents
↓
identify differentiators
↓
write insight
↓
make recommendation
↓
repeat every batch
```

Masalah utamanya bukan sekadar mendapatkan angka.

Masalah yang lebih mahal adalah:

1. video harus ditonton satu per satu;
2. analyst harus mencari **kenapa** performa berbeda;
3. insight generik seperti “hook kurang kuat” tidak cukup;
4. metric bisa misleading atau rusak;
5. Ads dan organic menghasilkan konteks performa berbeda;
6. analisis batch berikutnya sering mengulang reasoning dari awal;
7. AI generik mudah menghasilkan penjelasan yang terdengar masuk akal tetapi tidak grounded.

---

# 3. Product Thesis

Produk bukan:

> TikTok analytics dashboard + AI summary.

Produk adalah:

> **Content Intelligence Workspace untuk agency analyst yang menghubungkan actual video evidence, performance data, controlled comparison, AI hypothesis, dan human review.**

Long-term learning loop:

```text
Content
↓
Observed Performance
+
Extracted Content Features
↓
Controlled Comparison
↓
Hypothesis
↓
Next Test
↓
Future Content
↓
Result
↓
Supported / Contradicted
↓
Institutional Memory
```

MVP hanya harus membuktikan bagian pertama loop ini benar-benar membantu analyst.

---

# 4. Primary User

## Operator

Agency content / social media analyst.

User dianggap sudah familiar dengan istilah seperti:

```text
Views
ER
AWT
WFV
Pillar
Batch
Organic
Ads
```

UI tidak perlu menjelaskan istilah dasar secara berlebihan.

## Output audience

Client / brand team dapat membaca insight atau report yang dihasilkan kemudian.

Karena itu:

- workspace boleh teknis;
- narrative insight tetap harus client-readable.

---

# 5. Primary Job To Be Done

> Setelah konten sebuah batch tayang, bantu gue memahami performanya dan menghasilkan first-pass explanation yang cukup grounded sehingga gue tinggal memvalidasi dan memperdalam, bukan mulai analisis dari nol.

---

# 6. Core Product Object: Batch

**[LOCKED]**

Batch tidak dibuat otomatis berdasarkan tanggal atau clustering AI.

Batch sudah ditentukan sebelumnya berdasarkan quotation / contract agency.

Contoh:

```text
Brand Barakat

Batch 7
15 Short Videos

Batch 8
15 Short Videos

Batch 9
12 Short Videos
```

Sistem hanya:

```text
create/import existing batch
↓
assign contents to batch
```

---

# 7. Canonical Input

## Primary

**[LOCKED]**

```text
TikTok public video URL
```

Alasan:

- sudah tersedia setelah konten tayang;
- tidak membutuhkan koordinasi lintas divisi;
- human coordination cost lebih tinggi daripada acquisition compute cost.

Happy path tidak boleh membutuhkan analyst meminta MP4 ke tim produksi.

---

## Secondary enrichment

```text
CSV / spreadsheet
```

untuk private / owned metrics seperti:

```text
AWT
WFV
private analytics
Ads metrics
```

---

## Secondary convenience input

```text
TikTok account URL
```

Account URL dapat digunakan untuk discover video URLs.

Bukan canonical content identity.

---

## Emergency fallback

```text
Manual MP4 upload
```

Hanya jika public URL gagal / deleted / private / unavailable.

---

# 8. MVP Scope

## CORE

- Existing batch selection.
- TikTok video URL ingestion.
- Public video acquisition.
- Actual video processing.
- Transcript with timestamps.
- Hook / representative frames.
- Structured content fingerprint.
- Organic metrics.
- Private metric enrichment.
- Paid metric enrichment via CSV/manual import.
- Objective-aware performance labels.
- Per-content breakdown.
- Controlled Compare.
- Why / Evidence.
- Data quality states.
- AI extraction review.
- Hypothesis review.
- Analyst Notes.
- Minimal Next Test object.

## LIGHT MVP

### Consumer Says Lite

Jika comments tersedia:

```text
Questions
Objections
Praise
Confusion
Repeated phrases
Representative comments
```

Tidak menjadi blocker core workflow.

## LATER

- PPT/PDF generation.
- Automatic Pattern Memory discovery.
- Competitor intelligence.
- Multi-platform.
- Realtime monitoring.
- Scheduled crawling.
- Direct TikTok Ads / Meta Ads API.
- Autonomous strategy generation.
- Complex experiment management.
- Vector DB.
- Enterprise permission system.

---

# 9. Primary User Flow

```text
Open Brand
↓
Select existing Batch
↓
Paste TikTok URL
↓
System acquires video + public metadata
↓
Process actual video
    ├ transcript
    ├ timestamps
    ├ opening frames
    └ representative frames
↓
Extract structured content fingerprint
↓
Store public metrics
↓
Optional:
upload private / Ads metrics
↓
Content appears in Batch Workspace
↓
Performance labels calculated
↓
Analyst opens Compare
↓
System proposes controlled pair
↓
Why / Evidence generated
↓
Analyst:
Approve / Edit / Reject
↓
Analyst writes notes
↓
Optional Next Test
```

---

# 10. Functional Requirements

## FR-01 — Existing Batch

**[LOCKED]**

User can create/select a contractual batch containing:

```text
brand
batch name / number
contracted content count
status
```

System must not automatically invent batch membership.

---

## FR-02 — Add Content by URL

**[LOCKED]**

Analyst can paste TikTok video URL into an existing batch.

System creates canonical Content object using:

```text
platform
external post ID
source URL
published_at
duration
caption
```

---

## FR-03 — Public URL Acquisition

**[SPIKE-GATED]**

System must attempt:

```text
TikTok public URL
↓
playable/downloadable media
```

without human handoff.

Provider implementation must be abstracted behind acquisition adapter.

Success target for normal public URLs:

```text
≥ 90%
```

across spike dataset.

---

## FR-04 — Actual Video Processing

**[LOCKED]**

Analysis must not rely only on:

```text
caption
title
metrics
```

System must process actual media.

Required output:

```text
duration
audio
timestamped transcript
first-3-second visual evidence
representative frames
```

---

## FR-05 — Video Processing Pipeline

**[LOCKED]**

Default MVP pipeline:

```text
MP4
↓
ffprobe
↓
ffmpeg
├ audio
└ frames
↓
faster-whisper
↓
timestamped transcript
↓
multimodal extraction
```

Opening visual sampling minimum:

```text
0.0 sec
1.5 sec
3.0 sec
```

plus representative frames from remaining video.

---

# 11. Content Fingerprint

## AI-extracted fields

**[LOCKED — schema v0.1]**

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

Not AI-extracted:

```text
pillar
duration
duration_bucket
performance metrics
```

`pillar` = analyst / business taxonomy.

`duration_bucket` = deterministic derived feature.

---

# 12. Extraction Review

**[LOCKED]**

AI extraction is never automatically treated as ground truth.

Content-level review states:

```text
unreviewed
confirmed
corrected
rejected
```

UX must support:

```text
Confirm all
```

rather than requiring 13 confirmations.

If incorrect:

```text
Edit specific fields
```

Original AI value must remain stored.

Human correction creates a new reviewed value.

---

# 13. Golden Set

Every corrected feature must retain:

```text
AI original
human corrected value
reason
extraction run version
```

This becomes evaluation data for future extraction versions.

---

# 14. Performance Model

## No universal Best Overall

**[LOCKED]**

Forbidden label:

```text
Best Overall
```

unless an explicit analyst-defined weighted objective exists in the future.

Allowed examples:

```text
Best by Reach
Best by Watch Quality
Best by Engagement
Lowest by Reach
Lowest by Engagement
```

Every label must state its comparison basis.

Forbidden:

```text
High
Low
Baseline+
```

without explicit baseline.

Preferred:

```text
+18% vs pillar median
Top Reach in Batch
-22% vs same-pillar median
```

---

# 15. Pillar and Objective

**[LOCKED]**

Pillar is brand-specific taxonomy.

Example:

```text
Awareness
Conversion
Educational
Social Experiment
```

Every pillar can define:

```text
primary objective
secondary objective
```

Example:

```text
Awareness
Primary → Reach

Conversion
Primary → Engagement
Secondary → Watch Quality
```

Objective configuration is human-controlled.

AI may suggest but cannot silently change it.

---

# 16. Raw vs Derived Metrics

**[LOCKED]**

Raw metrics are stored as observations.

Example:

```text
views
likes
comments
shares
saves
AWT
WFV
spend
impressions
clicks
```

Derived metrics such as:

```text
ER
relative lift
watch percentage
```

must be calculated via deterministic formulas.

Every derived metric must store/reference:

```text
formula_version
```

---

# 17. Metric Snapshot

**[LOCKED structure / PROVISIONAL policy]**

One Metric Snapshot means:

> one data source, one capture time, one distribution context.

Required:

```text
content_id
source
distribution
captured_at
content_age_hours
raw_metrics
quality_state
```

Distribution:

```text
organic
paid
```

Organic and paid observations must not share baseline/scoring automatically.

---

# 18. Snapshot Comparison Policy

**[PROVISIONAL]**

Comparison must attempt to use observations at comparable content ages.

Candidate policy:

```text
target age = H+14
nearest eligible observation
max preferred delta = ±24h
```

If content ages differ substantially:

```text
comparison_quality penalty
```

Exact canonical timing will be calibrated during pilot.

---

# 19. Metric Quality

**[LOCKED]**

Every metric may have:

```text
VALID
MISSING
SUSPECT
UNAVAILABLE
```

Value `0` does not automatically mean valid zero.

SUSPECT metrics:

- remain visible;
- cannot act as strong evidence;
- cap related hypothesis confidence where appropriate.

---

# 20. Sample Guard

**[LOCKED concept / PROVISIONAL thresholds]**

System must prevent tiny samples from being presented as strong performance signals.

Provisional rules:

```text
Interactions < 20
→ insufficient sample

20–49
→ directional only

≥50
→ comparison eligible
```

Consumer Says:

```text
comments < 30
→ counts + quotes only
```

Pillar benchmark:

```text
<5 contents
→ directional only
```

Exact numbers can be recalibrated during pilot.

Rule set must be versioned.

---

# 21. Compare Modes

## Controlled Compare

**[CORE / DEFAULT]**

Prioritize pairs sharing as many variables as possible:

```text
same pillar
similar duration
similar format
similar content age
same distribution type
```

## Performance Contrast

Allowed:

```text
best vs lowest
```

but must explicitly state:

> useful for exploration, not causal attribution.

## Manual Compare

Analyst can manually select contents.

---

# 22. Comparison Quality

**[LOCKED]**

Comparison engine deterministically tracks:

```text
controlled variables
uncontrolled variables
snapshot compatibility
metric quality
sample eligibility
```

LLM does not decide comparison quality by prose.

---

# 23. Evidence Ontology

**[LOCKED]**

Every insight must distinguish:

### OBSERVED

Direct source observation.

Examples:

```text
1,315 views
35 sec duration
AWT 3.55 sec
```

### DERIVED

Deterministic calculation.

Examples:

```text
ER
relative difference
duration bucket
```

### EXTRACTED

AI interpretation of content.

Examples:

```text
hook_type = comparison
pacing = fast
```

### INFERRED

Reasoning / hypothesis.

Example:

> comparison framing may have increased curiosity.

These types must remain visually and structurally distinct.

---

# 24. Evidence Provenance

**[LOCKED]**

Evidence must reference source entities rather than copy mutable values.

Evidence may reference:

```text
metric snapshot
derived metric
transcript segment
video frame
content feature
```

Hypothesis must link to one or more evidence objects.

---

# 25. Why / Hypothesis

**[LOCKED]**

LLM cannot directly produce causal claims.

Allowed wording:

```text
likely contributed
may explain
consistent with
possible differentiator
```

Forbidden without experimental evidence:

```text
X caused performance Y
```

Every hypothesis must expose:

```text
supporting evidence
contradictory evidence
uncontrolled variables
confidence
review state
```

---

# 26. Confidence

**[LOCKED philosophy]**

No numeric probability.

Use:

```text
LOW
MEDIUM
HIGH
```

Confidence must be calculated by deterministic rules.

Separate:

```text
Comparison Quality
Effect Evidence
```

Hard caps:

```text
unreviewed extracted feature
→ overall max LOW

insufficient sample
→ max LOW

single pair only
→ max LOW

suspect primary metric
→ max LOW

legacy narrative only
→ max MEDIUM
```

LLM cannot override caps.

---

# 27. Hypothesis Lifecycle

**[LOCKED]**

```text
PROPOSED
↓
ACCEPTED
↓
TESTING
↓
SUPPORTED
or
CONTRADICTED
or
INCONCLUSIVE
↓
RETIRED
```

MVP needs to persist lifecycle even if automatic Pattern Memory is later.

---

# 28. Hypothesis ↔ Comparison

**[LOCKED]**

Many-to-many.

One hypothesis can be:

```text
originated from comparison A
replicated by comparison B
contradicted by comparison C
```

Required relation:

```text
hypothesis_comparison
```

with role:

```text
origin
replication
contradiction
```

---

# 29. Next Test

**[CORE MINIMAL]**

Next Test must be structured data, not only recommendation text.

Required:

```text
hypothesis_id
variable_to_test
variant_a
variant_b
controls
target_batch
status
```

Status:

```text
proposed
accepted
running
completed
```

Completed test can link to result comparison.

---

# 30. Analyst Review

Every AI hypothesis supports:

```text
Approve
Edit
Reject
```

Reject/Edit must capture reason.

Minimum reasons:

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

Original AI value must remain available.

---

# 31. Analyst Notes

**[CORE]**

Batch and content level analyst notes are first-class data.

They are not automatically treated as objective evidence.

They represent:

```text
human context
interpretation
client context
production knowledge
```

---

# 32. Organic and Ads

**[LOCKED]**

Same Content Item may have:

```text
Organic observation
+
Paid observation
```

but they must remain separate performance contexts.

MVP Ads ingestion:

```text
CSV/manual import
↓
map to content
↓
paid metric snapshot
```

Direct Ads API is later.

---

# 33. Consumer Says Lite

**[LIGHT MVP]**

Consumer Says should not block primary content analysis.

If comments exist:

```text
Questions
Objections
Praise
Confusion
Other
Repeated phrases
Representative comments
```

Small sample:

```text
show raw counts
show representative comments
show warning
```

Do not show misleading percentages.

---

# 34. Processing State

**[LOCKED]**

Content needs lightweight idempotent state tracking:

```text
acquisition
transcription
frame extraction
AI extraction
```

Per stage:

```text
pending
running
completed
failed
unavailable
```

Retrying one stage must not unnecessarily rerun completed stages.

---

# 35. Extraction Run Versioning

**[LOCKED]**

Every AI extraction run must store:

```text
model provider
model name
prompt version
fingerprint schema version
input hash
started_at
completed_at
status
cost estimate
```

This allows golden-set comparison between model/prompt versions.

---

# 36. MVP Technical Architecture

**[LEAN-LOCK]**

```text
Web application
↓
Supabase / Postgres
↓
Processing state
↓
One worker
    ├ ffprobe
    ├ ffmpeg
    ├ faster-whisper
    └ multimodal model
```

No dedicated queue infrastructure required Day-1.

A Postgres worker pattern is sufficient for MVP.

---

# 37. Acquisition Architecture

Provider must remain replaceable:

```text
interface VideoAcquirer
```

Happy path:

```text
TikTok URL
↓
Primary provider
↓
temporary MP4
```

Fallback:

```text
secondary provider
```

Last resort:

```text
manual MP4
```

Primary provider decision is **SPIKE-GATED**.

No product/domain logic may depend directly on provider-specific response shape.

---

# 38. Media Retention

Downloaded public MP4 is temporary.

Pipeline:

```text
download
↓
process
↓
persist:
transcript
frames
metadata
analysis artifacts
↓
delete temp MP4
```

Canonical source remains:

```text
TikTok URL
external post ID
```

Transient CDN URLs are not canonical assets.

---

# 39. MVP Data Entities

Minimum logical entities:

```text
workspace
brand
pillar
objective
batch
content
content_source

acquisition_run
processing_state

metric_snapshot

transcript
transcript_segment
video_frame

extraction_run
content_feature
content_feature_review
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
test_result

analyst_note
```

Optional Day-1 if time:

```text
comment
comment_theme
```

---

# 40. Multi-Tenancy

**[LOCKED structure]**

Root:

```text
workspace = agency
brand = client
```

All brand/domain data ultimately belongs to workspace.

Do not retrofit tenancy later.

---

# 41. Language

**[LEAN-LOCK]**

UI:

> Bahasa Indonesia.

Technical terms retain industry wording:

```text
ER
AWT
WFV
Organic
Ads
```

AI narrative:

> Bahasa Indonesia.

Content title/caption:

> Original.

Export language later configurable.

---

# 42. Day-1 Screens

Only:

```text
Batch Workspace
Content Library
Compare
Insights Review
Consumer Says Lite
Brand Overview
```

Brand Overview is secondary.

Reports = later.

---

# 43. Acceptance Criteria — Vertical Slice

MVP is DONE when:

```text
1. Analyst opens existing Batch.

2. Analyst pastes public TikTok URL.

3. System acquires video without human handoff.

4. System extracts:
   metadata
   transcript
   timestamped segments
   hook frames
   representative frames

5. AI produces structured fingerprint.

6. Content appears in Batch Workspace.

7. Public metric snapshot exists.

8. Private/paid metrics can be enriched manually/CSV.

9. Objective-aware performance labels render.

10. User can open Controlled Compare.

11. Why/Evidence separates:
    Observed
    Derived
    Extracted
    Inferred.

12. Suspect data is visibly gated.

13. Unreviewed extracted feature caps confidence at LOW.

14. Analyst can approve/edit/reject insight.

15. Reject/edit reason persists.

16. Analyst can save notes.

17. Analyst can create minimal Next Test.

18. Reload preserves state.
```

---

# 44. Quality Acceptance — Not Just “It Runs”

## Acquisition

Across spike:

```text
≥90% normal public TikTok URLs
processed without human coordination
```

Track:

```text
cost/video
median latency
failure reason
retry result
```

---

## Transcript quality

Manual inspection of difficult examples:

```text
Bahasa Indonesia
slang
music-heavy
text-heavy
low dialogue
```

Need usable meaning and timestamps.

---

## Visual hook quality

System must preserve enough resolution to inspect:

```text
opening visual
on-screen text
first 3 seconds
```

---

## Extraction quality

Blind human labels vs AI.

Evaluate per fingerprint field:

```text
exact / acceptable
incorrect
uncertain
```

Do not hide field-specific weakness behind one aggregate score.

---

## Stability

Same content processed twice should not produce wildly different categorical fingerprints.

---

# 45. Product Success Metrics

Primary pilot metric:

```text
AI insight usability
```

Review states:

```text
Approve
Minor edit
Major edit
Reject
```

Promising pilot target:

```text
Approve + Minor Edit ≥ 70%
```

Not a product guarantee; pilot target.

Secondary:

```text
time per batch:
manual vs tool

feature correction rate

major rejection reasons

public URL success rate

human handoffs required

cost/video
```

Most important qualitative question:

> Kalau tool ini hilang besok, analyst milih balik mulai dari blank page atau merasa kehilangan first-pass analysis-nya?

---

# 46. Kill / Pivot Criteria

Reconsider product thesis if after several real batches:

```text
analyst still needs to rewatch every video
just to verify AI

OR

majority of insights require major rewrite

OR

data ingestion is more work than current workflow

OR

value is almost entirely formatting/report generation
```

If so, pivot toward simpler reporting automation rather than pretending intelligence layer works.

---

# 47. Explicit Non-Goals

Day-1 is NOT:

```text
AI strategist replacing analyst
causal attribution engine
full BI platform
TikTok scraping infrastructure company
marketing attribution system
creative generation platform
client portal
report generator
competitor monitoring platform
```

---

# 48. Spike-Gated Decisions

Only these remain intentionally open:

```text
Primary TikTok URL → MP4 provider
fallback provider
actual acquisition cost
actual acquisition latency

snapshot canonical timing
sample threshold calibration

exact Ads CSV fields
```

These do **not** block writing code around the canonical interfaces.

---

# 49. Hackathon Cut Order

Kalau waktu habis, potong dalam urutan ini:

```text
1. fancy Brand Overview
2. Consumer Says
3. Ads UI polish
4. Content Library extras
5. Next Test UI sophistication
```

Jangan potong:

```text
URL ingestion
actual video reading
fingerprint
metrics
controlled compare
evidence provenance
review
data quality guards
```

Karena itu inti tes produk.

---

# 50. Day-1 Product Promise

Kalimat yang harus benar pada akhir hackathon:

> **“Gue paste URL video TikTok yang sudah tayang ke batch. Sistem nonton dan bedah videonya, gabungin dengan performanya, bantu gue compare konten yang relevan, kasih dugaan kenapa hasilnya beda beserta evidence, dan gue tinggal koreksi kalau AI-nya salah.”**

Kalau kalimat itu hidup end-to-end, **MVP berhasil**.

Kalau kita cuma punya dashboard cantik + angka + AI summary, **belum berhasil**.

