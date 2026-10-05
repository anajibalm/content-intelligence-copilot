# FAQ Agent

Pertanyaan yang sering ditanya agent, beserta jawabannya.

## Setup & Environment

### Q: Bagaimana cara run project?
A: Lihat `docs/setup.md`.

### Q: Apa Node version yang dibutuhkan?
A: Node.js 20+.

### Q: Bagaimana cara run test?
A:
    npm run lint
    npm run typecheck
    npm test
    npm run build

### Q: Apa itu `NEXT_PUBLIC_SUPABASE_URL`?
A: URL project Supabase. Wajib untuk koneksi DB.

### Q: Apa itu `SUPABASE_SERVICE_ROLE_KEY`?
A: Service role key Supabase (server-side only). JANGAN expose ke client.

## Task & Workflow

### Q: Task mana yang harus dikerjakan dulu?
A: Cek `docs/tracking/github-issues.manifest.json` dan `docs/tracking/issues/`.

### Q: Apa arti S0, S1, S2, ... S13?
A: Slice/tahap implementasi. Lihat `docs/glossary.md`.

### Q: Apa arti A0, C1, E1, P1, P2, R1?
A: Lihat `docs/glossary.md`.

### Q: Bagaimana cara commit?
A: Conventional Commits: `feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`. Lihat `CONTRIBUTING.md`.

### Q: Kapan boleh merge?
A: Setelah owner approval dan semua verification lulus.

## Arsitektur & Data

### Q: Apa itu `metric_snapshot`?
A: Snapshot metrik pada waktu tertentu. Organic & Paid disimpan di sini.

### Q: Kenapa JANGAN tambah distribution ke `content`?
A: Aturan domain dari `AGENTS.md`. Organic & Paid harus di `metric_snapshot`.

### Q: Apa itu OBSERVED, DERIVED, EXTRACTED, INFERRED?
A: Evidence types. Lihat `docs/glossary.md`.

### Q: Apa itu MVP Contract?
A: `docs/contracts/MVP_CONTRACT_v0.1_FROZEN.md` — kontrak produk MVP (frozen).

### Q: Apa itu Donor Map?
A: `docs/contracts/DONOR_MAP_FROZEN_v0.1.md` — pemetaan boundary donor.

## Git & Repo

### Q: Branch mana yang aktif?
A: `master`.

### Q: Apa yang tidak boleh di-commit?
A: `.env`, `node_modules/`, `.next/`, `*.tsbuildinfo`, `_bmad/`, `_bmad-output/`, secrets, transient CDN URLs.

### Q: Apa yang harus dicek sebelum commit?
A:
    git diff --check
    git status --short
    npm run lint
    npm run typecheck
    npm test
    npm run build

## Emergency

### Q: Apa yang dilakukan kalau test gagal?
A: Baca error, fix dalam scope, jalankan ulang. Kalau gagal 3x, STOP & lapor owner.

### Q: Apa yang dilakukan kalau ada conflict?
A: Jangan resolve otomatis. Lapor owner.

## Referensi

- `AGENTS.md`
- `CONTRIBUTING.md`
- `README.md`
- `docs/glossary.md`
- `docs/setup.md`
- `docs/contracts/`
- `docs/tracking/`
