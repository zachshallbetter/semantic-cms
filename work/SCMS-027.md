# SCMS-027 — Extend the composed proof to the full landed surface

**Intent ref:** PROJECT_INTENT.md · **Epic:** E7 · **Effect class:** E1
**Assigned by:** coordinator goal, on re-deriving the frontier.
**State:** Ready → Claimed → Done (closing state at bottom)

## The gap

SCMS-019 proved the spine composes — for the spine as it stood then. Since, the system gained
compensation (SCMS-020), the bounded merge lane (SCMS-021), declared-type enforcement
(SCMS-022), and fan-out (SCMS-026). The composed proof now lags its own components: each is
tested in isolation, but nothing shows them composing. That is the same "the record lags its
evidence" failure this project keeps closing.

## Ready predicate

- **Scope:** extend `impl/e2e` with seams for (1) the bounded merge landing through
  `content.revise@1` — a merged composition must still cross the contract, not bypass it;
  (2) the compensation round-trip inside the composed run, with the receipt chain intact;
  (3) fan-out over the composed world, including the non-leak across subscribers; and
  (4) an extended composite invariant covering every new artefact.
- **Exclusions:** no new production code — if a seam needs it, that is a finding, not a licence
  to widen. No free lane, no transport. No DESIGN.md change.
- **Dependencies (satisfied):** SCMS-011…026, all CI-verified.
- **Acceptance:**
  1. A bounded merge that validates lands via the governed write path and appears in Canon.
  2. A bounded merge that violates an invariant is refused and lands nothing.
  3. Promote → unpublish → re-promote composes inside the spine with the chain verifying.
  4. Fan-out over the composed world tells the member subscriber about visible changes and
     stays silent about the admin-only one.
  5. The composite invariant extends: no hidden subject appears in any artefact of the whole
     run, now including merge outputs, compensation receipts, and fan-out.
- **Evidence requirements:** `node --test` in scms-evidence-027, **Implemented + Tested for the
  composed path**. Establishes nothing new about the components themselves.
- **Target:** `impl/e2e/test/spine.test.ts`, `records/*`, `work/GRAPH.md`.
- **Stop conditions:** a seam requiring new production code → record the finding and stop.

## Closing state

**Done — the composed proof matches the landed surface.**
Evidence: records/evidence.jsonl · scms-evidence-027. Claim released.
