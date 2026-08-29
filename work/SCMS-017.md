# SCMS-017 — Consistency states, disclosure, and expiring presence (E6 narrow slice)

**Intent ref:** PROJECT_INTENT.md · **Epic:** E6 (board #11) · **Advances:** DESIGN.md §14 step 7
**Assigned by:** coordinator goal. Step 7 is the last §14 step whose canonical-v1 core is
unblocked; step 3's merge semantics overlap pending proposals P7/P22 (see the blocker recorded
at closing).
**Effect class:** E1 — a pure library; no transport, no canonical mutation.
**State:** Ready → Claimed → (closing state at bottom)

## Objective

Make R3 (live honesty) real at the semantic level: determine which HCML consistency state a
client is in, disclose it truthfully, and enforce the asymmetry that defines the design —
**conflict freezes consequential action while drafting continues** — plus presence that
expires by construction.

## Ready predicate

- **Scope:** `impl/observation/` —
  1. `consistencyState(baseline, canon)` → the six HCML states (`current | stale-but-safe |
     conflicted | superseded | revoked | unknown`) with a stated reason.
  2. `permits(state, action)` for `draft` vs `consequential`, implementing the asymmetry and
     `unknown` stopping at the protected boundary.
  3. `chip(state, freshness)` → the §8.3 disclosure line, computed against an **explicitly
     supplied** clock — never ambient time.
  4. Presence records carrying rr-rsp's mandatory `observedAt`/`expiresAt`, with
     `activePresence(records, nowMs)` and `heldLocks(...)` such that an expired record cannot
     drive a decision (soft locks self-release; ghost cursors are impossible by construction).
- **Exclusions:** P11's refinements are **pending** on PR #28 and are not implemented:
  presence×transport as two axes, UNKNOWN-as-rendered-state, hysteresis buffering, two-clock
  skew tracking, `absent_reason` codes, three absence granularities, named-absence routes.
  P10's transport (outbox, notify fan-out, `lagged`) is also pending — this slice determines
  and discloses state; it does not move it. No DESIGN.md change on main.
- **Dependencies (satisfied):** hcml pin (the consistency vocabulary and the freeze rule);
  rr-rsp pin (observation expiry: an expired observation may not drive decisions); SCMS-011
  Canon (revisions, supersession, revocation); node ≥ 22.6.
- **Acceptance:**
  1. Each of the six states is produced by a distinct, realistic situation.
  2. **Conflicted permits drafting and refuses consequential action** — the asymmetry that
     makes the design usable rather than merely safe.
  3. `unknown` refuses consequential action (stop at the protected boundary) while permitting
     local drafting, and is never silently treated as `current`.
  4. `superseded` directs action to the successor; `revoked` stops.
  5. Chips disclose freshness truthfully from the supplied clock and never claim "live" when
     the caller reports no successful check.
  6. Expired presence is excluded from active presence and cannot hold a lock; a lock held by
     an unexpired record is reported with its holder.
  7. Source-level: no ambient time or randomness anywhere in the module.
- **Evidence requirements:** `node --test` in scms-evidence-017 at **Implemented + Tested**
  for the narrow path. NOT established: transport, propagation latency, real multi-client
  behaviour, or empirical usefulness.
- **Permissions / effect class:** E1; project-mutation authority per bindings.
- **Target:** `impl/observation/` (new), `.github/workflows/gates.yml`, `records/*`,
  `work/GRAPH.md`. No other path.
- **Budget:** one work cycle; no spend; no credentials.
- **Stop conditions:** (a) honest disclosure would require a pending P11 refinement → stop and
  record; (b) determining a state would require ambient time → stop (the clock is an input);
  (c) the work would drift into transport → stop, that is P10-pending.

## Claim

Claimed by agent-under-owner-direction 2026-08-28; released at closing state below.

## Closing state

**Done — Implemented + Tested; §14 step 7 closed at the semantic level.**
Evidence: records/evidence.jsonl · scms-evidence-017. Claim released.
