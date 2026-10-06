# Setup Development

## Prasyarat

- Node.js `22.18.0` dari `.node-version`
- npm
- Git

Supabase/PostgreSQL tersedia sebagai application boundary yang belum terhubung ke current fixture UI. TikHub, Apify, dan Whisper hanya dipakai oleh path yang memerlukannya; unit tests memakai fakes/fixtures.

## Clone Repository

    git clone https://github.com/anajibalm/content-intelligence-copilot.git
    cd content-intelligence-copilot

## Setup Environment

    cp .env.example .env

Jangan isi atau commit secrets untuk fixture/unit-test path. Provider dan Supabase variables hanya dibutuhkan ketika runtime integration/provider path menggunakannya.

## Install Dependencies

    npm ci

## Jalankan Development Server

    npm run dev

Current UI fixture-backed. Buka http://localhost:3000.

## Verifikasi

    npm run lint
    npm run typecheck
    npm test
    npm run validate:fixtures
    npm run build
    git diff --check

Semua command harus lulus pada Node.js `22.18.0`. `npm test` menjalankan 19 unit/fixture tests. CI tidak memanggil production DB atau paid acquisition providers.

## Struktur Repo

    app/              # Next.js App Router, current route fixture-backed
    lib/              # Domain types dan acquisition adapter
    supabase/         # Candidate schema/migrations, verification boundary
    fixtures/         # Canonical fixture data
    spikes/           # Experiment/live provider spike
    scripts/          # Validation/probe utilities
    tests/            # Unit/integration/e2e locations
    docs/             # Contracts, decisions, architecture, tracking

## Database

Authority: Supabase/PostgreSQL untuk application boundary. Migration, seed, dan probe S1 diverifikasi pada disposable PostgreSQL; itu bukan bukti application runtime DB aktif.

## Troubleshooting

### `npm run build` gagal karena TypeScript error

Jalankan `npm run typecheck` dulu untuk melihat error.

### `next dev` tidak jalan

Cek port 3000. Ganti dengan `PORT=3001 npm run dev`.

### Supabase connection error

Runtime integration R1 masih blocked. Jangan mengubah fixture UI menjadi fake runtime DB.

### Test gagal

Baca error, fix dalam scope, dan jalankan ulang command yang gagal. Jangan mengurangi test scope atau menonaktifkan CI job.

## Referensi

- `README.md`
- `CONTRIBUTING.md`
- `AGENTS.md`
- `VIBE_CODING_PROTOCOL.md`
- `docs/contracts/`
- `docs/decisions/`
- `docs/tracking/`
