# SCMS-069 — A gate between the claim register and the work graph

**Intent ref:** PROJECT_INTENT.md · **Epic:** E0 · **Effect class:** E1
**Assigned by:** SCMS-068's audit, finding 8 — the structural one.

## The gap

`SPEC_HEALTH.md`'s claim register and `work/GRAPH.md` describe overlapping reality, and **nothing
relates them.** `check-work-graph.py` validates the graph's internal consistency and says nothing
about whether the claims agree with it.

Two of the audit's four corrections shared that cause. The clearest: a claim row read *"blocked on
P7/P22"* for a day after P22 was accepted, while the graph row for the same work had already been
corrected. One register knew; the other did not; nothing compared them.

## Ready predicate

- **Scope:** a gate asserting that every claim row citing `SCMS-NNN` cites an item whose graph state
  is consistent with the rung claimed.
- **The narrow, decidable rule** — deliberately not "does this prose match reality", which is not
  mechanically decidable:
  1. A claim at an **Implemented** or **Tested** rung must cite at least one item whose state is
     `Done`. A claim resting entirely on Ready or Blocked work is a claim about intentions.
  2. A claim citing a **Blocked** item must itself be marked partial, blocked, or NOT established.
  3. Every `SCMS-NNN` cited in the register must exist in the graph. (Already true; asserting it
     stops it silently ceasing to be.)
- **Exclusions:** no natural-language comparison, no attempt to judge whether cited evidence
  *supports* a claim — that is what the adversarial passes are for, and a gate pretending to do it
  would be worse than none.
- **Acceptance:** the gate ships with a self-test proving each of the three rules fires; run against
  today's register it either passes or names a real inconsistency; wired into CI.
- **Stop conditions:** if the rules produce false positives on honest rows, stop and narrow them —
  a gate people learn to ignore certifies nothing (the same reasoning that kept
  `check-declaration-parity.py` to leaf fields).
