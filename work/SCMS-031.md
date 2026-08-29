# SCMS-031 — The authoring surface, and the authority gate it exposed

**Intent ref:** PROJECT_INTENT.md · **Epic:** E12 · **Effect class:** E1
**Assigned by:** owner directive — *"We don't have a UI for the cms yet, so we'll need to figure that out."*
**State:** Ready → Claimed → Done (closing state at bottom)

## The gap

SH-8 has stood open since the register began: governance is specified exhaustively and what an
author actually sees is not. This slice builds the half of a UI that can be specified before any
visual decision — **what the editor may offer, to whom** — and leaves the visual language open,
per the owner's ratification that authoring slices are ResolvedSurfaces (DESIGN.md §11).

## Ready predicate

- **Scope:** derive the editor's operations from the live contract registry; declare the editor
  surface as `purpose: "edit"`; prove exposure gating and the exposure/authority separation.
- **Exclusions:** no visual design, no rendering, no deploy, no new contracts.
- **Acceptance:** the editor offers only implemented contracts; unimplemented intents are withheld
  with a legible reason; a compensatable operation is not offered without its compensation; effect
  class comes from the contract, not the editor; the owner's editor resolves a private draft while
  a public reader gets neither the operations nor the surface; and **offering is not permission**.

## What this slice actually found

The last acceptance criterion was written expecting to confirm existing behaviour. It found a
security defect instead, recorded as **NR-scms-005**.

The first version of that vector passed. It should not have been believed: it invoked promotion
with a stub input and asserted only that the outcome was not success. Checking *why* it was
refused showed it had blocked on a missing attestation — not on authorization. Reading the
handlers then showed the real state of affairs: **`req.actor` was recorded in every receipt and
consulted by no handler, and no handler read the caller's access at all.** Provenance was being
mistaken for a gate.

The reproduction: an anonymous caller at `public` access promoted an owner-private draft to
`promoted`, by supplying a self-written `QUALIFIED` attestation, a profile demanding no
verification, and a `promotionAuthority` string naming itself. Every gate the handler owned was
satisfiable by the party being gated, because authority arrived in the payload.

## The correction

Authority is now declared on the contract and enforced in one place:

- `ContractDefinition.minAuthority` is **required**, and checked at *registration* — a contract
  that does not state its authority cannot be registered. Types are stripped and not checked at
  runtime here, so this is a runtime refusal or it is nothing.
- `ExecutionContext.authority` is the authority the caller has **proven**, established by whatever
  authenticated the request. It is on the context and not in the input deliberately: input is
  written by the party being authorized, so an authority read from it is a claim, not a fact.
- `ContractRegistry.execute` refuses before dispatch, and refuses a context carrying no authority
  at all — fail closed.

Per-handler checking is what failed, so the fix does not add per-handler checks. A handler cannot
forget the gate because a handler never gets the chance to make it.

**27 previously-passing write vectors began failing the moment the gate landed.** Every one had
been executing writes with no authorization whatsoever. They now declare a proven authority.

## What remains open (not fixed here)

The attestation is still **caller-supplied and unverified**: `disposition: "QUALIFIED"` is trusted
because it was passed in. The authority gate means only an owner can exploit that today, which
lowers severity but does not close it — the evidence gate still accepts evidence from the party
being gated. Closing it needs a decision about who issues and signs attestations, which is an
authority question for the owner, not one for an implementer to invent. Registered as
**scms-blocker-003** and **SH-13**.

## Closing state

**Done — the editor cannot offer what nothing implements, and can no longer be mistaken for the
thing that decides what may happen.**
