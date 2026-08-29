# SCMS-021 — The bounded merge lane: merge, then validate (§14 step 3, partial)

**Intent ref:** PROJECT_INTENT.md · **Epic:** E1/E2 · **Advances:** DESIGN.md §14 step 3
**Assigned by:** coordinator goal, on re-deriving the frontier. §14 step 3 has three lanes;
blocking all three was too coarse.
**Effect class:** E1 — a pure merge/validate library; writes still cross SCMS-012's contract.
**State:** Ready → Claimed → (closing state at bottom)

## Why this is lawful now

DESIGN.md §8.5 (canonical v1, on main) specifies three concurrency lanes derived from SES
typed invariance:

| Lane | Rule | Status |
|---|---|---|
| `required` | serialized through a contract; loser gets `conflict` + recovery | **Proven** — SCMS-012 |
| `bounded` | merge, then validate against admission/cardinality; violation → `conflicted`, **never a silent fallback winner** | **This item** |
| `free` | convergent merge | **Blocked** — P7/P22 would reshape it (scms-blocker-001) |

The bounded lane depends on neither pending proposal: P7 adds a divergence-first *branching*
lane and P22 changes how merges are *justified*; neither redefines "merge then validate
against declared invariants." The validator it needs already exists (SCMS-016 socket admission
and cardinality). Implementing it pre-empts nothing.

## Ready predicate

- **Scope:** `impl/merge/` — (1) `mergeBounded(base, a, b, schema)` performing a structural
  three-way merge of a composition's socket occupancy, then validating the result against the
  declared composition schema; (2) outcome typing: `merged` when the union validates,
  `conflicted` when it does not — carrying the violated invariant and both contributions, never
  choosing a winner; (3) disjoint edits merge, overlapping edits on the same socket position
  are reported rather than resolved.
- **Exclusions:** **no free lane** (convergent/CRDT text merge) — blocked; no decision-map
  justification (P22 pending); no branching (P7 pending); no change to the required lane; no
  transport; no DESIGN.md change.
- **Dependencies (satisfied):** SCMS-016 composition schema + validator; SCMS-011 Canon;
  SCMS-012 contract path; ses pin (typed invariance semantics).
- **Acceptance:**
  1. Disjoint socket edits by two actors merge cleanly and the result validates.
  2. A merge that would exceed declared cardinality yields `conflicted` naming the socket and
     the violated bound — and **no** merged value is produced (no silent winner).
  3. A merge admitting a block the socket forbids yields `conflicted` naming the admission
     rule.
  4. Concurrent edits to the *same* socket slot are reported as a contention with both
     contributions preserved; the function refuses to pick.
  5. A `conflicted` result is not an error: it carries enough to review and resolve.
  6. The merge function is pure — no Canon writes; landing a merged result still goes through
     `content.revise@1`.
- **Evidence requirements:** `node --test` in scms-evidence-021 at **Implemented + Tested**
  for the bounded lane only. Explicitly NOT: the free lane, and therefore NOT §14 step 3 as a
  whole.
- **Permissions / effect class:** E1; project-mutation authority per bindings.
- **Target:** `impl/merge/` (new), `.github/workflows/gates.yml`, `records/*`, `work/GRAPH.md`.
- **Budget:** one work cycle; no spend; no credentials.
- **Stop conditions:** (a) the bounded lane cannot be expressed without deciding the free
  lane's shape → stop, that is the blocked part; (b) a vector would require P7/P22 → stop.

## Claim

Claimed by agent-under-owner-direction 2026-08-28; released at closing state below.

## Closing state

**Done — Implemented + Tested for the bounded lane; §14 step 3 remains partially blocked.**
Evidence: records/evidence.jsonl · scms-evidence-021. Claim released.
