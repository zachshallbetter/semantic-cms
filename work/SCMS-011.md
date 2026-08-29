# SCMS-011 — Canon: envelope, canonical identity, append-only journal (E1 narrow slice)

**Intent ref:** PROJECT_INTENT.md · **Epic:** E1 (board #6) · **Advances:** DESIGN.md §14 step 1
**Assigned by:** coordinator goal ("prioritize work that advances the narrowest end-to-end
proof and increases qualified maturity"); §16 of the v2 candidate names the E1 slice as the
condition for resuming design iteration.
**Effect class:** E1 — a pure library plus records; no persistence engine, no protected action.
**State:** Ready → Claimed → (closing state at bottom)

## Objective

Land the Canon spine the surface layer already assumes: a versioned envelope with the
four-class provenance lattice, content-addressed revision identity, and an append-only
journal supporting supersession and revocation — then connect it to the resolver by
projecting a `FrozenSnapshot`, closing the first end-to-end segment `Canon → freeze →
access projection → surface`.

## Ready predicate

- **Scope:** `impl/canon/` — (1) `Envelope` per DESIGN.md §3.1 with body kinds
  `Schema|Content|Relation|Observation|Topology`; (2) the provenance lattice §3.2 with its
  enforced rule (observed MUST carry `observed_at`+`expires_at`; declared/derived MUST NOT);
  (3) build-local revision identity by canonical JSON → SHA-256 **as canonical DESIGN.md v1
  §3.3 states it** (single hash; the two-tier P20 refinement is a *pending proposal* on PR #28
  and must not be implemented as though accepted); (4) an append-only journal with
  `append` / `supersede` / `revoke` and a hash-linked receipt chain — no update, no delete;
  (5) `freeze()` projecting a `FrozenSnapshot` the SCMS-008 resolver consumes unchanged.
- **Exclusions:** no database, no persistence engine, no transport, no ORM — SH-1's storage
  half stays an open decision and this slice must not decide it (in-memory journal only, with
  the durability question left explicitly open). No contract/write plane (that is E2). No
  qualification (E3). No entitlement authority. No schema authoring for SSS (UD-13, upstream).
  No DESIGN.md change on main.
- **Dependencies (satisfied):** rr-rsp pin (envelope shape, provenance classes, no-promotion,
  JCS+SHA-256 identity); ses pin (Slot/Block/Socket/Composition vocabulary for the Article and
  Home schema records); SCMS-008 resolver (the consumer proving the spine); node ≥ 22.6.
- **Acceptance:**
  1. Envelope validation rejects: an `observed` envelope without `expires_at`; a `declared` or
     `derived` envelope carrying `observed_at`/`expires_at`; an unknown body kind; an unknown
     provenance class.
  2. Revision identity is stable under key reordering and excludes the identity field itself;
     two different bodies hash differently.
  3. The journal is append-only in behaviour: a landed record cannot be mutated or removed;
     `supersede` appends a new revision naming its predecessor and leaves the predecessor
     readable as historical; `revoke` prevents new use while retaining provenance.
  4. The receipt chain is hash-linked and tamper-evident: altering any earlier entry breaks
     verification.
  5. Multi-axis state (§3.5) is representable and the single-enum `status` field is absent.
  6. `freeze()` output resolves through the unmodified SCMS-008 resolver, and an
     entitlement-declared record surfaces as `withheld`, not absent — proving Canon→surface
     end to end without either layer redefining the other.
- **Evidence requirements:** `node --test` output recorded in scms-evidence-011, claimed at the
  weakest justified rung: **Implemented + Tested** for the narrow path. Explicitly NOT
  established: durability, concurrency, transactional grants (the production append-only
  mechanism), performance, or empirical usefulness.
- **Permissions / effect class:** E1; project-mutation authority held per bindings.
- **Target:** `impl/canon/` (new), `.github/workflows/gates.yml` (one test step),
  `records/*`, `work/GRAPH.md`. No other path.
- **Budget:** one work cycle; no spend; no external services; no credentials.
- **Stop conditions:** (a) the slice would require choosing a persistence engine → stop, that
  is SH-1 and an owner decision; (b) a pending PR-#28 proposal would have to be implemented to
  make a vector pass → stop, record blocker (canonical v1 governs); (c) enforcing append-only
  would require weakening the resolver's read-only contract → stop.

## Claim

Claimed by agent-under-owner-direction 2026-08-28; released at closing state below.

## Closing state

**Done — Implemented + Tested for the narrow path; Canon→surface spine closed.**
Evidence: records/evidence.jsonl · scms-evidence-011. Claim released.
