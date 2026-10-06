# GitHub Tracking

Tracking setup dan execution status untuk `Content Intelligence Copilot`.

## Authority

- Product scope: `docs/contracts/MVP_CONTRACT_v0.1_FROZEN.md`
- Donor boundary: `docs/contracts/DONOR_MAP_FROZEN_v0.1.md`
- Candidate discovery: `docs/contracts/DATA_CONTRACT_v0.2_CANDIDATE.md` dan `docs/decisions/DISCOVERY_DELTA_2026-10-05.md`
- Execution evidence: `docs/decisions/`
- Architecture: `docs/architecture/README.md`

GitHub Issues dan Project memegang execution status. Contracts dan decisions tetap memegang behavioral authority.

## Current truth

- S0: PASS.
- S1: PASS pada disposable PostgreSQL; bukan application runtime DB.
- S2 deterministic adapter: PASS, 12/12; yt-dlp spike 10/10; belum proof Next.js runtime wiring.
- `app/page.tsx`: fixture-backed.
- Persistent worker: implemented and staged; production durability remains unproven.
- S3/S4/S5/S6: reviewable checkpoints recorded in evidence receipts.
- S7 #8: Review; pair/group/batch API and persistence acceptance passes; browser proof partial because local browser automation is unavailable.
- R1 #16: Blocked because runtime DB/API/durable handoff evidence remains incomplete for production.
- E1 #18: Done; sanitized receipt durable with source SHA-256, date, runner, and without media/provider payload.
- `BASELINE-CI-GOV-001` #21: Review, Project custom Tracking Status; delivery through feature branch/PR.
- v0.2: implementation candidate, not frozen.

## GitHub target

- Repository: `https://github.com/anajibalm/content-intelligence-copilot`
- Default branch: `master`.
- Project: `https://github.com/users/anajibalm/projects/1`.
- Custom `Tracking Status`: `Backlog`, `Ready`, `In Progress`, `Review`, `Blocked`, `Done`.
- Labels: `priority:p0/p1/p2`, `area:*`, `type:*`, `status:ready/review/blocked`.

## Operating workflow

1. Reuse or create issue by stable marker.
2. Set custom Project `Tracking Status` to `In Progress` before coding.
3. Preserve unrelated changes; stage exact paths only.
4. Run local verification on exact commit.
5. Push feature branch with upstream; do not push `master` or force-push.
6. Open/reuse PR to `master`, attach issue and evidence.
7. Set `Review` after implementation and evidence are complete.
8. Owner reviews and merges; do not claim merged before actual merge.

## Terminal workflow

Reusable terminal commands, isolated worktrees, exact-path delivery, CI gates, retry rules, and owner-gated merge boundary: [`TERMINAL_WORKFLOW.md`](TERMINAL_WORKFLOW.md).

## Files

- `github-issues.manifest.json`: stable-key mapping, status, dependencies, IDs, sync results.
- `PLAN_COVERAGE.md`: story, test matrix, handoffs, failures, gates.
- `issues/`: safe issue bodies with stable markers.
- `evidence/`: sanitized historical summaries only.
- `../decisions/`: actual checkpoint decisions and evidence.
- `resume.md`: idempotent read/repair commands.

No source code, media, provider payload, secrets, or `.env` content belongs in tracking issues.
