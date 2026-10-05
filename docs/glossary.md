# Glossary

Kamus istilah dan kode untuk Content Intelligence Copilot. Kalau agent nanya hal yang sama dua kali, tambahkan ke sini.

## Istilah Produk

| Istilah | Arti |
|---------|------|
| Content Intelligence | Analisis performa & pola konten digital |
| Copilot | Asisten untuk membantu keputusan konten |
| Organic | Konten yang dipublikasikan tanpa paid promotion |
| Paid | Konten dengan paid promotion (ads) |
| Metric Snapshot | Snapshot metrik pada waktu tertentu |
| Evidence | Bukti yang mendukung klaim (OBSERVED/DERIVED/EXTRACTED/INFERRED) |
| OBSERVED | Evidence dari pengamatan langsung |
| DERIVED | Evidence dari perhitungan/derivasi |
| EXTRACTED | Evidence dari ekstraksi data (scraping) |
| INFERRED | Evidence dari inferensi AI |
| Donor | Source code/repo yang jadi referensi |
| Donor Map | Pemetaan boundary donor |
| MVP Contract | Kontrak produk MVP yang di-frozen |
| Spike | Eksperimen untuk validasi teknis |

## Istilah Teknis

| Istilah | Arti |
|---------|------|
| Next.js | Framework React dengan App Router |
| Supabase | Backend-as-a-Service (PostgreSQL + Auth + Storage) |
| RLS | Row Level Security (Supabase) |
| TikHub | API untuk data TikTok |
| Apify | Platform scraping |
| Whisper | Model AI untuk transkripsi audio |
| Worker | Background process untuk task async |
| Fixture | Data test statis |
| tsbuildinfo | TypeScript build cache (jangan di-commit) |

## Kode Task (dari `docs/tracking/issues/`)

| Kode | Arti |
|------|------|
| S0, S1, S2, ... S13 | Slice/tahap implementasi |
| A0 | Tahap awal (pre-slice) |
| C1 | Contract/checkpoint |
| E1 | Evidence/verifikasi |
| P1-ADDITIONS | Prioritas 1 — penambahan |
| P2-BACKLOG | Prioritas 2 — backlog |
| R1 | Review/refactor |

## Kode Contract

| Kode | Arti |
|------|------|
| MVP_CONTRACT_v0.1_FROZEN | Kontrak produk MVP (frozen) |
| DONOR_MAP_FROZEN_v0.1 | Pemetaan donor (frozen) |
| DATA_CONTRACT_v0.2_CANDIDATE | Kandidat kontrak data v0.2 |

## Kode Prioritas (Umum)

| Kode | Arti |
|------|------|
| P0 | Urgent — kerjakan sekarang |
| P1 | High — prioritas tinggi |
| P2 | Medium — normal |
| P3 | Low — nice to have |

## Referensi

- `AGENTS.md` — aturan domain
- `docs/source/` — PRD, implementation plan
- `docs/contracts/` — MVP contract, donor map, data contract
- `docs/tracking/` — issues manifest, plan coverage, resume
