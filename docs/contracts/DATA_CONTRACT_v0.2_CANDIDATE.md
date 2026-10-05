# Data Contract v0.2 — Discovery Update

Status: **IMPLEMENTATION CANDIDATE — NOT FROZEN**  
Database: **Postgres / Supabase**

Sumber: full Data Contract v0.1 terakhir dalam transkrip proyek, ditambah 14 jawaban discovery Maya yang disampaikan Najib pada 5 Oktober 2026 pukul 05:23 WIB. v0.1 disimpan sebagai sejarah; v0.2 merupakan candidate terbaru untuk audit S1 yang belum dijalankan.

Perubahan utama: brand-approved metric priority (AWT-first sebagai preferensi awal), KPI brand yang berbeda dari benchmark, analysis seluruh batch, timeline evidence per detik, brand structure preferences, product sentiment positif/negatif/netral, dan pemisahan bahasa workspace/deck.

Dokumen ini tidak mengklaim bahwa frozen artifacts sudah diubah, schema sudah sesuai, database sudah diuji, atau acquisition sudah live PASS. OMP harus mencatat discovery delta dan konflik aktual dengan frozen sources sebelum mengubah implementasi. Batas donor dan integritas evidence tetap berlaku. Schema additions di bawah adalah candidate implementasi; jangan menebak nilai KPI atau approval brand.
  
Prinsip utama:

```text
RAW
↓
NORMALIZED FACT
↓
DERIVED
↓
AI EXTRACTED
↓
HUMAN REVIEW
↓
COMPARISON
↓
HYPOTHESIS
↓
NEXT TEST
```

Nilai AI **tidak pernah overwrite** raw fact atau koreksi manusia.

---

## 1. Entity map

```text
WORKSPACE
   │
   └── BRAND
        │
        ├── PILLAR ───── OBJECTIVE
        │
        └── BATCH
             │
             └── CONTENT
                  │
                  ├── CONTENT SOURCE
                  ├── ACQUISITION RUN
                  ├── PROCESSING STATE
                  │
                  ├── METRIC SNAPSHOT
                  │
                  ├── TRANSCRIPT
                  │      └── TRANSCRIPT SEGMENT
                  │
                  ├── VIDEO FRAME
                  │
                  ├── EXTRACTION RUN
                  │      └── CONTENT FEATURE
                  │             └── FEATURE REVIEW / CORRECTION
                  │
                  └───────────────┐
                                  │
CONTENT A + CONTENT B             │
          ↓                       │
      COMPARISON                  │
          │                       │
          ├── COMPARISON ITEM     │
          ├── SNAPSHOT REF        │
          └── EVIDENCE ◄──────────┘
                 │
                 ▼
             HYPOTHESIS
              ▲       │
              │       ▼
       many comparisons
                  NEXT TEST
                     │
                     ▼
             RESULT COMPARISON
```

Pattern Memory belum butuh tabel sendiri. Untuk MVP, “memory” bisa direkonstruksi dari hypothesis + comparison + next_test.

---

# 2. Workspace

```sql
workspace
---------
id uuid pk
name text not null
created_at timestamptz
```

Contoh:

```text
Sejalan Agency
```

Ini root tenancy.

---

# 3. Brand

```sql
brand
-----
id uuid pk
workspace_id uuid fk -> workspace.id
name text not null
status text
created_at timestamptz
```

Contoh:

```text
Barakat
```

---

# 4. Objective

Objective harus terpisah dari pillar karena beberapa pillar bisa punya objective sama.

```sql
objective
---------
id uuid pk
workspace_id uuid fk
name text
code text
description text
created_at timestamptz
```

Candidate codes:

```text
reach
engagement
watch_quality
conversion
```

`conversion` di sini berarti objective bisnis kalau metriknya memang tersedia, bukan otomatis berarti pillar bernama Conversion sudah mengukur conversion.

---

# 5. Pillar

```sql
pillar
------
id uuid pk
workspace_id uuid fk
brand_id uuid fk

name text
description text

primary_objective_id uuid fk -> objective.id
secondary_objective_id uuid nullable

active boolean default true
created_at timestamptz
```

Contoh:

```text
name = Conversion
primary objective = Engagement
secondary = Watch Quality
```

Pillar **human-defined**.

AI nanti boleh suggest, tapi tidak boleh mengganti canonical `pillar_id`.

---

# 6. Batch

Batch mengikuti quotation/contract.

```sql
batch
-----
id uuid pk
workspace_id uuid fk
brand_id uuid fk
analysis_config_id uuid nullable fk -> brand_analysis_config.id

name text
sequence_number integer
contracted_content_count integer

status text
started_at date nullable
completed_at date nullable

created_at timestamptz
```

Status:

```text
draft
active
completed
archived
```

Tidak ada AI auto-batching.

---

# 7. Content

Canonical identity satu video.

