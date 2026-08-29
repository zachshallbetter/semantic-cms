# SCMS-041 — Migrate the corpus through the governed path

**Intent ref:** PROJECT_INTENT.md · **Epic:** E8+E12 · **Effect class:** E1
**Assigned by:** owner directive — *"handle P7 by migrating my content using the editor in preview."*
**State:** Ready → Claimed → Done (closing state at bottom)

## What the instruction exposed

The owner's instruction could not be carried out, and finding out why is the substance of this item.

`content.revise@1` requires an existing revision. `content.promote@1` and `content.unpublish@1`
act on records that already exist. **There was no create contract.** So the only way content had
ever entered Canon was a direct `journal.append` — which DESIGN.md §5 forbids outside the Canon,
Contracts and Qualification packages, and which the write-boundary gate enforces.

Every migration and every vector did it from a test file, and the gate exempts fixture
construction by an explicit rule. So the exemption that was correctly written to allow fixtures
was also, silently, the only thing holding the entire import path up. A system that can revise,
publish, unpublish and merge but cannot lawfully *create* is a system whose content arrives by
magic — and nothing surfaced it until someone tried to do the real thing.

The write-boundary gate had in fact pointed straight at this an hour earlier, when it refused the
editor preview's data builder. That refusal read as a nuisance about a build script. It was the
actual finding.

## Ready predicate

- **Scope:** `content.create@1`, and a governed importer that offers each mapped envelope to the
  registry with a proven authority.
- **Exclusions:** no concurrent-editing workload yet (SCMS-042, which is what P7 needs); no
  deploy; no live-state change.
- **Acceptance:** the whole corpus lands through a contract with zero direct appends; every
  landing emits; a created record cannot arrive published or qualified however the input is
  shaped; creating over an existing subject is refused rather than silently replacing it; the
  import is idempotent and a re-run tells nobody about changes that did not happen; and an import
  without proven authority lands nothing.

## The consequence the owner needs to see

`content.create@1` fixes the state of a new record: draft, unqualified, unpublished. It is
deliberately not readable from input — the party being gated does not supply the value that
decides the gate (NR-scms-006).

**So 51 entries that were `published` on the old site do not arrive published.** Publishing here is
qualification plus promotion, and neither is inherited by being copied. Restoring them is a
deliberate act that needs evidence for each.

That is the system's central claim applied to its own migration, and it is either exactly right or
an unacceptable amount of ceremony for content that has been live for years. **That judgement is
the owner's**, so the strict behaviour is implemented and the choice is registered as **SH-15**
rather than settled quietly in either direction.

## Closing state

**Done — content can now come into existence lawfully, and the corpus arrives through the front
door. What it does not arrive with is a publication status it did not earn.**
