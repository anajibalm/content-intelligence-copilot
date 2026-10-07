# Content Intelligence Copilot

Canonical product behavior lives in `docs/contracts/MVP_CONTRACT_v0.1_FROZEN.md`; donor boundaries live in `docs/contracts/DONOR_MAP_FROZEN_v0.1.md`. Read both before changing domain logic.

- Keep Organic and Paid in `metric_snapshot`; never add distribution to `content`.
- Keep OBSERVED, DERIVED, EXTRACTED, and INFERRED evidence distinct.
- Preserve AI originals when recording human corrections.
- Do not store secrets, transient CDN URLs, or downloaded media in Git.
- Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` before declaring a story complete.

- MVP execution/review rules: `VIBE_CODING_PROTOCOL.md` §5. Read before coding; keep frozen domain contracts authoritative.

<!-- bmad:context -->
<!-- Verified 2026-10-05 against the initial repository baseline. -->
<!-- /bmad:context -->

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