```sql
content
-------
id uuid pk
workspace_id uuid fk
brand_id uuid fk
batch_id uuid fk
pillar_id uuid nullable fk

platform text
external_id text

title text nullable
caption text nullable

published_at timestamptz nullable
duration_ms integer nullable

created_at timestamptz
updated_at timestamptz
```

Untuk Day-1:

```text
platform = tiktok
```

Tidak ada `distribution` di sini.

Organic vs paid hidup di observation layer.

Constraint penting:

```text
unique(platform, external_id)
```

atau minimal unique per workspace kalau external ID berpotensi namespace-specific.

---

# 8. Content Source

Pisahkan canonical content dari bagaimana ia ditemukan.

```sql
content_source
--------------
id uuid pk
content_id uuid fk

source_type text
source_url text
is_canonical boolean

created_at timestamptz
```

MVP:

```text
source_type = public_url
```

Canonical:

```text
https://www.tiktok.com/...
```

Resolved CDN URL **bukan** canonical source.

---

# 9. Acquisition Run

Setiap percobaan URL → media dicatat.

```sql
acquisition_run
---------------
id uuid pk
content_id uuid fk
content_source_id uuid fk

provider text
attempt_no integer

status text

started_at timestamptz
completed_at timestamptz nullable

resolved_media_url text nullable
http_status integer nullable

failure_code text nullable
failure_message text nullable

raw_payload jsonb nullable

estimated_cost numeric nullable
```

Status:

```text
pending
running
completed
failed
unavailable
```

Provider contoh:

```text
tikhub
apify
manual_upload
```

Belum di-freeze provider-nya.

`raw_payload` jangan dibuang.

---

# 10. Processing State

Satu state machine sederhana per content.

```sql
content_processing
------------------
content_id uuid pk fk

acquisition_status text
transcription_status text
frame_status text
extraction_status text

retry_count integer default 0
last_error text nullable

updated_at timestamptz
```

Allowed status:

```text
pending
running
completed
failed
unavailable
```

Rule:

```text
transcription failed
≠
ulang acquisition
```

Setiap stage harus idempotent.

---

# 11. Metric Snapshot

Satu snapshot = satu source, capture time, distribution context. Public dan owned/Ads observations tidak digabung diam-diam.

```sql
metric_snapshot
---------------
id uuid pk
content_id uuid fk

distribution text
source text
captured_at timestamptz
content_age_hours numeric nullable
raw_metrics jsonb
quality_json jsonb
created_at timestamptz
```

Distribution: `organic | paid`.

Normalized raw measurements dapat mencakup `views`, `likes`, `comments`, `shares`, `saves`, `awt_seconds`, `wfv_pct`, dan `new_followers` bila source benar-benar menyediakannya. Paid metric fields mengikuti export nyata, bukan tebakan. ER dan watch percentage adalah derived; raw provider/import payload tetap disimpan terpisah.

Quality per metric: `valid | missing | suspect | unavailable`. Simpan reason/source context, misalnya `not_accessible`, `not_provided`, `source_error`, atau `unexplained_zero`.

- AWT/WFV unavailable karena akses tidak didapat: jangan ubah menjadi nol. Ranking dapat memakai fallback policy yang explicit.
- Nol karena error atau sebab belum jelas: suspect dan needs manual check; jangan gunakan sebagai evidence kuat.
- Nilai kecil seperti AWT 0.01 detik dapat merupakan valid measurement. Jangan dibulatkan menjadi nol atau otomatis dianggap glitch.
- New followers/AWT/WFV tidak diasumsikan tersedia dari public URL. Tanpa owned source, tampil unavailable.

Quality JSON dapat menyimpan objects berisi state dan reason; adapter lama dengan string quality perlu dinormalisasi secara explicit bila memakai bentuk baru. Jangan membuang original payload.

```json
{
  "awt_seconds": {"state": "unavailable", "reason": "not_accessible"},
  "views": {"state": "valid", "reason": null}
}
```

---

# 12. Jangan simpan ER sebagai raw fact

Misalnya raw:

```text
views
likes
comments
shares
saves
```

ER dihitung.

Untuk hackathon belum perlu tabel `derived_metric` khusus kalau mau cepat. Bisa dihitung service-side dengan versioned function.

Contract:

```text
metric_name
value
formula_version
source_snapshot_ids[]
```

Formula candidate:

```text
er_v1 =
(likes + comments + shares + saves)
/
views
```

Kalau definisi agency beda, kita bikin `er_v2`.

Tidak overwrite history.

---

# 13. Transcript

```sql
transcript
----------
id uuid pk
content_id uuid fk

provider text
model text
language text

status text
created_at timestamptz
```

---

# 14. Transcript Segment

```sql
transcript_segment
------------------
id uuid pk
transcript_id uuid fk

sequence integer
start_ms integer
end_ms integer

text text
```

Contoh:

