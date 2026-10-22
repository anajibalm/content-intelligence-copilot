# Batch presentation, pengukuran route-mocked synthetic

Scope: build produksi lokal PR #50. API di-route-mock dengan data synthetic. Bukti tidak membuktikan Batch 8, staging-integrated, provider, atau production data.

| Kriteria | Terukur 1440×900 | Terukur 390×844 | Hasil |
|---|---:|---:|---|
| Viewport dan overflow halaman | 1440×900; scroll width 1440, tanpa overflow | 390×844; scroll width 390, tanpa overflow | PASS |
| Processing drawer | terbuka; lebar 1086 px; tinggi 535 px; summary 44 px | terbuka; lebar 320 px; tinggi 649 px; summary 76 px | PASS |
| Tombol `Salin ID` | sebelum hover opacity 0 / hidden; setelah hover opacity 1 / visible; 70×44 px, 13 px | sebelum hover opacity 0 / hidden; setelah hover opacity 1 / visible; 55,53×44 px, 13 px | PASS |
| Kolom kondisional | header: Konten, Organik, Status, Percobaan, Salin ID. Iklan dan Frame tidak ada untuk data tanpa bukti terkait | header visual disembunyikan pada kartu mobile; Iklan dan Frame tidak dirender | PASS |
| Metrik | 13 px; line-height 19,5 px; lebar sel 248,16 px | 13 px; line-height 19,5 px; lebar sel 346 px | PASS |
| Badge `Cek` | 38,02×28 px; 12 px / 700; radius 4 px; `rgb(111,86,21)` | Sama | PASS |
| `Atur objective` | teks informatif tersedia 1; tombol 0 | teks informatif tersedia 1; tombol 0 | GAP, tidak dibuat tombol karena belum ada rute/alur konfigurasi nyata |
| Indikator Next.js | tidak terlihat | tidak terlihat | PASS |

Probe: `mise exec node@22.18.0 -- node /tmp/pr50-batch-evidence.mjs`; Playwright memuat build produksi pada `127.0.0.1:3202`, merutekan `/api/*` ke fixture synthetic, mengukur computed style/bounding box, meng-hover baris tabel, dan mengambil screenshot.

## Gambar

- Desktop: `docs/tracking/evidence/BATCH_PRESENTATION_1440x900.png`.
- Mobile: `docs/tracking/evidence/BATCH_PRESENTATION_390x844.png`.

## Batas

- Batch 8 integrated: NOT RUN.
- Staging: NOT RUN.
- Provider: NOT RUN.
- Production: NOT RUN.
- Walkthrough manusia: NOT RUN.
