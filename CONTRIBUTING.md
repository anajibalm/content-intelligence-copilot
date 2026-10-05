# Contributing to Content Intelligence Copilot

## Prasyarat

- Node.js 20+
- npm
- Git

## Alur Kontribusi

### 1. Baca Dulu

Sebelum ngoding, baca:

- `AGENTS.md` — aturan domain
- `docs/source/PRD_v0.1_Content_Intelligence_Copilot.md`
- `docs/source/IMPLEMENTATION_PLAN_v0.1.md`
- `docs/contracts/MVP_CONTRACT_v0.1_FROZEN.md`
- `docs/contracts/DONOR_MAP_FROZEN_v0.1.md`
- `docs/tracking/PLAN_COVERAGE.md`
- `docs/tracking/resume.md`
- `docs/tracking/github-issues.manifest.json`

### 2. Ambil Task

- Cek `docs/tracking/github-issues.manifest.json`
- Cek `docs/tracking/issues/` untuk detail task
- Hanya kerjakan task yang sudah disetujui
- Maksimal 1 task aktif

### 3. Bikin Branch

Format: `<type>/<scope>`

- `feat/<scope>` — fitur baru
- `fix/<scope>` — bug fix
- `chore/<scope>` — housekeeping
- `docs/<scope>` — dokumentasi
- `test/<scope>` — test
- `refactor/<scope>` — refactor

Contoh: `feat/s2-live-summary`, `fix/supabase-rls`

### 4. Commit

Conventional Commits:

- `feat(<scope>): ...`
- `fix(<scope>): ...`
- `docs(<scope>): ...`
- `chore(<scope>): ...`
- `test(<scope>): ...`
- `refactor(<scope>): ...`

Aturan:

- Satu logical change per commit
- Jangan campur feature/bug/cleanup/dependency/documentation
- Commit message bahasa Inggris, imperatif
- Body boleh bahasa Indonesia

### 5. Sebelum Push

Wajib jalankan:

    npm run lint
    npm run typecheck
    npm test
    npm run build

Semua harus lulus. Kalau gagal, perbaiki dulu.

### 6. PR

- Push ke branch yang sama
- Bikin PR ke `master`
- Isi deskripsi PR dengan link ke issue
- Link ke contract kalau relevan
- Screenshot kalau ada perubahan UI

### 7. Review

- Reviewer: owner
- Cek: scope, acceptance criteria, verification
- Tidak merge tanpa approval

### 8. Merge

- Squash merge ke `master`
- Hapus branch setelah merge

## Arti Label GitHub

### Tipe
- `bug` — perbaikan bug
- `feat` — fitur baru
- `docs` — dokumentasi
- `chore` — housekeeping
- `test` — test
- `refactor` — refactor

### Prioritas
- `priority:high` — urgent
- `priority:medium` — normal
- `priority:low` — nice to have

### Status
- `ready` — siap dikerjakan
- `in-progress` — sedang dikerjakan
- `blocked` — terblokir
- `done` — selesai

## Definition of Done

- [ ] Scope files jelas & terpenuhi
- [ ] Acceptance criteria terpenuhi
- [ ] `npm run lint` lulus
- [ ] `npm run typecheck` lulus
- [ ] `npm test` lulus
- [ ] `npm run build` lulus
- [ ] Docs diupdate kalau perlu
- [ ] Tidak ada secret/artifact yang ke-commit
- [ ] Owner approval (untuk perubahan material)

## Yang Tidak Boleh Dilakukan

- Push langsung ke `master`
- Merge tanpa approval owner
- Commit secrets, `.env`, atau transient CDN URLs
- Commit `node_modules/`, `.next/`, `*.tsbuildinfo`
- Campur feature/bug/cleanup dalam satu commit
- Ubah contract tanpa approval

## Setup Development

1. Clone repo
2. `cp .env.example .env` — isi credentials
3. `npm install`
4. `npm run dev`
5. Buka http://localhost:3000

## Butuh Bantuan?

- Baca `AGENTS.md`
- Baca `docs/source/` dan `docs/contracts/`
- Tanya owner
- Jangan nebak
