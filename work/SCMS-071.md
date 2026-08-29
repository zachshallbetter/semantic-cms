# SCMS-071 — Evidence addenda need a citation path

**Intent ref:** PROJECT_INTENT.md · **Epic:** E0 · **Effect class:** E1
**Assigned by:** SCMS-068's audit, finding 7.

## The gap

`scms-evidence-004a`, `-037a` and `-040a` are addenda that **nothing references.** Their content is
real — `-037a` records the write-boundary violation CI caught in the site server, which is a
genuinely useful finding — but the graph cites the parent id, so the addendum is unreachable from
any register. It is write-only.

## Ready predicate

- **Scope:** decide the convention and enforce it. Two candidates:
  1. A graph row cites every evidence record for its item, addenda included; the gate checks that
     an `-a` suffixed record is cited wherever its parent is.
  2. Addenda are abolished — a follow-up finding gets its own sequential id and its own row.
- **Recommendation:** (2). The `-a` suffix exists because I wanted to attach a finding to work that
  was already recorded, and a sequential id with a `supersedes`/`extends` field does that without
  inventing a second identifier grammar. Fewer kinds of identifier is worth more than the
  convenience.
- **Exclusions:** do not rewrite the three existing records — records are append-only. Give them a
  citation path and stop minting new ones.
- **Acceptance:** the convention is stated in `AGENTS.md`, the three existing addenda are reachable
  from the graph, and `check-work-graph.py` fails if a new orphan appears.
