# Content Intelligence Copilot

Canonical product behavior lives in `docs/contracts/MVP_CONTRACT_v0.1_FROZEN.md`; donor boundaries live in `docs/contracts/DONOR_MAP_FROZEN_v0.1.md`. Read both before changing domain logic.

- Keep Organic and Paid in `metric_snapshot`; never add distribution to `content`.
- Keep OBSERVED, DERIVED, EXTRACTED, and INFERRED evidence distinct.
- Preserve AI originals when recording human corrections.
- Do not store secrets, transient CDN URLs, or downloaded media in Git.
- Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` before declaring a story complete.

- Terminal GitHub workflow contract: `docs/tracking/TERMINAL_WORKFLOW.md`.

<!-- bmad:context -->
<!-- Verified 2026-10-05 against the initial repository baseline. -->
<!-- /bmad:context -->
