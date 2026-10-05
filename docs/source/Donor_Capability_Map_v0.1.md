 Donor Capability Map v0.1

### Prinsip utama

```text
MVP CONTRACT
     ↓
CAPABILITY
     ↓
DONOR / ADAPT / ORIGINAL
     ↓
REPO AUDIT
     ↓
PORT MINIMAL MODULE
```

Bukan:

```text
nemu repo keren
↓
fork
↓
produk mengikuti repo
```

---

## 1. Map utama

| Capability | Strategy | Priority | Candidate donor | Yang kita cari | Yang JANGAN diwarisi |
|---|---|---:|---|---|---|
| **App shell / workspace** | DONOR | P0 | `content-dashboard` | Next.js shell, sidebar, page structure, table/card primitives | domain model, DB schema, auth assumptions |
| **Batch Workspace UI** | ADAPT | P0 | `content-dashboard` + HTML v0.2 kita | metric cards, batch table, filters, status UI | generic BI dashboard philosophy |
| **Content Library** | DONOR | P1 | `swipefile` | cards, tags, filters, notes, content browsing | winner scoring / taxonomy mereka |
| **Video/content card** | DONOR | P0 | `swipefile` / generic component donor | thumbnail/player shell, metadata layout | media acquisition logic |
| **Compare interaction UI** | ADAPT | P0 | `swipefile` | side-by-side selection, compare interaction | their “why it works” logic |
| **Controlled Compare Engine** | **ORIGINAL** | P0 | — | — | **semua logic donor** |
| **Objective-aware performance** | **ORIGINAL** | P0 | — | — | universal winner/outlier score |
| **Metric normalization** | **ORIGINAL** | P0 | — | — | provider-specific metric assumptions |
| **Sample guards** | **ORIGINAL** | P0 | — | — | arbitrary thresholds dari donor |
| **Snapshot policy** | **ORIGINAL** | P0 | — | — | latest-value-only logic |
| **Data-quality engine** | **ORIGINAL** | P0 | — | — | treating zero as valid automatically |
| **Video acquisition adapter** | ADAPT / BUY | P0 | Treg/TikHub/Apify route | provider invocation pattern | provider schema becoming our domain model |
| **ffmpeg processing** | DONOR/COMMODITY | P0 | generic patterns | metadata/audio/frame extraction | custom overengineering |
| **Transcription** | DONOR/COMMODITY | P0 | faster-whisper patterns | timestamped segments | proprietary transcript schema |
| **Content extraction workflow** | ADAPT | P0 | `social-media-research-skills` | transcript/video analysis workflow, structured research prompts | taxonomy, confidence, final output model |
| **Fingerprint schema** | **ORIGINAL** | P0 | — | — | donor tag ontology as canonical |
| **Fingerprint review UX** | ADAPT | P0 | `swipefile`-style tagging/review | confirm/edit tags, inline correction | overwriting original AI value |
| **Review Queue** | ADAPT | P0 | generic moderation/review UX | needs-review queue, bulk confirm | donor workflow semantics |
| **Golden-set capture** | **ORIGINAL** | P0 | — | — | — |
| **Evidence UI** | ADAPT UI / ORIGINAL engine | P0 | generic citation/audit UI patterns | expandable evidence rows, source drilldown | evidence semantics |
| **Evidence ontology** | **ORIGINAL** | P0 | — | — | donor fact/opinion model |
| **Evidence provenance engine** | **ORIGINAL** | P0 | — | — | copied strings with no source refs |
| **Hypothesis reasoning prompt/workflow** | ADAPT | P0 | `competitive-intel-engine` | claim testing, signal→intelligence framing | confidence/scoring rules |
| **Hypothesis lifecycle** | **ORIGINAL** | P0 | — | — | stateless AI insight |
| **Confidence engine** | **ORIGINAL** | P0 | — | — | LLM self-rated confidence |
| **Next Test UX** | ADAPT | P1 | research/experiment UI patterns | small structured experiment card | experiment logic |
| **Next Test state/data model** | **ORIGINAL** | P0 | — | — | free-text recommendation only |
| **Consumer Says mining** | ADAPT | P1 | `social-media-research-skills` | comment clustering, repeated questions, objection mining | sentiment-only summary |
| **Consumer Says presentation** | DONOR/ADAPT | P1 | research UI patterns | quotes, counts, theme groups | percentages on tiny N |
| **Analyst Notes** | DONOR | P0 | `swipefile` / generic notes | inline notes, tagging | notes becoming objective evidence |
| **Historical research persistence** | ADAPT | P2 | `social-media-research-ops` | append-only research memory patterns | its canonical schema |
| **Pattern Memory engine** | **ORIGINAL later** | P2 | — | — | summarizing old reports as truth |
| **Reporting / export** | LATER | P2 | maybe donor later | PDF/PPT composition | Day-1 scope creep |
| **Testing fixtures** | DONOR PATTERN | P0 | research repos / generic app repos | fixture organization, mocked provider responses | their expected domain outputs |
| **E2E tests** | DONOR/COMMODITY | P0 | Playwright patterns | flows, selectors, test harness | donor product assertions |
| **Auth / tenancy** | COMMODITY | P1 | Supabase starter | auth plumbing/RLS patterns | donor entity hierarchy |
| **Database schema** | **ORIGINAL** | P0 | — | — | any donor's DB model |

