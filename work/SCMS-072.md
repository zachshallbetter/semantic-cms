# SCMS-072 — Evidence tone

**Intent ref:** PROJECT_INTENT.md · **Epic:** E5 (Field) · **Effect class:** E1
**Assigned by:** owner design direction, 2026-08-29 — the page builder's inspector shows
`Evidence Tone: steady`, and nothing implements it.

## What it is

SPS's `morphologyFor` had two halves. SCMS-008 decomposed them: **selection** went to SSS, and
**container form** went to the expression recipe. The half that went to neither is *evidence
density* — SPS's observation that a grouping's form should reflect **how much evidence actually
satisfies its lens**, surfaced as a tone: `earned` / `steady` / `fading`.

It is the honest answer to a real problem: a shelf declaring "recent work" with one stale item and a
shelf with twelve fresh ones are the same shelf structurally, and should not look the same.

## Ready predicate

- **Scope:** compute an evidence tone for a resolved group from its members' evidence state and
  recency, and expose it on the surface panel (SCMS-047 already renders that panel).
- **The boundary that matters:** tone is a **semantic** property, so it belongs to SSS's output, not
  to an expression. SSS-INV-008 forbids semantic priority prescribing graphical presentation, and
  the same applies here — the surface may say `fading`, and only an adapter decides whether that
  means smaller, greyer, later, or spoken last.
- **Exclusions:** no morphology selection driven by tone in this slice — that is the SES recipe's
  business and would recreate the coupling SCMS-008 separated.
- **Dependencies:** SH-7 is open (the Field plane is the least concrete plane), so tone must be
  computable from what exists — evidence state and observation timestamps — rather than from
  unbuilt metrics.
- **Acceptance:** a group whose members are qualified and recently observed reads `earned`; one
  whose evidence has expired reads `fading`; the tone appears on the Surface panel; and a vector
  asserts no expression's morphology changes as a *direct function* of tone.
