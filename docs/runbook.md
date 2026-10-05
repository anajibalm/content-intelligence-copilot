# Runbook

Panduan operasional untuk menjalankan, memonitor, dan troubleshooting Content Intelligence Copilot.

## Start / Stop Runtime

### Development Server

    npm run dev

Buka http://localhost:3000

### Production Build

    npm run build
    npm run start

## Monitoring

### Logs

Development: stdout terminal.
Production: platform-dependent (TBD).

### Health Check

    curl http://localhost:3000

## Common Issues

### Port 3000 sudah dipakai

    PORT=3001 npm run dev

### `npm run build` gagal

Cek:

    npm run typecheck
    npm run lint

Perbaiki error, jalankan ulang.

### Supabase connection error

1. Cek `.env` sudah diisi
2. Cek project Supabase aktif
3. Cek network access

### Test gagal

1. Baca error
2. Fix dalam scope
3. Jalankan ulang
4. Kalau gagal 3x, STOP & lapor owner

## Database

### Authority

Supabase (PostgreSQL).

### Schema & Migration

Ada di `supabase/`.

### JANGAN

- Reset DB production tanpa approval
- Commit `.env`
- Commit secrets

## Runtime Artifacts

Jangan commit:

- `.env`, `.env.*`
- `node_modules/`
- `.next/`
- `*.tsbuildinfo`
- `coverage/`, `test-results/`, `playwright-report/`
- `local-evidence/`, `tmp/`, `temp/`
- `*.mp4`, `*.wav`
- `spike_output/`
- `_bmad/`, `_bmad-output/`

## Verification

Wajib jalankan sebelum declare selesai:

    npm run lint
    npm run typecheck
    npm test
    npm run build

## Emergency

### Build gagal di CI

1. Cek GitHub Actions log
2. Cek secrets sudah diset (Supabase)
3. Reproduce locally
4. Fix, commit, push

### Rollback

Belum ada prosedur deploy production. TBD.

## Security

- JANGAN commit secrets
- JANGAN expose `SUPABASE_SERVICE_ROLE_KEY` ke client
- JANGAN pakai `NEXT_PUBLIC_*` untuk secret
- Preserve AI originals saat koreksi manusia

## Referensi

- `README.md`
- `docs/setup.md`
- `docs/faq-agent.md`
- `AGENTS.md`