```text
00:00.000 → 00:02.800
"Emang siwak lebih bagus dari sikat gigi?"
```

Evidence harus bisa menunjuk langsung ke segment ini.

---

# 15. Video Frame dan temporal evidence

```sql
video_frame
-----------
id uuid pk
content_id uuid fk
timestamp_ms integer
frame_type text
asset_path text
width integer nullable
height integer nullable
created_at timestamptz
```

Frame types tetap `hook | representative | scene`; sampling interval/policy dicatat sebagai versioned processing metadata.

Discovery terbaru: analyst ingin inspeksi urutan visual per detik. S3 harus mendukung frame pada setiap detik valid dalam media, ditambah 1.5 detik untuk hook bila diperlukan dan final frame valid. Deduplikasi timestamp, jaga urutan dan batas duration; tidak boleh seek di luar akhir video.

Pertahankan resolusi untuk membaca overlay. Hook 0, 1.5, 3 detik tetap minimum jika duration memungkinkan. Per-second frame inventory dapat ditampilkan secara lazy dalam timeline/scrubber; tidak harus dirender sekaligus.

Frame inventory untuk analyst berbeda dari model input budget. Jangan membuat satu panggilan AI per frame atau menganggap contact sheet yang kecil membuktikan semua detail terbaca. Model boleh memakai selected frames/contact sheet dan mengambil evidence tambahan di sekitar event penting; simpan frame IDs/timestamps yang benar-benar dipakai.

Product-entry anchors menunjuk ke frame/segment nyata dan mempunyai review state. Media unavailable harus menghasilkan state eksplisit, bukan placeholder yang terlihat seperti hasil analisis.

**AWT bukan retention curve.** AWT dibanding timestamp produk hanya temporal context; tidak membuktikan retention jatuh di detik produk masuk. Klaim per-detik memerlukan first-party retention series yang benar-benar tersedia dan source-referenced. Ingestion curve otomatis bukan dependency tambahan S1/S2.

---

# 16. Extraction Run

Setiap panggilan AI content reading punya provenance.

```sql
extraction_run
--------------
id uuid pk
content_id uuid fk

model_provider text
model_name text

prompt_version text
schema_version text

input_hash text

status text

started_at timestamptz
completed_at timestamptz nullable

estimated_cost numeric nullable

raw_output jsonb nullable
```

Ini wajib supaya nanti kita bisa membandingkan:

```text
prompt-v1 + model A
vs
prompt-v2 + model B
```

dengan golden set yang sama.

---

# 17. Content Feature

Satu row per feature.

```sql
content_feature
---------------
id uuid pk
content_id uuid fk
extraction_run_id uuid fk

feature_name text
feature_value jsonb

created_at timestamptz
```

Fingerprint field set (v0.2 memakai field yang sama, dengan temporal product_placement):

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

Tidak masuk sini:

```text
pillar
duration
duration_bucket
metrics
```

---

# 18. Feature Review

Jangan 13 checkbox.

```sql
feature_review
--------------
id uuid pk
content_id uuid fk
extraction_run_id uuid fk

decision text

reviewed_by uuid nullable
reviewed_at timestamptz

note text nullable
```

Decision:

```text
confirm_all
corrected
reject_all
```

---

# 19. Feature Correction

Hanya field yang salah yang disimpan.

```sql
feature_correction
------------------
id uuid pk
feature_review_id uuid fk

feature_name text

original_value jsonb
corrected_value jsonb

reason_code text nullable
note text nullable
```

Canonical reviewed value bisa dibaca sebagai:

```text
AI feature
+
latest correction if exists
```

AI original tidak pernah dihapus.

---

# 20. Comparison

```sql
comparison
----------
id uuid pk
workspace_id uuid fk
brand_id uuid fk
batch_id uuid nullable fk
mode text
scope text
comparison_quality text nullable
comparison_rule_version text
uncontrolled_variables jsonb
rule_result jsonb
created_at timestamptz
```

Modes tetap `controlled | performance_contrast | manual`.
Scope candidate: `pair | group | batch`.

Analyst biasanya menangani 10–18 konten per batch; 8 adalah ukuran kecil yang disebut Maya, bukan hard minimum validation. Batch Workspace menampilkan dan menganalisis seluruh actual membership, bukan hanya memilih satu best dan satu lowest.

Comparison mendukung lebih dari dua items. Full-batch performance contrast boleh untuk exploration; mixed pillars/formats/durations tidak otomatis menjadi controlled evidence. Controlled Compare memilih pasangan/cohort yang compatible dari batch; pair tetap berguna sebagai drilldown.

Bandingkan dengan ranking policy brand yang terlihat, snapshot context, quality, dan sample guards. Metrik pendukung tetap ditampilkan meskipun primary metric AWT. Jangan memanggil LLM untuk setiap kombinasi pasangan; satu fingerprint per content, deterministic cohort/pair selection, lalu reasoning pada comparison yang dipilih.

