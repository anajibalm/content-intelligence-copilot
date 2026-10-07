# Content Intelligence Copilot

Canonical product behavior lives in `docs/contracts/MVP_CONTRACT_v0.1_FROZEN.md`; donor boundaries live in `docs/contracts/DONOR_MAP_FROZEN_v0.1.md`. Read both before changing domain logic.

- Keep Organic and Paid in `metric_snapshot`; never add distribution to `content`.
- Keep OBSERVED, DERIVED, EXTRACTED, and INFERRED evidence distinct.
- Preserve AI originals when recording human corrections.
- Do not store secrets, transient CDN URLs, or downloaded media in Git.
- Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` before declaring a story complete.

- MVP execution/review rules: `VIBE_CODING_PROTOCOL.md` §5. Read before coding; keep frozen domain contracts authoritative.

## Bahasa laporan

- Gunakan Bahasa Indonesia untuk progress, checkpoint, ringkasan review, dan penjelasan kepada owner. Jangan beralih ke Bahasa Vietnam atau bahasa lain kecuali owner meminta.
- Pertahankan identifier, command, pesan error asli, dan istilah teknis. Aturan laporan ini tidak mengubah bahasa produk/deck yang disepakati dalam contract.

## Memori Hindsight dan Obsidian

Repo adalah sumber kebenaran untuk status dan prosedur. Memori hanya menyimpan konteks yang repo tidak dapat katakan; memori tidak mengganti kode, contract, Git, receipt, issue, atau Project aktual.

### Hindsight

- Gunakan bank `projects-content-intelligence-copilot`; satu bank per repo, jangan campur dengan repo lain. Pakai integrasi Hindsight yang sudah tersedia, jangan membuat sistem memori baru.
- **RECALL:** di awal tugas, lakukan 1–2 pencarian spesifik berdasarkan nama fitur, error, atau keputusan yang relevan. Hindari kata umum. Gunakan recall untuk lookup, bukan reflect atau sintesis LLM.
- Jika memori bertentangan dengan kode, dokumen, atau Git, ikuti repo dan laporkan pertentangan kepada owner; memori bisa usang.
- **RETAIN:** paling banyak satu ringkasan per tugas selesai/checkpoint yang ditutup. Simpan hanya keputusan beserta alasan, jebakan baru, aturan mesin/lingkungan, atau pekerjaan belum selesai yang membutuhkan konteks di luar repo. Jangan retain jika tidak ada konteks baru yang layak disimpan.
- Tulis ringkasan mandiri dan padat: nama repo, tanggal, alasan, satu fakta per kalimat. Hindari kata ganti seperti "itu" atau "tadi". Retain memicu ekstraksi/konsolidasi LLM; jangan menjalankannya untuk setiap command, commit, atau koreksi kosmetik.
- Jangan simpan isi kode/berkas besar, status yang sudah ada di repo atau PR, percakapan mentah, API key, token, data pribadi, atau URL media sementara.
- **REFLECT:** jangan gunakan kecuali owner meminta atau tugas benar-benar memerlukan sintesis banyak memori. Untuk fakta tunggal, pakai recall.
- Jika integrasi gagal/tidak tersedia, laporkan gap konkret. Jangan mengklaim recall/retain berhasil atau membuat bank pengganti.

### Obsidian

- Gunakan note proyek yang sudah ada: `/home/anajibalm/Documents/Obsidian Vault/projects/content-intelligence-copilot.md`.
- Perbarui sekali per checkpoint dengan perjalanan proyek: keputusan dan alasan, jebakan/lingkungan, batas acceptance, blocker, dan langkah berikutnya. Tautkan PR/issue/receipt repo sebagai rujukan status; Obsidian bukan sumber status kedua.
- Verifikasi write/readback sebelum mengklaim pembaruan berhasil. Jangan membuat note duplikat bila path gagal; laporkan gap.
- Jangan simpan secrets, data pribadi, atau URL media sementara. Tidak perlu menyimpan setiap percakapan atau mengulang ringkasan yang sama.

### Aturan proses mesin

- Jangan kill proses 9router atau Hindsight.
- Sebelum menghentikan proses tugas lain, cari PID lewat `ss -ltnp`, periksa command dan parent PID, lalu pastikan proses tersebut milik tugas aktif. Jangan mematikan proses berdasarkan port saja; jika ownership tidak jelas, laporkan blocker.

<!-- bmad:context -->
<!-- Verified 2026-10-05 against the initial repository baseline. -->
<!-- /bmad:context -->

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
