# Project Intent

**Project ID:** `scms`
**Project Name:** `Semantic CMS`
**Status:** Active

## Originating intent

Publishing and collaborating on content today forces a choice between systems that are live but dishonest (optimistic UI, silent merges, caches that serve superseded content without admission) and systems that are honest but static. This project exists to change that condition for the project owner's own publications and tooling — and for collaborators, human and machine, who work on them — by building a content management system in which every consequential fact is an explicit, typed, provenance-bearing, versioned record with a named authority, and everything visible is a declared projection of those records. The outcome that counts: content can be co-authored live, propagated live, and observed live while every surface can prove what it is showing, how fresh it is, and what authority it rests on. An outcome that would not count: a feature-complete CMS that reaches liveness by silently merging meaning, collapsing status distinctions, or letting rendered surfaces become second sources of truth.

This intent was distilled on 2026-08-28 from the accepted design candidate `DESIGN.md`, which this document now governs.

## Desired state

```text
CURRENT CONDITION
  A declared design (DESIGN.md); no implementation; concepts proven
  individually in SES, SPS, ICP, EQP, IEPE, HCML, Fundamental, rr-rsp.
      ↓
FORMAL / OPERATIONAL WORK
  Layer-by-layer establishment of the six planes (Canon, Contracts,
  Qualification, Projection, Field, Observation), each landed with
  evidence under this substrate.
      ↓
QUALIFIED TARGET CONDITION
  The narrowest end-to-end path of DESIGN.md §14 demonstrated with
  recorded evidence: live co-authoring without silent consequential
  merge (R1), disclosed propagation (R2), and live honesty (R3).
```

## Constraints

```text
ownership / licensing   All canonical content and records belong to the project
                        owner. Formal resources remain under their own licenses
                        and authority; this project binds, never absorbs, them.
dependencies            The system is built in isolation. Capabilities are
                        consumed as pinned dependencies (crate-like). Repair is
                        upstream-first: a needed, broken, or missing capability
                        is fixed in its owning project and re-pinned here;
                        local forks and vendor patches are prohibited, and any
                        unavoidable divergence is a typed, owner-authorized
                        deviation with the upstream fix as its reversal
                        trigger. (Owner directive, 2026-08-28; DESIGN.md §12.1)
privacy / data          Entitlement-gated content must be discoverable without
                        text exposure. Invalidation and presence channels must
                        not leak state a subscriber's access could not observe.
security                No persistent mutation outside a registered contract.
                        Append-only custody enforced in the store, not by
                        convention. Failure is closed, never a silent default.
cost                    Local-first development; no paid infrastructure is
                        adopted without explicit owner authorization (spending
                        is a protected effect).
platform                Renderer-neutral core; web host first. Resolvers pure
                        and host-independent.
latency                 Liveness may degrade in cadence under load, never in
                        correctness; degradation is disclosed.
accessibility           Accessibility obligations are semantic conformance,
                        not theme behavior; reduced-motion and equivalent-
                        meaning projections are required, and accessibility
                        overrides outrank ordinary expression.
regulatory              Content classes carrying legal/commercial consequence
                        use the `commitment` profile with reauthenticated
                        promotion.
human authority         Promotion, entitlement, revocation, spending, and
                        schema-breaking changes are human decisions. Machine
                        output enters as a candidate and never self-promotes.
```

## Non-goals

- Not a replacement for SES, SPS, ICP, EQP, IEPE, HCML, Fundamental Engine, or rr-rsp: this project composes and binds those resources; it does not fork or redefine them.
- Not a multi-tenant SaaS product, hosting platform, or commercialization effort (no commercialization profile is bound).
- Not a general workflow engine, ticketing system, or analytics platform.
- Not an attempt to validate the formal resources empirically on their authors' behalf; their own honest standing (recorded in the Gate and Protocol Register) is imported as-is.
- No additional product, service, schema, repository, protocol, or commercialization scope is to be inferred from silence.

## Success questions

At maturity, canonical state should answer:

```text
What is true?                    Canon: the record graph and receipt chain.
What is authoritative?           The authority order in AGENTS.md and
                                 PROJECT_PROFILE.json; provenance on every record.
What is unresolved?              records/alignment.jsonl and open conflicts.
What is Ready?                   work/GRAPH.md items satisfying the Ready predicate.
What is blocked and why?         Typed blockers with fingerprints and recovery.
What evidence supports claims?   records/evidence.jsonl, per claim, per revision.
What effects are allowed?        Effect-class bindings in PROJECT_PROFILE.json.
What requires a human decision?  Promotion, entitlement, revocation, deviation,
                                 spending — the protected effects.
```

## Termination / dormancy

The project becomes dormant if no work item advances for a sustained period; dormancy is recorded, not inferred. It is superseded only by an explicit successor intent naming what changes. It transfers to routine operation when the DESIGN.md §14 milestone evidence is closed and the owner promotes the system to operating status. Abandonment without record is not a lawful end state.
