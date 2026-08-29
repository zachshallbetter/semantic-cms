# SCMS-047 — The inspector's three tabs (owner design direction)

**Intent ref:** PROJECT_INTENT.md · **Epic:** E12 · **Effect class:** E1
**Assigned by:** owner — three UI mockups supplied as design direction, no accompanying text.
**State:** Ready → Claimed → Done (closing state at bottom)

## What the mockups establish

The most consequential thing in them is structural, not visual: **the inspector is tabbed
Inspector / Surface (SSS) / Expression (SES).** That turns `CANON ≠ SURFACE ≠ EXPRESSION` from a
sentence in the design into something a person navigates. The separation this project spent
SCMS-008 adopting and SCMS-044 enforcing becomes a thing you can click.

Several details confirm what was already built rather than redirecting it: Status is labelled
**Multi-Axis** with the four independent rows §3.5 requires; the chip reads *"Live · checked 18s
ago"* in the top bar, which is SCMS-035's rule in its intended position; Revision carries a
**not promoted** badge beside a draft number, so publication is visibly not a property of having
saved; and a frozen snapshot appears as a first-class sidebar object.

## What this item built

The two tabs whose data already existed and was never exposed.

**Surface (SSS)** — purpose, access projection, snapshot, fingerprint, and every group with its
role and members. The load-bearing field is **`basis`**: SSS §25 requires each included member to
carry an inspectable reason for participating, and nothing surfaced it. An author could see *that*
a related record appeared and never *why*. It now reads `priority 1 — subject-anchor`. Exclusions
appear too, so absence is legible rather than silent.

**Expression (SES)** — the adapter's identity, modality, and the container form it chose per group.

## The decision inside the Expression tab

The mockup shows **Recipe / Theme / Variant**. Those are SES vocabulary, and **we do not implement
them.** Filling those fields with local inventions would be precisely the duplication the SSS/SES
boundary exists to prevent, and precisely what §12.1 forbids — inventing upstream semantics locally
instead of consuming them.

So they are rendered as *"not implemented here"*, with the reason stated in the panel: SES is a
pinned dependency. What the tab reports instead is the same question in vocabulary we actually own —
adapter, modality, morphology per group. A UI that shows an empty field it does not own is more
honest than one that quietly invents a value for it.

## Acceptance — all met

1. The Surface tab reports the resolver's decision: purpose, access, snapshot, fingerprint, groups.
2. Every member carries a non-empty basis, asserted for all members.
3. The Expression tab reports the adapter's own choices and names what SES owns as absent.
4. **The panels cannot cross**: a vector asserts no container form the expression chose appears
   anywhere in the surface panel, and that the expression presents exactly the surface's members.
   That is SSS-INV-008/009 checked at the UI layer, where it is easiest to violate by accident.

## Gaps the mockups name and this item does not close

Recorded rather than quietly scoped in: **Evidence Tone** (SPS's evidence-density half, unbuilt);
**Entitled Groups** and **Staged Access** (P2, deferred); **Embargoes** (no representation at all);
and the **page builder**, which is an SES composition surface with no counterpart in the codebase
and would be its own epic. None of these are started on the strength of a mockup.

## Closing state

**Done — the architecture's central separation is now something a person can click, and the fields
we do not own say so.**
