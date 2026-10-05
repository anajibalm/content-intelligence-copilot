# Vibe Coding Protocol

> Dokumen ini adalah satu sumber kebenaran untuk cara kerja AI agent di repo ini.
> Baca ini dulu sebelum ngoding. Kalau ada konflik dengan dokumen lain, dokumen ini yang menang.

---

## 1. ALUR VIBE CODING END-TO-END

PRD -> Data Contract -> Implementation Plan -> Issue/Task -> Branch -> Commit -> PR -> Review -> Merge

Penjelasan tiap tahap:

1. PRD (Product Requirement Document)
   - Lokasi: docs/source/ (CIC), docs/product/ (PoliSpace), root (alterxjkt)
   - Isi: apa yang mau dibangun, kenapa, acceptance criteria
   - Output: user story, scope, non-goals

2. Data Contract
   - Lokasi: docs/contracts/ (CIC), docs/data-contract.md (PoliSpace), docs/ (alterxjkt)
   - Isi: bentuk data antar layer (FE <-> BE <-> DB)
   - Output: schema, API contract, error format

3. Implementation Plan
   - Lokasi: docs/source/IMPLEMENTATION_PLAN.md (CIC), docs/agent/WORK_QUEUE.md (PoliSpace)
   - Isi: breakdown teknis per task
   - Output: scope files, acceptance criteria, verification

4. Issue / Task
   - Lokasi: docs/tracking/issues/ (CIC), docs/agent/WORK_QUEUE.md (PoliSpace)
   - Format: 1 task = 1 issue = 1 branch = 1 PR
   - Status: Backlog -> Ready -> In Progress -> In Review -> Done

5. Branch
   - Format: type/scope (feat/, fix/, chore/, docs/, test/, refactor/)
   - Contoh: feat/pilkades-tps, fix/koordinator-panic

6. Commit
   - Format: Conventional Commits
     - feat(scope): ...
     - fix(scope): ...
     - docs(scope): ...
     - chore(scope): ...
     - test(scope): ...
     - refactor(scope): ...
   - Aturan: satu logical change per commit, jangan campur

7. PR (Pull Request)
   - Template: .github/pull_request_template.md
   - Isi: task ID, scope, acceptance, verification, checklist
   - Link: ke issue / decision

8. Review
   - Reviewer: owner
   - Cek: scope, acceptance, verification
   - Tidak merge tanpa approval

9. Merge
   - Squash merge ke main/master
   - Hapus branch setelah merge
   - Update status di WORK_QUEUE / tracking

---

## 2. FORMAT DOKUMEN BARU (Per Repo)

### Dokumen Root (WAJIB ada di semua repo)

| File | Fungsi | Wajib? |
|------|--------|--------|
| README.md | Pintu masuk repo | YA |
| CONTRIBUTING.md | Aturan kontribusi | YA |
| AGENTS.md | Onboarding AI agent | YA |
| CHANGELOG.md | Riwayat versi | YA |
| .editorconfig | Format konsisten | YA |
| .env.example | Contoh env var | YA |
| .gitignore | File yang di-ignore | YA |

### Dokumen .github/ (WAJIB)

| File | Fungsi |
|------|--------|
| .github/pull_request_template.md | Template PR |
| .github/ISSUE_TEMPLATE/feature.md | Template feature |
| .github/ISSUE_TEMPLATE/bug.md | Template bug |
| .github/workflows/ci.yml | CI workflow |

### Dokumen docs/ (WAJIB)

| File | Fungsi |
|------|--------|
| docs/glossary.md | Kamus istilah & kode |
| docs/architecture.md | Diagram arsitektur |
| docs/setup.md | Cara setup development |
| docs/data-contract.md | Kontrak data |
| docs/faq-agent.md | FAQ agent (anti-nanya berulang) |
| docs/runbook.md | Panduan operasional |

### Dokumen Control (WAJIB untuk repo kompleks)

| File | Fungsi |
|------|--------|
| docs/agent/PROJECT_STATE.md | Snapshot HEAD, upstream, status |
| docs/agent/DECISIONS.md | Keputusan resmi (DEC-XXX) |
| docs/agent/WORK_QUEUE.md | Task queue + aturan |
| docs/agent/REPO_MAP.md | Peta arsitektur |

---

## 3. ATURAN ANTI-LOOP

### Masalah: Agent STOP terus karena "snapshot mismatch"

Penyebab: Setiap commit baru -> HEAD naik -> snapshot ketinggalan -> agent STOP.

Solusi:

A. Gabung commit - file + snapshot dalam satu commit:
   git add file docs/agent/PROJECT_STATE.md
   git commit -m "docs: add X + update snapshot"

