# Batch presentation, pengukuran route-mocked synthetic

Scope: build produksi lokal branch `feat/batch-presentation-pr`. API di-route-mock dengan data synthetic oleh `tests/e2e/lb4-1-batch.spec.ts`. Bukti membuktikan lapisan presentasi; tidak membuktikan Batch 8, staging-integrated, provider, production data, atau walkthrough manusia.

| Kriteria | Target | Terukur 1440×900 | Terukur 390×844 | Hasil |
|---|---|---:|---:|---|
| Viewport dan overflow halaman | tanpa overflow horizontal | scroll width 1440 / viewport 1440 | scroll width 390 / viewport 390 | PASS |
| Judul panel | 15px / 600 | 15px / 600; `rgb(16, 24, 40)` | 15px / 600; `rgb(16, 24, 40)` | PASS |
| Header tabel | 32px, 12px / 500 | 32px, 12px / 500, middle | tersembunyi; kartu satu kolom | PASS |
| Tombol umum `Salin ID` | border 1px `#e3e6eb`, radius 6px, 13–14px / 500, 32–36px | 70×32px; 13px / 500; `rgb(227, 230, 235)`; radius 6px | 67.53×32px; sama | PASS |
| Metrik | 13px | 13px / 400; line-height 18px | 13px / 400; line-height 18px | PASS |
| Alasan kualitas engine | 12px abu; reason asal data | 12px / 400; `rgb(102, 112, 133)`; `MISSING · NOT_PROVIDED` | 12px / 400; warna sama | PASS |
| Badge `Cek` | terisi, 12px | 37.34×20px; 12px / 500; amber; border 0; radius 999px | sama | PASS |
| Status processing | badge terisi, tanpa border gelap | merah lembut `rgb(253, 236, 236)`; border 0; 12px / 500 | sama | PASS |
| Organik/Iklan | kolom terpisah; badge sumber tidak di sel nilai | sel metrik terpisah, tanpa source badge pada nilai | blok metrik terpisah satu kolom per distribution | PASS |
| Kartu mobile | tidak saling tumpang tindih | N/A | blok `.batch-cell` tidak beririsan; setiap blok dan teks tidak overflow | PASS |

Probe: `CIC_BATCH_EVIDENCE_DIR=docs/tracking/evidence CIC_E2E_STAGING_URL=http://127.0.0.1:3202 mise exec node@22.18.0 -- npx playwright test tests/e2e/lb4-1-batch.spec.ts --grep 'AC-07 readability|AC-08 Batch panels' --reporter=list`; kedua test lulus pada build produksi lokal. `AC-08` juga mengukur computed style dan overlap kartu di 1440×900 serta 390×844.

## Gambar

| Desktop 1440×900 | Mobile 390×844 |
|---|---|
| `docs/tracking/evidence/BATCH_PRESENTATION_1440x900.png` | `docs/tracking/evidence/BATCH_PRESENTATION_390x844.png` |

## Selisih tersisa

- Tidak ada selisih terhadap kriteria Batch yang terukur.
- Batch 8 integrated, staging, provider, production, dan walkthrough manusia: NOT RUN.
