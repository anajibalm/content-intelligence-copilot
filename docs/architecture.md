# Architecture

Current and target architecture views live in [`architecture/README.md`](architecture/README.md).

- Current view: `architecture/current-through-s2.architecture.json` and delivered HTML.
- Target view: `architecture/target-mvp.architecture.json` and delivered HTML.
- Current UI remains fixture-backed.
- S2 acquisition adapters and yt-dlp spike are tested separately from Next.js runtime wiring.
- S1 PostgreSQL verification is disposable; it is not application runtime DB.
- S3 processing, S4 extraction, S5 metrics/KPI/ranking, R1 runtime integration, and S8–S10 workflow remain pending.

Architecture README is navigation only. Detailed truth boundaries and source references remain authoritative in `docs/architecture/README.md`.
