# SCMS-057 — Canon in Postgres: append-only by refusal

**Intent ref:** PROJECT_INTENT.md · **Epic:** E13 · **Effect class:** E1
**Assigned by:** owner — *"Migrate off of zach-core entirely."*
**State:** Ready → Claimed → Done (closing state at bottom)

## What this is

§13's sketch, made real:

> *"Store: Postgres. Revision and receipt tables append-only **by grant** (no UPDATE/DELETE for the
> runtime role)."*

The point is not that Canon now has a schema. It is that **append-only stops being something the
code promises and becomes something the database refuses.** This project's recurring failure is a
rule stated in prose beside code that only partly provides it; a grant cannot be partly provided.

## The shape

- **`canon_record`** — the revision *is* the primary key, so identity and integrity are one column,
  and re-landing identical content collides on the key rather than needing the idempotency check the
  in-memory journal implements by hand.
- **`canon_receipt`** — the hash chain. Ordering is carried by `prev_hash`, not by `seq` contiguity.
- **`canon_outbox`** — written **only** by an `AFTER INSERT` trigger on receipts, `SECURITY DEFINER`.
  The runtime role has no INSERT here, so an event exists **if and only if** a receipt does. The
  trigger also `pg_notify`s, which is the native channel §8.1 requires so fan-out needs no second
  infrastructure.
- **`canon_current`** and **`canon_revoked`** are **views**, not columns — SCMS-056's derivation,
  expressed where it belongs.

Two constraints worth naming: a unique partial index on `supersedes` makes a second successor
impossible, so `current` can never fork; and `supersedes IS DISTINCT FROM revision` rejects
self-supersession rather than leaving it merely unlikely.

## The conformance suite is fifteen refusals

The only honest test of a guarantee made by grants is to attempt the forbidden thing and require
failure. As the runtime role: UPDATE and DELETE on records and receipts, a forged outbox row, and
DELETE on the outbox — **all must fail**. Then the controls: the runtime *can* append, appending
*does* emit, and receipt/event parity holds. Fifteen checks, all passing.

## What Postgres taught us, immediately

The in-memory outbox required event ids to be **gapless**, on the reasoning that a gap would let a
client replay past a change it never saw.

That reasoning was wrong, and Postgres proved it within minutes:

```
before: max event_id = 3
after rollback+commit: event_ids = 1,2,3,5
```

A rolled-back transaction consumes a sequence value. So the store the design prescribes produces
gaps **legitimately**, and `verifyEmissionIntegrity` would have rejected it. Gaplessness was an
in-memory artifact mistaken for an invariant.

It was also the wrong detector. `eventsSince` is a `>` query, so an id that never existed skips
nothing. What actually detects loss is **receipt/event parity** — a receipt with no event is a change
nobody was told about — and that holds whether or not ids are contiguous. The check now requires
strictly-increasing ids, and parity does the work it was always doing.

A proxy that fails on the real store is worse than the property it proxied.

## What this does NOT establish

There is **no store adapter yet** — nothing in `impl/` reads or writes these tables, and the
in-memory journal is still what every other package uses. That is deliberate sequencing, not an
oversight: the grants are the load-bearing claim and they are provable on their own. The adapter is
next, and it is where the first runtime dependency (a Postgres driver) enters.

No auth, no migration runner, no connection pooling, no production database.

## Closing state

**Done — the database refuses what the design says it must, and says so in fifteen checks.**
