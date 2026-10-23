# Gaya dasar Library dan Compare, pengukuran presentasi

Scope: build produksi lokal, route-mocked synthetic. Bukti ini tidak membuktikan Batch 8, staging-integrated, provider, production, atau walkthrough manusia.

| Kriteria | Target 1440×900 | Terukur 1440×900 | Target 390×844 | Terukur 390×844 | Hasil |
|---|---:|---:|---:|---:|---|
| Judul panel Library | 15 px/600 | 15 px/600 | daftar sengaja tersembunyi | daftar tersembunyi | PASS |
| Konten Library terpilih | `#eaf1ff`; ID 12 px | `rgb(234, 241, 255)`; 12 px | detail-only | detail-only | PASS |
| Judul panel Compare | 15 px/600 | 15 px/600 | 15 px/600 | 15 px/600 | PASS |
| Pilihan Compare terpilih | `#eaf1ff`; border 1 px `#e3e6eb` | `rgb(234, 241, 255)`; `rgb(227, 230, 235)` | sama | sama | PASS |
| Badge kualitas `Rendah` | amber; 20 px; meta 12 px; tanpa border | `rgb(254, 246, 221)`; 12 px; border 0 px | sama | sama | PASS |
| Overflow horizontal | tidak ada | `scrollWidth <= innerWidth` | tidak ada | `scrollWidth <= innerWidth` | PASS |

Probe: `CIC_LC_EVIDENCE_DIR=docs/tracking/evidence/lc-style npx playwright test tests/e2e/slice-0-ledger.spec.ts --grep "Library Compare shared presentation tokens" --reporter=list`, 2/2 PASS. Probe klik pilihan Compare dan membuat perbandingan sebelum mengukur badge quality.

## Gambar berdampingan

- Desktop, kiri Library dan kanan Compare: `docs/tracking/evidence/LC_STYLE_LIBRARY_COMPARE_1440x900.png` (2880×3198).
- Mobile, kiri Library dan kanan Compare: `docs/tracking/evidence/LC_STYLE_LIBRARY_COMPARE_390x844.png` (780×6803).

## Selisih tersisa

1. Capture full-page lebih tinggi daripada viewport karena data fixture menampilkan seluruh tabel fingerprint; screenshot tetap berasal dari viewport 1440×900 dan 390×844.
2. Library menyembunyikan daftar konten pada `<=900px` sejak baseline; mobile menampilkan detail konten terpilih, tidak mengubah urutan atau menambah navigation baru.
3. Fixture synthetic, nilai snapshot, ID, dan quality bukan data produk.
4. Batch 8 integrated, staging, provider, production, dan walkthrough manusia: NOT RUN.
