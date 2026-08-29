# SCMS-042 — The editing session, and the instrument P7 needs

**Intent ref:** PROJECT_INTENT.md · **Epic:** E12 · **Effect class:** E1
**Assigned by:** owner directive — *"handle P7 by migrating my content using the editor in preview."*
**State:** Ready → Claimed → Done (closing state at bottom)

## What this item deliberately does not do

It does not decide P7, and it does not simulate the workload that would decide it.

The owner's instruction is the right method: settle divergence-first branching versus convergent
prose merge by *actually editing*, which is what §8.5's deferral asked for — *"a real editing
workload rather than a fixture."* Fabricating edits and reporting a conclusion from them would
answer the question with data I invented, dressed as evidence. That is the precise failure this
project exists to prevent, and it would be a worse version of it than any yet recorded, because it
would look like diligence.

So this item builds the **instrument**: real edits land through the contract path and are observed
in a form P7 can be decided from later. `summarizeP7` refuses to offer a reading below a stated
floor of 30 overlapping free-lane edits, and says why rather than hedging.

## What is observed, and why each thing bears on the question

- **Lane.** P7 governs only the `free` lane. Bounded and required concurrency are already settled,
  so counting their conflicts toward P7 would answer a different question. A mixed edit takes the
  strictest lane it touches: an edit that changes prose *and* access is not a prose edit.
- **Overlap.** Whether another session changed *the same field* since this session's baseline.
  This is the crux. Edits that do not touch the same text merge correctly under any model, so
  counting them would inflate the case for convergence. Overlap is computed **before** the write is
  attempted, because afterwards it is unrecoverable — a conflict tells you the revision moved, not
  whether it moved on the fields you touched.

## What building it found: silent data loss (NR-scms-008)

The overlap detector reported an overlap where there should have been none, and it was right —
about something worse than it was looking for.

`content.revise` spread the change set over the body at the top level only. So a change to one slot
**replaced the entire `slots` map**, silently deleting every sibling. Editing an article's body
destroyed its title and summary, and the write reported `completed`. Data loss in the one write
path that is supposed to be safe.

Every existing vector missed it because they all used flat bodies, where a shallow merge and a deep
one are indistinguishable. The defect was reachable only by editing realistically-shaped content —
which is what happens the first time you point a system at real work.

Fixed with a recursive merge in which arrays replace wholesale (a slot's parts are authored as a
unit) and removal is explicit via `null` (deleting by omission is how this happened). The receipt
now names `/body/slots/body` rather than `/body/slots`, because reporting the container hides which
field moved — the same loss of resolution in a different place.

## Closing state

**Done — the editor writes, real editing is observable, and P7 stays open on purpose. The corpus
also stopped destroying itself when edited.**