`comparison_quality` dihitung deterministic. Banyak items dalam satu batch bukan bukti independent replication lintas batch.

---

# 21. Comparison Item

```sql
comparison_item
---------------
id uuid pk
comparison_id uuid fk
content_id uuid fk
role text nullable
sort_index integer
```

Role dapat memberi arti seperti reference/contrast bila dibutuhkan, bukan enum yang membatasi ke A/B. Selection order harus stabil. Cegah duplicate content dalam comparison yang sama.

Tidak ada fixed two-column content_a/content_b sebagai canonical schema. Pair adalah comparison dengan dua items; group/batch memiliki N items.

---

# 22. Comparison Snapshot

Comparison harus membekukan metric observation yang dipakai.

```sql
comparison_snapshot
-------------------
id uuid pk
comparison_id uuid fk
content_id uuid fk
metric_snapshot_id uuid fk
```

Jadi historical comparison tidak berubah ketika snapshot terbaru masuk.

---

# 23. Comparison rule inputs

Engine menyimpan/reconstruct:

```text
same_pillar
duration_delta / duration_range
same_format
same_talent_class
content_age_delta / content_age_range
distribution_match
sample_eligibility
metric_quality
selected_brand_policy_version
actual_primary_metric
fallback_used
```

Controlled/uncontrolled variables harus terlihat per pair/group. KPI achievement dan comparison quality adalah analisis berbeda: target KPI tidak membuktikan sebab performa.

Rule result boleh JSON yang diberi versi. Tidak menganggap batch berukuran 18 sebagai 18 independent comparisons atau menjumlah support seolah semua observations independen.

---

# 24. Evidence

Evidence adalah immutable analytical artifact.

```sql
evidence
--------
id uuid pk

evidence_type text
formula_version text nullable

created_at timestamptz
```

Type:

```text
observed
derived
extracted
```

`inferred` tidak perlu jadi evidence source karena itu sudah hypothesis.

---

# 25. Evidence Source

Evidence bisa punya lebih dari satu source.

```sql
evidence_source
---------------
id uuid pk
evidence_id uuid fk

source_type text
source_id uuid
role text nullable
```

Source types:

```text
metric_snapshot
transcript_segment
video_frame
content_feature
```

Contoh:

```text
Evidence:
ER A > ER B

sources:
snapshot A
snapshot B

formula_version:
relative_er_v1
```

---

# 26. Hypothesis

```sql
hypothesis
----------
id uuid pk
workspace_id uuid fk
brand_id uuid fk

statement text

status text

comparison_quality text
effect_evidence text
overall_confidence text

confidence_rule_version text

created_by text
created_at timestamptz

reviewed_at timestamptz nullable
```

Status:

```text
proposed
accepted
testing
supported
contradicted
inconclusive
retired
```

Confidence:

```text
low
medium
high
```

No percentage.

---

# 27. Hypothesis ↔ Comparison

Many-to-many.

```sql
hypothesis_comparison
---------------------
hypothesis_id uuid fk
comparison_id uuid fk

role text

primary key (hypothesis_id, comparison_id)
```

Role:

```text
origin
replication
contradiction
```

Ini penting supaya:

```text
Batch 8 → origin
Batch 9 → replication
Batch 11 → contradiction
```

bisa menjadi satu knowledge thread.

---

# 28. Hypothesis Evidence

```sql
hypothesis_evidence
-------------------
hypothesis_id uuid fk
evidence_id uuid fk

role text

primary key (...)
```

Role:

```text
supporting
contradicting
contextual
```

---

# 29. Hypothesis confidence hard gates

Rule config, bukan DB logic hardcoded.

Contoh contract:

```text
unreviewed extracted feature
→ max LOW

insufficient sample
→ max LOW

one comparison only
→ max LOW

suspect primary metric
→ max LOW

legacy narrative only
→ max MEDIUM
```

Comparison Quality dan Effect Evidence disimpan terpisah.

---

# 30. Review

Hypothesis review harus punya alasan.

```sql
review
------
id uuid pk

target_type text
target_id uuid

decision text
reason_code text nullable

original_value jsonb nullable
corrected_value jsonb nullable

note text nullable

created_at timestamptz
```

Target type Day-1:

```text
hypothesis
```

Decision:

```text
approve
edit
reject
```

Reason codes:

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

---

# 31. Next Test

```sql
next_test
---------
id uuid pk
hypothesis_id uuid fk

target_batch_id uuid nullable fk

variable_to_test text

variant_a jsonb
variant_b jsonb
controls jsonb

status text

created_at timestamptz
completed_at timestamptz nullable
```

Status:

```text
proposed
accepted
running
completed
cancelled
```

---

# 32. Test Result

```sql
test_result
-----------
id uuid pk
next_test_id uuid fk

result_comparison_id uuid fk

result text
note text nullable

created_at timestamptz
```

