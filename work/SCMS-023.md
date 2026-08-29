# SCMS-023 — Constitutional gate: no Canon mutation outside the contract runtime

**Intent ref:** PROJECT_INTENT.md · **Epic:** E2 · **Effect class:** E1
**Assigned by:** coordinator goal, on re-deriving the frontier.
**State:** Ready → Claimed → Done (closing state at bottom)

## The gap

DESIGN.md §5 opens: *"No persistent mutation executes outside a registered contract."*
Nothing enforces it. `CanonJournal.append/supersede/revoke` are callable by any module, so the
rule is doctrine without a checker — the pattern SCMS-004 named as the uniform cautionary tale,
and the same family as the two defects just closed (SCMS-020, SCMS-022).

## Ready predicate

- **Scope:** `scripts/check-canon-write-boundary.py` — a source-level gate asserting that Canon
  mutators are called only from (a) the canon package itself, and (b) the contract handlers
  authorised to hold the write path (`impl/contracts`, `impl/qualification`). Test files may
  construct fixtures directly: that is legitimate fixture construction, not a production write
  path, and the gate says so explicitly rather than pretending otherwise. Wired into CI with a
  **self-test proving the gate can fail** (a gate that cannot fail is a finding).
- **Exclusions:** no runtime capability tokens or private-field enforcement — that would churn
  every fixture for no additional guarantee at this maturity; the honest limitation is recorded.
  No new contracts. No DESIGN.md change.
- **Dependencies (satisfied):** SCMS-011 canon, SCMS-012/013/020 contract handlers.
- **Acceptance:**
  1. The gate passes on the current tree.
  2. The gate **fails** when a violation is introduced (self-test with a synthetic violation).
  3. Violations name the file, line, and mutator.
  4. Test files are exempt by an explicit, documented rule — not by accident.
  5. CI runs both the gate and its self-test.
- **Evidence requirements:** gate output in scms-evidence-023 at **Implemented + Tested**.
  NOT established: runtime enforcement — a determined caller can still import the journal
  directly; this is a source-level boundary, and the record says so.
- **Target:** `scripts/check-canon-write-boundary.py`, `.github/workflows/gates.yml`,
  `records/*`, `work/GRAPH.md`.
- **Stop conditions:** (a) enforcement would require churning fixtures for no added guarantee →
  prefer the source-level gate and record the limitation; (b) the gate cannot be made to fail →
  stop, it is not a gate.

## Closing state

**Done — Implemented + Tested; the §5 rule now has a checker that can fail.**
Evidence: records/evidence.jsonl · scms-evidence-023. Claim released.
