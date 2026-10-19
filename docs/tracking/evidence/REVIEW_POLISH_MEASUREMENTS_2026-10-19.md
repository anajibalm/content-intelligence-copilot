# Polish gaya Review — pengukuran presentasi

Scope: build lokal route-mocked synthetic. Bukti ini tidak membuktikan Batch 8, staging-integrated, provider, atau production.

| Kriteria | Target 1440×900 | Terukur 1440×900 | Target 390×844 | Terukur 390×844 | Hasil |
|---|---:|---:|---:|---:|---|
| Viewport | 1440×900 | 1440×900 | 390×844 | 390×844 | PASS |
| Filter antrean | `#eef0f3`, radius 6 px; segmen aktif putih + bayangan; 13 px, satu baris, tanpa irisan | `rgb(238,240,243)`, 6 px; putih, `0 1px 2px rgb(16 24 40 / 12%)`; 13 px, `nowrap`, batas tepat bersebelahan | Reflow antrean | Terlihat tanpa overflow | PASS |
| Tabel metrik | Header angka kanan; garis 1 px `#e3e6eb`; label 13 px/500 muted; padding vertikal 10 px | `right,right`; `1 px rgb(227,230,235)`; 13 px/500 `rgb(102,112,133)`; 10/10 px | Ringkasan metrik mobile | 13 px, tanpa overflow | PASS |
| Badge sumber | Observasi abu terisi, Hasil perhitungan biru muda terisi, tanpa border | `rgb(238,240,243)` dan `rgb(239,248,255)`; border 0 px | Sumber tetap di kartu provenance | 2 kartu tampil | PASS |
| Status detail | Badge review di samping confidence | Confidence Rendah + Menunggu review | Sama | Sama | PASS |
| Kartu sumber/waktu | Border 1 px, radius 8 px, padding 12 px; tautan hanya bila ada | Dua kartu `1 px`, 8 px, 12 px; nama, waktu, verifikasi; 0 tautan karena fixture tidak punya tautan | Sama | Dua kartu, tanpa overflow | PASS |
| Alasan confidence | Indonesia, 12 px muted, dari cap engine | `Sampel kurang · +1 batas`, 12 px, `rgb(102,112,133)` | Sama | 12 px | PASS |
| Input Reviewer | Lebar ≥160 px desktop | 160 px | Tetap reflow | Kontrol terlihat | PASS |
| Navigasi dan sticky | Brand tersembunyi, nav ≤52 px, tanpa overflow | N/A desktop | Brand tersembunyi, nav 44 px; overflow `false` | PASS |

Probe: `CIC_E2E_STAGING_URL=http://127.0.0.1:3201 npx playwright test tests/e2e/review-layout-mock.spec.ts --reporter=list` — 2/2 PASS. Pemilihan antrean memakai pointer nyata (`mouse.move/down/up`).

## Gambar berdampingan

- Desktop, kiri antrean dan kanan detail terukur: `docs/tracking/evidence/REVIEW_POLISH_QUEUE_DETAIL_1440x900.png` (2880×900).
- Mobile, kiri antrean dan kanan detail terukur: `docs/tracking/evidence/REVIEW_POLISH_QUEUE_DETAIL_390x844.png` (780×844).

## Selisih tersisa

1. Evidence memakai payload route-mocked synthetic. Nilai, waktu, dan status bukan bukti data produk.
2. Fixture tidak menyediakan tautan sumber. UI tidak merender tautan palsu.
3. Batch 8 integrated, walkthrough manusia, provider, staging, dan production: NOT RUN.
