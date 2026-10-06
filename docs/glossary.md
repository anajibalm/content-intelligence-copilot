# Glossary

Kamus istilah dan kode Content Intelligence Copilot.

## Istilah Produk

| Istilah | Arti |
|---------|------|
| Content Intelligence | Analisis performa dan pola konten digital berbasis evidence |
| Copilot | Asisten analyst; AI mengusulkan, analyst memvalidasi/mengedit/menolak |
| Agency / brand analyst | Primary operator MVP |
| Organic | Observasi konten tanpa paid promotion |
| Paid | Observasi konten dengan paid promotion |
| Metric Snapshot | Snapshot metrik pada waktu tertentu; Organic/Paid tetap terpisah |
| Evidence | Bukti yang mendukung klaim: OBSERVED/DERIVED/EXTRACTED/INFERRED |
| OBSERVED | Fakta langsung dari source |
| DERIVED | Perhitungan deterministik dari fakta |
| EXTRACTED | Interpretasi AI dari konten |
| INFERRED | Hipotesis/reasoning yang harus ditinjau analyst |
| Controlled Compare | Perbandingan dengan basis dan variabel yang dinyatakan |
| Donor | Source code/repo referensi; tidak menentukan domain CIC |
| MVP Contract | Kontrak produk MVP yang frozen |
| Data Contract Candidate | Candidate implementasi; belum frozen |
| Spike | Eksperimen validasi teknis; bukan bukti runtime aplikasi |

## Istilah Teknis

| Istilah | Arti |
|---------|------|
| Fixture-backed UI | UI current yang membaca fixture JSON, bukan runtime DB/acquisition |
| Supabase | Boundary PostgreSQL aplikasi; belum tersambung ke current UI |
| Disposable PostgreSQL | Database sementara untuk migration/seed/probe verification |
| yt-dlp | Provider path yang live-proven pada Python spike |
| TikHub / Apify | Credential-gated adapters; belum live-verified |
| Worker | Background process; persistent worker belum tersedia |
| tsbuildinfo | TypeScript build cache; jangan di-commit |

## Kode Task dan Status

| Kode | Arti |
|------|------|
| S0, S1, S2, ... S13 | Slice/tahap implementasi |
| A0 | Architecture retrospective |
| C1 | Candidate contract decision |
| E1 | Evidence/receipt durability |
| R1 | Application runtime integration |
| BASELINE-CI-GOV-001 | CI/governance baseline checkpoint |
| Backlog / Ready / In Progress / Review / Blocked / Done | Custom Project `Tracking Status` |

## Kontrak

| Kode | Arti |
|------|------|
| MVP_CONTRACT_v0.1_FROZEN | Kontrak produk MVP frozen |
| DONOR_MAP_FROZEN_v0.1 | Boundary donor frozen |
| DATA_CONTRACT_v0.2_CANDIDATE | Candidate contract data, belum frozen |

## Referensi

- `AGENTS.md`
- `VIBE_CODING_PROTOCOL.md`
- `docs/contracts/`
- `docs/decisions/`
- `docs/tracking/`
