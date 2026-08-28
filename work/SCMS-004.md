# SCMS-004 — Review titan-node, titan-observatory, and Tools

**Intent ref:** PROJECT_INTENT.md
**Assigned by:** project.owner, 2026-08-28 ("Let's dig into these in the same way")
**Effect class:** E0 (read-only review of external repositories) + E1 (landing the review document and records)
**State:** Done — review landed; proposals P17–P28, the consumability ledger, and housekeeping findings await owner disposition
**Evidence:** records/evidence.jsonl · scms-evidence-004 · gates re-passed at context digest 2f94a3eb

## Objective

Review /Users/zachshallbetter/Projects/titan-node/, /Users/zachshallbetter/Projects/titan-observatory/,
and /Users/zachshallbetter/Projects/Tools/ (~40 independent tool projects) in the SCMS-002
manner: findings classified (confirms / better mechanism / novel-applicable / generative),
mapped to the six planes and R1–R3 — and, per the SCMS-003 dependency doctrine, assessed
for **consumability as pinned dependencies** (license, manifest, maturity, pin state).

## Scope

- titan-node: control plane, registries, protocol/smoke gates, preflight discipline,
  bridge profiles, storage/deployment doctrine, agent hosting, patches/ (upstream-first
  counterexample or managed exception?).
- titan-observatory: the live-dashboard miniature, its freshness honesty.
- Tools: three clusters — content/knowledge/editing; identity/graph/structure/visual;
  agents/infra/analysis. Deep on CMS-relevant projects, triage the rest.
- Land: research/titan-node-observatory-tools-review.md, evidence record, regenerated
  context.

## Exclusions

- No modification of the reviewed projects; no DESIGN.md changes (proposals only);
  no new pins in FORMAL_RESOURCE_MANIFEST.json (candidates proposed only).

## Acceptance

1. Review lands with concrete mechanisms, file references, and per-tool consumability
   verdicts.
2. Findings classified and mapped to planes; proposals numbered continuing from P16.
3. Evidence appended; `gen-context.py --check` and `validate-bootstrap.py --check-context`
   pass after landing.

## Evidence requirements

Synthesized from four bounded exploration passes (titan-node+observatory; Tools ×3
clusters); dispositions `observed` (single pass, not adversarially verified).
