# SCMS-051 — Qualify, promote, and a reader who sees it

**Intent ref:** PROJECT_INTENT.md · **Epic:** E8 · **Effect class:** E1
**Assigned by:** coordinator goal, following SCMS-050.
**State:** Ready → Claimed → Done (closing state at bottom)

## The gap

SCMS-050 made promotion decide what readers see, and the site correctly went empty. But nothing
could be promoted: the editor had no route to record evidence or attest, and the editor and site are
separate processes with separate journals, so even a promotion made in one would have been invisible
to the other. The E8 arc stopped one step short of a reader seeing the result.

## What now works, end to end

Verified by driving the real servers:

```
editor:  qualify → QUALIFIED attestation
editor:  promote → publicationState: promoted
site:    replayed 4 owner action(s), 2 promoted
site:    /writing → 1 card, rss.xml → 1 item
```

And the control that makes it meaningful: a promoted **private** article produced **zero** cards.
Promotion decides publication; access still decides audience.

## Two decisions worth stating

**Replay goes through the contracts, not around them.** The action log records *what the owner did*,
and rebuilding replays those acts through the same registry. It does not restore serialized state.
That distinction is the point: a replayed action crosses exactly the gates the original crossed, so
a log entry cannot smuggle in something the contracts would refuse. If replayed evidence has expired,
the promotion is refused and the record simply is not published — which is correct, not a bug to
work around. Refusals are counted and reported at startup rather than swallowed.

**The self-attestation hole is disclosed at the point of use.** SH-13 records that attestations are
caller-supplied, so an owner attesting to their own work is self-certification. The qualify route
therefore writes `independentEvaluator: false` on every evidence record — truthfully, because the
owner is not independent of their own work — and returns a disclosure saying so in the response:

> *You attested to your own work… Nothing in the system currently requires an independent evaluator
> (SH-13), so this passes; that is a gap in the gate, not a property of your content.*

Building a workflow through a known-weak gate is defensible only if the weakness is visible where
someone meets it. A weakness recorded only in a register nobody reads is a weakness nobody meets.

## A routing bug found while wiring it

The generic `POST /api/entry/:subject` handler matched by prefix, so it swallowed
`/qualify` and `/promote`. Fixed by matching on shape (`/^\/api\/entry\/[^/]+$/`) rather than
relying on declaration order — order-dependent routing is a bug waiting for someone to reorder the
file.

## What this does NOT establish

Persistence here is **development-grade custody and not the durability decision** — SH-1 remains
open. The action log is a local file outside the repository; there is no shared database, no
concurrency control between the two processes, and the site rebuilds its Canon at startup rather
than following changes live. Wiring the transport between them is separate work.

## Closing state

**Done — the arc closes: edit, qualify, promote, and a reader sees it. Nothing is deployed.**
