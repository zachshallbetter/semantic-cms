# SCMS-016 — Article type and Home composition as Schema records (E1, §14 step 1)

**Intent ref:** PROJECT_INTENT.md · **Epic:** E1 · **Advances:** DESIGN.md §14 step 1 (the last
incomplete early step of the narrowest path).
**Effect class:** E1 — Schema-body envelopes plus a conformance checker; no new authority.
**State:** Ready → Claimed → (closing state at bottom)

## Objective

Make the content vocabulary concrete and canonical: one content type (**Article**, with SES
Slots) and one composition (**Home**, with SES Sockets) landed in Canon as `Schema`-body
envelopes, plus a checker proving `Content` instances conform to their declared type.

## Ready predicate

- **Scope:** `impl/schema/` — (1) `Article` as a Schema record declaring slots
  `title | media | body | meta` with required/optional and content-kind admission; (2) `Home`
  as a Schema record declaring sockets `hero | rail` with admission policy (which blocks,
  cardinality, importance); (3) `checkConformance(instance, schemaRecord)` returning typed
  findings; (4) vectors including negatives.
- **Exclusions:** SES *vocabulary* is imported as declared bindings — Slot, Socket, Block,
  Composition, admission policy, cardinality, importance keep their SES meanings and are not
  redefined; no expression, recipe, theme, or morphology (SES owns those); no resolver change;
  no new content types beyond the two §14 names; no DESIGN.md change.
- **Dependencies (satisfied):** ses pin (Slot/Socket/Composition semantics); SCMS-011 Canon
  (Schema body kind, journal); node ≥ 22.6.
- **Acceptance:**
  1. Both schema records land as `Schema`-body envelopes and validate under SCMS-011's
     envelope rules (they are `declared` provenance and carry no time bounds).
  2. A conforming Article instance passes; a missing **required** slot fails with a typed
     finding naming the slot.
  3. An instance carrying an **undeclared** slot fails (a content type is closed, not a bag).
  4. Socket admission is enforced: a block whose kind is not admitted by `hero` is rejected,
     and cardinality violations are typed findings.
  5. Schema records participate in Canon like any other record — superseding a schema appends
     a new revision and leaves the predecessor readable (no special-casing).
  6. The checker introduces no expression concern: no finding references morphology, theme,
     or visual form.
- **Evidence requirements:** `node --test` in scms-evidence-016 at **Implemented + Tested**
  for these two records. NOT established: a general schema registry, migration between schema
  versions, or empirical authoring usefulness.
- **Permissions / effect class:** E1; project-mutation authority per bindings.
- **Target:** `impl/schema/` (new), `.github/workflows/gates.yml`, `records/*`,
  `work/GRAPH.md`. No other path.
- **Budget:** one work cycle; no spend; no credentials.
- **Stop conditions:** (a) conformance would require deciding an SES semantic not present in
  the pin → stop and record upstream debt; (b) the checker would need to make an expression
  decision → stop (that is SES's).

## Claim

Claimed by agent-under-owner-direction 2026-08-28; released at closing state below.

## Closing state

**Done — Implemented + Tested; §14 step 1 closed.**
Evidence: records/evidence.jsonl · scms-evidence-016. Claim released.
