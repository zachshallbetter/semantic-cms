# SCMS-074 — Entitlement classes: entitled groups and staged access

**Intent ref:** PROJECT_INTENT.md · **Epic:** E4 · **Effect class:** E1
**Assigned by:** owner design direction, 2026-08-29 — the inspector shows `Entitled Groups` and
`Staged Access`, and P2 proposed the model.

## Where this stands

**P2 is proposed and not ratified**, and SCMS-039 recommended accepting only its 404-not-403 half —
which is already true at the resolver, the editor and the site — and deferring section-level
entitlement classes *until entitled content exists*. None does.

This ticket exists so the concept is registered rather than remembered. **It should not be built
until there is something to entitle**, or it becomes a plane with nothing in it.

## Ready predicate — for whenever it is scheduled

- **Scope:** section-level `open` / `entitled` classes with a **single shared restriction
  function**, per P2; entitled-group membership; staged access as a declared, time-bounded grant.
- **The property that must hold:** one restriction function, used everywhere. P2's five-record
  independence chain exists because entitlement checked in two places is entitlement checked
  differently in two places — the failure this project has committed with access (NR-scms-004,
  NR-scms-006) and with authority (NR-scms-005).
- **Dependencies:** owner ratification of P2; and SH-2, since entitled groups presuppose an identity
  model that does not exist.
- **Acceptance:** an entitled section is absent — not redacted — for an unentitled reader, at every
  surface and in every expression; the restriction function has exactly one implementation, asserted
  by a vector that fails if a second appears.
