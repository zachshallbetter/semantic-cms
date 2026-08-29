# SCMS-046 — Observations are signals, not participants (closes SH-14)

**Intent ref:** PROJECT_INTENT.md · **Epic:** E6 · **Effect class:** E1
**Assigned by:** coordinator goal. Prerequisite named in SCMS-045's Ready predicate.
**State:** Ready → Claimed → Done (closing state at bottom)

## The gap

`freeze()` projected only `Content` and `Relation` bodies, so `Observation` bodies never became
snapshot subjects at any access level. SCMS-028's derived Semantic Article Field therefore landed in
Canon and was **invisible to everything, including its owner** — written and unreadable. Found
incidentally by the NR-scms-007 adversarial pass.

SH-14 offered two remediations: project observations as subjects, or state explicitly that they
reach surfaces by another route. Neither was true, and picking one is the work.

## The decision

**Observations are signals *about* subjects, not participants *in* a surface.**

So the omission was right and its consequence was wrong. A model's claim about an article, or a note
that someone is editing it, must not become a member a reader can land on — that is the
no-promotion rule (§3.2) and SSS §22 from the other side, where a resolver *may consume* field
signals and does not own or promote them. Turning an observation into a subject would let a
machine's opinion acquire the standing of authored content by being adjacent to it, which is exactly
what SCMS-028 refused to do at import.

What was wrong is that the exclusion was silent, so a whole record class was write-only. Snapshots
now carry an `observations` collection, deliberately **separate from `subjects`**, so nothing that
reads members can accidentally read these. The separation is what keeps "an observation is not a
participant" structural rather than remembered.

## Not decoration

Adding a snapshot field with no reader would have been the fifth instance of the failure P27 names
and NR-scms-004 records. So `observationsFor(snapshot, subject, access)` lands with it, and a vector
asserts the derived field is reachable through it.

Access is the **observation's own**, not its subject's: a private note about a public article stays
private. Inheriting the subject's access would publish the note by association.

## What this unblocks, and one thing it gave away for free

SCMS-045's working copy is defined as an observation. Writing these vectors surfaced that the
envelope validator already refuses `observed` provenance without `observedAt`/`expiresAt` — so a
working copy inherits its self-release from the validator rather than from an implementer
remembering to add one. That is the §8.4 soft-lock property arriving without being built twice.

## Acceptance — all met

1. An observation never appears among a snapshot's subjects.
2. The derived Semantic Article Field is reachable through `observationsFor`.
3. An observation is scoped by its own access, not its subject's.
4. An observation with no `about` is skipped rather than guessed at.

## Closing state

**Done — the exclusion is now a declared property with a reader, instead of an omission with a
casualty.**
