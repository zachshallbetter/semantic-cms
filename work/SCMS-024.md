# SCMS-024 — Wire-protocol schema and golden canonicalization vectors (closes SH-12)

**Intent ref:** PROJECT_INTENT.md · **Epic:** E1 · **Closes:** SPEC_HEALTH SH-12
**Assigned by:** coordinator goal, on re-deriving the frontier.
**Effect class:** E1
**State:** Ready → Claimed → Done (closing state at bottom)

## The gap

SPEC_HEALTH SH-12 names the E1 slice deliverable: *"`schemas/scms/` JSON Schemas
(`additionalProperties: false`, hash-pattern-typed) + golden canonicalization vectors incl. a
negative vector."* SCMS-011 delivered the envelope as TypeScript types and a runtime validator,
but no interchange schema and no goldens. The wire protocol `scms-0.1` is named in every
envelope and defined nowhere a second implementation could read.

## Ready predicate

- **Scope:** (1) `schemas/scms/envelope.schema.json` — the interchange contract, closed
  (`additionalProperties: false`), hash-pattern-typed (`^sha256:[0-9a-f]{64}$`), encoding the
  provenance freshness rule conditionally; (2) `schemas/scms/golden/canonicalization.json` —
  input → canonical string → digest vectors, **including a negative vector** whose recorded
  digest is deliberately wrong; (3) a vector suite asserting the goldens reproduce, the
  negative one fails, and the schema and the runtime validator agree on a shared case set.
- **Exclusions:** no JSON-Schema *library* (zero-dependency policy) — full meta-validation of
  the schema is not performed and the limitation is recorded; no new envelope fields; no
  DESIGN.md change.
- **Dependencies (satisfied):** SCMS-011 envelope + canonicalJson + revisionHash.
- **Acceptance:**
  1. The schema parses, is closed, and types hashes by pattern.
  2. Every positive golden reproduces its canonical string and digest exactly.
  3. The negative golden **fails** as recorded — proving the vector check can fail.
  4. Schema and runtime validator agree on a shared valid/invalid case set (the freshness rule
     in particular).
  5. Canonicalization is order-independent and prunes undefined, per the goldens.
- **Evidence requirements:** `node --test` in scms-evidence-024, **Implemented + Tested**.
  NOT established: meta-validation of the schema document; cross-language reproduction.
- **Target:** `schemas/scms/`, `impl/canon/test/`, `.github/workflows/gates.yml`, `records/*`,
  `work/GRAPH.md`, `SPEC_HEALTH.md` (SH-12 resolved).
- **Stop conditions:** (a) agreement would need a schema library → record the limitation and
  assert agreement case-wise instead; (b) a golden cannot be reproduced → stop, that is a
  canonicalization defect, not a vector problem.

## Closing state

**Done — Implemented + Tested; SH-12 closed.**
Evidence: records/evidence.jsonl · scms-evidence-024. Claim released.