---

# 2. Tiga kelas donor

Supaya audit repo nanti cepat, tiap capability masuk salah satu dari tiga kelas.

### A. `TAKE`

Komponen commodity yang bisa hampir langsung dipakai:

```text
app shell
tables
cards
filters
video player shell
notes UI
loading/error states
ffmpeg commands
Whisper wrapper
Playwright setup
Supabase plumbing
```

Kalau ada repo yang implementasinya bersih, ambil cepat.

---

### B. `ADAPT`

Ada logic berguna, tapi **harus dipaksa masuk contract kita**:

```text
Content Library
Compare UX
Review Queue
Content analysis workflow
Comment mining
Hypothesis prompt structure
Historical research persistence
```

Di sini kita nyolong **pattern/capability**, bukan worldview repo.

---

### C. `ORIGINAL`

Ini jangan dikompromikan:

```text
Data Contract
Metric normalization
Objective model
Sample guards
Snapshot policy
Data-quality rules

Evidence ontology
Evidence provenance

Controlled Compare Engine
Comparison Quality

Fingerprint taxonomy canonical
Golden-set model

Confidence rules
Hypothesis lifecycle
Next Test loop

Organic/Paid semantics
Longitudinal Pattern logic
```

Kalau repo donor punya versi mereka sendiri, **abaikan**.

Ini calon moat dan integritas analisis kita.

---

# 3. Mapping kandidat repo yang sudah pernah kita temukan

## `tenfoldmarc/content-dashboard`

### Fungsi donor

```text
APP SHELL
BATCH/DASHBOARD SCAFFOLD
PERFORMANCE UI
```

Ambil kemungkinan:

```text
layout
navigation
tables
metric components
loading states
content presentation
```

Jangan ambil:

```text
DB/domain schema
outlier definition
scoring
analytics assumptions
```

**Depth donor:** shallow.

Kalau port shell-nya >30–45 menit, tinggal bikin sendiri pakai prototype kita.

---

## `gntrs/swipefile`

Ini lebih menarik untuk **workflow analyst**.

Target:

```text
Content Library
tagging
notes
side-by-side comparison
winner/testing/loser interaction patterns
source-linked creative browsing
```

Yang mungkin sangat berguna buat kita:

```text
CONTENT
  ↓
tag
  ↓
compare
  ↓
notes
```

Tapi status:

```text
winner
loser
```

tidak boleh kita adopsi semantik mentah.

Di sistem kita harus menjadi:

```text
Best by Reach
Best by Watch Quality
...
```

**Depth donor:** medium.

---

## `ScrapeCreators/social-media-research-skills`

Ini kandidat paling penting di **intelligence workflow**, bukan UI.

Cari pattern untuk:

```text
transcript intelligence
content analysis
outlier investigation
comment mining
competitor/social research
```

Yang kita ambil:

> bagaimana satu agent memecah social content menjadi evidence / observations / research tasks.

Yang tidak diambil:

```text
our canonical fingerprint
our evidence taxonomy
our confidence
our sample guard
our DB
```

**Depth donor:** medium/high pattern donor.

---

## `HunterSUNSUN/social-media-research-ops`

Bukan Day-1 integration.

Tujuan audit:

> bagaimana hasil research tidak hilang setiap run dan bisa accumulate.

Cocok untuk fase:

```text
hypothesis history
↓
future observations
↓
Pattern Memory
```

Bukan buat vertical slice awal.

**Depth donor Day-1:** zero.  
**Research donor:** later.

---

## `thereisno-tomorrow/competitive-intel-engine`

Ini bukan donor app.

Dia donor **reasoning architecture**.

Kita cari:

```text
information vs intelligence
claim testing
pattern test
leading vs lagging
historical synthesis
```

Lalu translate ke domain kita:

```text
content evidence
↓
comparison
↓
claim
↓
hypothesis
```

Jangan ambil:

```text
confidence formula
domain model
storage
```

**Depth donor:** conceptual / prompt-level.

---

