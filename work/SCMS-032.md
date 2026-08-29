# SCMS-032 — The transactional outbox: nothing happens without an emission

**Intent ref:** PROJECT_INTENT.md · **Epic:** E5 · **Effect class:** E1
**Assigned by:** coordinator goal under owner sign-off; unblocked by P10's acceptance.
**State:** Ready → Claimed → Done (closing state at bottom)

## The gap

R2 live propagation is the only realtime obligation with **nothing built**. Consistency state is
computed (SCMS-017) and then nothing moves it. P10's acceptance made the transport lawful and,
better, specified it: §8.1 names the transactional outbox as the sole emission source, with
*"nothing happens without an emission"* as the property and *no event loss* as an acceptance
criterion.

## The design decision that carries the weight

**The outbox lives inside `CanonJournal`, not beside it.**

The obvious build is an emitter the write path calls after landing a record. That is the shape
this project has now failed at three times: an obligation every implementer must remember is an
obligation someone eventually forgets (NR-scms-005 on authorization, NR-scms-006 on the gate that
replaced it). An emitter that can be skipped turns the property into a slogan.

Putting emission inside `#land` means there is no code path that lands a record without emitting,
because the emission is not a separate step a caller performs — it is part of what landing *is*.
Validation throws before it, so a rejected write emits nothing, and the idempotent re-land path
returns before it, so re-landing identical content is correctly not a change.

This does not couple Canon to transport. The outbox holds rows, not connections. §8.1's own
justification is the argument: the audit trail, projections, dead-letter handling and subscribers
are all *consumers* of the stream the system already needed for its own integrity. The stream is
integrity substrate; the wire comes later (SCMS-033).

## Ready predicate

- **Scope:** the outbox row, emission inside the journal, cursor-based replay, and the integrity
  checks that make the property verifiable.
- **Exclusions:** no wire, no subscribers, no fan-out (SCMS-033), no lagged disclosure (SCMS-034),
  no persistence. Durability and real transactions remain SH-1.
- **Acceptance:** every append, supersede and revoke emits; a rejected write emits nothing; an
  idempotent re-land emits nothing new; event ids are gapless and monotonic; the event stream and
  the receipt chain agree; replay from *every* cursor position loses nothing; a cursor ahead of
  the stream returns silence rather than an error; events name a revision and carry no content;
  the integrity check can fail; and the real 226-record corpus emits exactly once per record.

## What this does NOT establish

Emission, not delivery. Nothing is transported, nothing is subscribed, and no client has ever
reconnected. The in-memory "transaction" is a single synchronous operation, which is the right
*semantics* but is not a database transaction — durability and concurrent commit remain open
under SH-1. R2 moves from *not established* to *partially established*, and the register says so.

## Closing state

**Done — the system can no longer change without saying so.**
