# S13 human evaluation packet

Status: `PENDING`. Packet berisi 10 URL publik Barakat nyata. Semua kolom label masih kosong; packet tidak berisi AI answer, reviewed answer, confidence, atau verdict model.

## Field schema

CSV menyediakan satu kolom untuk setiap field berikut; evaluator tidak perlu menulis JSON:

`topic`, `format`, `hook_type`, `hook_subject`, `talent_type`, `talent_familiarity`, `opening_style`, `pacing`, `narrative_structure`, `emotional_trigger`, `tension_type`, `product_placement`, `cta_type`.

## Cara pengisian

1. Buka `source_url` pada baris video.
2. Tonton media penuh, lalu isi 13 kolom label dengan observasi manusia. Jika suatu field tidak dapat ditentukan, tulis `uncertain` dan alasannya di `notes`; jangan menebak atau menyalin output AI.
3. Isi identifier evaluator pada `reviewer` dan waktu UTC pada `labelled_at_utc` (contoh: `2026-10-08T09:00:00Z`).
4. Kembalikan CSV dengan empat kolom source dan urutan video tidak berubah. Simpan hasil blind beserta provenance dan hash berkas sebelum membuka output AI. Satu pass blind manusia cukup.

## Batas blind evaluation

- Evaluator membaca `source_url`, `content_id`, `external_post_id`, dan field schema saja.
- Pilih evaluator yang belum melihat output AI untuk 10 video ini. Jika output AI sudah terlihat, laporkan ke owner; jangan mengklaim hasil sebagai blind evaluation.
- Evaluator tidak boleh membuka `fixtures/extraction.json`, `fixtures/golden-labels.json`, receipt extraction, AI review panel, atau output provider sebelum label blind tersimpan.
- Jangan isi kolom dengan AI original atau reviewed value.
- Satu baris mewakili satu video. Pertahankan format CSV saat menyimpan dari spreadsheet. Jangan commit media atau secret.

## Perbandingan AI setelah label blind tersimpan

- Bandingkan output AI dengan label manusia yang sudah dibekukan; catat verdict `exact`, `acceptable`, `incorrect`, atau `uncertain` per field.
- Simpan verdict terpisah dari label blind, dengan rujukan video, extraction run, field, reviewer, dan alasan jika diperlukan. Jangan mengubah label blind agar cocok dengan AI.
- Jangan mengisi verdict sebelum output pembanding tersedia. Label `uncertain` manusia dan verdict `uncertain` perbandingan adalah dua hal berbeda.

## Stability ekstraksi model

Sesuai `docs/source/IMPLEMENTATION_PLAN_v0.1.md` §8, stability berarti mengulang **ekstraksi model pada sebagian video**, lalu membandingkan nilai per field. Stability bukan kewajiban manusia melabel ulang semua video dua kali.

- Gunakan input, provider/model, prompt, dan schema yang sama; catat identitas run serta field stabil/tidak stabil.
- Pakai run tersimpan yang sebanding jika sudah tersedia. Jika belum ada, bukti stability tetap `PENDING` sampai pengulangan terkontrol dilakukan; packet kosong bukan bukti stability.
- Pengiriman packet atau patch dokumentasi ini tidak menjalankan generation baru.

## Acceptance evidence

Required: label manusia untuk 10/10 video dan 13/13 field per video, reviewer/timestamp/provenance label blind, verdict per field setelah perbandingan AI, serta bukti stability ekstraksi model pada sebagian video. Laporkan ketidakpastian per field; jangan merangkum seluruh kualitas menjadi satu skor.

Actual blind human evaluation dan stability tetap `PENDING` sampai bukti masing-masing tersedia dan diverifikasi owner. Status S13 tetap `Blocked`; PR #33 belum merge. Keputusan C1 dan freeze v0.2 tetap terpisah dan pending.
