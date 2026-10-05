# Terminal GitHub Workflow

Reusable CIC workflow for issue-driven work. GitHub Issues and Project hold execution status; contracts and decisions remain behavioral authority.

## Commands

Run from repository root:

```bash
scripts/kanban.sh list
scripts/kanban.sh ready
scripts/kanban.sh import 23 [--dry-run]
scripts/kanban.sh pick 23 [--dry-run]
scripts/kanban.sh review 23 [--dry-run]
scripts/kanban.sh blocked 23 --reason "dependency pending" [--dry-run]
scripts/kanban.sh done 23 --pr 24 [--dry-run]
scripts/task.sh 23 [--dry-run]
scripts/task-done.sh 23 --paths path/to/file,path/to/test --commit-message "feat(scope): describe behavior" --body-file /tmp/task-23-pr.md [--title "PR title"]
scripts/task-merge.sh 23 --pr 24 --approved-head SHA [--dry-run]
```

Issue arguments accept CIC issue numbers or full URLs. URL inputs must belong to `anajibalm/content-intelligence-copilot`. Project reads use custom `Tracking Status`, not built-in `Status`:

`Backlog`, `Ready`, `In Progress`, `Review`, `Blocked`, `Done`.

## Task isolation and retry

`task.sh` creates or resumes issue-bound worktree `../content-intelligence-copilot-task-<issue>` and branch `task/<issue>`. It validates an existing worktree before reuse, writes non-committed state under `.cic-terminal-workflow/`, then moves issue to `In Progress` only after worktree setup succeeds. Main working directory and index remain separate.

`task-done.sh` runs `npm ci`, lint, typecheck, tests, fixture validation, build, whitespace checks, stages only explicit paths, commits, pushes feature branch, creates or reuses PR, waits for checks, and moves issue to `Review`. It never merges. PRs stack on baseline PR #22 while baseline remains open; after baseline merges, new delivery targets `master`.


Write commands require repository origin, non-base branch, issue-bound state, isolated worktree, and stable task lock. `task-done.sh` requires `--body-file`; body must describe actual Problem/Changes and Verification/Acceptance, and must not promise closure for partial work.
Retries read Git/GitHub state first. Existing Project items, worktrees, open PRs, and state files are reused only after identity/base checks. Failed auth, network, verification, commit, or push commands stop with non-success output.

## Merge boundary

Owner review is required. `task-merge.sh` requires explicit `--approved-head`; this flag is a technical exact-HEAD guard, not owner approval. Command rereads PR state, requires open PR with `master` base and exact approved head, requires green checks, uses squash merge with `--match-head-commit`, then verifies `MERGED`, `mergedAt`, base, issue closure, and Project `Done` readback. Merge queues or changed HEAD stop without claiming success.

`done` is verification-only: merged PR, correct base, linked issue, and closed issue are required. CI green alone is insufficient.

## CI and evidence

Local delivery follows repository gates: lint, typecheck, test, fixture validation, build, and `git diff --check`. PR checks must be present and all report `bucket=pass`; pending, failed, cancelled, timeout, or zero checks stop delivery. Evidence belongs to exact PR HEAD. No secrets, provider payloads, transient URLs, or media enter state, issues, or Git.
