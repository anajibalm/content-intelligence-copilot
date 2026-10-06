# FAQ Agent

Pertanyaan berulang tentang Content Intelligence Copilot.

## Setup & Environment

### Q: Bagaimana cara run project?
A: Pastikan Node.js `22.18.0` dari `.node-version`, jalankan `npm ci`, lalu lihat `docs/setup.md`.

### Q: Apa Node version yang dibutuhkan?
A: Node.js `22.18.0`. CI membaca `.node-version` agar direct TypeScript tests kompatibel.

### Q: Bagaimana cara run test?
A:

    npm run lint
    npm run typecheck
    npm test
    npm run validate:fixtures
    npm run build

### Q: Apakah Supabase wajib untuk test/UI sekarang?
A: Tidak. Current UI fixture-backed dan tests memakai fixtures/fakes. Supabase/PostgreSQL adalah application boundary yang belum tersambung; S1 database proof memakai disposable PostgreSQL.

### Q: Apa provider acquisition yang live-proven?
A: yt-dlp pada Python spike. TikHub dan Apify tetap credential-gated dan belum live-verified.

## Task & Workflow

### Q: Task mana yang harus dikerjakan dulu?
A: Cek `docs/tracking/github-issues.manifest.json`, issue stable marker, `PLAN_COVERAGE.md`, dan Project custom `Tracking Status`.

### Q: Apa status Project yang valid?
A: `Backlog`, `Ready`, `In Progress`, `Review`, `Blocked`, `Done`. Labels aktual memakai `priority:p0/p1/p2`, `area:*`, `type:*`, dan `status:ready/review/blocked`.

### Q: Apa arti S0, S1, S2, ... S13?
A: Slice/tahap implementasi. Lihat `docs/glossary.md` dan `docs/tracking/PLAN_COVERAGE.md`.

### Q: Kapan boleh merge?
A: Setelah owner approval, exact-head CI green, acceptance terbukti, dan PR siap review. Jangan klaim merged sebelum merge aktual.

## Arsitektur & Data

### Q: Apa itu `metric_snapshot`?
A: Snapshot metrik. Organic dan Paid hidup di sini; jangan menaruh `distribution` di `content`.

### Q: Apa itu OBSERVED, DERIVED, EXTRACTED, INFERRED?
A: Evidence ontology canonical. Keempat layer tidak boleh digabung diam-diam.

### Q: Apa yang belum berjalan?
A: Current UI masih fixture-backed; S3 actual-media processing, S4 extraction, S5 metrics/KPI/ranking, R1 runtime integration, dan future Pattern Memory belum boleh diklaim selesai.

## Git & Repo

### Q: Branch mana yang aktif?
A: `master` adalah default. Pekerjaan delivery memakai feature branch dan PR; jangan push langsung ke `master`.

### Q: Apa yang tidak boleh di-commit?
A: `.env`, `node_modules/`, `.next/`, `*.tsbuildinfo`, `_bmad/`, `_bmad-output/`, secrets, provider raw payloads, transient CDN URLs, dan downloaded media.

### Q: Apa yang harus dicek sebelum commit/push?
A:

    npm run lint
    npm run typecheck
    npm test
    npm run validate:fixtures
    npm run build
    git diff --check

## Referensi

- `AGENTS.md`
- `CONTRIBUTING.md`
- `VIBE_CODING_PROTOCOL.md`
- `README.md`
- `docs/contracts/`
- `docs/decisions/`
- `docs/tracking/`
