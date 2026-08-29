# SCMS-075 — Link liveness as a Field signal, not a qualification gate

**Intent ref:** PROJECT_INTENT.md · **Epic:** E5 (Field) · **Effect class:** E1
**Assigned by:** the SH-22 discussion, 2026-08-29.

## The problem this solves

`ob/links-resolve` currently reports external URLs as `INCONCLUSIVE`, which is a coverage gap, which
blocks the article. **78% of the owner's corpus has at least one external URL** — 541 URLs across
119 domains — so 78% of articles cannot be promoted, while the check verifies **five** internal
references in total across 215 entries.

That is the wrong gate in both directions: it blocks almost everything while checking almost
nothing.

## Why liveness cannot be a gate

Making qualification depend on the reachability of 119 third-party domains would:

1. **Break determinism.** Every resolver and evaluator here is reproducible — explicit clocks, frozen
   snapshots, stable fingerprints. An evaluator doing network I/O means the same article qualifies
   on Tuesday and fails on Wednesday because someone else's server was down. The attestation would
   stop being a statement about the content and become one about the internet at an instant.
2. **Make publication silently expire.** A live URL dies later. Gating on it means published work
   becomes retroactively unqualified through no act of the author's.
3. **Be a disclosure.** 119 domains would learn this content is being processed, and roughly when.

## What it should be instead

The Field plane is built for exactly this: signals that decay and are re-observed. §9 already types
metric provenance and §8.4 already requires observations to carry `observedAt` and `expiresAt`.

Link health is an **observation about a subject**, which SCMS-046 established is a signal, not a
participant — so it can reach the editor without becoming part of the record or entering a reader
surface.

## Ready predicate

- **Scope:** a link-health observation per subject — reachable / unreachable / unchecked, with
  `observedAt` and `expiresAt` — surfaced on the entry in the editor.
- **Exclusions:** it does **not** feed qualification, and no obligation may depend on it. That is the
  whole point of the split.
- **Dependencies:** SH-22's disposition. If the owner narrows `ob/links-resolve` to internal
  references, this becomes the home for the external half. If they remove the obligation, this is
  the only place the information lives.
- **Acceptance:** a subject with an unreachable link shows it in the editor with the observation's
  age; the observation expires by construction; no attestation, disposition or promotion outcome
  changes as a function of it, asserted by a vector.
- **Stop conditions:** network access is required and is a real cost — if checking is not wanted at
  all, this ticket closes as declined rather than being built and left unused.
