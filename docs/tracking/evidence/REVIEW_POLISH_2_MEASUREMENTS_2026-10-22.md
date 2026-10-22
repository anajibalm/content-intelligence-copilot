# Polish Review 2 — pengukuran presentasi

Scope: build produksi lokal, API di-route-mock dengan fixture synthetic. Bukti tidak membuktikan Batch 8, staging-integrated, provider, atau production data.

| Kriteria | Target 1440×900 | Terukur 1440×900 | Target 390×844 | Terukur 390×844 | Hasil |
|---|---:|---:|---:|---:|---|
| Viewport | 1440×900 | 1440×900 | 390×844 | 390×844 | PASS |
| Header mobile | N/A | N/A | kontainer gelap ≤52 px; nav→judul Review ≤24 px | sidebar 52 px; nav 44 px; nav→judul 21,67 px | PASS |
| Chip synthetic mobile | N/A | N/A | bawah chip ke garis dan judul batch ≥8 px | garis 9 px; judul batch 17 px | PASS |
| Judul klaim | 18 px / 600, warna utama; layer terpisah; gap 8 px | 18 px / 600, `rgb(16,24,40)`; layer terpisah; 8 px | 16 px / 600 | 16 px / 600 | PASS |
| Badge confidence/status | 20 px, 12 px / 500, radius 999 px, tanpa border; merah / kuning terisi | `#fdecec` / `#b91c1c`; `#fef6dd` / `#a16207`; 20 px, border 0 | Sama | Sama | PASS |
| Ringkasan antrean | 12 px muted | 12 px `rgb(102,112,133)` | Sama | Sama | PASS |
| Label/form/header tabel | 12 px / 500 muted; placeholder 400 | 12 px / 500 muted; placeholder 400 | Sama | Sama | PASS |
| Judul panel | 15 px / 600 | Bukti terhubung dan Catatan dan rencana uji: 15 px / 600 | Sama | Sama | PASS |
| Metrik mobile | N/A | N/A | Nilai tidak memulai baris dengan `·`; dua baris berlabel | `Alpha creative:` dan `Beta creative:` pada baris terpisah; tanpa `·` awal | PASS |
| Keputusan mobile | sticky ≤64 px | 63 px | bar total termasuk Opsi ≤132 px; Reviewer/Catatan 40 px; aksi 44 px | 129 px; 40 px; 44 px, proporsi 1.4:1:1 | PASS |
| Border Catatan vs Reviewer | warna sama | `rgb(228,231,236)` / `rgb(228,231,236)` | warna sama | `rgb(228,231,236)` / `rgb(228,231,236)` | PASS |
| Metrik desktop tanpa duplikasi | `snapshot-mobile-values` terlihat 0; badge sumber hanya kolom Sumber | 0; kolom Sumber terlihat; nilai rata kanan | N/A | N/A | PASS |
| Field kosong | teks 12 px / 400 muted; ghost 12 px / 500, tinggi ≤28 px | `rgb(102,112,133)` 12 px / 400; tombol 12 px / 500, 28 px | Sama | Sama | PASS |
| Badge sumber `Belum diverifikasi` | inline-flex, 20 px, radius 999, border 0; lebar <50% kartu; offset 0 px | 109,375 / 369 px = 29,64%; offset 0 px | Sama | 109,375 / 336 px = 32,55%; offset 0 px | PASS |
| Panel Catatan tertutup | tinggi ≤48 px | 46 px | tinggi ≤48 px | 46 px | PASS |
| Waktu sumber | spasi sebelum `·` | 4 px sebelum pemisah waktu | 4 px | 4 px | PASS |
| Indikator Next.js | Tidak terlihat | Tidak terlihat | Tidak terlihat | Tidak terlihat | PASS |

Probe: `CIC_E2E_STAGING_URL=http://127.0.0.1:3201 mise exec node@22.18.0 -- npx playwright test tests/e2e/review-layout-mock.spec.ts --reporter=json` — 2/2 PASS. Probe memakai pointer nyata untuk memilih antrean, computed style, bounding box, dan screenshot dari build produksi.

## Gambar berdampingan

- Desktop: `docs/tracking/evidence/REVIEW_POLISH_2_DETAIL_1440x900.png` (2880×900, dua viewport 1440×900 berdampingan).
- Mobile: `docs/tracking/evidence/REVIEW_POLISH_2_DETAIL_390x844.png` (780×844, dua viewport 390×844 berdampingan).

## Selisih tersisa

1. Evidence memakai payload route-mocked synthetic. Nilai, waktu, dan status bukan bukti data produk.
2. Batch 8 integrated, walkthrough manusia, provider, staging, dan production data: NOT RUN.
