# Baseline CI and Governance — 2026-10-05

## Verdict

**PARTIAL until PR exact-head CI completes.** Local correction is implemented and verified. GitHub delivery and Obsidian note are in progress; merge remains pending owner review.

## Authority

1. Owner instruction in `OMP_CIC_BASELINE_FIX_PUSH_OBSIDIAN_PROMPT.md` authorizes this correction, scoped commits, feature push, PR, and Obsidian write. It does not authorize merge.
2. `docs/contracts/MVP_CONTRACT_v0.1_FROZEN.md` defines frozen product behavior.
3. `docs/contracts/DONOR_MAP_FROZEN_v0.1.md` defines donor boundaries.
4. `docs/contracts/DATA_CONTRACT_v0.2_CANDIDATE.md` is implementation candidate, not frozen.
5. `docs/decisions/` records actual approval/evidence status.
6. `docs/source/IMPLEMENTATION_PLAN_v0.1.md` translates scope into stories; it does not create product decisions.
7. GitHub Issues/Project manage execution status; manifest and local issue bodies map/resume tracking.
8. `AGENTS.md`, `VIBE_CODING_PROTOCOL.md`, and `CONTRIBUTING.md` govern workflow without replacing domain invariants.

## Baseline

- Base/source HEAD: `2af60f97e6d811621e6d01d52ed15c30f59453c0` on `master`.
- Branch: `fix/ci-governance-baseline`.
- Original CI failure: Node.js 20 executed `npm test`, while `tests/unit/acquisition.test.mjs` imported `.ts` directly and failed with `ERR_UNKNOWN_FILE_EXTENSION`.
- Local Node.js `22.18.0` executes direct TypeScript imports through native type stripping. CI now reads `.node-version`; `package.json` requires `>=22.18.0`.
- `npm ci` was run after dependency metadata update.

## Corrections

- `.node-version` pins `22.18.0`.
- `.github/workflows/ci.yml` uses `node-version-file` and preserves lint, typecheck, test, fixture validation, and build steps.
- `VIBE_CODING_PROTOCOL.md` uses actual CIC paths, custom Project `Tracking Status`, snapshot/upstream rules that avoid documentation self-loop, owner scope approval, feature-branch delivery, and correct multiline-body guidance.
- `README.md`, `CONTRIBUTING.md`, `docs/setup.md`, and `docs/faq-agent.md` state agency/brand analyst scope, evidence-backed analyst-reviewed hypotheses, fixture-backed UI, disposable DB verification boundary, yt-dlp proof, candidate contract status, and pending S3/S5/R1 scope.
- `docs/architecture.md` and `docs/data-contract.md` provide short entrypoints without duplicating authoritative bodies.
- Issue templates use actual repository labels.
- E1 receipt records source summary SHA-256 without copying media, provider payloads, credentials, or transient URLs.
- Manifest records baseline stable key `BASELINE-CI-GOV-001` and issue #21.

## Local verification

Run on Node.js `22.18.0`:

- `npm ci` — PASS.
- `npm run lint` — PASS.
- `npm run typecheck` — PASS.
- `npm test` — PASS, 19/19.
- `npm run validate:fixtures` — PASS.
- `npm run build` — PASS.
- `git diff --check` — PASS.
- Manifest parse/dependency-cycle check — PASS, 20 existing items; baseline stored as checkpoint metadata.

## Tracking state

- Baseline issue: https://github.com/anajibalm/content-intelligence-copilot/issues/21.
- Project: https://github.com/users/anajibalm/projects/1.
- Issue label moved to `status:review`; custom Project `Tracking Status` set to `In Progress`.
- S3 #4 remains Ready and is next implementation checkpoint.
- S5 #6 remains Ready and separate.
- R1 #16 remains Blocked; no runtime handoff implemented here.
- E1 #18 remains Ready; historical receipt is now durable with source hash.
- v0.2 remains candidate.

## Delivery receipt

- PR: pending creation.
- Final pushed SHA: pending push.
- Exact-head CI: pending PR push.
- Obsidian note: `/home/anajibalm/Documents/Obsidian Vault/projects/content-intelligence-copilot.md`; checkpoint content read back successfully.
- Merge: pending owner review; no merge performed.