Result:

```text
supported
contradicted
inconclusive
```

Ini yang benar-benar menutup learning loop.

---

# 33. Analyst Note

```sql
analyst_note
------------
id uuid pk
workspace_id uuid fk

target_type text
target_id uuid

body text

created_by uuid nullable
created_at timestamptz
updated_at timestamptz
```

Target:

```text
batch
content
comparison
hypothesis
```

Human note bukan otomatis evidence.

---

# 34. Consumer Says Lite

```sql
comment
-------
id uuid pk
content_id uuid fk
external_id text nullable
text text
likes integer nullable
created_at timestamptz nullable
captured_at timestamptz
source text
```

```sql
comment_theme
-------------
id uuid pk
comment_id uuid fk
theme text
extraction_run_id uuid nullable
```

Themes seperti `question | objection | praise | confusion | other` tetap berbeda dari sentiment. Pertanyaan tentang varian/promo boleh memiliki theme question dan product sentiment neutral.

Candidate sentiment payload, dapat disimpan pada versioned classification JSON atau entity kecil jika implementation membutuhkannya:

```text
comment_id
sentiment: positive | negative | neutral | unclassified
scope: product
reason
extraction_run_id
source_reference
review_state
```

Definisi yang diberikan Maya:
- Positive: testimonial/penilaian bagus terhadap produk.
- Negative: testimonial/penilaian buruk terhadap produk.
- Neutral: pertanyaan informasional, misalnya cocok varian apa atau promo sampai kapan.

Jangan menyamakan komentar yang menyukai talent/video dengan testimonial produk. Ambiguous/mixed/irrelevant comments boleh unclassified; jangan dipaksa neutral atau diasumsikan purchase intent.

Tampilkan count, N analyzed, unclassified count, sample coverage, dan representative quotes. Persentase positive/negative/neutral menggunakan denominator `classified usable comments`; denominator harus terlihat, termasuk excluded count. Jika sample di bawah threshold versi rule, gunakan counts + quotes + warning dan tahan persentase.

No comments: jujur `No analyzable comments`, tanpa sentiment palsu. Consumer Says tetap Lite dan tidak memblokir core. Jangan menambah vector DB.

---

# 35. Versioned rule configs

Jangan bikin semuanya tabel.

Repo:

```text
/config/rules/
```

Minimal:

```text
sample-size-v1.json
comparison-v1.json
confidence-v1.json
snapshot-v1.json
metrics-v1.json
```

Contoh:

```json
{
  "engagement": {
    "insufficient_below": 20,
    "directional_below": 50
  },
  "consumer_comments": {
    "counts_only_below": 30
  },
  "pillar_benchmark": {
    "directional_below_contents": 5
  }
}
```

Angka masih **PROVISIONAL**.

Yang penting setiap artifact analitik menyimpan version yang digunakan.

---

# 36. Snapshot policy config

Candidate global policy lama:

```json
{
  "version": "snapshot-v1",
  "target_age_hours": 336,
  "preferred_delta_hours": 24
}
```

336 = usia posting 14 hari. Angka ini tetap provisional; jangan menganggap Maya sudah menyetujuinya.

KPI assessment window dan posting-age compatibility merupakan dua hal berbeda. Policy dapat disesuaikan brand/reporting workflow dengan versioning, tetapi source/capture time/age dan snapshot IDs tetap harus terlihat. Public metrics T1 dan owned metrics T2 tidak boleh dipresentasikan sebagai satu source/time observation.

---

# 37. Canonical Content Packet

Setelah acquisition + normalize, downstream code jangan baca provider response langsung.

Semua provider wajib menghasilkan shape seragam:

```json
{
  "content": {
    "platform": "tiktok",
    "external_id": "123456789",
    "source_url": "https://www.tiktok.com/...",
    "caption": "...",
    "published_at": "2026-10-01T12:00:00Z",
    "duration_ms": 35000
  },

  "public_snapshot": {
    "source": "tiktok_provider",
    "distribution": "organic",
    "captured_at": "2026-10-04T12:00:00Z",
    "content_age_hours": 72,
    "raw_metrics": {
      "views": 1315,
      "likes": 20,
      "comments": 4,
      "shares": 3
    }
  },

  "media": {
    "downloadable": true
  }
}
```

Provider-specific extra fields tetap di:

```text
acquisition_run.raw_payload
```

---

# 38. Canonical Extraction Packet

Structured schema candidate terbaru: `fingerprint-v0.2`. Tetap 13 fields; simpan model/prompt/schema/input hash.

