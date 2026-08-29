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
| SCMS-009 | S3 cross-expression qualification | E1 | Done — S3 established for the narrow path; awaiting owner verification | records/evidence.jsonl · scms-evidence-009 |
| SCMS-011 | Canon: envelope, canonical identity, append-only journal (E1 narrow slice) | E1 | Done — Canon→surface spine closed; awaiting owner verification | records/evidence.jsonl · scms-evidence-011 |
| SCMS-012 | Contracts: content.revise@1, the governed write path (E2 narrow slice) | E1 | Done — §14 step 2 closed; awaiting owner verification | records/evidence.jsonl · scms-evidence-012 |
| SCMS-013 | Qualification and promotion as separate gates (E3 narrow slice) | E1 | Done — §14 steps 4–5 closed; awaiting owner verification | records/evidence.jsonl · scms-evidence-013 |
| SCMS-014 | Fingerprint-scoped projection invalidation (E4 narrow slice) | E1 | Done — §14 step 8 closed; awaiting owner verification | records/evidence.jsonl · scms-evidence-014 |
| SCMS-015 | Dependency revisions track subjects, not snapshots (SSS §21 conformance) | E1 | Done — NR-scms-003 closed; awaiting owner verification | records/evidence.jsonl · scms-evidence-015 |
| SCMS-016 | Article type and Home composition as Schema records (§14 step 1) | E1 | Done — awaiting owner verification | records/evidence.jsonl · scms-evidence-016 |
| SCMS-017 | Consistency states, disclosure, expiring presence (E6 narrow slice) | E1 | Done — §14 step 7 closed semantically; awaiting owner verification | records/evidence.jsonl · scms-evidence-017 |
| SCMS-019 | The narrowest end-to-end path, proven as one run (E7) | E1 | Done — spine composes; awaiting owner verification | records/evidence.jsonl · scms-evidence-019 |
| SCMS-020 | content.unpublish@1: make the declared compensation real | E1 | Done — awaiting owner verification | records/evidence.jsonl · scms-evidence-020 |
| SCMS-021 | The bounded merge lane: merge, then validate (§14 step 3, partial) | E1 | Done — awaiting owner verification | records/evidence.jsonl · scms-evidence-021 |
| SCMS-022 | Declared schemas become load-bearing in the write path | E1 | Done — awaiting owner verification | records/evidence.jsonl · scms-evidence-022 |
| SCMS-023 | Constitutional gate: no Canon mutation outside the contract runtime | E1 | Done — awaiting owner verification | records/evidence.jsonl · scms-evidence-023 |
| SCMS-024 | Wire-protocol schema + golden canonicalization vectors (closes SH-12) | E1 | Done — awaiting owner verification | records/evidence.jsonl · scms-evidence-024 |
| SCMS-025 | Reconcile the claim register to the evidence | E1 | Done — awaiting owner verification | records/evidence.jsonl · scms-evidence-025 |
| SCMS-026 | Subscription fan-out: who is told, and who must not be | E1 | Done — awaiting owner verification | records/evidence.jsonl · scms-evidence-026 |
| SCMS-027 | Extend the composed proof to the full landed surface | E1 | Done — awaiting owner verification | records/evidence.jsonl · scms-evidence-027 |
| SCMS-028 | Map the zach-core corpus into Canon (first real workload) | E8 | Done — 215 real entries map, 22 source-collapse findings raised; awaiting owner verification | records/evidence.jsonl · scms-evidence-028 |
| SCMS-029 | Reconcile the corpus against live Postgres (seed-time vs current) | E8 | **Blocked** — needs owner-authorized credentials (protected action) | — |
| SCMS-030 | The site as a reader expression of Canon (round-trip out) | E8 | Done — real reader routes resolve; NR-scms-004 recorded; awaiting owner verification | records/evidence.jsonl · scms-evidence-030 |
| SCMS-031 | The authoring surface, and the authority gate it exposed | E12 | Done — SH-8 first slice; NR-scms-005 fixed; scms-blocker-003 raised; awaiting owner verification | records/evidence.jsonl · scms-evidence-031 |
| SCMS-032 | The transactional outbox: nothing happens without an emission (R2) | E5 | Done — emission proven; delivery is SCMS-033; awaiting owner verification | records/evidence.jsonl · scms-evidence-032 |
| SCMS-033 | Subscription lenses and fan-out over the wire (R2) | E5 | Done — lens narrows only; lag is subscriber-relative | records/evidence.jsonl · scms-evidence-033 |
| SCMS-034 | Replay by last_event_id, no event loss, lagged disclosure (R2) | E5 | Done — landed with SCMS-033 | records/evidence.jsonl · scms-evidence-033 |
| SCMS-035 | The provenance chip driven by a real transport (R2 meets R3) | E6 | Ready — depends on SCMS-034 | — |
| SCMS-036 | Evidence and attestations as Canon records | E3 | Done — forgery closed; SH-13 (self-attestation) remains owner policy | records/evidence.jsonl · scms-evidence-036 |
| SCMS-037 | The site renders from Canon (consolidation, no deploy) | E8 | Ready — completes E8 up to the deploy decision, which stays the owner's | — |
| SCMS-038 | Independent adversarial verification of the load-bearing claims | E0 | Ready — nothing has ever been marked Verified; targets the new authority gate first | — |
| SCMS-039 | Recommended dispositions for the 25 open proposals on PR #28 | E0 | Ready — recommendations only; ratification is owner authority and will NOT be exercised | — |
| SCMS-040 | The editor in preview: a usable authoring surface over real content | E12 | Done — SH-8 closed; preview published; awaiting owner verification | records/evidence.jsonl · scms-evidence-040 |
| SCMS-041 | Migrate the corpus through the governed path (content.create@1) | E8+E12 | Done — creation is governed at last; SH-15 raised; awaiting owner verification | records/evidence.jsonl · scms-evidence-041 |
| SCMS-042 | The editing session and the P7 instrument | E12 | Done — instrument built, NR-scms-008 fixed; **P7 stays open pending real edits** | records/evidence.jsonl · scms-evidence-042 |
| SCMS-043 | The editor, running: saves through contracts, records P7 observations | E12 | Done — verified by interaction; awaiting owner verification | records/evidence.jsonl · scms-evidence-043 |
| SCMS-044 | Route the editor through the surface pipeline it currently bypasses | E12 | Ready — closes SH-16; the editor is the one surface that is not one | — |
| SCMS-018 | R1 live co-authoring — **free lane only** (convergent merge) | E1 | **Blocked** — awaiting disposition of P7/P22 on PR #28 | records/blockers · scms-blocker-001 |
| SCMS-010 | S4 cross-domain portability: a materially unrelated project (outside this repository, per owner doctrine 2026-08-28) consumes @semantic-systems/surface unmodified | external | Backlog — executes outside scms; scms records the conformance result | — |

