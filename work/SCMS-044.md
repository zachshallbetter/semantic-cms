# SCMS-044 — The working copy: drafting that does not publish

**Intent ref:** PROJECT_INTENT.md · **Epic:** E2 · **Effect class:** E1
**Assigned by:** owner — *"Define it and we'll add it in at the appropriate time."*
**State:** **Defined — not scheduled.** Deliberately not claimed. The canonical passage in §5 below
requires owner ratification before it is applied to DESIGN.md.

---

## 1. The hazard this closes, demonstrated

`content.revise@1` builds its next envelope as `{ ...prior.envelope, body: nextBody }`
(`impl/contracts/src/runtime.ts:440`). Every one of the four state axes is inherited — including
`publicationState`. Reader surfaces resolve from `journal.current()`. So a revision to a **promoted**
subject is visible to the public the instant it lands.

Verified against the landed code, not reasoned about:

```
reader sees BEFORE : The Finished Version
revise outcome     : completed
publicationState   : promoted
reader sees AFTER  : half-finished thought I was still
```

This system's central claim is that *publishing is qualification plus promotion, never a boolean*.
`revise` currently republishes without either. That is not a missing feature; it is a live
contradiction of §6, and it is recorded as **SH-15** rather than left inside this work item.

## 2. Why zach-core's mechanism cannot be copied directly

`zach-core` solves this with a mutable `working_copy` jsonb column, last-writer-wins
(`archive.schema.sql:138`, `api/v1/admin/draft.ts`). Semantic CMS cannot hold a mutable buffer:
Canon is append-only by construction (§3.4), and a column that is overwritten in place is precisely
the destructive edit the design forbids.

The mechanism has to be re-derived rather than imported. The design already contains its shape.

## 3. Definition — **a working copy is an observation, not a revision**

§8.3's provenance chip already names the state (`local · unsent`), and §8.4 already makes presence,
selections and soft locks `observed` envelopes carrying mandatory `observed_at` and `expires_at`. A
working copy is that same kind of thing: something *seen*, not something *declared*.

Landing it as an `observed` envelope rather than a `declared` one yields the required properties
structurally, with no new enforcement to remember:

| Property | Why it follows | From |
|---|---|---|
| Cannot move any of the four state axes | An `observed` record may update a chip; it may never overwrite a `declared` field | §3.2 no-promotion rule |
| Never reaches a reader surface | `freeze()` projects only `Content` and `Relation` bodies into a snapshot | SH-14, which becomes the mechanism here rather than a gap |
| Abandoned buffers self-release | Mandatory `expires_at`; an expired observation may not drive decisions | §8.4 soft-lock semantics |
| Honest provenance | The envelope says "observed", which is exactly what an unsent draft is | §3.2 four-class lattice |
| Owner-scoped | A buffer is written at `owner` access **regardless of the subject's access** — a draft on a public article is not public | §5 |

## 4. The buffering rule

Derived from our own model rather than imported from zach-core, though it lands in the same place:

> **A revision to a promoted subject is immediately visible to readers. Therefore drafting against a
> promoted subject MUST buffer. Drafting against an unpublished subject MAY write through, because
> there is no reader to protect.**

- **Buffered** (subject is `promoted`): the draft lands as an observation. Published fields are
  untouched. Readers see the promoted revision, unchanged.
- **Written through** (subject is not `promoted`): the draft lands as an ordinary revision. Nothing
  is gained by buffering content no reader can reach.

**Commit** is the explicit act: promoting a buffer into a revision crosses `content.revise@1` with
the buffer's content and the author's `expectedRevision`, then discards the buffer. Autosave is
durability; commit is publication. That is the same separation §6 already draws between
qualification and promotion, applied one layer down.

**Emission.** A buffer write is something happening, so it emits — but it emits an *observation*
event, never a content-change event. Subscribers to a subject's content must not be woken by a
keystroke, and the outbox invariant ("nothing happens without an emission", SCMS-032) stays intact
because the buffer write does emit, into the right channel.

**Concurrency.** Buffers are per-session observations, so two sessions drafting the same subject do
not collide in the buffer; they collide at **commit**, where `expectedRevision` already produces a
typed `conflict` with no partial write. A second session's uncommitted buffer is *presence*, not
conflict — "someone else is editing this" — which §8.4 already covers.

## 5. Proposed canonical passage — **NOT APPLIED**

For DESIGN.md §8, pending ratification:

> **8.9 Drafting is not publishing.**
> A revision inherits publication state, so a revision to a promoted subject reaches readers
> immediately. Drafting against a promoted subject therefore lands as a **working copy**: an
> `observed` envelope, owner-scoped, carrying `observed_at` and `expires_at`, which by construction
> cannot move a state axis, cannot enter a reader surface, and self-releases when abandoned.
> Committing a working copy is an explicit governed write; until it happens, readers see the
> published revision and nothing else. Drafting against unpublished content writes through, because
> there is no reader to protect. Autosave is durability. Commit is publication. A system that
> conflates them publishes drafts.

## 6. Ready predicate — for whenever this is scheduled

- **Scope:** the working-copy observation type; the buffered/written-through branch in the write
  path; commit-and-discard; observation-channel emission; the presence signal for a foreign buffer.
- **Exclusions:** no new merge semantics (P7 is separate), no transport work, no UI beyond surfacing
  the buffer state the editor already renders as `local · unsent`.
- **Dependencies:** SCMS-032 (outbox), SCMS-017 (consistency states), SCMS-040/043 (the editor).
  **SH-14 must be resolved first or deliberately left standing** — the definition leans on
  `freeze()` not projecting observations, which is currently true by omission rather than by
  declared intent. Leaning on an accident is how the last four negative results happened.
- **Acceptance:**
  1. A buffered draft against a promoted subject leaves every reader surface byte-identical.
  2. A buffered draft moves no state axis, and a control proves the assertion can fail.
  3. An expired buffer drives nothing — it cannot be committed and cannot hold a lock.
  4. Write-through applies only where the subject is not promoted.
  5. A buffer write emits on the observation channel and **not** on the content channel, with the
     outbox integrity check still passing.
  6. Two sessions committing from divergent buffers produce a typed `conflict` and land nothing.
  7. A buffer on a public subject is not readable at public access.
- **Stop conditions:** if buffering cannot be expressed without a mutable record, stop and record —
  that would mean the observation framing is wrong, not that append-only should bend.

## 7. One ordering consequence worth acting on

**This should land before the P7 workload runs, not after.** Today every autosave that lands is a
revision, so P7's free-lane overlap statistic would count autosave races as concurrent authorship.
With buffering, only *commits* are revisions, and the overlap number then measures what §8.5
actually asked about: two people meaningfully editing the same prose. Running the workload first
would produce a number that looks like evidence and is not.
