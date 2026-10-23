# Changelog

Semua perubahan penting pada proyek ini didokumentasikan di file ini.

Format mengikuti [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
dan proyek ini mengikuti [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Antrean Review tersimpan per workspace/batch dengan filter Menunggu review/Semua, deep link, dan retry baca; tanpa tabel workflow baru.
- Retry job gagal memakai antrean durable existing; peringatan synthetic berdasarkan provenance sumber/provider, bukan nama batch.
- `README.md` — root README dengan quick start, stack, scripts, aturan domain
- `CONTRIBUTING.md` — aturan kontribusi, branch, commit, PR, DoD
- `docs/glossary.md` — kamus istilah & kode (S0-S13, A0, C1, E1, P1, P2, R1)
- `docs/setup.md` — panduan setup development
- `docs/faq-agent.md` — FAQ agent
- `docs/runbook.md` — panduan operasional
- `.github/pull_request_template.md` — template PR
- `.github/ISSUE_TEMPLATE/feature.md` — template feature request
- `.github/ISSUE_TEMPLATE/bug.md` — template bug report
- `.github/workflows/ci.yml` — CI workflow (lint, typecheck, test, build)
- `.editorconfig` — konfigurasi editor konsisten

### Changed
- Batch: tabel anggota responsif; KPI/ranking di atas tabel; data hilang tetap dash, ID konten tanpa judul tampil sebagai judul, serta status akuisisi/processing eksplisit.
- Batch menyetarakan tabel/kartu anggota ke skala panel 15 px, body 13 px, meta 12 px; reason kualitas engine dan badge status eksplisit; kartu mobile satu kolom tanpa overflow atau tumpang tindih.
- Batch: status `SUCCEEDED`/`COMPLETED` kini memakai pill hijau, `FAILED` merah, dan status berjalan amber konsisten pada anggota serta drawer processing; geometri tetap 20 px satu baris tanpa mengubah state atau data.
- Batch, Library, Compare, dan Review memiliki tugas terpisah; hasil generation membuka Review tanpa menyalin form review.
- Label Indonesia terpusat, fingerprint AI asli/hasil review berdampingan, history append-only ringkas, form Next Test terlipat, serta mobile tanpa page overflow.
- Review hipotesis merangkum antrean per pasangan konten, menampilkan snapshot bukti berdampingan, metadata sumber/waktu, dan layout keputusan yang diuji pada desktop/mobile.
- Review detail menampilkan klaim asli ringkas dan ontology terpisah, dengan keputusan sticky yang seluruh kontrolnya terbukti terlihat pada desktop dan mobile.
- Tabel metrik Review menampilkan setiap nilai satu kali di desktop dan ringkasan A/B per metrik di mobile; null tetap tersembunyi sampai toggle dan chip ontology tetap terlihat.
- Evidence Review memakai tab terpilih, ringkasan klaim tampil terpisah dari detail bukti, nilai metrik hilang memakai tanda pisah, dan baris anggota Batch mempertahankan interaksi Library existing.
- Review memakai tab garis bawah, filter antrean tersegmentasi, kolom sumber per metrik dan nilai rata kanan pada desktop, ringkasan alasan confidence satu baris dari cap engine, serta nav satu baris dan tombol kembali sesuai viewport.
- Kontrol dasar Batch, Library, Compare, dan Review kini konsisten: tombol 13 px / weight 500, border 1 px `#e3e6eb`, radius 6 px, varian primary/danger eksplisit, serta navigasi mobile bersama.
- Ringkasan confidence Review kini memakai label Indonesia dan jumlah batas; reason engine mentah tetap tersedia lewat title dan tab Kriteria tanpa mengubah cap tersimpan.
- Polish Review menyelaraskan filter antrean, status detail, tabel metrik, kartu sumber/waktu, alasan confidence berbahasa Indonesia, dan input Reviewer; seluruhnya diuji pada 1440×900 dan 390×844.
- Polish Review 2 menetapkan judul klaim responsif, badge status tanpa border, ringkasan antrean, label/form/header tabel seragam, nilai metrik mobile berlabel per baris, dan header mobile ≤52 px; diuji pada build produksi 1440×900 dan 390×844.
- Polish Review final memadatkan header mobile, menyetarakan input Reviewer/Catatan, menjaga tindakan sticky 44 px tiga kolom, dan menjaga disclosure ringkas tanpa overflow; diuji pada build produksi 1440×900 dan 390×844.
- Polish Review final mengembalikan badge sumber sebagai pill 20 px tanpa border, memberi clearance mobile untuk chip synthetic, dan menyetarakan kontrol field kosong ghost 28 px pada desktop/mobile; diuji pada build produksi 1440×900 dan 390×844.
- Notes dan draft review terikat hipotesis saat navigasi biasa; evidence mempertahankan exact source anchors dan artefak historis.
- `.gitignore` — ignore `*.tsbuildinfo`, `_bmad/`, `_bmad-output/`

### Fixed
- Hapus `tsconfig.tsbuildinfo` dari tracking

## [0.0.0] — 2026-10-05

### Added
- Initial commit
