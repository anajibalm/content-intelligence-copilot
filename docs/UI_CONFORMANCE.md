# UI Conformance

Sumber aturan visual semua halaman: Batch, Library, Compare, Review. Tunduk pada AGENTS.md, VIBE_CODING_PROTOCOL.md, dan frozen contract. Aturan diukur mesin; laporan berisi jumlah pelanggaran per aturan, bukan kata PASS.

## LINGKUP
- Halaman × viewport: 390×844, 768×1024, 1024×768, 1440×900.
- Route-mocked synthetic, build produksi, Node sesuai .node-version, port kosong, server sebagai service bernama (poll HTTP readiness; jangan menunggu server exit). Menghentikan proses: ikuti AGENTS.md (ss -ltnp, periksa command dan parent PID, jangan berdasarkan port saja, jangan menyentuh 9router atau Hindsight).
- Fixture wajib mencakup: baris sukses, gagal, dan aktif; konten dengan dan tanpa bukti; perbandingan terpilih beserta hasilnya; antrean hipotesis dengan detail dan bar keputusan.
- Referensi emas: halaman Review (sudah merged).

## ATURAN
Setiap pelanggaran dicatat: id aturan, halaman, viewport, selector, nilai terukur, nilai target.

R0 | Nilai computed token (judul panel, isi, meta, badge, disclosure) sama dengan elemen sepadan di Review, toleransi 0 | semua
T1 | Judul panel 15px/600 warna teks utama | semua
T2 | Isi dan metrik 13px/400; tak ada kontrol atau metrik di bawah 13px | semua
T3 | Meta 12px/400 muted; tak ada teks di bawah 12px | semua
B1 | Pill: tinggi 20px, 12px/500, radius 999, border 0, nowrap, satu baris | semua
B2 | Warna sesuai makna (tabel di bawah); teks label selalu ada | semua
D1 | Semua disclosure default tertutup | semua
D2 | Disclosure tertutup ≤48px, summary 15px/600, tanpa ruang kosong di bawah baris summary | semua
L1 | Tak ada scroll horizontal halaman | semua
L2 | Tak ada teks terpotong (scrollWidth ≤ clientWidth), kecuali pengecualian | semua
L3 | Interseksi bounding box antar elemen leaf (teks, badge, tombol) = 0, dalam kartu maupun lintas baris. Elemen sticky/fixed dikecualikan dari konten di bawahnya, tetapi konten terakhir tidak boleh tertutup bar | semua
L4 | Jarak dari bawah nav ke judul halaman ≤24px | 390, 768
L5 | Bar sticky ≤130px dan semua kontrolnya terlihat penuh | 390
L6 | Ruang kosong bawah dalam kontainer ≤ padding token + 8px | semua
L7 | Layout mengalir di lebar tengah: tak ada kolom <240px dan tak ada kartu terjepit (bukan hanya dua state) | 768, 1024
X1 | Pemisah " · " bersepasi di kedua sisi dan tidak memulai baris | semua
X2 | Tak ada enum mentah huruf kapital (pola [A-Z]{3,}(_[A-Z]+)*, mis. ORGANIC, SUCCEEDED) atau UUID/ID >24 karakter di tampilan utama; hanya di blok teknis | semua
X3 | Angka Indonesia, satu formatter dengan Review: desimal koma ("10,00%", "8,00 s"), ribuan titik ("1.000"). Hanya angka metrik; teks statement tersimpan tidak diubah | semua
X4 | Waktu "6 Okt 2026, 21.23 WIB"; ISO hanya di blok teknis | semua
X5 | Satu istilah per konsep; alias terlarang di tampilan utama: Rasio interaksi, pillar, talent class, talenta | semua
I1 | Area sentuh efektif ≥44×44px untuk setiap elemen interaktif. Ukuran visual boleh lebih kecil bila area diperluas dengan padding atau pseudo-element; diuji dengan elementFromPoint di empat sudut dan tengah kotak 44×44 yang berpusat pada elemen | 390, 768
I2 | Maksimal satu tombol primary (biru terisi) per viewport | semua
I3 | Fokus terlihat; disclosure dapat dioperasikan keyboard | semua
I4 | Axe: nol pelanggaran serious/critical. Axe bersih BUKAN bukti aksesibel penuh; cek keyboard manual tetap oleh owner | semua
I5 | Area sentuh elemen bersebelahan tidak beririsan dan berjarak ≥8px | 390, 768
I6 | Reveal hover-only (mis. Salin ID) punya padanan fokus-keyboard dan sentuh | semua
H1 | Nilai hilang tampil "–" atau "belum tersedia", tak pernah "0"; nol asli tampil "0". Diuji pada kasus fixture yang diketahui | semua

