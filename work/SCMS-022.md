# SCMS-022 — Declared schemas become load-bearing in the write path

**Intent ref:** PROJECT_INTENT.md · **Epic:** E2 · **Fixes:** a gap left by SCMS-016
**Assigned by:** coordinator goal, on re-deriving the frontier.
**Effect class:** E1.
**State:** Ready → Claimed → Done (closing state at bottom)

## The gap

`ARTICLE_TYPE` and `checkArticle` are consumed **only by tests**. No contract
consults them, so a governed write can land content that violates its own
declared content type. The schema records from §14 step 1 are decorative in the
pipeline — the exact "declaration richer than the checker that consumes it"
pattern this project names as a cautionary tale, committed by this project.

## Ready predicate

- **Scope:** `ExecutionContext` gains an optional `validateBody` hook; `content.revise@1`
  consults it before landing and refuses non-conformant content with `invalid_input`
  plus `focus_field` recovery naming the offending slot. The hook is a *function*, not a
  schema import: the contracts package must not depend on the schema package (layering).
- **Exclusions:** enforcement is opt-in by supplying the hook — not every content kind has a
  declared type yet, and pretending otherwise would be a false claim. No new content types.
  No changes to promote/unpublish. No DESIGN.md change.
- **Dependencies (satisfied):** SCMS-012 contract runtime; SCMS-016 schema + checker.
- **Acceptance:**
  1. With a validator wired, a revise carrying a required-slot violation is refused
     `invalid_input`, names the slot in recovery, and writes nothing.
  2. With a validator wired, a conformant revise lands normally.
  3. Without a validator (existing callers), behaviour is unchanged — all prior vectors pass.
  4. The contracts package does not import the schema package (asserted at source level).
  5. The e2e spine wires the real Article checker, so the declared type is load-bearing in the
     composed path.
- **Evidence requirements:** `node --test` in scms-evidence-022, **Implemented + Tested**.
  NOT established: enforcement for content kinds with no declared type.
- **Target:** `impl/contracts/src/runtime.ts`, its test, `impl/e2e/test/spine.test.ts`,
  `records/*`, `work/GRAPH.md`.
- **Stop conditions:** (a) enforcement would require contracts to depend on schema → stop and
  invert via the hook; (b) it would break existing callers → stop, make it opt-in.

## Closing state

**Done — Implemented + Tested; declared types are enforced where declared.**
Evidence: records/evidence.jsonl · scms-evidence-022. Claim released.
