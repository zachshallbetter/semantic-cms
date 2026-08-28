# SCMS-001 — Canonize the design; initialize the operating substrate

**Intent ref:** PROJECT_INTENT.md (originating intent; this item establishes the substrate that intent presumes)
**Effect class:** E1 (reversible internal mutation — files in this repository only)
**State:** Done — awaiting owner verification

## Objective

Make DESIGN.md canonical by placing it under a formal operating substrate: initialize
formal-project-bootstrap v0.5.0 in existing mode, distill and record project intent,
pin the eight formal resources with honest revision/digest state, bind local vocabulary
to source concepts, and produce reproducible compiled context.

## Scope

- Initialize FPB v0.5.0 (`--mode existing`) into this directory; zero-collision admission.
- Instantiate PROJECT_INTENT.md, PROJECT_PROFILE.json, FORMAL_RESOURCE_MANIFEST.json,
  bindings/PROJECT_BINDINGS.yaml, README.md.
- Create work/ register (GRAPH.md, this contract).
- Record evidence and alignment entries; regenerate compiled context; validate structure.

## Exclusions

- No application code, no schema implementations, no git initialization, no external
  publication, no changes to any pinned resource.
- DESIGN.md content unchanged (its sha256 remains e10a83dc4f333bf9…632a9581).

## Acceptance

1. `python3 scripts/validate-bootstrap.py --check-context` exits 0.
2. `python3 scripts/gen-context.py --check` exits 0 (context reproducible from unchanged sources).
3. FORMAL_RESOURCE_MANIFEST.json pins all eight resources with revisionOrDigest present
   and source state (clean/dirty/unversioned) disclosed.
4. records/evidence.jsonl carries the canonization evidence record.
5. records/alignment.jsonl records the DESIGN.md ↔ PROJECT_INTENT.md authority relation.

## Evidence requirements

Command outputs recorded in records/evidence.jsonl as disposition `observed` (single
execution; `reproduced` requires a second independent run).

## Notes

- reflective-rust pin is provisional: working tree dirty (61 paths) at pin time — disclosed
  in the manifest per integrity policy.
- Version control for this repository is recommended and intentionally left to the owner.
