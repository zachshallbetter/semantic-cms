# SCMS-054 — Evidence from evaluators that actually ran

**Intent ref:** PROJECT_INTENT.md · **Epic:** E3 · **Effect class:** E1
**Assigned by:** coordinator goal, on reviewing what SCMS-051's qualify route actually recorded.
**State:** Ready → Claimed → Done (closing state at bottom)

## The defect I shipped hours earlier

SCMS-051's qualify route recorded `result: "PASS"` for **every** obligation in the profile —
including `ob/links-resolve` and `ob/media-alt-text`, for which no checker exists and none ran.

That is not the self-attestation SH-13 describes, and which the route honestly disclosed. It is
**fabricated evidence**: a reader of the record could not tell that the check never happened. I
built a disclosure for the weaker problem and walked past the stronger one in the same function.

## The vocabulary already had the honest answer

`NOT_RUN` was already in the evidence vocabulary, and `qualify()` already treats it correctly — a
NOT_RUN obligation is a **coverage gap**, which yields `BLOCKED`, never `QUALIFIED`. EQP's whole
point is that an unrun check is not a passed one. The machinery was right and the caller was lying
to it.

## What now happens

`impl/qualification/src/evaluators.ts` gives each obligation either a real evaluator or an explicit
`NOT_RUN` with a stated reason:

| Obligation | Status |
|---|---|
| `ob/schema-valid` | **real** — runs the declared content type's checker |
| `ob/access-declared` | **real** — the envelope must carry a declared access level |
| `ob/links-resolve` | NOT_RUN — no link checker exists |
| `ob/media-alt-text` | NOT_RUN — no media inspector exists |
| `ob/entitlement-declared` | NOT_RUN — entitlement classes are P2, deferred |
| `ob/recipient-contract` | NOT_RUN — no checker exists |
| `ob/second-attestation` | NOT_RUN — independent attestation is SH-13 |

Missing evaluators are named **individually** rather than defaulted, so adding an obligation to a
profile without an evaluator produces a blocking NOT_RUN instead of a silent pass.

The consequence is honest and inconvenient, and was confirmed against the real corpus:

```
article → schema-valid PASS · access-declared PASS · links-resolve NOT_RUN · media-alt-text NOT_RUN
        → BLOCKED → promote refused: needs_evidence
note    → schema-valid PASS · access-declared PASS
        → QUALIFIED → promoted
```

**An article cannot currently be published**, because two of its four checks do not exist. That is
not a verdict on the content; it is the system declining to certify what it has not examined.

## Two further defects this uncovered

**The declared type did not describe the content.** `ARTICLE_TYPE` never declared a `summary` slot,
which the owner's corpus carries on most entries, so every migrated article failed `schema-valid`
with `undeclared-slot at summary`. A declared type is meant to describe the content that exists,
not a subset someone remembered. Added.

**Type enforcement was inert at import.** SCMS-022 made declared types load-bearing in the governed
write path *when a validator is supplied* — and `governedImport` supplied none, so 215 records were
created without their type ever being consulted, and the mismatch surfaced only later at
qualification. `governedImport` now threads `validateBody`, and both servers pass it. All 215 still
import, so the type and the corpus now agree.

## Closing state

**Done — evidence records what was checked, and the system declines to certify what it has not
examined.**
