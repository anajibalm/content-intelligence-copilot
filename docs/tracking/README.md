# GitHub Tracking Checkpoint

Tracking setup for `Content Intelligence Copilot`.

## Authority

- Product scope: `docs/contracts/MVP_CONTRACT_v0.1_FROZEN.md`
- Donor boundary: `docs/contracts/DONOR_MAP_FROZEN_v0.1.md`
- Candidate discovery changes: `docs/contracts/DATA_CONTRACT_v0.2_CANDIDATE.md` and `docs/decisions/DISCOVERY_DELTA_2026-10-05.md`
- Execution evidence: `docs/decisions/S0_S1_VERIFICATION.md`, `docs/decisions/S2_CHECKPOINT_2026-10-05.md`
- Architecture: `docs/architecture/README.md`

GitHub Issues and Projects hold execution status. Source contracts and decisions remain behavioral authority.

## Current truth

- S0: PASS.
- S1: PASS in disposable Docker PostgreSQL only; not application runtime DB.
- S2 deterministic adapters: PASS; tests 12/12.
- S2 live gate: PASS, Python spike + yt-dlp 10/10, not proof of Next.js runtime wiring.
- `app/page.tsx`: fixture-backed.
- `lib/acquisition/`: implemented and tested; not wired to Next.js runtime.
- Persistent processing worker: absent.
- S3/S5: not started.
- v0.2: implementation candidate, not frozen.
- Architecture automated checks and browser evidence: PASS; human perceptual review remains pending.

## GitHub target

- Repository: `https://github.com/anajibalm/content-intelligence-copilot`
- Existing repository visibility: public; unchanged by this setup.
- Default branch: `master`.
- Project: `Content Intelligence Copilot MVP`, private.
 - Views: `Core MVP board`, `Dependency verification`, `P1 P2 backlog`, and `Blocked work`.

## Operating workflow

1. Pick issue marked `Ready`.
2. Set project `Status` to `In Progress` before coding.
3. Keep acceptance checklist and verification evidence in issue.
4. Set `Review` when implementation is complete and evidence is attached.
5. Close issue and set `Done` only after acceptance is proven.
6. Link future PRs to issue; this checkpoint does not commit or push source.

## Files

- `github-issues.manifest.json`: stable-key mapping, status, dependencies, IDs, and sync results.
- `PLAN_COVERAGE.md`: story, test matrix, handoffs, failures, and gates.
- `issues/`: safe issue bodies with stable markers.
- `../decisions/GITHUB_TRACKING_CHECKPOINT_2026-10-05.md`: actual setup verdict and gaps.
- `resume.md`: idempotent read/repair commands.

No source code, media, provider payload, secrets, or `.env` content belongs in tracking issues.
