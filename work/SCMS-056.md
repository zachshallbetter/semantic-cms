# SCMS-056 — Supersession and revocation are derived (closes SH-23)

**Intent ref:** PROJECT_INTENT.md · **Epic:** E1 · **Effect class:** E1
**Assigned by:** owner directive to migrate off zach-core; named as its prerequisite.
**State:** Ready → Claimed → Done (closing state at bottom)

## The gap

`supersede()` rewrote the predecessor's row to set `supersededBy`, and `revoke()` rewrote a row to
set `revoked`. Both §3.4 and §13's implementation sketch specify Canon as append-only rows with
**no UPDATE grant** for the runtime role.

The old comment defended the first case:

> *"Marking the predecessor superseded is journal metadata, not a content edit: the envelope itself
> is untouched and its revision hash is unchanged."*

True of the envelope, false of the row — and a grant applies to rows. Harmless in memory, and
impossible in a store that enforces the rule rather than intending it. Which is exactly what
SCMS-057 is about to build.

## The fix

Both facts are already implied by append-only data, so neither needs storing:

- **Superseded** — some *other* row declares `supersedes` pointing at this revision. The successor
  carries the pointer; the predecessor is never touched.
- **Revoked** — a `revoke` receipt names this revision. The receipt chain is append-only by
  construction.

Rows are now a private `CanonRow[]` that nothing assigns into. `JournalEntry` keeps its public shape,
projected at read time with the two fields derived. Indexes are maintained incrementally for speed,
and `deriveIndexes()` recomputes them from rows and receipts alone.

## The vector that matters

**"The derived indexes are only a cache — recomputation reproduces them exactly."**

An index maintained incrementally can drift into becoming the source of truth, and the drift is
invisible until something tries to rebuild from the store. Asserting that recomputation from
append-only data agrees with what the journal is using catches that the moment it happens.

Two more assert the property directly: after a supersede, every pre-existing envelope is
byte-identical; after a revoke, likewise. And `current()` is shown to be expressible as the query it
will become — *a row is current when nothing supersedes it and no revoke receipt names it* — computed
in the vector from append-only data alone, without the journal's indexes.

## Closing state

**Done — Canon can now live somewhere that refuses UPDATE, which is the point.**
