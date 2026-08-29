# SCMS-033/034 — The wire: backfill, replay, and honest lag

**Intent ref:** PROJECT_INTENT.md · **Epic:** E5 · **Effect class:** E1
**Assigned by:** coordinator goal under owner sign-off; unblocked by P10.
**State:** Ready → Claimed → Done (closing state at bottom)

## The gap

SCMS-032 made the system unable to change without saying so. Nobody was listening. R2 had emission
and no delivery, which §8.1 specifies in full: backfill burst then live, reconnect by
`last_event_id` with *no event loss* as a stated criterion, an explicit `lagged` disclosure, and
`catch-up-then-live` recovery.

## The property that was easy to lose

**Lag must be measured in what the subscriber may see, not in what happened.**

The obvious implementation limits the burst on the pending event stream and reports how far behind
the client is. That number is global write volume. Telling a public subscriber "you are 400 events
behind" when 399 of those were changes to private drafts turns the lag disclosure into a side
channel for exactly the inference SCMS-026 closed by sending silence instead of empty
notifications — and it does it while looking like a helpful protocol message.

So relevance is computed *first*, and the burst limit applies to the subscriber's own stream. A
vector makes a hundred changes to a subject the subscriber cannot see and asserts the delivery is
not lagged: only two events were ever its business.

The same discipline governs the rest. A lens is an allow-list applied after the accessible
dependency set, so it can only remove keys — a lens naming a subject outside that set grants
nothing. Silence remains silence: a subscriber with nothing to hear gets no message and its cursor
does not advance, because advancing it with an empty delivery would announce that a wave occurred.
And the wire carries invalidation keys, never content, so a delivery cannot shortcut the access
projection a client re-fetches through.

## What this does NOT establish

Transport *semantics*, in memory, in one process. There is no network, no durability, no real
latency, no reconnection over a dropped socket, and no measurement against §8.6's budgets — which
do not exist yet (SH-6). R2 moves to implemented-and-tested for its semantic core, and the register
says exactly that rather than "R2 done".

## Closing state

**Done — the system says what changed, to exactly whoever may hear it, and tells the truth about
being behind.**
