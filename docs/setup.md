# Setup Development

## Prasyarat

- Node.js 20+
- npm
- Git
- Akun Supabase (untuk production/staging)
- API keys (opsional):
  - TikHub API key
  - Apify token
  - Whisper model (untuk transkripsi)

## Clone Repository

    git clone https://github.com/anajibalm/content-intelligence-copilot.git
    cd content-intelligence-copilot

## Setup Environment

Salin template:

    cp .env.example .env

Edit `.env` dan isi:

### Wajib

    NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
    NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
    SUPABASE_SERVICE_ROLE_KEY=xxx

### Opsional

    TIKHUB_API_KEY=xxx
    APIFY_TOKEN=xxx
    APIFY_ACTOR=spider_studio~tiktok-video-resolver
    WHISPER_MODEL=small

**JANGAN commit `.env`.** Sudah di-ignore.

## Install Dependencies

    npm install

## Jalankan Development Server

    npm run dev

Buka http://localhost:3000

## Verifikasi

Wajib jalankan sebelum declare selesai:

    npm run lint
    npm run typecheck
    npm test
    npm run build

Semua harus lulus.

## Validasi Fixtures

    npm run validate:fixtures

## Struktur Repo

    app/              # Next.js App Router
    components/       # React components
    lib/              # Library & utilities
    worker/           # Background worker
    supabase/         # Supabase config & migrations
    fixtures/         # Test fixtures
    spikes/           # Experiment & spike
    scripts/          # Utility scripts
    tests/            # Test files
    types/            # TypeScript types
    docs/             # Dokumentasi
    AGENTS.md         # Aturan agent
    CONTRIBUTING.md   # Aturan kontribusi

## Database

Authority: Supabase (PostgreSQL).

Schema & migration ada di `supabase/`.

Untuk local development, bisa pakai Supabase local (butuh Docker) atau project Supabase remote.

## Troubleshooting

### `npm run build` gagal karena TypeScript error

Jalankan `npm run typecheck` dulu untuk lihat error detail.

### `next dev` tidak jalan

Cek port 3000 tidak dipakai. Ganti dengan `PORT=3001 npm run dev`.

### Supabase connection error

Cek `.env` sudah diisi. Cek project Supabase aktif.

### Test gagal

Baca error, fix, jalankan ulang. Kalau gagal 3x, lapor owner.

## Referensi

- `README.md` — overview
- `CONTRIBUTING.md` — aturan kontribusi
- `AGENTS.md` — aturan domain
- `docs/contracts/` — MVP contract, donor map
- `docs/tracking/` — issues, plan coverage, resume
