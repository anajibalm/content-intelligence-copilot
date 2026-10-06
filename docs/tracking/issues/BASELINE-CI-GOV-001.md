<!-- cic-tracking-key:BASELINE-CI-GOV-001 -->
# BASELINE-CI-GOV-001 — CI and governance baseline

## Scope
Align direct TypeScript test runtime, CI Node version, governance/documentation claims, tracking paths/statuses, GitHub delivery, and Obsidian checkpoint. S3/S4/S5 implementation remains outside this checkpoint.

## Status
In Progress. Owner-authorized baseline correction on `fix/ci-governance-baseline`; merge pending owner review.

## Acceptance
- CI uses maintained Node runtime that executes direct `.ts` imports and matches local/docs.
- Lint, typecheck, unit tests, fixture validation, build, and whitespace checks pass.
- Snapshot/upstream/heredoc/scope-approval rules do not create false stop loops.
- Authority, paths, labels, Project Tracking Status, and product/runtime claims match evidence.
- Feature branch PR is ready for owner review.
- Obsidian checkpoint is written and read back.

## Verification
See `docs/decisions/BASELINE_CI_GOVERNANCE_2026-10-05.md`, GitHub issue #21, PR, and exact-head CI run.

## Boundaries
- Frozen MVP and donor contracts unchanged.
- `DATA_CONTRACT_v0.2_CANDIDATE.md` remains candidate, not frozen.
- No direct push or merge to `master`.
- S3 #4 and S5 #6 remain separate Ready work.
- R1 #16 remains Blocked until runtime DB/API/durable handoff evidence exists.
- E1 #18 remains Ready; historical receipt hash is recorded without media/provider payload.
