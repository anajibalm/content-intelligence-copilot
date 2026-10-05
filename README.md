# Content Intelligence Copilot

Content Intelligence Copilot adalah sistem untuk mengumpulkan, menganalisis, dan mengelola konten digital (terutama TikTok) untuk kebutuhan kampanye dan intelijen konten. Sistem ini menggabungkan pengumpulan data dari berbagai sumber (TikHub, Apify), analisis dengan AI, dan penyimpanan terstruktur di Supabase.

Produk ini dirancang untuk tim kampanye yang butuh memahami performa konten, mengidentifikasi pola viral, dan mengelola konten secara sistematis — bukan hanya mengandalkan intuisi.

## Status

- **Fase saat ini:** Lihat `docs/tracking/resume.md`
- **Slice terakhir:** Lihat `docs/tracking/PLAN_COVERAGE.md`
- **Next:** Lihat `docs/tracking/resume.md`
- **Contract:** `docs/contracts/MVP_CONTRACT_v0.1_FROZEN.md`

## Stack

- **Frontend:** Next.js 16.3.8 + React 19.2.0
- **Bahasa:** TypeScript
- **Database:** Supabase (PostgreSQL)
- **Testing:** Node.js test runner (`node --test`)
- **Linting:** ESLint
- **Deployment:** TBD (belum ditetapkan)

## Quick Start

### Prasyarat

- Node.js 20+
- npm
- Akun Supabase (untuk production)
- API keys (opsional, tergantung fitur):
  - TikHub API key
  - Apify token
  - Whisper model (untuk transkripsi)

### Setup

    git clone https://github.com/anajibalm/content-intelligence-copilot.git
    cd content-intelligence-copilot
    cp .env.example .env
    npm install
    npm run dev

Buka http://localhost:3000

### Environment Variables

Lihat `.env.example`. Wajib:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Opsional:

- `TIKHUB_API_KEY`
- `APIFY_TOKEN`
- `APIFY_ACTOR`
- `WHISPER_MODEL`

## Scripts

| Command | Fungsi |
|---------|--------|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Production server |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check |
| `npm test` | Unit test |
| `npm run validate:fixtures` | Validate fixtures |

## Dokumentasi

- `AGENTS.md` — aturan agent
- `docs/source/` — PRD, implementation plan
- `docs/contracts/` — MVP contract, donor map, data contract
- `docs/architecture/` — diagram arsitektur
- `docs/decisions/` — decision log
- `docs/tracking/` — GitHub issues manifest, plan coverage, resume

## Aturan Domain

- Organic & Paid di `metric_snapshot`; JANGAN tambah distribution ke `content`.
- OBSERVED, DERIVED, EXTRACTED, INFERRED evidence tetap terpisah.
- AI originals disimpan saat koreksi manusia.
- JANGAN simpan secrets/transient CDN URLs/media ke Git.
- Jalankan `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` sebelum declare selesai.

## Kontribusi

Lihat `CONTRIBUTING.md`.

## Lisensi

Private.
