# Spec Health — Semantic CMS

The register of exactly where DESIGN.md is ambiguous enough that a builder would have to
invent an answer — listed so the invention becomes a decision instead. Tags:
**GUESS** (a builder would silently pick), **GAP** (nothing exists), **THIN** (named but
underspecified), **CAVEAT** (specified with a known unresolved tension). Each entry
carries a proposed default where one can be responsibly offered; defaults are proposals,
not decisions, until dispositioned.

Maintained under SCMS-005. Remove entries only by resolving them into DESIGN.md (or a
decision record) — never by deletion.

| # | Tag | Area | The ambiguity | Proposed default |
|---|-----|------|---------------|------------------|
| SH-1 | GUESS | Implementation stack | §13 is non-normative; dependencies span TS (Fundamental, SES-adjacent), Rust (rr-rsp, Infinite-Platform precedent), Python (ACP, FPB tooling). Which language owns the resolver, the store adapters, the wire? | TypeScript for resolver + wire + editor (shared client/server/edge per §13); Postgres for Canon; Python retained only for substrate tooling and ACP; Rust deferred until a measured need. |
| SH-2 | GUESS | Tenancy & identity | No tenancy model, no identity provider, no session model. Single-tenant (owner properties) or multi-tenant? | Single-tenant first (one owner, many actors incl. agents); actor identity via the four-class identity table (§3.3); external IdP deferred; capability tokens shaped per ICP verification levels. |
| SH-3 | CAVEAT | Deletion vs law | Append-only-forever meets right-to-erasure (GDPR/CCPA) how? Revocation retains provenance — lawful for personal data? | Crypto-shredding candidate: personal-data fields encrypted per-subject; erasure = key destruction, leaving tombstoned ciphertext + intact non-personal provenance. Needs legal review before any third-party personal data enters Canon. |
| SH-4 | GAP | Media & blobs | Canon is record-centric. Images/video/fonts: CAS store, derivative classes (thumbnail/preview/reader-*), codec-outside-identity — described in the IV review, adopted nowhere. | Adopt IV's model: BLAKE3- or SHA-256-addressed CAS, immutable, `Cache-Control: immutable`; manifests declare derivative *classes* never encodings; delivery projections own codecs. |
| SH-5 | THIN | Search | Named as a projection; no query model, no index spec, and the composition of access projection with full-text search (snippet/leak risk) is unaddressed. | Per-access-level index shards built from access-projected inputs only (the fingerprint rule extended to indexes); entitled text never enters an open shard — IV rule 16″ applied to search. |
| SH-6 | GAP | Quantitative budgets | R1–R3 have no numbers: no propagation-latency budget, presence expiry values, resolver p95, commit-wave cadence, degradation tiers. | Starting envelope to be validated by E1 slice: presence expiry 10s; notify fan-out p95 < 2s intra-region; resolver p95 < 10ms per composition; commit waves ≥ 1/s under load; degradation tiers per §8.8 with measured thresholds. |
| SH-7 | THIN | Field plane concretes | Which metrics at launch, which patterns couple what, evidence-floor values — the least concrete plane despite being "ours." | Launch set: attention, heat (recency), staleness (freshness half-life per content class), memory (relation use); one coupling pattern (evidence-resolved shelf morphology); floors per SCMS-002 P13 defaults (0.45 evidence floor, 0.55 name floor) until measured. |
| SH-8 | GAP | Authoring surface | Governance is specified exhaustively; what a writer actually sees is not — no composition, no wireframe, no editor interaction design. | First slice: one Article editor = SES composition + slot-level editing + provenance chip + live qualification panel; visual language deferred to a design pass (Infinite-UI patterns inform). |
| SH-9 | THIN | Import/migration | No pipeline from existing corpora (zachshallbetter.com archive, markdown trees) into Canon; the Admission plane (P1) is pending. | First import: the zach-core archive (pending rcp-001 confirmation) through the Admission record shape; markdown ingest canonicalized via the round-trip core (P24). |
| SH-10 | THIN | Backup & recovery | No RPO/RTO; no operational promises exist yet, so the promise register (P15) has nothing to check. | Declare with the E1 slice: nightly logical backup, RPO 24h → 1h post-MVP, RTO 4h; each promise entered in the register with its verifying artifact. |
| SH-11 | CAVEAT | GPL boundary | open-knowledge consumed as a service (P25) — process-boundary isolation believed sufficient; not yet reviewed by counsel. | Keep strict service boundary (no linking, no vendoring); counsel review before any distribution of a combined work. |
| SH-12 | GUESS | Wire protocol concretes | `scms-0.1` is named but no schema files exist for the envelope/bodies; JCS+SHA-256 named but no golden vectors. | E1 slice deliverable: `schemas/scms/` JSON Schemas (`additionalProperties: false`, hash-pattern-typed) + golden canonicalization vectors incl. a negative vector. |

## Claim register

Claims this project currently makes about itself, with admissible status (ladder:
Documented ≠ Implemented ≠ Tested ≠ Deployed ≠ Verified). A claim may not be stated
above its rung.

| Claim | Status | Evidence that would strengthen it |
|---|---|---|
| The six-plane design is coherent and buildable | Documented | E1 vertical slice landing with its gates green |
| Substrate gates pass | Tested (locally + CI) | CI history on main; gate self-tests staying green |
| Review findings accurately describe the sources | Partially verified | Adversarial verification pass (SCMS-005) — results in records/evidence.jsonl |
| Dependencies are pinned and consumable | Documented + hash-locked | Admission scans (P17) run per pin; UD-8/UD-9 closed |
| Realtime obligations R1–R3 are satisfiable | Documented | §14 milestone steps 3, 7, 8 demonstrated |
| The board reflects work state | Implemented | Reconciliation check between GRAPH.md and issues (future gate) |
| Published artifacts match their canonical sources | Tested | scripts/check-projection-sync.py in CI (design spec); review artifacts frozen post-addendum |

*"This register narrows claims; it does not manufacture validation."*
