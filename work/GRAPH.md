# Work Graph — scms

**Board of record (owner directive, 2026-08-28):** work items are handled as GitHub
issues on https://github.com/zachshallbetter/semantic-cms (workable via the
agent-control-plane in Railway). This file remains the local projection of the graph;
states are reconciled to the board, and a conflict between the two is repaired at the
board, then re-projected here. Mapping: SCMS-001/002/003 verification → #2/#3/#4 ·
SCMS-002 P1–P16 disposition → #1 · SCMS-004 → #5 · epics E1–E7 → #6–#12.

States follow docs/WORK_GRAPH.md: `Backlog → Ready → In progress → In review → Done → Verified`.
No item may be marked Ready until it satisfies the full Ready predicate (scope, exclusions,
dependencies, acceptance, evidence requirements, permissions/effect class, target, budget,
stop conditions). Epics below are a register, not authorized work: items are authored per
epic as the owner assigns the corresponding piece of work.

## Issues

| ID | Title | Effect | State | Evidence |
|---|---|---|---|---|
| SCMS-001 | Canonize the design; initialize the operating substrate | E1 | Done — awaiting owner verification | records/evidence.jsonl · scms-evidence-001 |
| SCMS-002 | Review Titan and Infinite-Verse for concepts informing the CMS | E0+E1 | Done — proposals P1–P16 await owner disposition | records/evidence.jsonl · scms-evidence-002 |
| SCMS-003 | Canonize the dependency isolation doctrine | E1 | Done — awaiting owner verification | records/evidence.jsonl · scms-evidence-003 |
| SCMS-004 | Review titan-node, titan-observatory, and Tools | E0+E1 | Done — proposals P17–P28 await owner disposition (#5) | records/evidence.jsonl · scms-evidence-004 |
| SCMS-005 | Resolve the gap register (build excluded) | E1+E0 | Done — awaiting owner rulings on #26 (recipient) and #28 (v2 PR) | records/evidence.jsonl · scms-evidence-005 |
| SCMS-006 | First upstream-first cycle: FPB v0.5.1 + SES packaging; re-pin | E1+E2 | Done — awaiting owner verification | records/evidence.jsonl · scms-evidence-006 |
| SCMS-007 | Consumption boundaries for all pinned protocol resources | E1+E2 | Done — awaiting owner verification | records/evidence.jsonl · scms-evidence-007 |
| SCMS-008 | Adopt SSS; implement the narrowest surface-resolution path | E1 | Done — awaiting owner verification | records/evidence.jsonl · scms-evidence-008 |

## Epic register

| Epic | Plane / concern | Governing design section | State |
|---|---|---|---|
| E0 | Operating substrate (bootstrap, pins, compiled context) | DESIGN.md §13 | Done via SCMS-001, pending verification |
| E1 | Canon — envelope schema, identity classes, append-only store, receipts ledger | DESIGN.md §3 | Backlog |
| E2 | Contracts — write plane: contract registry, instance lifecycle, receipts, recovery | DESIGN.md §5 | Backlog |
| E3 | Qualification — evidence records, consequence profiles, incremental re-qualification, promotion | DESIGN.md §6 | Backlog |
| E4 | Projection — resolver, projection contracts, access projection, derivations, fingerprint invalidation | DESIGN.md §4, §7 | Backlog |
| E5 | Field — semantic metrics, workspace morphology, editorial time | DESIGN.md §9 | Backlog |
| E6 | Observation — presence, consistency states, provenance chips, drift, degradation | DESIGN.md §8, §10 | Backlog |
| E7 | Narrowest end-to-end path — the nine-step milestone, exit by evidence | DESIGN.md §14 | Backlog (depends on E1–E6 slices, not their entirety) |

Epic order is not a promise of sequence: E7 slices vertically and may pull minimal
slices of E1–E6 rather than waiting for any epic to complete.
