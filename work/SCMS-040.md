# SCMS-040 — The editor in preview

**Intent ref:** PROJECT_INTENT.md · **Epic:** E12 · **Effect class:** E1
**Assigned by:** owner directive — *"We don't have a UI for the cms yet, so we'll need to figure that
out"*, and *"handle P7 by migrating my content using the editor in preview when that is built."*
**State:** Ready → Claimed → Done (closing state at bottom)

## The gap

SH-8 has been open since the register began, and SCMS-031 closed only half of it: what the editor
may *offer*. What a person actually *sees* was still unbuilt. The owner has since made it
load-bearing — the editor is the instrument that produces the real editing workload P7's deferral
asked for, so P7 cannot be decided until this exists.

## The shape of the work

The view-model is the engineering; the page is its surface. `editorView()` returns what an author
sees as **data**, so the honesty properties are tested rather than drawn — a UI whose correctness
lives only in CSS is a UI whose correctness is unverifiable.

Four behaviours, each a rendering of a rule the system already holds:

1. **Publish is visibly not Save.** `content.revise` is E1 and reversible; `content.promote` is E3
   and compensatable. The weight is carried from the contract's own declaration, so the interface
   *cannot* present them as the same gesture, and a compensatable action names its way back before
   you take it rather than after.
2. **A withheld operation carries its reason.** "No qualified attestation covers this revision" is
   an instruction; a greyed-out button is a shrug. Every disabled operation has a reason string,
   and a vector asserts none is ever disabled without one.
3. **The chip is reused, not reimplemented.** SCMS-017's `chip()` verbatim. A second implementation
   of an honesty rule is a second chance to get it wrong.
4. **The four state axes render as four things.** Never merged into one status — the exact collapse
   §3.5 forbids and the source data committed.

## What the corpus made possible

The 25 migration findings SCMS-028 refused to guess on now surface **on the entry itself**, with a
count in the index acting as a work queue. The importer declined to launder the source's mixed
`status` vocabulary; the editor is where that ambiguity becomes the owner's decision instead of an
importer's guess. That is the whole argument for refusing to guess, made concrete.

## What was found while building

`editorView` accepted an `access` parameter and never consumed it, so a public actor could open a
private entry in the editor. Its own vector caught it before it landed. This is the
declaration-without-a-consumer failure (NR-scms-004) for the third time, here as an access leak.
Fixed, and the refusal is `notFound` rather than `forbidden` so the response does not confirm the
subject exists.

Separately, two early vectors were asserting nothing: the first public entry in the corpus is
already promoted, so "publishing is refused without qualification" was passing on an entry that
could not be published anyway. Corrected to select a public *unpublished* entry.

## Preview scope

Published at https://claude.ai/code/artifact/1201416c-78ec-4145-9149-bdfccb9af68a — **73 public
entries only**. No private draft is in it, not even a title. The page is pure ASCII by
construction, so a server that omits a charset cannot mangle it.

## Closing state

**Done — SH-8 closes. The editor exists, its honesty is tested rather than styled, and the
instrument P7 needs now exists.**
