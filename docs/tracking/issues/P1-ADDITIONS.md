<!-- cic-tracking-key:P1-ADDITIONS -->
# P1 additions — Brand Overview, provider fallback, richer retry UI

## Scope
Capture plan P1 enhancements not duplicated by S11/S12: Brand Overview polish, provider fallback policy, richer retry UI.

## Status
Backlog, P1. No milestone Core MVP dependency.

## Acceptance
- Brand Overview remains objective-aware and avoids universal winner semantics.
- Provider fallback is configured and credential-gated; failures preserve reason and provenance.
- Retry UI reflects canonical acquisition/processing states and unavailable versus error.

## Verification
Add focused UI/provider tests after runtime state contract exists.

## Dependencies
S5 for ranking/quality; R1 for runtime state and acquisition wiring.
