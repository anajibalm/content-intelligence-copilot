# Vibe Coding Protocol

> Dokumen ini mengatur cara kerja AI agent di repo ini.
> Baca ini sebelum coding. Frozen product/donor contracts tetap menjadi authority untuk domain; protokol ini tidak mengganti contract atau required checks.

---

## 1. ALUR VIBE CODING END-TO-END

PRD -> Data Contract -> Implementation Plan -> Issue/Task -> Branch -> Commit -> PR -> Review -> Merge

Penjelasan tiap tahap:

1. PRD (Product Requirement Document)
   - Lokasi: `docs/source/PRD_v0.1_Content_Intelligence_Copilot.md`.
   - Isi: product goal, user, scope, non-goals, acceptance.

2. Data Contract
   - Lokasi: `docs/contracts/`.
   - Frozen MVP/donor contracts mengatur boundary; `DATA_CONTRACT_v0.2_CANDIDATE.md` tetap candidate.
   - Output: schema, API contract, error format

3. Implementation Plan
   - Lokasi: `docs/source/IMPLEMENTATION_PLAN_v0.1.md` (CIC).
   - Isi: breakdown teknis per task.
   - Output: scope files, acceptance criteria, verification.

4. Issue / Task
   - Lokasi: `docs/tracking/issues/` (CIC).
   - Format: satu task aktif, branch feature/fix yang sesuai, satu PR.
   - Status lokal/GitHub mengikuti custom `Tracking Status`: Backlog -> Ready -> In Progress -> Review -> Blocked -> Done.

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
   - Technical reviewer: ChatGPT; executor utama: OMP (local repo agent).
   - Owner menentukan approval merge.
   - Cek: scope, acceptance, verification
   - Tidak merge tanpa approval

9. Merge
   - Squash merge ke main/master
   - Hapus branch setelah merge
   - Update status di WORK_QUEUE / tracking

---

## 2. DOKUMEN REPOSITORY CIC

- `README.md` — product, status, setup singkat, dan scope truth.
- `CONTRIBUTING.md` — contribution, labels, Project status, verification, dan delivery.
- `AGENTS.md` — domain invariants, bahasa laporan, Hindsight/Obsidian, dan aturan proses mesin.
- `VIBE_CODING_PROTOCOL.md` — workflow agent, snapshot, push, dan anti-loop.
- `.node-version` — Node.js runtime pin untuk local/CI.
- `.github/workflows/ci.yml` — lint, typecheck, tests, fixtures, build.
- `docs/architecture.md` — architecture entrypoint.
- `docs/data-contract.md` — data contract entrypoint.
- `docs/glossary.md`, `docs/setup.md`, `docs/faq-agent.md`, `docs/runbook.md` — supporting operational docs.
- `docs/contracts/`, `docs/decisions/`, `docs/tracking/` — authority, evidence, and execution records.

Tidak semua generic document dari repository lain berlaku di CIC. Jangan membuat path generic atau mengklaim file yang tidak ada.
---

## 3. ATURAN SNAPSHOT, PUSH, DAN HEREDOC

### Snapshot

- Snapshot mencatat commit/source yang diverifikasi, waktu, scope, dan bukti.
- Snapshot tidak wajib berisi SHA dari commit yang menyimpan snapshot itu sendiri.
- Mismatch diperiksa lewat relevant diff; documentation commit sendiri bukan alasan STOP.
- Jangan memperbarui snapshot berulang kali hanya untuk mengejar current HEAD.
- Path generic yang tidak ada dipetakan ke path CIC aktual; tidak menjadi blocker palsu.

### Push dan upstream

- Fetch dan verifikasi remote/upstream yang benar sebelum delivery.
- Local ahead karena commit baru adalah kondisi normal sebelum push.
- Remote ahead/divergence ditangani berdasarkan actual diff; jangan force overwrite.
- Feature branch baru boleh belum punya upstream; push dengan upstream setup yang tepat.
- Verifikasi `0 0` dilakukan setelah successful push terhadap feature upstream, bukan sebelum commit baru.

### Scope approval

- Owner approval menentukan scope pekerjaan material; tidak perlu izin ulang untuk setiap file atau command rutin di dalam scope.
- Owner review tetap diperlukan sebelum merge.
- Blocker auth, permission, atau ambiguity dilaporkan spesifik setelah pekerjaan independen selesai.

### Heredoc dan multiline text

- Triple-backtick di dalam quoted heredoc tidak memotong heredoc; delimiter collision atau unquoted expansion yang merusak output adalah masalahnya.
- Gunakan quoted, unique delimiter dan verifikasi output aktual.
- Untuk issue/PR multiline, gunakan structured API args atau `gh --body-file`; jangan memasukkan body sebagai shell code.

## 4. ANTI-LOOP DAN SNAPSHOT

### Masalah: Agent STOP terus karena "snapshot mismatch"

Penyebab: setiap commit baru mengubah HEAD, sedangkan snapshot merekam commit sebelumnya.

Solusi:

- Terima snapshot yang tertinggal satu commit bila relevant diff sudah diverifikasi.
- Atau commit snapshot terakhir setelah semua file selesai, tanpa mengejar HEAD lagi.

### Masalah: Agent membaca snapshot lama

Solusi: baca ulang snapshot dan verifikasi status Git sebelum melanjutkan task.

### Masalah: Loop update snapshot

Solusi: satu snapshot checkpoint per logical delivery; jangan membuat commit hanya untuk mencocokkan own HEAD.

