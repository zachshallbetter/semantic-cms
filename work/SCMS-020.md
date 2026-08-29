# SCMS-020 — `content.unpublish@1`: make the declared compensation real

**Intent ref:** PROJECT_INTENT.md · **Epic:** E2/E3 · **Fixes:** a defect introduced by SCMS-013
**Assigned by:** coordinator goal, on re-deriving the frontier after an incorrect wholesale block.
**Effect class:** E1 in-repo. The contract it models is **E2** (reversible/compensable
operational mutation) → verification `confirm`, which differs from promote's E3/`reauthenticate`
— demonstrating that verification derives from consequence, not preference.
**State:** Ready → Claimed → (closing state at bottom)

## The defect

`CONTENT_PROMOTE` declares `compensationInteraction: "icp:interaction/content.unpublish"`, and
every promotion receipt carries it. No such contract exists. Two problems, both canonical-v1:

1. **A declaration with no consumer** — the exact pattern SCMS-004 named as the uniform
   cautionary tale ("a declaration format richer than the checker that consumes it silently
   becomes decoration").
2. **A false reversibility claim** — ICP separates reversibility from recovery, and an effect
   labelled `compensatable` whose compensation cannot be executed is not compensatable. The
   receipt currently over-claims.

## Ready predicate

- **Scope:** `content.unpublish@1` in `impl/qualification/src/` — reverses a promotion by
  moving `publicationState` from `promoted` back to `unpublished`, as a **new appended
  revision** (compensation is forward motion, never erasure); refuses when the target is not
  promoted; requires `confirm` verification (E2) and a named authority; emits a receipt whose
  `compensationInteraction` points back at the promotion it compensates.
- **Exclusions:** no cascade to delivery or caches (that is E6/transport, P10-pending); no
  deletion, no history rewriting; no change to promote's gates; no DESIGN.md change.
- **Dependencies (satisfied):** icp pin (reversibility vs recovery; compensation semantics);
  SCMS-012 registry; SCMS-013 promote; SCMS-011 Canon.
- **Acceptance:**
  1. Unpublishing a promoted record appends a revision with `publicationState: unpublished`
     and leaves all other axes untouched; the receipt chain still verifies.
  2. Unpublishing a record that is not promoted is refused with a typed outcome and recovery —
     not a silent no-op.
  3. `confirm` verification is required; `none` is refused with `verification_required`.
  4. An unnamed authority is refused.
  5. The compensation is **round-trippable**: promote → unpublish → promote, with history
     showing all three landings and nothing erased.
  6. Promote's receipt now names a compensation that actually resolves in the registry — the
     declaration has a consumer.
- **Evidence requirements:** `node --test` in scms-evidence-020 at **Implemented + Tested**.
  NOT established: delivery-side compensation (caches, CDNs, external surfaces).
- **Permissions / effect class:** E1; project-mutation authority per bindings. No external
  publication or un-publication is performed — this moves a state axis in an in-memory journal.
- **Target:** `impl/qualification/src/unpublish.ts`, its test, `.github/workflows/gates.yml`
  (no new step — extends the qualification suite), `records/*`, `work/GRAPH.md`.
- **Budget:** one work cycle; no spend; no credentials.
- **Stop conditions:** (a) honest compensation would require touching delivery → stop, that is
  P10-pending; (b) it would require erasing history → stop, Canon forbids it.

## Claim

Claimed by agent-under-owner-direction 2026-08-28; released at closing state below.

## Closing state

**Done — Implemented + Tested; the declared compensation is real.**
Evidence: records/evidence.jsonl · scms-evidence-020. Claim released.
