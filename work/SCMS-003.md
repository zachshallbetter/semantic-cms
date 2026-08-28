# SCMS-003 — Canonize the dependency isolation doctrine

**Intent ref:** PROJECT_INTENT.md
**Assigned by:** project.owner, 2026-08-28 ("We will be building this system in isolation. If we use capabilities, they should be handled like crates or dependencies. If something is needed, broken, or missing in them — we will update the other project and pull the dependency.")
**Effect class:** E1 (canonical files in this repository)
**State:** Done — awaiting owner verification

## Objective

Record the owner's dependency doctrine in every canonical surface it governs, so
isolation and upstream-first repair are enforceable policy, not chat history.

## Scope / changes landed

- DESIGN.md §12.1 (new subsection; canonical statement — no section renumbering)
- PROJECT_INTENT.md constraints (`dependencies` row)
- FORMAL_RESOURCE_MANIFEST.json `integrityPolicy` (`consumptionModel`, `repairDoctrine`, `divergenceRequiresDeviation`)
- bindings/PROJECT_BINDINGS.yaml (doctrine header comment)
- records/alignment.jsonl (owner-directive record)
- Design artifact republished with the new DESIGN.md digest

## Exclusions

No dependency is re-pinned and no upstream project is modified by this item.

## Acceptance

Gates pass after landing (`gen-context.py --check`, `validate-bootstrap.py --check-context`);
the doctrine text is consistent across all four canonical surfaces; the design artifact's
envelope hash matches the updated DESIGN.md.
