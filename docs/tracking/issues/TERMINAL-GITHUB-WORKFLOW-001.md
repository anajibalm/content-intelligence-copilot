<!-- cic-tracking-key:TERMINAL-GITHUB-WORKFLOW-001 -->
# TERMINAL-GITHUB-WORKFLOW-001 — Reusable terminal GitHub workflow

## Scope
Implement reusable CIC terminal commands for Kanban reads/mutations, isolated task worktrees, verification/commit/push/PR delivery, and explicit owner-gated merge.

## Status
Review. PR #24 is open draft and stacked on baseline PR #22. Lifecycle review corrections are delivered on `feat/terminal-github-workflow`; baseline merge remains owner-controlled.

## Acceptance
- Kanban commands use repository identity and custom `Tracking Status` with pagination and readback.
- Task setup creates/resumes an issue-bound isolated worktree from verified baseline/master base.
- Delivery verifies exact paths, local gates, committed HEAD, PR base/head, latest CIC CI, and Review transition.
- Done and merge reject pre-merge, wrong-base, unrelated, incomplete, or unverified delivery; merged retry reconciles safely.
- State is atomic, ignored, locked, and not committed.
- Lifecycle regression covers nested untracked files, renames, expected-error lock cleanup, retry idempotency, and foreign PR rejection before merge/Project mutation.

## Dependency
- Baseline: PR #22 / issue #21. PR #22 remains OPEN on `fix/ci-governance-baseline`; automation PR #24 remains stacked/draft until baseline merges.

## Evidence
- PR: https://github.com/anajibalm/content-intelligence-copilot/pull/24
- Branch: `feat/terminal-github-workflow`
- Current head: `004f4214fc520ed5fa2e4a5cc96ba0fcba9ea21d`
- Targeted lifecycle suite: 12/12 PASS; full suite: 31/31 PASS on Node `22.18.0`.
- Local gates: lint, typecheck, fixture validation, build, and diff check PASS.
- CI: https://github.com/anajibalm/content-intelligence-copilot/actions/runs/37407347911 — PASS; Build & Test job `112087724896`
- Project item: `PVTI_lAHOAz65Rs4Blun5zg-pUZg`

## Limits
S3 #4 and S5 #6 remain outside this task. Data Contract v0.2 remains candidate. Merge requires baseline merge and owner instruction for current approved HEAD; no merge performed.
