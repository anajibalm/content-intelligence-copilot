# PR #49 — Pengukuran presentasi Review

Scope: route-mocked synthetic Review pada build lokal; bukan bukti Batch 8, staging-integrated, provider, atau production.

| Kriteria | Target 1440×900 | Terukur 1440×900 | Target 390×844 | Terukur 390×844 | Hasil |
|---|---:|---:|---:|---:|---|
| 1. Viewport | 1440×900 | 1440×900 | 390×844 | 390×844 | PASS |
| 2. Pilih antrean dengan pointer | Detail terbuka | `queuePointerSelected=true` | Detail terbuka | `queuePointerSelected=true` | PASS |
| 3. Kembali ke antrean | Kontrol desktop disembunyikan | `backVisible=false` | Kontrol jelas | `backVisible=true` | PASS |
| 4. Navigasi mobile | Satu baris, ≤52 px | N/A desktop | satu baris, ≤52 px | `navSingleRow=true`, 44 px | PASS |
| 5. Tab detail | Satu baris; garis bawah 2 px | `tabsSingleRow=true`; 2 px | Satu baris; garis bawah 2 px | `tabsSingleRow=true`; 2 px | PASS |
| 6. Tabel metrik | Font ≥13 px | 13 px | Font ≥13 px | 13 px | PASS |
| 7. Nilai dan sumber metrik | Nilai kanan; kolom Sumber | `right,right,right,right`; `sourceColumn=true` | Nilai per metrik; sumber bukti terlihat | ringkasan A/B; region sumber terlihat | PASS |
| 8. Tipografi | Tidak ada weight ≥700 selain h1/judul klaim | `heavyTextCount=0` | Sama | `heavyTextCount=0` | PASS |
| 9. Alasan confidence | Satu baris | 18 px pada font 16 px | Satu baris | 18 px pada font 16 px | PASS |
| 10. Keputusan/sticky/overflow | Kontrol ≥44 px; sticky; tanpa overflow | 44/44/44 px; 63 px; sticky; `false` | 44/44/44 px; 152 px; sticky; `false` | PASS |

Probe: `CIC_E2E_STAGING_URL=http://127.0.0.1:3200 npx playwright test tests/e2e/review-layout-mock.spec.ts --reporter=list` — 2/2 PASS. Probe memakai pointer nyata (`mouse.move/down/up`) untuk memilih antrean.

## Gambar berdampingan

- Desktop, kiri target dan kanan hasil: `docs/tracking/evidence/PR49_REVIEW_TARGET_VS_RESULT_1440x900.png` (2880×900).
- Mobile, kiri target dan kanan hasil: `docs/tracking/evidence/PR49_REVIEW_TARGET_VS_RESULT_390x844.png` (780×844).

## Selisih tersisa

1. Target memakai data referensi berbeda; hasil memakai payload route-mocked synthetic. Klaim, angka, timestamp, dan hitungan antrean tidak sebanding sebagai data produk.
2. Target memperlihatkan semua metrik snapshot; fixture hasil hanya punya tayangan dan Engagement rate, sehingga delapan field null disembunyikan sesuai perilaku produk.
3. Target memuat identitas reviewer; hasil sengaja memakai placeholder session karena tidak hardcode identitas analyst.
4. Batch 8 integrated, walkthrough manusia, provider, staging, dan production: NOT RUN.
