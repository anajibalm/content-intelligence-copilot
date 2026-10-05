# Discovery Delta — 2026-10-05

Status: recorded against `DATA_CONTRACT_v0.2_CANDIDATE.md`; candidate is **not frozen**.

## Source and precedence

- Source: `/home/anajibalm/Downloads/DATA_CONTRACT_v0.2_CANDIDATE.md`
- SHA-256: `8091552731b14df6a44c1cdd17413e3f9f5a353fb00560e3b5906a51fceab756`
- Repository copy: `docs/contracts/DATA_CONTRACT_v0.2_CANDIDATE.md`
- Preserved history: `docs/contracts/MVP_CONTRACT_v0.1_FROZEN.md`, `docs/contracts/DONOR_MAP_FROZEN_v0.1.md`, and `docs/source/IMPLEMENTATION_PLAN_v0.1.md`
- Precedence remains: frozen MVP contract → frozen donor map → implementation plan → v0.2 candidate.

v0.2 adds discovery requirements and candidate persistence shapes. It does not reopen frozen product boundaries, declare provider success, or prove database execution.

## Discovery changes and affected stories

| Discovery delta | Affected story / implementation surface | S1/S2 treatment |
|---|---|---|
| AWT-first preference, subject to brand approval | S1 config types/persistence; S5 ranking later; S7 compare later | Store versioned `brand_analysis_config` with nullable/unconfigured primary metric. Do not seed AWT approval or ranking weights. |
| Brand-approved ranking rules; no universal score | S1 config; S5/S7 | Store ranking and fallback policy JSON as versioned opaque config. No invented policy. |
| Full-batch analysis, usually 10–18 contents | S1 comparison order; S6/S7 later | Support ordered N-item comparisons. Existing comparison item position remains usable; add explicit scope/order semantics where needed. |
| Multi-item comparisons plus controlled pair/group drilldown | S1 comparison schema/types; S7 | Preserve controlled compare. Extend comparison to `pair`, `group`, and `batch` scope without replacing pair behavior. |
| Brand KPI targets distinct from relative benchmarks | S1 KPI definitions and batch assessments; S5 later | Add versioned KPI definition and immutable batch assessment records. Unknown target, comparator, aggregation, and window remain unconfigured. |
| Missing-access fallback distinct from metric errors | S1 metric quality metadata; S5 later | Add per-metric quality JSON with explicit reason. `unavailable/not_accessible` must not become zero; `suspect/source_error` stays suspect. |
| Brand-specific creative preferences | S1 config; S4 later | Store preference context separately from extracted features. Never turn preference into observed/extracted fact. |
| Per-second temporal evidence and product-entry anchors | S1 temporal metadata; S3 later | Preserve timestamped frames and add minimal versioned metadata/anchor types only where needed. Actual media processing remains S3. |
| Product sentiment positive/negative/neutral | S12 later | Record as candidate/conditional scope only; no comments or fake sentiment in S1 seed. Themes stay separate from sentiment. |
| Indonesian working explanation and future English decks | S1 brand/workspace config | Store explicit language fields; deck export remains later. |

## Actual conflicts with frozen documents

1. **No direct conflict: multi-item comparison.** Frozen MVP §12 defines Controlled Compare and says preferred pairs; it does not mandate two items. v0.2 makes N-item/group/batch scope explicit. This is an implementation expansion within frozen compare semantics, not a product-contract replacement.
2. **No direct conflict: per-second temporal evidence.** Frozen MVP §17 requires actual media and hook/representative frames; it does not prohibit per-second analyst inventory. v0.2 adds traceability detail. Retention causality remains prohibited without first-party retention evidence.
3. **No direct conflict: AWT-first.** Frozen MVP §8 requires objective-specific labels and no universal Best Overall. v0.2 makes AWT a candidate preference only when brand-approved. No frozen rule is changed.
4. **No direct conflict: KPI targets versus benchmarks.** Frozen MVP §8 governs relative labels; v0.2 separates those labels from brand target assessment. This clarifies two analytical concepts.
5. **Candidate/schema mismatch requiring implementation resolution:** v0.2 lists acquisition `unavailable`, while frozen v0.1 types/SQL currently list `PENDING/RUNNING/SUCCEEDED/FAILED`. Add `UNAVAILABLE` only as an explicit quality/access state if required by the canonical adapter; do not conflate it with ordinary provider failure.
6. **Candidate/schema refinement:** v0.2 proposes richer fields such as `caption`, `published_at`, `content_age_hours`, `quality_json`, and config/KPI entities. Existing canonical schema intentionally omitted unsupported fields. Add only fields required for S1 invariants and persistence; leave unknown values null/unconfigured.
7. **No conflict with donor boundaries.** Donor Map remains authoritative: provider-neutral connector pattern is allowed, donor domain model and confidence semantics remain forbidden.

## Preserved boundaries and invariants

- Provider raw responses stay in acquisition-layer records; canonical packets are normalized.
- OBSERVED, DERIVED, EXTRACTED, and INFERRED evidence remain distinct.
- Human corrections preserve immutable AI originals and append-only review/correction history.
- Organic and Paid remain separate on metric snapshots; no silent shared baseline.
- Raw metrics do not contain derived metrics.
- Comparisons freeze exact snapshot IDs and preserve selection order.
- Evidence retains immutable source references.
- Missing access is not metric error; zero is not automatically valid.
- AWT is temporal context, not a retention curve or causal proof.
- No KPI target, ranking weight, brand approval, retention curve, comment, or provider reliability is invented.
- Temporary media and transient CDN URLs remain outside canonical persisted domain identity.

## Execution checkpoint

Before this delta: S0 PASS; S1 PARTIAL; migration, seed, and live integrity probes unverified; acquisition provider spike-gated.

This delta does not claim S1 or S2 PASS. Next gates: audit/update S1 persistence, run migration and seed in isolated PostgreSQL, then implement deterministic S2 adapter and separately attempt live acquisition gate.
