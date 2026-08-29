# SCMS-063 — The live channel to a browser

**Intent ref:** PROJECT_INTENT.md · **Epic:** E14 · **Effect class:** E1
**Assigned by:** owner — *"how about static pages and realtime editing of the page itself?"*
**State:** Ready → Claimed → Done (closing state at bottom)

## What it does

An SSE endpoint that pushes **invalidation keys** to a browser, per §8.3. The client re-fetches
through the same route it first rendered — so the channel carries *which subject changed* and never
content, and cannot become a second read path with its own access rules.

The full loop, driven end to end: promote in the editor → the action log grows → the site replays
the increment **through the contracts** → the outbox emits → `deliver` filters per subscriber → SSE
pushes one key → the browser re-fetches and swaps.

## The defect this produced, and the reason it happened

The first version computed the wave itself, straight from `journal.events()`, ignoring
`minimumAccess`. A **public** SSE client was sent the subject ids of owner-scoped evidence and
attestation records, revision hashes included — it learned that qualification had happened, on which
revision, and which obligations ran.

I wrote a **third** notification path beside `fanOut` (SCMS-026) and `deliver` (SCMS-033), both of
which exist precisely to be non-leaking, and the new one did not inherit the property. I did it while
quoting §8.3 in the module docstring.

Recorded as **NR-scms-018**. There is now no wave computation in the module: `deliver` decides what
each subscriber hears, filtering against that subscriber's own accessible dependency set.

## A second thing the fix surfaced

With the leak closed, a connecting client got an 80-key backfill — `position: null` means "has seen
nothing", so its first wave was everything its page already showed. But a client that has just been
served a page is **caught up**, not new. The position now comes from `deliver` rather than being
counted locally, for the same reason as above: "how many events are relevant to this subscriber" is
the question `deliver` already answers, and reimplementing it is how the leak happened one function
earlier.

## Failure degrades to truth

§8.3 is explicit that a dropped channel must not become a spinner. If the EventSource errors, the
chip reads `snapshot` and the page keeps the state it has. It never claims `live` without a
connection behind it — the rule NR-scms-010 was written about.

## What this is NOT

The file-watch is **development-grade custody**, and deliberately a seam rather than a design. The
real mechanism is already in the schema: `canon_emit` calls `pg_notify('canon_outbox', …)`, which is
the native channel §8.1 requires. When the adapter lands (SCMS-065) the watcher is replaced by a
LISTEN and nothing above it changes.

No reconnect-with-backoff, no `lagged` handling in the client, no auth — the site is public-only.

## Closing state

**Done — an edit in the editor reaches a reader's open page, and tells them only what they may hear.**
