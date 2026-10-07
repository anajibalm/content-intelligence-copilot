# S13 human evaluation packet

Status: `PENDING`. Packet berisi 10 URL publik Barakat nyata. Tidak berisi AI answer, reviewed answer, confidence, atau verdict model.

## Field schema

Isi 13 field fingerprint berikut untuk setiap video:

`topic`, `format`, `hook_type`, `hook_subject`, `talent_type`, `talent_familiarity`, `opening_style`, `pacing`, `narrative_structure`, `emotional_trigger`, `tension_type`, `product_placement`, `cta_type`.

## Cara pengisian

1. Buka `source_url` pada baris video.
2. Tonton media penuh, lalu isi `human_labels_json` sebagai JSON object dengan tepat 13 key field schema. Gunakan string label observasi manusia; jangan salin output AI.
3. Isi `verdicts_json` sebagai JSON object dengan key sama dan nilai salah satu `exact`, `acceptable`, `incorrect`, atau `uncertain` hanya setelah pembanding resmi tersedia. Jika belum ada pembanding, gunakan `uncertain` dan jelaskan alasan di catatan eksternal evaluator.
4. Isi `reviewer` dan `labelled_at_utc` setelah satu pass selesai.
5. Jalankan stability check: ulangi labeling 10 video setelah jeda, tanpa melihat pass pertama. Isi `stability_run_2_labels_json`, `stability_verdicts_json`, `stability_reviewer`, dan `stability_labelled_at_utc`.
6. Stability per field stabil bila nilai pass pertama dan kedua sama; evaluator harus menyerahkan daftar field stabil/tidak stabil bersama CSV.

## Batas blind evaluation

- Evaluator membaca `source_url`, `content_id`, `external_post_id`, dan field schema saja.
- Evaluator tidak boleh membuka `fixtures/extraction.json`, `fixtures/golden-labels.json`, receipt extraction, AI review panel, atau output provider sebelum pass pertama dan kedua selesai.
- Jangan isi kolom dengan AI original atau reviewed value.
- Satu baris mewakili satu video. JSON object harus valid, tanpa trailing comma.
- Setelah selesai, kembalikan CSV asli dengan kolom source tidak berubah dan kolom label terisi. Sertakan nama evaluator, timestamp UTC, dan provenance penyimpanan. Jangan commit media atau secret.

## Acceptance evidence

Required: 10/10 video rows labelled, 13/13 field keys per row, reviewer/timestamp per pass, verdict per field, stability second pass, stable/unstable field summary, dan provenance evaluator. Actual blind human evaluation tetap `PENDING` sampai packet terisi dan diverifikasi owner.
