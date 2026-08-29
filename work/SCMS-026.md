# SCMS-026 — Subscription fan-out: who is told, and who must not be

**Intent ref:** PROJECT_INTENT.md · **Epic:** E6 · **Advances:** DESIGN.md §8.2–8.3
**Assigned by:** coordinator goal, on re-deriving the frontier.
**Effect class:** E1
**State:** Ready → Claimed → Done (closing state at bottom)

## The gap

§8.3: *"the notify phase pushes invalidation keys; clients re-fetch through access projection."*
SCMS-014 decides whether **one cache entry** is stale. Nothing decides **which subscribers** to
tell. The non-leak property proven so far is about a viewer's own entry; fan-out raises a
different question — can a subscriber learn, from being notified at all, that something they
cannot see has changed? That is unproven, and it is where the side channel would actually live.

## Ready predicate

- **Scope:** `impl/notify/` — a subscription registry where each subscription is a lens
  (§8.2: allow-list scope + access level); `fanOut(subscriptions, changedSubjectIds)` returning
  per-subscription invalidation keys, derived **only** from each subscription's own accessible
  dependency set; a silence guarantee — a subscription whose set is untouched receives nothing,
  not an empty notification.
- **Exclusions:** no wire, no durability, no outbox, no replay, no `lagged` — those are P10's
  proposal and pending on PR #28. This decides *who is told*; it does not move anything. No
  DESIGN.md change.
- **Dependencies (satisfied):** SCMS-008 resolver dependencies; SCMS-014 cache; SCMS-011 Canon.
- **Acceptance:**
  1. A subscriber whose dependency set contains a changed subject receives an invalidation key
     naming it.
  2. A subscriber whose set does not is **not notified at all** — silence, not an empty message
     (an empty message is itself a signal that a wave occurred).
  3. **The fan-out non-leak:** an admin-only change produces byte-identical fan-out output to a
     world where that change never happened, for every lower-access subscriber.
  4. Two subscribers at different access levels over the same subject are decided
     independently.
  5. Fan-out is pure and reads no access-scoped state itself (asserted at source level).
- **Evidence requirements:** `node --test` in scms-evidence-026, **Implemented + Tested**.
  NOT established: R2 as a whole — nothing is transported; delivery, ordering, and replay
  remain unbuilt and P10-pending.
- **Target:** `impl/notify/`, `.github/workflows/gates.yml`, `records/*`, `work/GRAPH.md`.
- **Stop conditions:** (a) correct fan-out would need to read state above a subscriber's level →
  stop, that is the leak; (b) the work drifts into transport → stop, P10-pending.

## Closing state

**Done — Implemented + Tested; fan-out decides who is told without telling anyone what they cannot see.**
Evidence: records/evidence.jsonl · scms-evidence-026. Claim released.
