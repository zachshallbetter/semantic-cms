# SCMS-009 — S3 cross-expression qualification

**Intent ref:** PROJECT_INTENT.md · **Parent:** SCMS-008 (SSS adoption) · **Board:** #34 lineage
**Assigned by:** project.owner, 2026-08-28 review ("That is the obvious S3 experiment") and the
coordinator goal ("including S3 cross-expression qualification when Ready").
**Effect class:** E1 — pure host adapters and a checker over an existing ResolvedSurface; no
canonical mutation, no protected action.
**State:** Ready → Claimed → (closing state at bottom)

## Objective

Establish **S3 cross-expression conformance** for the adopted surface layer: one
`ResolvedSurface` consumed by two *materially different* expression implementations while
protected participation semantics are provably identical, and morphology provably differs.

## Ready predicate

- **Scope:**
  1. `impl/surface-expression/` — two host adapters over the SCMS-008 resolver output:
     (a) **structural/web** — a semantic HTML fragment (native elements + ARIA; SES data
     attributes as inspection hooks only), (b) **linear/voice** — a spoken-order script with
     no 2D structure. Materially different modalities per SSS IMPLEMENTATION_BOUNDARY §3.
  2. An **equivalence checker** asserting the six S3 properties from SSS CONFORMANCE.md
     (member identity · semantic grouping · required priority · required operation exposure ·
     access constraints · explanation identity), plus a *difference* assertion proving the two
     expressions are not trivially similar (morphology genuinely varies).
  3. Vectors run by `node --test`, wired into CI.
- **Exclusions:** no SES resolver, cascade, theme, recipe, token, or Visual Language is
  implemented — expression *semantics* are imported from the SES pin as declared bindings and
  the adapters remain scms-local host adapters (SSS IMPLEMENTATION_BOUNDARY §7 keeps host
  adapters in separate packages). No visual design, no CSS, no DOM runtime. No change to the
  resolver's protected semantics. No S4 work (external, SCMS-010). No DESIGN.md change on main.
- **Dependencies (satisfied):** SCMS-008 resolver (Implemented+Tested, 11 vectors); sss pin
  (S3 definition + mandatory negative 6: `role=primary` must not force hero morphology); ses pin
  (typed invariance dimensions, preserve/transform/mayOmit/mayIntroduce, the six operation
  distinctions, renderer-neutral output rule OUTPUT-005 that accessibility obligations persist
  even when a host cannot realize them); node ≥ 22.6.
- **Acceptance:**
  1. Both adapters consume the *same* `ResolvedSurface` without reading canon.
  2. Checker asserts all six S3 properties equal across expressions.
  3. Checker asserts morphology differs (materially different, not two skins of one shape).
  4. Negative 6 holds: a `primary` group does not force any particular container form — proven
     by the two adapters realizing it differently while both conforming.
  5. An expression may not introduce a member, group, or operation absent from the surface, and
     may not silently drop a required operation exposure (SES: a Theme "may not silently remove
     required exposure") — proven by two failing-mutation vectors.
  6. Access constraint preserved: an expression built from a member-access surface contains no
     trace of higher-access state.
- **Evidence requirements:** `node --test` output recorded in scms-evidence-009 with the
  claim stated at the weakest justified rung. This establishes **S3 conformance for the narrow
  path only** — it does not establish S4, empirical usefulness, or that the adapters are
  production expression systems (they are conformance instruments).
- **Permissions / effect class:** E1; agent-under-owner-direction holds project mutation for
  E0–E1 in this repository (bindings/authority_bindings).
- **Target:** `impl/surface-expression/` (new), `.github/workflows/gates.yml` (one test step),
  `records/*`, `work/GRAPH.md`. No other path.
- **Budget:** one work cycle; no spend; no external services; no credentials.
- **Stop conditions:** (a) conformance would require the resolver to emit morphology → stop,
  record blocker (would weaken SSS-INV-008/009); (b) equivalence would require weakening an
  existing binding or duplicating SES semantics locally → stop, record blocker; (c) a needed
  SES capability is missing upstream → stop, record upstream debt (do not implement locally).

## Claim

Claimed by agent-under-owner-direction 2026-08-28; released at closing state below.

## Closing state

**Done — Implemented + Tested; S3 conformance established for the narrow path.**
Evidence: records/evidence.jsonl · scms-evidence-009. Claim released.