## Epic register

| Epic | Plane / concern | Governing design section | State |
|---|---|---|---|
| E0 | Operating substrate (bootstrap, pins, compiled context) | DESIGN.md §13 | Done via SCMS-001, pending verification |
| E1 | Canon — envelope schema, identity classes, append-only store, receipts ledger | DESIGN.md §3 | In progress — narrow slice landed (SCMS-011); durable store open (SH-1) |
| E2 | Contracts — write plane: contract registry, instance lifecycle, receipts, recovery | DESIGN.md §5 | In progress — one contract landed (SCMS-012); multi-contract + verification levels open |
| E3 | Qualification — evidence records, consequence profiles, incremental re-qualification, promotion | DESIGN.md §6 | In progress — note profile end-to-end (SCMS-013); evidence collection + evaluator independence open |
| E4 | Projection — resolver, projection contracts, access projection, derivations, fingerprint invalidation | DESIGN.md §4, §7 | In progress — resolver + S3 + invalidation landed; SCMS-015 open |
| E5 | Field — semantic metrics, workspace morphology, editorial time | DESIGN.md §9 | Backlog |
| E6 | Observation — presence, consistency states, provenance chips, drift, degradation | DESIGN.md §8, §10 | In progress — semantic core landed (SCMS-017); transport pending P10 |
| E8 | **Consolidation 1 — zach-core + zachshallbetter → one project** (rcp-001; the CMS is the substrate, the site is its reader expression) | DESIGN.md §14 + SH-9 | Ready — owner-confirmed 2026-08-28 |
| E9 | Migration 2 — a friends site (first multi-property test) | — | Backlog — after E8 |
| E10 | Migration 3 — fundamental-engine (first materially different domain; earns S4) | SSS S4 | Backlog — after E9 |
| E11 | Migration 4 — infinite-verse (publication domain; sibling-system integration) | — | Backlog — after E10 |
| E12 | **Authoring surface** — the CMS UI (owner-named gap 2026-08-28) | DESIGN.md §4, §7 + SH-8 | Ready — stack decision pending survey |
| E7 | Narrowest end-to-end path — the nine-step milestone, exit by evidence | DESIGN.md §14 | In progress — 8 of 9 steps closed and composed (SCMS-019); step 3 blocked on P7/P22 disposition |

Epic order is not a promise of sequence: E7 slices vertically and may pull minimal
slices of E1–E6 rather than waiting for any epic to complete.
