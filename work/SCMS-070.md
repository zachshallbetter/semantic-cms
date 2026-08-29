# SCMS-070 — Done items carry a work file or a stated exemption

**Intent ref:** PROJECT_INTENT.md · **Epic:** E0 · **Effect class:** E1
**Assigned by:** SCMS-068's audit, finding 6.

## The gap

**12 of 67 items are Done with no work file.** The Ready-predicate discipline held for the first
forty items and thinned as the pace rose.

## The thing this must NOT do

It must not force retroactive predicates. A Ready predicate is valuable *because it was written
before the work*, when it could still constrain what got built; composed afterwards from what
happened, it produces a document that looks like governance and functions as decoration. This
project has enough declarations that nothing consumes.

## Ready predicate

- **Scope:** extend `check-work-graph.py` so a `Done` row must have either a `work/SCMS-NNN.md` file
  **or** an explicit exemption marker in the row stating why not.
- **The twelve existing items get markers, not fabricated predicates.** A truthful annotation —
  *"no predicate written; discipline lapsed 2026-08-29, see scms-evidence-068"* — is honest in a way
  an invented predicate is not.
- **Exclusions:** no requirement on Ready or Blocked rows; no attempt to check a predicate's
  *quality*, which is unmeasurable.
- **Acceptance:** the gate fails on a Done row with neither file nor marker, with a self-test
  proving it; the twelve existing rows carry accurate markers; new work lands with a file.
