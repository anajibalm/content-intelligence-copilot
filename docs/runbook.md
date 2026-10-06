# Runbook

Panduan operasional Content Intelligence Copilot.

## Start / Stop Runtime

### Development Server

    npm run dev

Current route fixture-backed. Buka http://localhost:3000.

### Production Build

    npm run build
    npm run start

Build tidak membuktikan application runtime DB atau worker tersedia.

## Monitoring

Development logs tampil di stdout terminal. Production deployment belum ditetapkan.

## Common Issues

### Port 3000 sudah dipakai

    PORT=3001 npm run dev

### `npm run build` gagal

    npm run typecheck
    npm run lint

### Supabase connection error

R1 runtime integration masih Blocked. S1 PostgreSQL proof memakai disposable database, bukan application runtime DB.

### Test gagal

Baca error, fix dalam scope, jalankan ulang command gagal. Jangan menurunkan test scope, disable CI job, atau klaim green tanpa output.

## Database

Supabase/PostgreSQL adalah application boundary. Schema, migration, seed, dan probe ada di `supabase/`; verification database bersifat disposable.

## Runtime Artifacts

Jangan commit `.env`, `.env.*`, `node_modules/`, `.next/`, `*.tsbuildinfo`, `coverage/`, `test-results/`, `playwright-report/`, `local-evidence/`, `tmp/`, `temp/`, media, `spike_output/`, `_bmad/`, atau `_bmad-output/`.

## Verification

    npm ci
    npm run lint
    npm run typecheck
    npm test
    npm run validate:fixtures
    npm run build
    git diff --check

Runtime: Node.js `22.18.0` from `.node-version`. CI uses same version and does not call paid providers or production DB.

## Security

- Jangan commit secrets/provider raw payloads/transient CDN URLs/media.
- Jangan expose `SUPABASE_SERVICE_ROLE_KEY` ke client.
- Preserve AI originals saat koreksi manusia.

## Referensi

- `README.md`
- `docs/setup.md`
- `docs/faq-agent.md`
- `AGENTS.md`
- `VIBE_CODING_PROTOCOL.md`
