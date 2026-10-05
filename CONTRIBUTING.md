# Contributing to Content Intelligence Copilot

## Prasyarat

- Node.js `22.18.0` dari `.node-version`
- npm
- Git

## Alur Kontribusi

### 1. Baca Dulu

Sebelum ngoding, baca:

- `AGENTS.md`
- `VIBE_CODING_PROTOCOL.md`
- `docs/contracts/MVP_CONTRACT_v0.1_FROZEN.md`
- `docs/contracts/DONOR_MAP_FROZEN_v0.1.md`
- `docs/contracts/DATA_CONTRACT_v0.2_CANDIDATE.md`
- `docs/source/PRD_v0.1_Content_Intelligence_Copilot.md`
- `docs/source/IMPLEMENTATION_PLAN_v0.1.md`
- `docs/decisions/`
- `docs/tracking/PLAN_COVERAGE.md`
- `docs/tracking/resume.md`
- `docs/tracking/github-issues.manifest.json`

### 2. Ambil Task

- Cek issue dengan stable marker dan `docs/tracking/github-issues.manifest.json`.
- Cek `docs/tracking/issues/` untuk detail task.
- Maksimal satu task aktif.
- Selaraskan issue status dengan custom Project `Tracking Status`: Backlog, Ready, In Progress, Review, Blocked, Done.

### 3. Bikin Branch

Format: `<type>/<scope>`; delivery ke `master` selalu melalui PR.

- `feat/<scope>` — fitur baru
- `fix/<scope>` — bug fix
- `chore/<scope>` — housekeeping
- `docs/<scope>` — dokumentasi
- `test/<scope>` — test
- `refactor/<scope>` — refactor

### 4. Commit

Conventional Commits: `feat(scope):`, `fix(scope):`, `docs(scope):`, `chore(scope):`, `test(scope):`, `refactor(scope):`.

- Satu logical change per commit.
- Jangan campur feature/bug/cleanup/dependency/documentation.
- Commit message bahasa Inggris, imperatif.

### 5. Sebelum Push

    npm ci
    npm run lint
    npm run typecheck
    npm test
    npm run validate:fixtures
    npm run build
    git diff --check

Semua harus lulus pada Node.js `22.18.0`. CI tidak memanggil paid acquisition providers atau production DB.

### 6. PR

- Push ke feature branch, bukan `master`.
- Bikin PR ke `master`.
- Isi template dengan task ID, scope, acceptance, verification, decision, dan remaining limits.
- Link contract/decision relevan.
- Jangan klaim merged sebelum owner review dan merge aktual.

### 7. Review dan Merge

- Reviewer: owner.
- Cek: scope, authority, acceptance criteria, verification, dan remaining limits.
- Tidak merge tanpa approval owner.
- Squash merge ke `master` hanya setelah approval.

## Label GitHub Aktual

### Prioritas

- `priority:p0`, `priority:p1`, `priority:p2`

### Area

- `area:engine`, `area:ui`, `area:qa`, `area:platform`

### Tipe

- `type:story`, `type:integration`, `type:decision`, `type:chore`

### Status label dan Project status

- `status:ready`, `status:review`, `status:blocked`
- Project custom `Tracking Status`: `Backlog`, `Ready`, `In Progress`, `Review`, `Blocked`, `Done`.
- GitHub issue open/closed tetap dibaca sebagai state issue; jangan menyamakan built-in Project `Status` dengan custom `Tracking Status`.

## Definition of Done

- [ ] Scope files jelas dan terpenuhi.
- [ ] Acceptance criteria terpenuhi.
- [ ] `npm run lint` lulus.
- [ ] `npm run typecheck` lulus.
- [ ] `npm test` lulus.
- [ ] `npm run validate:fixtures` lulus.
- [ ] `npm run build` lulus.
- [ ] `git diff --check` lulus.
- [ ] Docs/tracking/decision diupdate bila authority, path, status, atau evidence berubah.
- [ ] Tidak ada secret, transient URL, media, atau runtime artifact yang di-commit.

## Yang Tidak Boleh Dilakukan

- Push langsung ke `master` atau force push.
- `git add .` tanpa review exact paths.
- Commit secrets, `.env`, `node_modules/`, `.next/`, `*.tsbuildinfo`, provider payloads, atau downloaded media.
- Campur feature/bug/cleanup/dependency/documentation dalam satu commit.
- Ubah frozen contract atau donor boundary tanpa decision/approval.
- Klaim runtime DB, provider live proof, UI functionality, atau CI green tanpa evidence aktual.

## Setup Development

1. Clone repository.
2. Pastikan Node.js `22.18.0` aktif dari `.node-version`.
3. `cp .env.example .env` hanya untuk path yang membutuhkan environment.
4. `npm ci`.
5. `npm run dev` untuk fixture-backed current UI.

## Butuh Bantuan?

- Baca `AGENTS.md`, `VIBE_CODING_PROTOCOL.md`, contracts, decisions, dan tracking docs.
- Tanya owner hanya untuk keputusan produk/authority yang belum terselesaikan.
- Jangan menebak.