B. Commit snapshot terakhir - setelah semua file di-commit, baru commit snapshot:
   git add docs/agent/PROJECT_STATE.md
   git commit -m "docs(agent): sync snapshot to HEAD hash"

C. Update snapshot sebelum mulai task baru - pastikan snapshot = HEAD sebelum agent mulai.

### Masalah: Agent baca snapshot versi lama

Penyebab: Agent cache snapshot di memory.

Solusi: Kasih instruksi eksplisit ke agent:
"Baca ULANG PROJECT_STATE.md (versi terbaru), lalu lanjutkan task X."

### Masalah: File kepotong saat pakai heredoc

Penyebab: Nested code fence (triple backtick) di dalam heredoc.

Solusi:
- Pakai delimiter BEDA (misal README_EOF, bukan EOF)
- Ganti nested code fence jadi indentasi 4 spasi

### Masalah: Loop tak berujung update snapshot

Penyebab: Setiap commit snapshot mengubah HEAD, jadi snapshot selalu ketinggalan 1.

Solusi:
- Terima snapshot ketinggalan 1 commit (normal)
- ATAU commit snapshot terakhir tanpa file lain setelah semua commit selesai

---

## 4. SESSION BOOTSTRAP (WAJIB tiap mulai kerja)

1. Baca AGENTS.md - aturan agent
2. Baca CLAUDE.md - konteks project (kalau ada)
3. Baca docs/agent/REPO_MAP.md - peta arsitektur
4. Baca docs/agent/PROJECT_STATE.md - snapshot state
5. Baca docs/agent/DECISIONS.md - keputusan resmi
6. Baca docs/agent/WORK_QUEUE.md - task queue
7. Verifikasi: pwd, branch, HEAD, upstream, staged files, status
8. Kalau mismatch -> STOP & lapor
9. Hanya kerjakan task yang disetujui owner

---

## 5. CHECKLIST SEBELUM COMMIT

- [ ] Satu logical change per commit
- [ ] Tidak campur feature/bug/cleanup/dependency/documentation
- [ ] git diff --check lulus (whitespace)
- [ ] Tidak ada runtime artifact (.db, .log, .pid, .out, node_modules/, .next/)
- [ ] Docs diupdate (kalau ada perubahan API/schema)
- [ ] Snapshot diupdate (kalau ada perubahan HEAD)
- [ ] Verification command lulus

## 6. CHECKLIST SEBELUM PUSH

- [ ] git rev-list --left-right --count HEAD...@{upstream} = 0 0
- [ ] Upstream benar (bukan branch lain)
- [ ] Working tree bersih kecuali runtime artifacts
- [ ] Owner approval (untuk perubahan material)

---

## 7. YANG TIDAK BOLEH DILAKUKAN

- Push langsung ke main/master (wajib PR + review)
- git add . (bisa nyampur feature/bug/cleanup)
- git commit -am "wip" (message jelek, gak jelas)
- Commit secrets (.env, API keys)
- Commit runtime artifacts (sudah di-ignore)
- Hapus file tanpa owner approval (bisa hilang history)
- Ubah contract tanpa approval (harus lewat DECISIONS)
- Tambah dependency tanpa diskusi (bisa bikin repo berat)

---

## 8. PER REPO (SESUAIKAN)

### alterxjkt (Telegram Bot - Python)
- Branch utama: main
- Stack: Python 3.14, SQLite
- Test: bash scripts/test.sh
- CI: .github/workflows/ci.yml
- Control docs: docs/DELIVERY_BOARD.md, docs/DECISIONS.md, docs/glossary.md

### PoliSpace (Go + React + SQLite)
- Branch utama: feature/pilkades-mvp-phase6 (aktif)
- Stack: Go 1.23, React + Vite, SQLite
- Test: JWT_SECRET='verify-only-local-secret' go test ./...
- CI: .github/workflows/ci.yml
- Control docs: docs/agent/REPO_MAP.md, PROJECT_STATE.md, DECISIONS.md, WORK_QUEUE.md

### content-intelligence-copilot (Next.js + Supabase)
- Branch utama: master
- Stack: Next.js 16, React 19, Supabase
- Test: npm run lint && npm run typecheck && npm test && npm run build
- CI: .github/workflows/ci.yml
- Control docs: docs/tracking/github-issues.manifest.json, docs/tracking/PLAN_COVERAGE.md, docs/decisions/

---

## 9. KALAU BINGUNG

1. Baca ulang dokumen ini
2. Baca AGENTS.md + docs/agent/
3. Cek docs/faq-agent.md
4. Tanya owner - jangan nebak
5. Kalau owner gak available -> STOP & tunggu

---

Terakhir diupdate: 2026-10-05
Maintainer: Najib (owner)
