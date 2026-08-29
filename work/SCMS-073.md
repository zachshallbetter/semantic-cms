# SCMS-073 — Embargoes

**Intent ref:** PROJECT_INTENT.md · **Epic:** E3 · **Effect class:** E3
**Assigned by:** owner design direction, 2026-08-29 — `Embargoes` is a nav section in the mockups.

## What it is

A promotion that takes effect at a declared future instant. DESIGN.md already names the pieces:
§9's editorial time makes **world time declared** (`publishedAt`, *"embargo instants — declaration
beats inference"*) and semantic time derived, with *"imminence ramps toward embargo horizons"*.

## Why it is E3 and not a scheduling feature

An embargo is a **consequential commitment made in advance**. Publishing early is the failure mode,
and it is unrecoverable in the way that matters — a reader who saw it, saw it. So it inherits
promotion's effect class rather than sitting beside it as a convenience.

## Ready predicate

- **Scope:** an embargo instant on a promotion; the publication axis moves only at or after that
  instant; the reader surface excludes an embargoed record until then.
- **The rule this must not break:** no ambient time. Every resolver and evaluator in this system
  takes an explicit clock, and an embargo is the first thing that genuinely *wants* to read a wall
  clock. It must not. The temporal coordinate is already in `SurfaceContext` (§21) — an embargo is
  evaluated against the caller's declared `at`, exactly as replay is.
- **Exclusions:** no scheduler, no background job. A record becomes visible because a later
  resolution is asked at a later coordinate, not because something woke up.
- **Acceptance:** an embargoed record resolves as absent before its instant and present at or after
  it, at the same access; the publication axis is not moved early; a vector resolves the same
  snapshot at two coordinates and gets two different surfaces; and no code path reads
  `Date.now()`.
- **Stop conditions:** if excluding an embargoed record requires the resolver to know *why* it is
  absent in a way a reader could detect, stop — that is a disclosure question (§5), not a
  scheduling one.
