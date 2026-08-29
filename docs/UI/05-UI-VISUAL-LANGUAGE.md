# UI Visual Language

The UI should make the architecture understandable through visual grammar rather than protocol terminology.

Six recurring visual ideas can carry most of the model:

- **Focus** — what we are dealing with.
- **Field** — what surrounds it.
- **Lens** — why we are looking.
- **Threads** — how things relate.
- **Strata** — how it changed.
- **Pulse** — how current it is.

## 1. Focus + Field

The current subject is visually central. Related semantic material appears around it as a contextual field.

Changing purpose reorganizes the field while the subject remains stable. This teaches: the object is the same; what matters around it changes.

## 2. Semantic depth

Use depth to distinguish layers:

```text
CURRENT SURFACE
things that matter now

RELATED FIELD
things available nearby

CANON
underlying semantic state
```

The user can move outward for context or inward for provenance and source identity.

## 3. Relationship threads

Typed relations should be tangible and inspectable. Threads may stay quiet until selected, then reveal relation type, source, revision, and provenance.

## 4. Provenance marks

Use a compact recurring mark vocabulary:

```text
● declared
◇ derived
◉ observed
◆ certified
```

The mark answers “where did this come from?” without requiring constant labels.

## 5. State as independent tracks

Avoid one giant status badge. Show independent state dimensions such as content, evidence, publication, and delivery.

## 6. Freshness pulse

Realtime surfaces should expose currentness explicitly:

```text
● LIVE      checked 3s
◐ STALE     revision +2
○ SNAPSHOT  Aug 29 · 12:41
◇ LOCAL     unsent
```

## 7. Why this?

Every dynamically surfaced object should support a universal explanatory gesture: “Why this?” The reveal shows the actual relation path, eligibility, grouping, and priority that caused participation.

## 8. Semantic halos

Use subtle temporary visual emphasis for the role an object has in the current surface:

```text
primary
supporting
context
attention
unknown
withheld
stale
```

The role is contextual, not permanent metadata.

## 9. Withheld information as bounded absence

Where disclosure is permitted, inaccessible material can be shown as bounded presence without exposing protected content. Where disclosure is not permitted, it should not participate at all.

## 10. History as strata

Represent history as accumulated semantic strata rather than a flat revision list. Scrubbing backward reconstructs the state of the system at that coordinate.

## 11. Qualification as evidence structure

Show readiness as a constellation or support structure of evidence rather than a generic progress bar. Users should be able to see what supports readiness and where uncertainty remains.

## 12. Propagation as ripples

After promotion, show propagation outward from the canonical revision to derived projections and delivery destinations. Drift becomes a visible divergence rather than a hidden operational condition.

## 13. Context as a lens

Expose the current purpose simply, for example:

```text
Read   Edit   Understand   Qualify   Monitor
```

Changing the lens changes the surrounding semantic surface without pretending the user has moved to a different underlying object.

## 14. Semantic zoom

Zoom can change semantic granularity:

```text
Publication
  ↓
Collection
  ↓
Article
  ↓
Section
  ↓
Claim
  ↓
Evidence
```

Zooming inward increases granularity. Zooming outward increases relational context.

## 15. Peel-apart inspection

When deeper explanation is needed, the UI can reveal the experience as layers:

```text
REPRESENTATION — what you are seeing
EXPRESSION     — how it took form
SURFACE        — why this is here
CANON          — what is true
```

This gives users a direct visual explanation of the system’s architecture.