```json
{
  "schema_version": "fingerprint-v0.2",
  "features": {
    "topic": "oral hygiene",
    "format": "educational_comparison",
    "hook_type": "comparison",
    "hook_subject": "siwak vs toothbrush",
    "talent_type": "talking_head",
    "talent_familiarity": "unknown",
    "opening_style": "direct_question",
    "pacing": "medium",
    "narrative_structure": "question_explanation_payoff",
    "emotional_trigger": "curiosity",
    "tension_type": "comparison",
    "product_placement": {
      "placement": "late",
      "first_visible_ms": null,
      "first_mentioned_ms": null,
      "frame_ids": [],
      "transcript_segment_ids": []
    },
    "cta_type": "none"
  }
}
```

Example values bukan fakta konten atau enum final. Temporal anchors nullable; model tidak boleh menebak timestamp bila source tidak mendukung. Bentuk product_placement v0.2 perlu version-aware normalization dari string v0.1, tanpa overwrite originals.

Brand creative preferences adalah input context terpisah dari extracted feature. Jangan mengarang familiarity/USP/gimmick hanya karena brand preference menyebutnya. Extraction tidak boleh memprediksi performance atau menjelaskan sebab; reasoning datang setelah metrics/guards/compare.

---

# 39. Fingerprint review resolution

Canonical reviewed feature dibaca begini:

```text
IF corrected:
    corrected_value
ELSE IF confirmed:
    AI value
ELSE:
    AI value + status UNREVIEWED
```

Hypothesis engine boleh membaca `UNREVIEWED`, tapi:

```text
confidence max LOW
```

---

# 40. Derived metric contract

Service signature kira-kira:

```ts
deriveMetric({
  metricName,
  snapshots,
  formulaVersion
})
```

Output:

```json
{
  "metric": "engagement_rate",
  "value": 0.0205,
  "formula_version": "er-v1",
  "source_snapshot_ids": ["..."]
}
```

Jangan menaruh hasil turunan ke raw snapshot.

---

# 41. Comparison contract

Input:

```json
{
  "mode": "controlled",
  "contents": ["content-a", "content-b"],
  "rule_version": "comparison-v1"
}
```

Output deterministic sebelum LLM:

```json
{
  "comparison_quality": "medium",
  "controlled": {
    "same_pillar": true,
    "similar_duration": true,
    "same_distribution": true
  },
  "uncontrolled": [
    "talent_familiarity",
    "posting_context"
  ],
  "sample_state": "directional"
}
```

Baru dikirim ke reasoning model.

---

# 42. Hypothesis generation packet

LLM menerima:

```text
reviewed/unreviewed features
+
selected metric snapshots
+
derived metrics
+
comparison quality
+
sample guard
+
data quality
+
relevant transcript/frame evidence
```

LLM tidak menentukan confidence final.

Output:

```json
{
  "statement": "...",
  "supporting_evidence_ids": ["..."],
  "contradicting_evidence_ids": ["..."],
  "suggested_next_test": {
    "variable": "...",
    "variant_a": "...",
    "variant_b": "..."
  }
}
```

Lalu rule engine menghitung:

```text
overall_confidence
```

---

# 43. Immutability rules

Ini wajib.

Tidak boleh overwrite:

```text
raw provider payload
metric snapshot
AI extraction run
AI original feature
evidence source
comparison snapshot selection
hypothesis history
review history
```

Kalau ada update:

```text
buat row/run baru
```

Aturan yang sama berlaku untuk analysis config/KPI versions dan batch KPI assessment: perubahan target tidak boleh mengubah penilaian historis diam-diam.

bukan mutate sejarah.

---

# 44. Delete / retention

Temporary MP4:

```text
download
↓
process
↓
delete
```

Persist:

```text
canonical URL
raw provider payload
metadata
transcript
selected frames
AI artifacts
metrics
reviews
```

Provider CDN URL boleh disimpan buat debugging di acquisition run, tapi jangan dianggap stable asset.

---

# 45. Schema Day-1 dan discovery additions

Core entities dari v0.1 tetap:

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

Discovery additions logical candidates: `brand_analysis_config`, `brand_kpi_definition`, `batch_kpi_assessment`. Exact persistence dapat memakai minimal equivalent versioned model jika invariants di sections 48–50 dipenuhi dan mapping dicatat. Jangan membuat schema/config UI berlebihan; S1 cukup menyediakan types/persistence/fixtures yang jujur.

Conditional setelah core: `test_result`, `comment`, `comment_theme`, sentiment classification persistence. S11 paid import dan S12 Consumer Says tetap mengikuti implementation plan setelah core green.

Jumlah entity tidak digunakan sebagai ukuran PASS; audit kebutuhan/constraints nyata. Fixture-backed ranking tidak membuktikan actual-media analysis.

---

# 46. Yang belum di-freeze

Seluruh dokumen v0.2 masih implementation candidate, bukan frozen contract.

