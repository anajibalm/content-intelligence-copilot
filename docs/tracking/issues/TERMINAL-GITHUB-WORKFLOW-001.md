<!-- cic-tracking-key:TERMINAL-GITHUB-WORKFLOW-001 -->
# TERMINAL-GITHUB-WORKFLOW-001 — Reusable terminal GitHub workflow

## Scope
Implement reusable CIC terminal commands for Kanban reads/mutations, isolated task worktrees, verification/commit/push/PR delivery, and explicit owner-gated merge.

## Status
Review. PR #24 is open draft and stacked on baseline PR #22. Corrections from review are being delivered on `feat/terminal-github-workflow`; baseline merge remains owner-controlled.

## Acceptance
- Kanban commands use repository identity and custom `Tracking Status` with pagination and readback.
- Task setup creates/resumes an issue-bound isolated worktree from verified baseline/master base.
- Delivery verifies exact paths, local gates, committed HEAD, PR base/head, latest CIC CI, and Review transition.
- Done and merge reject pre-merge, wrong-base, unrelated, incomplete, or unverified delivery; merged retry reconciles safely.
- State is atomic, ignored, locked, and not committed.

## Dependency
- Baseline: PR #22 / issue #21. Automation PR remains stacked/draft until baseline merges.

## Evidence
- PR: https://github.com/anajibalm/content-intelligence-copilot/pull/24
- Branch: `feat/terminal-github-workflow`
- Current head: `99ab389092e772d2bcdcd233a93c0252c86ffaf0`
- Previous CI: https://github.com/anajibalm/content-intelligence-copilot/actions/runs/37324829775
- Project item: `PVTI_lAHOAz65Rs4Blun5zg-pUZg`

## Limits
S3 #4 and S5 #6 remain outside this task. Data Contract v0.2 remains candidate. Merge requires owner instruction for current approved HEAD.
