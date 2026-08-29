# SCMS-025 — Reconcile the claim register to the evidence

**Intent ref:** PROJECT_INTENT.md · **Effect class:** E1
**Assigned by:** coordinator goal, on re-deriving the frontier.
**State:** Ready → Claimed → Done (closing state at bottom)

## The gap

SPEC_HEALTH's claim register exists so this project cannot state a claim above its rung. Its
rows still rate claims by evidence that predates SCMS-009…024 — including one row asserting
gates pass "(locally + CI)" that was written *before* NR-scms-002 revealed CI had never passed.
A register that lags its own evidence is exactly the decoration it was built to prevent, and it
can now err in **both** directions: understating what the run established, and overstating what
it did not.

## Ready predicate

- **Scope:** update every row of the claim register to the rung its current evidence supports —
  no higher and no lower — citing the evidence that sets each rung. Add rows for claims this
  run created (surface resolution, the composed spine, the write/publish path).
- **Exclusions:** no new claims about empirical usefulness or performance; no SPEC_HEALTH entry
  removals; no DESIGN.md change; nothing may be rated on a passing test alone where the claim
  is about usefulness.
- **Dependencies:** the evidence ledger (scms-evidence-009…024), all CI-verified.
- **Acceptance:**
  1. Every row cites specific evidence, not a general impression.
  2. No row is rated above what its evidence supports (`Tested` never implies `Qualified`;
     a passing vector never implies empirical usefulness).
  3. Claims this run did **not** establish are stated as not established — R2 transport, S4,
     durability, concurrency at scale.
  4. The register still names what would strengthen each claim.
- **Evidence requirements:** the diff itself plus scms-evidence-025.
- **Target:** `SPEC_HEALTH.md`, `records/*`, `work/GRAPH.md`.
- **Stop conditions:** if a row cannot be rated without an owner judgement, mark it as requiring
  owner disposition rather than guessing.

## Closing state

**Done — the register matches the evidence, in both directions.**
Evidence: records/evidence.jsonl · scms-evidence-025. Claim released.