| Open value/config | Kebutuhan sebelum memberi hasil final |
|---|---|
| URL→MP4 provider, reliability, latency, cost | Live acquisition gate |
| Approved primary/ranking rule tiap brand | Konfirmasi/config manual berdasarkan agreement brand |
| KPI values, units, comparator, aggregation, reporting window | Target brand nyata; jangan invent |
| Exact ER/engagement definition dan metric eligibility | Actual input/agency formula version |
| Sample thresholds | Pilot calibration |
| Snapshot timing | Actual reporting workflow |
| Ads/private export field mapping | Sample export nyata |
| Fingerprint enums dan temporal extraction accuracy | Golden-set evaluation |
| Actual retention curve availability | First-party source jika ada; bukan asumsi public acquisition |

Kebutuhan analisis yang baru sudah jelas; nilai yang belum diketahui tetap null/unconfigured dengan reason. Jangan mengisi fake KPI, brand approval, comments, atau retention curve demi seed terlihat lengkap.

---

# 47. Hard invariants buat coding agent

Ini menurut gue bagian paling penting buat ditempel di atas repo:

```text
1. Provider response NEVER becomes domain model directly.

2. Raw metrics NEVER contain derived metrics.

3. AI extraction NEVER overwrites human-reviewed value.

4. Unreviewed AI feature NEVER supports > LOW confidence.

5. SUSPECT metric NEVER acts as strong evidence.

6. Comparison ALWAYS freezes snapshot IDs used.

7. Hypothesis ALWAYS points to evidence.

8. Evidence ALWAYS points back to immutable sources.

9. Organic and Paid NEVER silently share a performance baseline.

10. Batch membership is NEVER invented by AI.

11. Human corrections and rejection reasons are NEVER discarded.

12. Historical analytical artifacts are versioned, not silently recomputed.
```

Kalau agent melanggar salah satu dari 12 itu, architecture-nya sudah melenceng walaupun UI kelihatan benar.

---


---

# 48. Brand Analysis Configuration

Maya memprioritaskan AWT/retention untuk best/lowest, tetapi metric penentu harus mengikuti agreement masing-masing brand. Beberapa brand memilih likes/comments. Jangan menaruh satu universal score tersembunyi.

Minimal logical config version:

```text
id
workspace_id
brand_id
version
primary_metric
supporting_metrics[]
ranking_rule_json
fallback_rule_json
creative_preferences_json
working_language
future_deck_language
configured_by
approval_state
created_at
```

- `primary_metric` dapat awt_seconds atau explicit engagement rule yang disepakati. AWT-first adalah preferensi discovery, bukan bukti semua brand sudah mengesahkan setting itu.
- Config disimpan/versioned; batch/analysis memilih version ID sehingga hasil historis reproducible.
- Supporting metrics mencakup Views, ER, Engagement, WFV, New Followers sesuai availability dan brand/pillar objective. Jangan menafsirkan kata “semua metrics” sebagai permission membuat composite weights.
- Jika primary metric unavailable karena akses, gunakan fallback policy explicit ke views/ER bila configured dan eligible. Tampilkan actual basis, fallback reason, availability, dan evidence limits. Jika fallback ranking precedence belum configured, tampil metric-specific results tanpa universal best.
- Suspect primary metric butuh manual check; jangan menggantinya diam-diam dengan fallback yang menyamarkan error.
- AWT absolut dan AWT/duration adalah dua ukuran berbeda. Tampilkan konteks durasi; jangan mengganti primary metric ke watch percentage tanpa approval.
- Creative preferences brand: misalnya concise, no gimmick, detailed USP. Bukan universal structure taxonomy atau evidence bahwa konten benar-benar memenuhi preference. User context dapat berubah tiap batch; gunakan explicit versioned notes/override jika diperlukan.
- Workspace analysis/explanation Indonesia, terms seperti TikTok apa adanya. Future deck narrative English; deck export tetap Later. UI label bahasa belum dikonfirmasi ulang, jadi pertahankan lean-lock Indonesia sambil mencatat source.

# 49. Brand KPI Definition

**KPI target berbeda dari performance benchmark.** Maya menggunakan baseline sebagai target KPI brand tahun 2026, lalu memonitor achievement tiap batch. Median batch/pillar hanya benchmark pembandingan relatif, bukan otomatis target KPI.

Minimal logical definition:

```text
id
workspace_id
brand_id
version
metric_name
target_value
unit
comparator
aggregation_method
assessment_scope
reporting_window
source_requirement
distribution
formula_version
configured_by
effective_from
created_at
```

Target/comparator/aggregation/window memakai nilai yang diberikan brand. Jika tidak tersedia, simpan unconfigured; jangan menebak sum/mean/median atau membagi KPI tahunan menjadi per-batch target tanpa aturan yang dikonfirmasi. KPI content/pillar/batch/brand memiliki scope explicit.

Unit dan formula harus compatible. Organic dan paid target tidak dicampur. Penilaian goal achieved tidak boleh berasal dari angka yang unavailable/suspect atau beda reporting window tanpa gate.

# 50. Batch KPI Assessment dan Batch Performance

