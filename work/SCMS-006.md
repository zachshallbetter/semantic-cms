# SCMS-006 — First upstream-first cycle: FPB v0.5.1 and SES packaging

**Intent ref:** PROJECT_INTENT.md · **Assigned by:** project.owner, 2026-08-28
("Go ahead and update the protocols and formal project bootstrap")
**Effect class:** E1 (scms) + E2 (upstream repos: FPB new release dir, SES commit)
**State:** Done — awaiting owner verification
**Evidence:** records/evidence.jsonl · scms-evidence-006

## Changes

**Upstream — formal-project-bootstrap v0.5.1** (new sibling release dir; v0.5.0
untouched, preserving its pinned digest): AUTHORITY_MODEL gains instrument
stratification ("authorization by the cheaper record" named illegal, provenance
NR-scms-001); FORMAL_RESOURCES gains Consumption / Upstream-first repair /
Upstream debt (ratchet subordinated to the deviation instrument); NEGATIVE_KNOWLEDGE
names two drafting failure classes; VERSION/CHANGELOG/README/profile-template/
package-manifest bumped; full check-all gate green. Doc-level additive — no
schema, script, or required-file changes.

**Upstream — semantic-expression-system SES-041** (commit 40e543653112):
package.json exposing the normative schemas for downstream pinning; work item +
evidence in house style; no normative change. Closes UD-1 (#16). Registry
publication remains a separate owner-authorized promotion.

**Pull — scms:** fpb re-pinned 0.5.0 → 0.5.1, ses pin advanced; six-dimensional
compatibility declared (records/alignment.jsonl); the three amended COMMON docs
synced into docs/ (mechanical sync of the pin); UD-1 closure appended.

## Exclusions

Other protocols unchanged (no concrete pending amendments; the stratification
rule's one authoritative home is FPB's authority model, which they all import).
The dated Gate & Protocol Register untouched (it is an observation, not living
doctrine). Non-repo protocol dirs not git-initialized (would break content-digest
pins without owner direction). reflective-rust's dirty tree untouched (UD-8 —
its 61 paths are unreviewed WIP, not mine to commit).
