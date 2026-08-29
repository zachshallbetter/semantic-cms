# SCMS-015 — Dependency revisions track subjects, not snapshots (SSS §21 conformance)

**Intent ref:** PROJECT_INTENT.md · **Epic:** E4 · **Fixes:** NR-scms-003 (raised by SCMS-014)
**Assigned by:** coordinator goal (increase *qualified* maturity — this is a conformance defect
against a pinned protocol requirement, not a feature).
**Effect class:** E1 — library change plus vectors; no canonical mutation.
**State:** Ready → Claimed → (closing state at bottom)

## Objective

Restore pinned SSS §21: "changes outside the observable dependency set should not invalidate
the surface." Today every `SurfaceDependency.revision` carries the *snapshot* id, so a new
commit wave moves the fingerprint even when nothing observable changed.

## Ready predicate

- **Scope:** (1) add optional `revision?: string` to the frozen-snapshot subject shape;
  (2) resolver emits `dependencies[].revision = subject.revision ?? snapshot.snapshotId`, with
  the fallback **declared in code** — a snapshot that supplies no per-subject revisions cannot
  produce content-tracking fingerprints, and the coarse behaviour is stated rather than
  guessed; (3) `freeze()` populates each subject's revision from its Canon envelope; (4)
  vectors: fingerprint stable across waves when no accessible dependency changed, and moving
  when one did.
- **Exclusions:** no change to the fingerprint's domain separation or field set beyond the
  revision value; no two-tier hashing (P20 pending); no refresh policy (P4 pending); no
  changes to expression, contracts, or qualification.
- **Dependencies (satisfied):** SCMS-008 resolver, SCMS-011 freeze, SCMS-014 cache (its
  vector currently pins the defect and must be flipped by this item); sss pin §21.
- **Acceptance:**
  1. Two waves with no accessible change produce an **identical** fingerprint when the
     snapshot supplies per-subject revisions.
  2. An accessible content change moves the fingerprint.
  3. The non-leak property is preserved: hidden state still never enters the dependency set
     (SCMS-008's vectors continue to pass unchanged).
  4. Backward compatibility: a snapshot without per-subject revisions behaves exactly as
     before (the SCMS-008 suite and the published demo values remain valid).
  5. SCMS-014's defect vector is **flipped** to assert the corrected behaviour, and its
     inline defect note is replaced with the fix reference.
- **Evidence requirements:** all four existing suites plus the new vectors run green;
  recorded in scms-evidence-015 at **Implemented + Tested**. NOT established: that
  fingerprints are now optimal, only that they satisfy §21 on this path.
- **Permissions / effect class:** E1; project-mutation authority per bindings.
- **Target:** `impl/surface-resolver/src/{types,resolver}.ts`, `impl/canon/src/freeze.ts`,
  `impl/projection-cache/test/cache.test.ts`, `records/*`, `work/GRAPH.md`. No other path.
- **Budget:** one work cycle; no spend; no credentials.
- **Stop conditions:** (a) the fix would weaken the non-leak property → stop immediately;
  (b) published artifact values would silently become wrong → stop and republish as part of
  the item (honesty of a derived projection is not optional).

## Claim

Claimed by agent-under-owner-direction 2026-08-28; released at closing state below.

## Closing state

**Done — Implemented + Tested; NR-scms-003 closed.**
Evidence: records/evidence.jsonl · scms-evidence-015. Claim released.