Minimal logical assessment artifact:

```text
id
batch_id
kpi_definition_id
analysis_config_id
source_snapshot_ids[]
formula_version
rule_version
actual_value
status: achieved | not_achieved | insufficient_data | unconfigured
quality_state
assessed_at
```

Historical assessment immutable/versioned. Derived actual value dapat computed service-side, tetapi artifact menyimpan input refs/formula version. Status `achieved` merupakan output deterministic terhadap target yang explicit, bukan opini LLM.

Default Batch Workspace:
- seluruh actual contents dalam batch, biasa 10–18, tanpa memalsukan contracted/processed counts;
- status processing dan metric availability;
- best/lowest by configured brand metric, AWT-first jika configured;
- supporting metrics dan durations;
- KPI target vs actual/achievement sebagai area terpisah;
- group/pair comparisons dan short insight/Next Test.

Overview untuk komunikasi keseluruhan/AE/client tetap secondary. Semua per-content data perlu tersedia sebelum agregasi yang mengklaim full-batch coverage.

# 51. Temporal review dan output narrative

Analyst membutuhkan frame sequence per detik dan evidence timestamped untuk melihat hook, sequence, serta product entry. Frame timestamps terhubung ke actual media, bukan narasi lama atau caption saja.

Jika hanya AWT tersedia, boleh menyatakan bahwa produk pertama terlihat dekat/lebih awal/lebih lambat dari average watch duration, dengan uncertainty yang tepat. Jangan menyimpulkan penonton keluar pada detik tersebut atau produk menyebabkan exit. Actual curve jika tersedia memperkuat observasi titik perubahan; causal claim tetap memerlukan evidence eksperimen.

Insight dan next recommendation singkat/padat/jelas. Next Test tetap structured object meskipun tampilan ringkas. Approve/edit/reject dan alasan/histori tetap wajib.

# 52. Traceability 14 Jawaban Maya

| No. | Fakta discovery | Implikasi candidate |
|---|---|---|
| 1 | Best/lowest tiap batch, AWT prioritas, seluruh metrics dilihat | Batch-first, configured primary + supporting metrics |
| 2 | Overview untuk komunikasi keseluruhan dan dasar | Secondary overview |
| 3 | Retention utama jika disetujui brand; sebagian likes/comments | Brand-approved metric priority, no universal weights |
| 4 | Kedua compare dibutuhkan; biasanya 10–18 konten, minimal kecil 8 | Full-batch analysis + group/pair comparison, no max-two model |
| 5 | Baseline = KPI brand 2026 yang dimonitor tiap batch | Separate KPI target and relative benchmark |
| 6 | Pillar memakai AWT, Views, ER, Engagement, New Followers | Configurable supporting metrics dan owned enrichment |
| 7 | Missing access berbeda dari error; 0.01 dapat valid | Reason-aware quality + explicit fallback + manual error check |
| 8 | Insight dan next recommendation singkat | Concise narrative + structured Next Test |
| 9 | Approval dan history penting | Review, correction provenance, append-only history |
| 10 | Structure preferences berbeda tiap brand/batch | Brand config/context terpisah dari extracted facts |
| 11 | Ingin melihat raw evidence pola | Drilldown tetap wajib; automatic Pattern Memory Later |
| 12 | Banyak brand no comments; ingin product positive/negative/neutral | Sentiment + themes terpisah, sample guard, honest empty state |
| 13 | Frame per detik untuk melihat product entry | Temporal frame inventory/anchors; no fabricated retention curve |
| 14 | Deck English, explanation Indo, TikTok terms asli | Preserve Indonesian working context; future deck English |

# 53. Source-of-Truth dan Execution Checkpoint

Frozen MVP/Donor Map tetap harus dibaca; jangan ditimpa hanya karena candidate baru tersedia. Buat `DISCOVERY_DELTA_2026-10-05.md` di repo dengan source traceability, affected stories, dan conflict findings. Bedakan config refinement dari perubahan capability (multi-item compare dan per-second inspection) yang perlu dicatat eksplisit dalam implementation delta. Tidak perlu restart product discovery atau donor research.

Last known execution state: S0 PASS berdasarkan report OMP; S1 PARTIAL; migration/seed/probes belum dijalankan; prompt continuation sebelumnya belum dikerjakan. Data Contract v0.1 dan v0.2 tidak membuktikan DB atau provider PASS.

Next run: ingest v0.2 → audit existing types/schema/fixtures → isolated migration/seed/invariant tests → implement S2 URL ingestion/acquisition adapter. S3 temporal media processing dan S5 metrics/KPI execution memakai contract ini kemudian. Jangan mengimplementasikan seluruh roadmap sekaligus di S1/S2.

No commit/stage/push/remote pada continuation ini. Preserve existing work and original files. No production database. Provider remains spike-gated. Reporting export, automatic Pattern Memory, and new donor search remain outside this run.