Pemetaan makna → warna (satu sumber di util presentasi; tes membaca util itu, tidak menduplikasi):
- Hijau: Selesai, Berhasil, Valid, Terkonfirmasi, Akuisisi Berhasil, Processing Berhasil
- Kuning: Diproses, Menunggu review, Cek, Perlu diperiksa, Belum diverifikasi
- Merah: Gagal, Ditolak, Rendah
- Abu: label netral dan hitungan
- Chip ontologi (Observasi, Perhitungan, Ekstraksi AI, Dugaan): pemetaan existing di Review

## PENGECUALIAN
Hanya di docs/UI_CONFORMANCE.exemptions.json: { rule, page, selector, alasan, owner_approved }. Agent tidak boleh mengisi owner_approved: true. Pengecualian tanpa persetujuan dihitung sebagai pelanggaran.

## LOOP (servo dengan batas)
Batas (anti-Goodhart): selama loop, agent TIDAK boleh mengubah ui-conformance.spec.ts, UI_CONFORMANCE.md, exemptions, melonggarkan atau menghapus tes lain, mengubah nilai fixture, atau mengubah semantik review/engine/DTO/query/schema. Hanya presentasi (komponen, CSS, formatter tampilan). Perubahan aturan = PR tersendiri yang disetujui owner.
Hakim: suite deterministik yang berjalan sebagai proses terpisah dari build. Klaim agent tidak dihitung.
1. Bootstrap sesuai VIBE_CODING_PROTOCOL §5. Branch baru dari origin/task/37, worktree baru.
2. Jalankan npm run test:ui-conformance. Keluaran: violations.json dan summary.md ke ~/cic-evidence/conformance/<branch>/. summary.md juga di-commit ke docs/tracking/evidence/; violations.json tidak di-commit.
3. Perbaiki pelanggaran per aturan lalu per halaman. Jalankan ulang.
4. Berhenti bila: nol pelanggaran; atau 5 iterasi; atau pelanggaran identik di dua iterasi berturut-turut. Untuk dua kondisi terakhir, laporkan sisa pelanggaran dan sebabnya, jangan klaim selesai.
5. Setelah nol: screenshot viewport (bukan full-page) 390 dan 1440, plus crop ukuran asli (DPR1) area yang berubah, ke ~/cic-evidence/<nomor-PR>/. Tanpa baseline pembanding, status visual INCONCLUSIVE, bukan PASS. Cetak path folder apa adanya.
6. Cek wajib repo: npm run lint, typecheck, npm test, validate:fixtures, build, git diff --check, full E2E pada HEAD yang tepat. Push, PR base task/37, tunggu CI. Satu receipt, update Obsidian (readback), Hindsight sesuai AGENTS.md.
7. Berhenti. Jangan merge. Done hanya oleh owner setelah merge dan acceptance.

## LAPORAN
Bahasa Indonesia, tanpa narasi: HEAD, base, nomor PR, CI run; tabel pelanggaran aturan × halaman × viewport (sebelum → sesudah); pengecualian yang diajukan; jumlah test per suite; path folder bukti; NOT RUN: Batch 8 integrated, staging, provider, production, walkthrough manusia.

## REVIEW OWNER
Satu kali per PR, pada hasil akhir. Hanya blocker correctness atau aturan di dokumen ini yang membuka revisi. Keberatan selera visual dicatat sebagai aturan baru (ID + cara mengukur) dan diterapkan lewat loop di PR berikutnya.

=== AKHIR ISI ===