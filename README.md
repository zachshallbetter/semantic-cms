# Semantic CMS

A realtime publication system in which every consequential fact is a typed,
provenance-bearing, versioned record with a named authority; every visible surface is a
declared projection; every write crosses a contract; and live state is observation with
an expiry.

**Status:** design canonized; no implementation yet. `Documented ≠ Implemented ≠ Tested ≠
Empirically Validated` — this project is at Documented.

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
