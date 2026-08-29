# SCMS-007 — Consumption boundaries for all pinned protocol resources

**Intent ref:** PROJECT_INTENT.md · **Assigned by:** project.owner, 2026-08-28
("ensure they're defined and placed in the appropriate protocol or project directories")
**Effect class:** E1 (scms) + E2 (upstream protocol directories, additive files only)
**State:** Done — awaiting owner verification
**Evidence:** records/evidence.jsonl · scms-evidence-007

## Changes (upstream, all additive; zero normative content touched)

- **EQP:** package.json with exports for the four normative schemas
  (candidate / evidence-record / qualification-profile / qualification-attestation).
- **ICP:** protocol-manifest.json declaring the normative artifact under its own
  §7.2 identity rule (`icp:protocol/interaction-contract`), plus package.json.
- **SPS:** package.json naming the normative surface (docs/, INTENT.md), with
  house-style work/SPS-002.md + evidence/SPS-002-packaging.md.
- **HCML:** corpus package.json (research corpus — informs, does not command).
- **IEPE:** verified already defined (iepe-core 0.2.0, Apache-2.0) — no change.
- **fundamental / rr-rsp:** already ship real npm/Cargo boundaries — no change.

All four new manifests are private/UNLICENSED: those directories carry no
LICENSE, and license selection is an owner rights decision (UD-12), not
something to invent on their behalf.

## Pull (scms)

Aggregate content digests recomputed and re-pinned for sps/icp/eqp/hcml with a
six-dimensional compatibility declaration (all dimensions unchanged — additive
metadata only). UD-12 registered.

## Acceptance

All manifests parse; named files exist; scms gates green after re-pin.
