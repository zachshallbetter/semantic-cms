# SCMS-043 — The editor, running

**Intent ref:** PROJECT_INTENT.md · **Epic:** E12 · **Effect class:** E1
**Assigned by:** owner — *"You'll want to load the editor too. You pointed me at an artifact."*
**State:** Ready → Claimed → Done (closing state at bottom)

## The gap

The published preview was a static render. Useful for judging the design, useless for the thing it
was built for: P7 is to be settled by **real edits**, and a page that cannot save produces none.
The owner was right to push on this — I had delivered the appearance of the instrument.

## What it does

A zero-dependency Node server over the same view-model:

- Imports all 215 entries through `content.create@1` at startup — the governed path, not a seed.
- Loads prose from the owner's own checkout at runtime (`--content`). **Nothing is vendored**; the
  repository still holds only frontmatter and body digests.
- Lands every save through `content.revise@1`, so editing is indistinguishable from any other
  governed write: a revision appends, the outbox emits, the receipt names the field that moved.
- Records a P7 observation per edit, with lane and overlap, to a log outside the repository.
- Registers **every** contract the system implements, not the narrow path. An editor that hides a
  capability it has is as dishonest as one that offers a capability it lacks.
- Reads `qualified` from Canon via the attestation, exactly as the promotion gate does — so
  "Publish" is refused for the same reason in the UI as in the contract, not a second opinion.

## Persistence, stated honestly

Edits persist to an append-only JSONL outside the repository and replay through the contract path
on restart. **This is not the durability decision** — SH-1 leaves the persistence engine open and
this does not close it. It is development-grade custody so a night's work survives a restart.

## What was found

The corpus's Medium imports carry a stray `---` horizontal rule immediately after the frontmatter,
so it renders as the first line of the body. That is the owner's content, not a parser defect, and
it has been left alone: silently stripping characters from 140-odd articles is an edit, and edits
are the owner's to make. It is visible in the editor, which is where it can be decided about.

## Claim discipline

The server is thin glue over modules that are individually vectored, and it is **verified by
interaction rather than by vectors** — I opened it, made an edit, and confirmed the revision landed
and the observation recorded. That is a lower rung than the rest of this system sits at, and the
register says so rather than borrowing the view-model's coverage.

## Closing state

**Done — the editor saves. P7 can now accumulate evidence instead of waiting for it.**
