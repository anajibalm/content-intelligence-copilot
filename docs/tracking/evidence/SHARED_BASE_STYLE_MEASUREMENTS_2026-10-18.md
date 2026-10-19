# Gaya dasar bersama — pengukuran presentasi

Scope: build lokal route-mocked synthetic. Bukti ini tidak membuktikan data Batch 8, staging-integrated, provider, atau production.

| Kriteria | Target 1440×900 | Terukur 1440×900 | Target 390×844 | Terukur 390×844 | Hasil |
|---|---:|---:|---:|---:|---|
| Viewport | 1440×900 | 1440×900 | 390×844 | 390×844 | PASS |
| Antrean aktif | `#eaf1ff`, border 1 px `#e3e6eb`, radius 6 px, 13 px/500 | `rgb(234, 241, 255)`, 1 px `rgb(227, 230, 235)`, 6 px, 13 px/500 | N/A, detail terbuka | detail terbuka | PASS |
| Filter antrean | segmented, 13 px, satu baris | 13 px, `white-space: nowrap` | N/A, detail terbuka | detail terbuka | PASS |
| Judul Antrean | 15 px/600 | 15 px/600 | N/A, detail terbuka | detail terbuka | PASS |
| Alasan confidence | 12 px abu, dari alasan engine | 12 px; `sample size 2 is below high-confidence threshold 3` | 12 px, 36 px tinggi karena wrap | 12 px, 36 px tinggi karena wrap | PASS |
| Tab detail | transparan, garis bawah 2 px, satu baris | transparan, 2 px, satu baris | sama | sama | PASS |
| Tabel metrik | ≥13 px; nilai kanan; badge sumber hanya kolom Sumber | 13 px; `right,right,right,right`; kolom Sumber terlihat | ≥13 px | 13 px | PASS |
| Tipografi Review | tidak ada text weight ≥700 selain heading klaim | `heavyTextCount=0` | sama | `heavyTextCount=0` | PASS |
| Keputusan sticky | kontrol ≥44 px; sticky; tanpa overflow | 44/44/44 px; 63 px; sticky; overflow `false` | sama | 44/44/44 px; 152 px; sticky; overflow `false` | PASS |
| Navigasi mobile | brand tersembunyi; satu baris ≤52 px | N/A | brand tersembunyi; satu baris | satu baris, 44 px | PASS |
| Tombol kembali mobile | kecil, ≤36 px | tersembunyi desktop | ≤36 px | terlihat, ≤36 px | PASS |

Probe: `CIC_E2E_STAGING_URL=http://127.0.0.1:3201 npx playwright test tests/e2e/review-layout-mock.spec.ts --reporter=list` — 2/2 PASS. Probe memilih antrean dengan pointer nyata (`mouse.move/down/up`).

## Gambar berdampingan

- Desktop, kiri target Review terdahulu dan kanan hasil shared-base route-mocked: `docs/tracking/evidence/SHARED_BASE_STYLE_TARGET_VS_RESULT_1440x900.png` (2880×900).
- Mobile, kiri target Review terdahulu dan kanan hasil shared-base route-mocked: `docs/tracking/evidence/SHARED_BASE_STYLE_TARGET_VS_RESULT_390x844.png` (780×844).

## Selisih tersisa

1. Gambar target memakai data referensi Review sebelumnya; hasil memakai fixture synthetic. Nilai, jumlah field, timestamp, dan antrean bukan perbandingan data produk.
2. Target kiri masih menampilkan versi Review sebelum cutover; target tidak menyediakan computed-style artifact untuk semua kontrol lintas halaman. Kolom target pada tabel memakai acceptance criterion eksplisit owner; kolom terukur berasal dari Playwright.
3. Nilai ringkas mobile sengaja tidak membawa badge sumber di sel nilai. Label sumber tetap pada kolom Sumber desktop dan region sumber snapshot.
4. Batch 8 integrated, walkthrough manusia, provider, staging, dan production: NOT RUN.
