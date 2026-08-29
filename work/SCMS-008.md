# SCMS-008 — Adopt SSS and implement the narrowest surface-resolution path

**Intent ref:** PROJECT_INTENT.md · **Assigned by:** project.owner, 2026-08-28
("Reconcile Semantic Surface System v0.1.0 … then continue through implementation of the
narrowest end-to-end surface-resolution path without duplicating upstream semantics or
weakening existing authority.")
**Effect class:** E1 (this repository) — the resolver is pure and read-only by protocol
**State:** Ready → In progress → (see closing state at bottom)

This is the project's first item written against the full Ready predicate.

## Ready predicate

- **Scope:** (1) reconciliation of SSS v0.1.0 against the nine named resources with
  exact binding relations recorded in bindings/PROJECT_BINDINGS.yaml; (2) sss pinned in
  FORMAL_RESOURCE_MANIFEST.json; (3) `impl/surface-resolver/` — a pure TypeScript
  resolver implementing the twelve-step SSS lifecycle for the `focus` and `collection`
  profiles, with typed failures, trace, and access-scoped fingerprints; (4) golden and
  negative vectors run by `node --test` locally and in CI.
- **Exclusions:** no SES expression consumption (S3 is out of scope); no second domain
  (S4 out of scope); no persistence, transport, or workspace composition; no
  counterfactual overlays; no schema authoring upstream (UD-13 — local types are
  explicitly non-normative derivations); no DESIGN.md change on main (one [SSS]-tagged
  hunk goes to PR #28 for disposition with the rest).
- **Dependencies:** sss pin (this item); rr-rsp pin (envelope/access semantics);
  ses pin (operation identity vocabulary); node ≥ 22.6 (native type stripping;
  host has v25.4.0).
- **Acceptance:** resolver passes all vectors including the four mandatory negatives —
  (a) an inaccessible record cannot affect membership, ordering, trace, or fingerprint
  (SSS S2 / mandatory negative tests 1–2); (b) `unknown` is not mapped to `ineligible`
  (negative 3); (c) `withheld` ≠ absent under access change; (d) undisclosed
  nondeterminism check — two resolutions of equal input are deep-equal and the resolver
  source contains no wall-clock/random reference (negative 9). CI runs the suite.
- **Evidence requirements:** test run output recorded in scms-evidence-008;
  claim ladder honesty — this establishes *Implemented + Tested* for an S0/S1 slice
  plus the S2 access property; it does NOT establish S3/S4 conformance or empirical
  usefulness.
- **Permissions / effect:** E1 only; no protected actions touched.
- **Target:** `impl/surface-resolver/` (new), `bindings/PROJECT_BINDINGS.yaml`,
  `FORMAL_RESOURCE_MANIFEST.json`, `records/*`, `.github/workflows/gates.yml` (one
  test step), PR #28 branch (one tagged hunk).
- **Budget:** one session; no monetary spend; no external services.
- **Stop conditions:** any vector requires weakening an existing binding or duplicating
  upstream semantics to pass → stop and surface to owner; SSS spec ambiguity that
  forces an invented normative decision → record in SPEC_HEALTH as GUESS and proceed
  only if non-normative, else stop.

## Reconciliation summary

Recorded in full in records/alignment.jsonl (reconciliation, 2026-08-28) and
bindings/PROJECT_BINDINGS.yaml. Headlines: SSS fills the participation/expression seam;
SPS's morphologyFor decomposes (selection→SSS, form→expression recipe; binding moved
exact→constrained with semantic-change declared); FCI deliberately not pinned
(anti-bloat: its distinctions arrive via pinned intermediaries); no doctrinal conflict
found; UD-13 raised (empty schemas/ + conformance/ upstream; naming inconsistency).

**State (closing):** Done — implemented and tested; awaiting owner verification.
Evidence: records/evidence.jsonl · scms-evidence-008.
