# SCMS-013 — Qualification and promotion as separate gates (E3 narrow slice)

**Intent ref:** PROJECT_INTENT.md · **Epic:** E3 (board #8) · **Advances:** DESIGN.md §14 steps 4–5
**Assigned by:** coordinator goal (increase *qualified* maturity; the publish path is the
thesis's centre — "publishing is qualification plus promotion, never a boolean on a row").
**Effect class:** E1 in this repository — a pure library. The **contract it models**,
`content.promote@1`, is an E3 consequential external commitment whose verification level is
therefore `reauthenticate`; the narrow slice proves the gate refuses without that
verification rather than performing any external publication.
**State:** Ready → Claimed → (closing state at bottom)

## Objective

Make publishing two gates that cannot collapse: **qualification** (is the required evidence
present, valid, current, sufficient for this exact revision and claim set) and **promotion**
(a separate authority acting on a qualified candidate). Close §14 steps 4–5 for the note
profile.

## Ready predicate

- **Scope:** `impl/qualification/` —
  1. EQP vocabularies imported as declared bindings: evidence `result`
     (`PASS|FAIL|PARTIAL|INCONCLUSIVE|BLOCKED|NOT_RUN|NOT_APPLICABLE`), `validity`
     (`VALID|INVALID|STALE|SUPERSEDED|OUT_OF_SCOPE|UNVERIFIABLE`), disposition
     (`QUALIFIED|NOT_QUALIFIED|BLOCKED|SUPERSEDED`) — verified from the pinned schemas.
  2. **Consequence profiles** (DESIGN.md §6.1) as declared data: `note`, `article`,
     `commitment` — each naming its obligations **and its end** ("no further gates" is a
     declared statement, not silence).
  3. `qualify(candidate, profile, evidence)` → attestation with disposition; missing evidence
     yields `INCONCLUSIVE` → disposition `BLOCKED`, never `PASS`/`QUALIFIED`.
  4. Incremental re-qualification by **radius** (`R1|R2|R3|R4`) implementing the v1
     RequiredEvidence equation: invalidated + new-claim + mandatory-profile evidence.
  5. `content.promote@1` registered in the SCMS-012 registry: refuses a non-`QUALIFIED`
     candidate; refuses without `reauthenticate` verification; on success emits a change
     receipt and moves the record's **publicationState** axis only.
- **Exclusions:** no P3 refinements (four-column verdicts, vacuous-pass gating, evaluator
  self-test requirements, per-obligation freshness) — **pending** on PR #28; canonical v1
  governs. No embargo scheduling, no external publication, no delivery. No evaluator
  independence claim (single-actor evidence here is recorded as such). No DESIGN.md change.
- **Dependencies (satisfied):** eqp pin (enums + qualification tuple + promotion boundary);
  SCMS-011 Canon (state axes, revisions); SCMS-012 registry (the only write path); node ≥ 22.6.
- **Acceptance:**
  1. `QUALIFIED` requires every profile obligation satisfied by `VALID` `PASS` evidence.
  2. A missing obligation yields `INCONCLUSIVE`/`BLOCKED` — provably not `NOT_QUALIFIED`
     (a coverage gap is not a finding about the candidate) and provably not `QUALIFIED`.
  3. `STALE` or `SUPERSEDED` evidence cannot qualify; an exception may not rewrite an
     evidence result to `PASS` (EQP §14).
  4. Qualification does not publish: a `QUALIFIED` attestation alone leaves
     `publicationState` unchanged.
  5. `content.promote@1` refuses a non-qualified candidate (`needs_evidence`) and refuses
     without `reauthenticate` (`verification_required`), each with executable recovery.
  6. Promotion by a named authority moves only `publicationState`, emits a receipt, and
     leaves semantic/evidence/delivery axes untouched.
  7. Radius drives incremental re-qualification: an R1 editorial change re-runs only
     invalidated obligations; an R3 schema-class change re-runs the mandatory set.
  8. The note profile's declared end holds: it requires no obligation the profile does not
     name (no gate creep).
- **Evidence requirements:** `node --test` output in scms-evidence-013; claim at the weakest
  justified rung — **Implemented + Tested** for the note profile on the narrow path. NOT
  established: evaluator independence, real evidence collection, embargo, external
  publication, empirical usefulness.
- **Permissions / effect class:** E1 in-repo; no protected action is performed — the promote
  contract's refusal path is what is exercised, never an external effect.
- **Target:** `impl/qualification/` (new), `.github/workflows/gates.yml`, `records/*`,
  `work/GRAPH.md`. No other path.
- **Budget:** one work cycle; no spend; no credentials; no external services.
- **Stop conditions:** (a) a vector would require a pending PR-#28 proposal → stop; (b)
  promotion would require performing an actual external publication → stop, that is a
  protected action requiring owner promotion authority; (c) qualification would need to
  manufacture evidence → stop (EQP forbids it).

## Claim

Claimed by agent-under-owner-direction 2026-08-28; released at closing state below.

## Closing state

**Done — Implemented + Tested for the note profile; §14 steps 4–5 closed on the narrow path.**
Evidence: records/evidence.jsonl · scms-evidence-013. Claim released.
