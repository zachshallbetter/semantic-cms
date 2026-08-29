# SCMS-019 — The narrowest end-to-end path, proven as one run (E7)

**Intent ref:** PROJECT_INTENT.md · **Epic:** E7 (board #12) · **Advances:** DESIGN.md §14 as a whole
**Assigned by:** coordinator goal. Every §14 step except 3 (blocked, scms-blocker-001) is closed
in isolation; nothing yet proves the pieces *compose*.
**Effect class:** E1 — an integration vector over landed libraries; no new capability.
**State:** Ready → Claimed → (closing state at bottom)

## Objective

Run the whole spine once, in order, asserting the doctrine at each seam:
`Canon → schema conformance → governed revise → qualify → promote → freeze → resolve →
express (twice) → cache → invalidate → consistency + chip`.

## Ready predicate

- **Scope:** `impl/e2e/` — one integration suite composing the seven landed packages, with no
  new production code. Vectors assert the *seams*, not the internals each package already
  proves: that the artefacts of one stage are the accepted inputs of the next, and that the
  invariants survive composition.
- **Exclusions:** no new capability, no §14 step 3 (blocked), no transport, no persistence, no
  DESIGN.md change. If a seam requires new production code to close, that is a finding to
  record — not a licence to widen this item.
- **Dependencies (satisfied):** SCMS-011 canon, 012 contracts, 013 qualification, 016 schema,
  008 resolver, 009 expression, 014/015 cache. All landed with CI-verified conclusions.
- **Acceptance:**
  1. A schema-conformant Article lands in Canon; a non-conformant one is rejected before
     it reaches the journal.
  2. A governed `content.revise@1` supersedes it and emits a verifiable receipt.
  3. Qualification of the revised candidate under the note profile yields `QUALIFIED`; a
     candidate missing an obligation yields `BLOCKED` and cannot promote.
  4. `content.promote@1` moves only `publicationState`; the receipt chain still verifies.
  5. `freeze()` → `resolveSurface()` produces a surface whose members are exactly the
     accessible, non-revoked content; entitlement appears as `withheld`, admin-only state
     appears nowhere.
  6. Both expressions consume that one surface and preserve the six S3 properties while
     differing in morphology.
  7. The cache retains across a wave that changed nothing accessible and invalidates on one
     that did — and an admin-only edit leaves the member entry untouched.
  8. Consistency for a client holding the pre-revision baseline is `superseded` (or
     `conflicted` with local edits), and the chip discloses it truthfully.
  9. **Composite invariant:** across the entire run, no hidden subject id appears in any
     surface, expression, cache entry, receipt, or chip.
- **Evidence requirements:** `node --test` in scms-evidence-019, claimed as **Implemented +
  Tested for the composed narrow path**. This does NOT establish S4, durability, transport,
  concurrency, or empirical usefulness, and does not close §14 (step 3 remains blocked).
- **Permissions / effect class:** E1; project-mutation authority per bindings.
- **Target:** `impl/e2e/` (new), `.github/workflows/gates.yml`, `records/*`, `work/GRAPH.md`.
- **Budget:** one work cycle; no spend; no credentials.
- **Stop conditions:** (a) a seam needs new production code → record the finding and stop
  rather than widening scope; (b) composition would require a pending proposal → stop.

## Claim

Claimed by agent-under-owner-direction 2026-08-28; released at closing state below.

## Closing state

**Done — Implemented + Tested; the spine composes end to end.**
Evidence: records/evidence.jsonl · scms-evidence-019. Claim released.
