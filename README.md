# Semantic CMS

A realtime publication system in which every consequential fact is a typed,
provenance-bearing, versioned record with a named authority; every visible surface is a
declared projection; every write crosses a contract; and live state is observation with
an expiry.

**Status:** implemented and tested along a narrow path, against the owner's real 215-entry
archive. 20 packages, ~293 vectors, CI-verified. A running editor and a running site both resolve
from Canon; Canon has a Postgres schema whose append-only property is enforced by grant.

`Documented ≠ Implemented ≠ Tested ≠ Deployed ≠ Empirically Validated` — this project is at
**Tested**. Nothing is deployed, and no person has yet done a day's work through it, so the claim
that it is *useful* remains unestablished. `SPEC_HEALTH.md` carries every claim at the rung its
evidence supports.

## Canonical order

| File | Role |
|---|---|
| `PROJECT_INTENT.md` | Originating intent — governs everything below |
| `AGENTS.md` + `docs/` | Operating doctrine (formal-project-bootstrap v0.5.0) |
| `FORMAL_RESOURCE_MANIFEST.json` | The eight pinned formal resources |
| `bindings/PROJECT_BINDINGS.yaml` | Local vocabulary bound to source concepts |
| `DESIGN.md` | The accepted design candidate (the architecture) |
| `PROJECT_PROFILE.json` | Operational bindings, authorities, protected effects |
| `work/` | Work graph: `GRAPH.md` register + one contract per item |
| `records/*.jsonl` | Append-only: evidence, negative results, deviations, alignment |
| `.agents/` | Generated compiled context — a projection; never hand-edit, recompile |

## Verify

```bash
python3 scripts/validate-bootstrap.py --check-context
```

Regenerate compiled context after changing any source:

```bash
python3 scripts/gen-context.py
```
