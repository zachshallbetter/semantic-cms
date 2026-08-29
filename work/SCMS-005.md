# SCMS-005 — Resolve the gap register (build excluded)

**Intent ref:** PROJECT_INTENT.md
**Assigned by:** project.owner, 2026-08-28 ("resolve all of these items, excluding the build (for the moment)")
**Effect class:** E1 (this repository) + E0 (verification reads of external repos) + board/PR operations
**State:** In progress → items land incrementally this session

## Objective

Resolve gaps 2–7 of the 2026-08-28 gap assessment: recipient register, disposition
mechanics, self-enforcement, deferred-decision register, upstream errand tracking, and
evidence strengthening. Gap 1 (the build) is explicitly excluded by owner direction.

## Scope / deliverables

1. **Recipient (gap 2):** records/recipients.jsonl with candidate rcp-001 (owner +
   zachshallbetter.com archive), status derived `primitive`; board decision ticket for
   confirmation.
2. **Disposition mechanics (gap 3):** DESIGN.md v2 candidate integrating P1–P28,
   delivered as a PR (branch `design-v2-candidate`) so disposition is a per-hunk review;
   P#→section map in the PR body.
3. **Self-enforcement (gap 4):** .github/workflows/gates.yml (context reproducibility,
   structural validation, records append-only, projection sync — each failure-capable,
   two with self-tests); scripts/check-records-append-only.py;
   scripts/check-projection-sync.py; projections/ holding the artifact HTML sources +
   manifest.json (survives scratchpad loss; hash-locked to sources); verification
   checklists commented on #2–#4.
4. **Deferred decisions (gap 5):** SPEC_HEALTH.md — 12 tagged entries with proposed
   defaults + the claim register.
5. **Upstream errands (gap 6):** records/upstream-debts.jsonl (UD-1…UD-10) + one board
   issue per debt, labeled `upstream`.
6. **Evidence strengthening (gap 7):** two adversarial verification passes (lighter
   models) attempting to refute the 20 most load-bearing review claims; results land in
   records/evidence.jsonl and adjust the v2 candidate if refutations warrant; all pins
   hash-locked (pin-state record in records/alignment.jsonl).

## Exclusions

No E1–E7 build work. No DESIGN.md change on main (v2 lives on the PR branch until
promoted by the owner). Admission scans (P17) deferred to P17 acceptance — ticketed,
not run.

## Acceptance

Gates (including the two new checkers and their self-tests) pass locally and in CI;
board carries the recipient decision, upstream tickets, and the v2 PR; verification
results recorded with per-claim verdicts.
