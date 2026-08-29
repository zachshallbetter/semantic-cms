# SCMS-077 — Run the editing workload and disposition P7

**Intent ref:** PROJECT_INTENT.md · **Epic:** E1 · **Effect class:** E1
**Assigned by:** owner — *"you can also handle P7 by migrating my content using the editor in
preview when that is built."*

## What P7 is waiting for

§8.5 deferred divergence-first branching with a stated revisit condition:

> *"a real architectural commitment that should be made against a real editing workload rather than
> a fixture… Revisit once the first migration is carrying real edits."*

The owner has since named how to satisfy it: run the migration **through the editor**. The
instrument exists — SCMS-042 records a P7 observation per edit with its lane and overlap, and
SCMS-043 wired it to the running editor.

## The ordering that matters

**SCMS-045 (the working copy) must land first.** Today every landed autosave is a revision, so the
free-lane overlap statistic would count autosave races as concurrent authorship. With buffering,
only *commits* are revisions, and the overlap figure measures what §8.5 actually asked about.

Running the workload first would produce a number that looks like evidence and is not.

## Ready predicate

- **Scope:** carry real edits through the editor; accumulate P7 observations; produce a
  recommendation grounded in what the workload showed.
- **The recommendation is not the disposition.** Accepting or continuing to defer P7 changes what
  the system claims to be, and that signature is the owner's (§12.1).
- **Dependencies:** SCMS-045 landed; the editor running against real content (done).
- **Acceptance:** `summarizeP7` reports enough overlapping free-lane edits to be read rather than
  guessed at — the instrument already refuses to be decided from too little and says so; the
  recommendation states what was observed, how much, and what it does *not* establish.
- **Prior art to weigh:** `stone-oven/docs/architecture-gaps.md` is the owner's own pre-mortem
  arguing that a raw `<<<<<<< HEAD` conflict wall would break an authoring experience. That is
  evidence for the decision, and it is a designer's prediction rather than the observation §8.5
  asked for — the recommendation should treat it as such.
- **Stop conditions:** if real editing produces too few overlaps to read, say so and leave P7
  deferred. An under-powered number presented as evidence is worse than none.