# 4. Capability map khusus hackathon

Karena kita cuma sehari, jangan audit semuanya.

### Audit sekarang — P0

| Capability | Cari donor sekarang? |
|---|---:|
| App shell | YES |
| Batch Workspace | YES |
| Content card/player | YES |
| Compare UI | YES |
| Review Queue | YES |
| Transcript/video analysis pattern | YES |
| ffmpeg/Whisper pattern | YES |
| Evidence panel UI | YES |
| Testing harness | YES |

### Jangan buang waktu cari donor — langsung original

| Capability | Action |
|---|---|
| Metric normalization | BUILD |
| Objective scoring | BUILD |
| Sample guard | BUILD |
| Snapshot selector | BUILD |
| Comparison quality | BUILD |
| Confidence caps | BUILD |
| Evidence model | BUILD |
| Feature correction storage | BUILD |
| Hypothesis state | BUILD |
| Next Test state | BUILD |

### Ignore hari ini

```text
Pattern Memory
Reporting
Competitor
multi-platform
client portal
full auth
```

---

# 5. Rule saat audit repo

Setiap repo nanti cuma boleh lolos kalau jawabannya bagus untuk lima pertanyaan:

| Check | Pertanyaan |
|---|---|
| **Extractability** | Bisa cabut capability ini tanpa membawa setengah repo? |
| **Framework fit** | Masuk ke stack kita tanpa rewrite besar? |
| **Contract fit** | Bisa bind ke Data Contract kita? |
| **License** | Boleh secara legal kita adopsi/adaptasi? |
| **Time advantage** | Benar-benar lebih cepat daripada bikin sendiri hari ini? |

Dan rule hackathonnya:

```text
Estimated port < 30 min
→ TAKE

30–90 min
→ ADAPT only if capability substantial

>90 min
→ DON'T DONATE
```

Kecuali sesuatu seperti video processing engine yang memang menghemat banyak technical risk.

---

# 6. Repo scorecard nanti

Begitu kita buka satu repo, nilai 0–2:

```text
Extractability       /2
Framework fit        /2
Contract fit         /2
Code quality         /2
Tests                /2
License              /2
Maintenance signal   /2
Time saved           /2
```

Total `/16`.

Interpretasi cepat:

```text
13–16 → strong donor
9–12  → selective donor
5–8   → inspiration only
0–4   → skip
```

**Tapi satu hard fail license = skip code reuse**, regardless score.

---

# 7. Kanibal architecture target

Kalau semua berjalan ideal:

```text
┌─────────────────────────────────────────────┐
│               OUR APP                      │
│                                             │
│  donor shell                               │
│      ↓                                     │
│  donor/adapted content library             │
│      ↓                                     │
│  adapted compare UI                        │
│      │                                     │
│      └──────── OUR Compare Engine           │
│                                             │
│  adapted analysis workflow                 │
│      │                                     │
│      └──────── OUR Fingerprint Schema       │
│                                             │
│  donor review UI                           │
│      │                                     │
│      └──────── OUR Golden Set               │
│                                             │
│  donor evidence presentation               │
│      │                                     │
│      └──────── OUR Evidence Engine          │
│                                             │
│  adapted reasoning patterns                │
│      │                                     │
│      └──────── OUR Hypothesis Engine        │
│                     │                       │
│                     └── OUR Next Test       │
└─────────────────────────────────────────────┘
```

Jadi donor berada **di tepi**.

Core intelligence tetap punya kita.

---

# 8. Definition of success donor audit

Setelah donor audit, kita harus punya tabel final seperti:

| Capability | Repo | File/module | Action |
|---|---|---|---|
| App shell | X | `/components/...` | port |
| Content library | Y | `/src/...` | adapt |
| Compare UI | Y | `/...` | adapt |
| Video processing | Z | `/...` | extract pattern |
| Review UI | Y | `/...` | port |
| Comment mining | Z | skill/prompt | adapt |
| Evidence engine | **OURS** | — | build |
| Compare engine | **OURS** | — | build |
| Confidence | **OURS** | — | build |
| Hypothesis | **OURS** | — | build |

**Sampai level file/module**, bukan cuma nama repo.

Itulah `DONOR MAP v0.1 FROZEN` yang kemudian dikasih ke coding agent.

---

Jadi posisi kita sekarang:

```text
PRD                         ✅
Data Contract Candidate     ✅
MVP Contract FROZEN         ✅
Video Acquisition Spike     ✅ ready to run
Donor Capability Map        ✅
                                ↑
                             WE ARE HERE

↓ NEXT

Donor Repo Audit
↓
Donor Map FROZEN
↓
Implementation Stories
↓
BUILD
```

