# SCMS-048 — The converge step, and the declaration-parity gate

**Intent ref:** PROJECT_INTENT.md · **Epics:** E6, E0 · **Effect class:** E1
**Assigned by:** coordinator goal.
**State:** Ready → Claimed → Done (closing state at bottom)

## Part 1 — `converge()`, the step §8.6 names and nothing implemented

§8.6's table permits consequential action in `stale-but-safe` **"✓ after converge"**. Nothing
implemented converge, so the qualifier had no referent, and `permits()` answered the whole question
with "yes" — which is why a client told it is 37 events behind can still publish (SH-17).

**This supplies the mechanism and deliberately does not flip the answer.** Whether lag should gate
promotion is a consequence-model decision and stays the owner's; what was missing was the thing that
decision would depend on. SH-17 is now a one-line change rather than a design question, and a vector
pins `permits()`'s current behaviour so the register keeps describing the system that exists.

Converging is narrow on purpose: it acknowledges that Canon advanced *elsewhere*. It does not
resolve a conflict, adopt a successor, or revive a revoked record — each of those needs a decision a
client cannot make by catching up, and a function that did them quietly under the name "converge"
would be exactly the widening this project keeps catching. All four refusals are vectored.

## Part 2 — the declaration-consumer parity gate (P27)

> *"A declaration format richer than the checker that consumes it silently becomes decoration."*

Four instances, all found by accident rather than by a gate: SCMS-020's compensation interaction
that did not exist, SCMS-022's content type nothing validated against, NR-scms-004's `unlisted` flag
documented for lenses that no lens consumed, SCMS-044's `editorRequest` the editor never called.
**Doctrine is what we had while committing it four times**, so this is a script.

`scripts/check-declaration-parity.py` asserts that every leaf field declared in a scms schema is
referenced by non-test source — 18 fields today. Deliberately narrow, because a broad version would
be worse than none:

- **Leaf fields only.** A container's name is often absent while its children are read individually;
  flagging it would train people to ignore the gate.
- **Reference, not correct use.** It cannot tell whether a field is consumed *properly*, only
  whether it is consumed at all. Stated in the script rather than implied.
- **Tests are not consumers.** A field exercised only by its own vectors is the SCMS-022 failure.

An intentionally-unconsumed field goes in `schemas/declaration-parity.json` with a reason — the
exception is the point, because it turns a gap into a decision.

Ships with a self-test proving it detects an unconsumed field and does not mistake a container for a
leaf. It currently passes with zero inert fields.

## A note on authority

P27 is a *recommendation* in SCMS-039 and is **not ratified**. Building the gate does not ratify it:
the gate enforces a rule this project has already recorded four violations of, and running it
produces information. If the owner declines P27, the CI step is one line to remove.

## Closing state

**Done — a qualifier in §8.6 has a referent, and the failure class with the most instances now has a
checker.**
