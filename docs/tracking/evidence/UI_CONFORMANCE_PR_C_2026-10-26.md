# UI Conformance PR C — 2026-10-26

## Status

- Branch: `test/ui-conformance-pr-c`
- Base: `origin/task/37` at `5ca77d3339a1d14201f732b69987f45036c5ae22`
- Source HEAD before receipt commit: `31b1676`
- PR: [#55](https://github.com/anajibalm/content-intelligence-copilot/pull/55), base `task/37`, OPEN/unmerged
- Conformance: **NOT COMPLETE**; historical presentation iteration stopped at five iterations with residual violations
- Owner approval: not recorded
- Merge: not performed

## Commits

- `d4945c5 docs(ui): define conformance loop`
- `a54b6aa test(ui): add conformance suite`
- `a9b5fdb test(ui): stabilize conformance evaluator`
- `510d137 docs(ui): record conformance checkpoint`
- `4aec406 docs(ui): require green E2E loop iterations`
- `31b1676 Revert "style(ui): apply conformance presentation fixes"`

PR C now contains docs, suite, receipt, and the non-rewriting revert commit only. Presentation commit `e9d059e` is retained in history but its tree changes are absent from current PR C. No API, DTO, schema, DB, engine, provider, processing, or fixture-value change exists.

## Conformance loop

Evidence summaries and full violation JSON remain outside Git under `~/cic-evidence/conformance/`.

| Run | Target | Violations | Rule counts |
|---|---|---:|---|
| Iteration 1 | `origin/task-37` | 834 | B1 36; D1 4; D2 28; I1 54; I2 12; I4 32; I5 156; L2 13; L3 195; L7 6; R0 24; T1 58; T2 32; T3 164; X2 20 |
| Iteration 2 | `origin/task-37` | 367 | D1 4; I2 12; I4 12; I5 76; L2 13; L3 178; L7 6; T2 8; T3 38; X2 20 |
| Iteration 3 | `origin/task-37` | 474 | D2 8; I2 12; I5 77; L2 13; L3 276; L7 6; T2 16; T3 46; X2 20 |
| Iteration 4 | `origin/task-37` | 103 | I2 4; I5 22; L3 31; T3 26; X2 20 |
| Iteration 5 | `origin/task-37` | 103 | I2 4; I5 22; L3 31; T3 26; X2 20 |
| Corrected presentation build (historical `e9d059e`, not current tree) | `origin/task/37` | 47 | I5 22; L3 9; X2 16 |
| Target 2 | `origin/feat/library-compare-style` | 818 | B1 32; D1 4; D2 28; I1 54; I2 12; I4 40; I5 156; L2 13; L3 193; L7 6; R0 24; T1 48; T2 32; T3 156; X2 20 |

Historical corrected-build residuals remain on Review (`I5`, `X2`), Batch (`L3`, `X2`), and Compare (`X2`); these counts belong to reverted presentation commit `e9d059e`. No exemption was added; `docs/UI_CONFORMANCE.exemptions.json` remains `[]`.
## Exact HEAD validation — 2026-10-26

- Exact HEAD `858b9fac0cf4447c2243e8cbb8d3d6db80474bd0`; production build PASS.
- `npm run test:ui-conformance` against exact production build returned **834 violations**, not 47: B1 36; D1 4; D2 28; I1 54; I2 12; I4 32; I5 156; L2 13; L3 195; L7 6; R0 24; T1 58; T2 32; T3 164; X2 20.
- Fresh output: `~/cic-evidence/conformance/test-ui-conformance-pr-c-live/summary.md` and `violations.json`.
- Therefore current PR C conformance remains **NOT COMPLETE**. The 47-violation result is historical evidence from the reverted presentation tree and is not current-HEAD evidence.


## Required gates

| Command | Result |
|---|---|
| `mise exec node@22.18.0 -- npm run typecheck` | PASS |
| `mise exec node@22.18.0 -- npm run lint` | PASS, 0 errors / 4 existing warnings |
| `mise exec node@22.18.0 -- npm test` | PASS, 122/122 |
| `mise exec node@22.18.0 -- npm run validate:fixtures` | PASS |
| `mise exec node@22.18.0 -- npm run build` | PASS |
| `git diff --check` | PASS |
| `env -u CIC_E2E_STAGING_URL mise exec node@22.18.0 -- npm run test:e2e` | PASS, 53/53 |

The 13 failures listed in historical capture belonged to presentation commit `e9d059e`. After non-rewriting revert `31b1676`, all existing E2E passed. This proves presentation changes were the regression source; no E2E assertion was weakened or changed.

## Evidence paths

- `~/cic-evidence/conformance/test-ui-conformance-pr-c-iter1/summary.md`
- `~/cic-evidence/conformance/test-ui-conformance-pr-c-iter2/summary.md`
- `~/cic-evidence/conformance/test-ui-conformance-pr-c-iter3/summary.md`
- `~/cic-evidence/conformance/test-ui-conformance-pr-c-iter4/summary.md`
- `~/cic-evidence/conformance/test-ui-conformance-pr-c-iter5/summary.md`
- `~/cic-evidence/conformance/test-ui-conformance-pr-c-corrected-build/summary.md`
- `~/cic-evidence/conformance/test-ui-conformance-pr-c-target2/summary.md`

No conformance screenshot was produced because zero violations was not reached. Batch 8 integrated, staging, provider, production, and human walkthrough remain `NOT RUN`.
