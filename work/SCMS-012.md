# SCMS-012 — Contracts: `content.revise@1`, the governed write path (E2 narrow slice)

**Intent ref:** PROJECT_INTENT.md · **Epic:** E2 (board #7) · **Advances:** DESIGN.md §14 step 2
**Assigned by:** coordinator goal (narrowest end-to-end proof; §14 step 2 follows the landed
Canon slice).
**Effect class:** E1 — a pure library over the in-memory journal; no persistence, no protected
action. (The *contracts it models* carry their own effect classes; `content.revise@1` is an E1
reversible draft mutation whose verification level is therefore `none`, per DESIGN.md §5.)
**State:** Ready → Claimed → (closing state at bottom)

## Objective

Close §14 step 2: no persistent mutation outside a registered contract. One contract —
`content.revise@1` — landing draft revisions into Canon through the ICP instance lifecycle,
with typed outcomes, executable recovery, optimistic concurrency, and change receipts.

## Ready predicate

- **Scope:** `impl/contracts/` — (1) a contract **registry** keyed by versioned identity;
  (2) `execute()` driving the ICP instance lifecycle subset `declared → ready → started →
  validating → processing → completed | conflicted | failed`, with every terminal outcome drawn
  from the ICP outcome-class vocabulary; (3) typed **recovery actions** from the ICP vocabulary
  on every blocking outcome; (4) **optimistic concurrency**: a revise against a stale
  `expectedRevision` yields outcome `conflict` carrying the current revision and
  `refresh_record` + `review_conflict` recovery — never a silent overwrite; (5) **change
  receipts** per ICP §10.5 shape (before/after revision, path-level changes, reversibility,
  integrity digest) chained into the journal's receipt ledger; (6) the structural rule: the
  journal's write surface is reachable only through a registered contract in this package's
  API.
- **Exclusions:** exactly one contract definition (no promote, entitle, or migrate contracts —
  those are E3/later); no verification levels above `none` (nothing here is E2+ in effect); no
  qualification or promotion logic (E3, EQP-owned); no transport, HTTP, or persistence; no
  changeCertainty/receiptSurrogate (P8 is a **pending** proposal on PR #28 — canonical v1
  governs); no DESIGN.md change on main.
- **Dependencies (satisfied):** icp pin (instance states §5.1, outcome classes, recovery
  actions, change receipt §10.5 — all re-verified from source this cycle, and independently
  confirmed in scms-evidence-005 claim 10); SCMS-011 Canon journal; node ≥ 22.6.
- **Acceptance:**
  1. An unregistered contract id cannot execute (`not_found`, no journal write).
  2. A valid revise appends a superseding revision and emits a change receipt whose
     before/after revisions match the journal, with a verifiable integrity digest.
  3. A stale `expectedRevision` yields `conflict` with the current revision and executable
     recovery — and the journal is unchanged (no partial write).
  4. Invalid input yields `invalid_input` with `focus_field` recovery and no journal write.
  5. Every non-completed outcome carries at least one recovery action or a declared terminal
     reason (ICP: a blocking outcome is not an error).
  6. Instance lifecycle states are recorded in order and are all ICP-canonical strings.
  7. The receipt ledger still verifies after contract-driven writes (chain intact).
- **Evidence requirements:** `node --test` output in scms-evidence-012; claim at the weakest
  justified rung — **Implemented + Tested** for one contract on the narrow path. NOT
  established: multi-contract composition, verification levels above `none`, durability,
  concurrency under real parallelism, or empirical usefulness.
- **Permissions / effect class:** E1; project-mutation authority per bindings.
- **Target:** `impl/contracts/` (new), `.github/workflows/gates.yml`, `records/*`,
  `work/GRAPH.md`. No other path.
- **Budget:** one work cycle; no spend; no credentials; no external services.
- **Stop conditions:** (a) a vector would require a pending PR-#28 proposal → stop, canonical
  v1 governs; (b) governed writes would require weakening the journal's append-only property →
  stop; (c) a needed ICP concept is missing upstream → stop and record upstream debt.

## Claim

Claimed by agent-under-owner-direction 2026-08-28; released at closing state below.

## Closing state

**Done — Implemented + Tested for the narrow path; §14 step 2 closed.**
Evidence: records/evidence.jsonl · scms-evidence-012. Claim released.