### Path/status/labels

- CIC implementation plan berada di `docs/source/IMPLEMENTATION_PLAN_v0.1.md`.
- Gunakan labels aktual `priority:p0`, `priority:p1`, `priority:p2`, `area:*`, `type:*`, dan `status:*`.
- Gunakan custom Project `Tracking Status`: Backlog, Ready, In Progress, Review, Blocked, Done.
- Existing issue status, body, manifest, dan Project state tidak boleh saling berlawanan.

## 5. SESSION BOOTSTRAP (WAJIB tiap mulai kerja)

1. Baca `AGENTS.md`, termasuk aturan bahasa, RECALL awal tugas, dan ownership proses mesin.
2. Baca control docs CIC aktual: `docs/contracts/`, `docs/decisions/`, `docs/tracking/`.
3. Baca `docs/source/IMPLEMENTATION_PLAN_v0.1.md`.
4. Verifikasi `pwd`, branch, HEAD, upstream, staged files, dan status.
5. Jika mismatch branch/HEAD atau perubahan unrelated ditemukan, preserve dan klasifikasikan; jangan reset, clean, atau stash otomatis.
6. Hanya kerjakan task yang disetujui owner.
### Aturan eksekusi dan review MVP

1. **Preflight sebelum coding:** cek dependency, runtime, provider, dan input nyata yang diperlukan. Laporkan prerequisite yang belum tersedia; jangan membuat fallback yang memalsukan acceptance.
2. **Checkpoint berdasarkan acceptance:** laporkan setelah alur staging yang disyaratkan terbukti. Checks PASS saja belum berarti story selesai; acceptance yang belum terbukti tetap dicatat sebagai partial/blocked.
3. **Satu review lengkap per checkpoint:** kumpulkan temuan penghalang acceptance sekaligus; kosmetik masuk backlog.
4. **Review ulang hanya delta:** ulangi pemeriksaan yang terdampak perubahan, tetap jalankan required delivery checks. Koreksi kecil boleh dibuat reviewer; perubahan material dikerjakan OMP. Satu penulis aktif per branch, handoff eksplisit, dan author asli dipertahankan.
5. **Integrasi dan rekonsiliasi:** setelah approval owner, integrasikan PR dan perbarui issue, Project custom `Tracking Status`, receipt, Hindsight, serta Obsidian dalam satu checkpoint. Ikuti aturan memori `AGENTS.md`: RETAIN hanya konteks baru yang layak, paling banyak satu ringkasan per tugas/checkpoint; Obsidian diperbarui sekali per checkpoint. Memory mendukung konteks; frozen contracts tetap authority produk. Jika sinkronisasi gagal, catat gap tanpa mengarang keberhasilan.

Tinjau efektivitas aturan ini setelah checkpoint S7 dari hambatan yang benar-benar terjadi; jangan menambah sistem governance atau review ulang tanpa perubahan relevan.

---

## 6. CHECKLIST SEBELUM COMMIT

- [ ] Satu logical change per commit.
- [ ] Tidak campur feature/bug/cleanup/dependency/documentation.
- [ ] `git diff --check` lulus.
- [ ] Tidak ada runtime artifact atau secret.
- [ ] Docs diupdate jika authority/path/status berubah.
- [ ] Verification command lulus.

## 7. CHECKLIST SEBELUM PUSH

- [ ] Feature branch, bukan `master`.
- [ ] Upstream benar setelah push.
- [ ] Working tree bersih kecuali ignored runtime artifacts.
- [ ] Verification dijalankan pada exact commit yang akan dipush.
- [ ] PR ready untuk owner review; jangan merge otomatis.

## 8. YANG TIDAK BOLEH DILAKUKAN

- Push langsung ke `master`.
- `git add .` saat scope paths belum direview.
- Commit secrets, `.env`, transient CDN URLs, media, atau runtime artifacts.
- Ubah frozen contract tanpa decision/approval.
- Klaim feature, runtime DB, provider, atau CI green tanpa evidence aktual.

---

## 9. PER REPO (SESUAIKAN)

### content-intelligence-copilot
- Branch utama: `master`; delivery memakai feature branch dan PR.
- Stack: Next.js 16, React 19, TypeScript, Supabase/PostgreSQL boundary.
- Runtime prerequisite: Node.js `22.18.0` dari `.node-version`.
- Test: `npm test`; lint/typecheck/build memakai npm scripts.
- CI: `.github/workflows/ci.yml`.
- Control docs: `docs/contracts/`, `docs/decisions/`, `docs/tracking/`, `docs/source/IMPLEMENTATION_PLAN_v0.1.md`.

### Dokumen generic

README, glossary, setup, FAQ, runbook, dan architecture entrypoints hanya merujuk authority CIC aktual. Jangan menyalin contract penuh ke entrypoint.

---

## 10. KALAU BINGUNG

1. Baca ulang `AGENTS.md` dan control docs CIC.
2. Cek `docs/tracking/README.md`, `PLAN_COVERAGE.md`, `resume.md`, dan issue body terkait.
3. Cek `docs/faq-agent.md`.
4. Tanya owner hanya untuk keputusan produk/authority yang belum terselesaikan.
5. Jangan mengarang path, label, status, provider success, atau runtime readiness.
6. Jika blocker auth/permission nyata, selesaikan pekerjaan independen lalu laporkan blocker spesifik.

---

Terakhir diupdate: 2026-10-07
Maintainer: Najib (owner)
