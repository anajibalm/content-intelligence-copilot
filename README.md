# Content Intelligence Copilot

Content Intelligence Copilot membantu analyst agency/brand membuat hipotesis content intelligence yang evidence-backed dan analyst-reviewed dari konten TikTok, evidence video, serta metric snapshots. Produk bukan campaign war room, viral-tier scorer, autonomous strategist, atau Pattern Memory yang sudah berjalan.

## Status

- **Fase saat ini:** S0, S1, S2, dan actual-media S3/R1 staging checkpoint selesai dengan batas di `docs/tracking/PLAN_COVERAGE.md`.
- **Current UI:** staging runtime path; Next.js route invokes canonical acquisition and processing service. State/output checkpoint masih local JSON/files under `/tmp`, bukan application DB durable.
- **Provider proof:** yt-dlp actual-media flow terbukti; faster-whisper tiny dipakai pada temporary Python 3.13 environment.
- **Next:** Supabase/Postgres runtime persistence dan durable worker handoff R1 belum terbukti; S3 AWT requirement belum dibuktikan; S4/S5 tetap terpisah; v0.2 tetap implementation candidate.
- **Frozen contract:** `docs/contracts/MVP_CONTRACT_v0.1_FROZEN.md`.

## Stack

- **Frontend:** Next.js 16.3.8 + React 19.2.0
- **Bahasa:** TypeScript
- **Database boundary:** Supabase/PostgreSQL; disposable PostgreSQL hanya untuk verification, bukan application runtime DB.
- **Testing:** Node.js test runner (`node --test`)
- **Linting:** ESLint
- **Runtime:** Node.js `22.18.0` dari `.node-version`.

## Quick Start

### Prasyarat

- Node.js `22.18.0`
- npm
- Git

Provider credentials dan Supabase credentials hanya diperlukan oleh runtime/provider path yang memakainya; current fixture UI dan unit tests tidak memanggil production DB atau paid acquisition providers.

### Setup

    git clone https://github.com/anajibalm/content-intelligence-copilot.git
    cd content-intelligence-copilot
    cp .env.example .env
    npm ci
    npm run dev

Buka http://localhost:3000

### Environment Variables

Lihat `.env.example`. Jangan mengisi atau commit secret untuk verification fixture/unit-test path.

Provider variables yang tersedia:

- `TIKHUB_API_KEY` — optional, credential-gated adapter.
- `APIFY_TOKEN` / `APIFY_ACTOR` — optional, credential-gated adapter.
- `WHISPER_MODEL` — optional spike setting.
- Supabase variables — disiapkan untuk application/runtime integration yang belum selesai.

## Scripts

| Command | Fungsi |
|---------|--------|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Production server |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check |
| `npm test` | 19 unit/fixture tests dengan Node test runner |
| `npm run validate:fixtures` | Validate canonical fixtures |

## Dokumentasi

- `AGENTS.md` — aturan domain
- `VIBE_CODING_PROTOCOL.md` — workflow, snapshot, push, dan status
- `docs/contracts/` — frozen MVP/donor boundaries dan candidate data contract
- `docs/source/` — PRD dan implementation plan aktual
- `docs/architecture.md` — entrypoint architecture current/target
- `docs/data-contract.md` — entrypoint contract data
- `docs/decisions/` — decision dan verification records
- `docs/tracking/` — GitHub issue mapping, plan coverage, resume

## Aturan Domain

- Organic & Paid di `metric_snapshot`; jangan tambah distribution ke `content`.
- OBSERVED, DERIVED, EXTRACTED, INFERRED evidence tetap terpisah.
- AI originals disimpan saat koreksi manusia.
- Jangan simpan secrets, transient CDN URLs, provider raw payloads, atau downloaded media ke Git.
- Provider response bukan domain model; acquisition adapter menormalkan packet.

## Kontrak dan Scope

Frozen MVP mengunci URL-first TikTok, actual video processing, Organic/Paid separation, evidence ontology, controlled compare, analyst review, dan structured Next Test. S3 processing, S4 extraction, S5 metrics/KPI/ranking, R1 runtime integration, serta future Pattern Memory belum boleh diklaim selesai.

## Kontribusi

Lihat `CONTRIBUTING.md`.

## Lisensi

Belum ditetapkan dalam repository.
