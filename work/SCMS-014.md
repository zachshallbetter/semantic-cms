# SCMS-014 — Fingerprint-scoped projection invalidation (E4 narrow slice)

**Intent ref:** PROJECT_INTENT.md · **Epic:** E4 (board #9) · **Advances:** DESIGN.md §14 step 8
**Assigned by:** coordinator goal (narrowest end-to-end proof). SCMS-008 proved hidden state
cannot move a fingerprint; this closes the other half — that it cannot move an *invalidation*
either, which is where the side channel would actually leak.
**Effect class:** E1 — a pure cache library over existing surfaces; no canonical mutation.
**State:** Ready → Claimed → (closing state at bottom)

## Objective

Prove the design's most distinctive projection claim end to end: **cache correctness and
side-channel safety in one mechanism**. A cached projection is invalidated exactly when a
subject in its *own accessible dependency set* changes — so an edit the viewer could not
observe produces no invalidation for them, and invalidation timing leaks nothing.

## Ready predicate

- **Scope:** `impl/projection-cache/` —
  1. A cache keyed by `(requestIdentity, accessLevel)` holding the resolved surface, its
     fingerprint, and the SSS `dependencies` the resolver already emits (SSS §21 — a *pinned*
     requirement, not a pending proposal).
  2. `commitWave(changedSubjectIds)` → per-entry decision `invalidated | retained`, with the
     deciding dependency named (an audit trail, not a boolean).
  3. Re-resolution on read after invalidation, and a fingerprint comparison proving the new
     surface actually differs when it should.
- **Exclusions:** P4's declared **refresh policy** (eager / lazy-on-read / scheduled), the
  human-verification eagerness override, and the `computed_from` naming are **pending** on
  PR #28 — not implemented. No stale-while-revalidate. No transport, no persistence, no TTLs
  (freshness disclosure is E6/Observation, and its refinements are pending under P11). No
  DESIGN.md change on main.
- **Dependencies (satisfied):** SCMS-008 resolver (emits `dependencies` + `fingerprint` over
  the access-projected set); SCMS-011 Canon + freeze; sss pin §21; node ≥ 22.6.
- **Acceptance:**
  1. A change to a subject **in** an entry's dependency set invalidates that entry.
  2. A change to a subject **not** in the set retains the entry.
  3. **The side-channel vector:** editing an admin-only subject invalidates the owner-access
     entry and provably does *not* invalidate the member-access entry — the member's cache
     state is byte-identical to a world where that subject never changed.
  4. The same holds for an entitlement-withheld subject: it *is* a dependency (it was
     evaluated and excluded), so a change to it may invalidate — proving the mechanism keys on
     *observability*, not on membership.
  5. Retained entries keep their original fingerprint; invalidated entries re-resolve to a
     fingerprint that differs iff the accessible content differs.
  6. Every invalidation decision names its deciding dependency.
- **Evidence requirements:** `node --test` output in scms-evidence-014; claim at the weakest
  justified rung — **Implemented + Tested** for the narrow path. NOT established: distributed
  caching, eviction under memory pressure, refresh policy, empirical performance.
- **Permissions / effect class:** E1; project-mutation authority per bindings.
- **Target:** `impl/projection-cache/` (new), `.github/workflows/gates.yml`, `records/*`,
  `work/GRAPH.md`. No other path.
- **Budget:** one work cycle; no spend; no credentials; no external services.
- **Stop conditions:** (a) correct invalidation would require reading state above the entry's
  access level → stop (that is the leak this exists to prevent); (b) a vector would require a
  pending PR-#28 proposal → stop; (c) the resolver would need to change to support caching →
  stop and re-scope (the cache is downstream, not a resolver concern).

## Claim

Claimed by agent-under-owner-direction 2026-08-28; released at closing state below.

## Closing state

**Done — Implemented + Tested; §14 step 8 closed on the narrow path.**
Evidence: records/evidence.jsonl · scms-evidence-014. Claim released.
