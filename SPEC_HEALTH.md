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
| SH-8 | **GAP — now actionable** | Authoring surface | Governance is specified exhaustively; what a writer actually sees is not — no composition, no wireframe, no editor interaction design. | First slice: one Article editor = SES composition + slot-level editing + provenance chip + live qualification panel; visual language deferred to a design pass (Infinite-UI patterns inform). |
| ~~SH-9~~ | **RESOLVED — for the seed corpus** | Import/migration | *Closed by SCMS-028:* `impl/migrate` maps the real 215-entry zach-core archive into Canon, CI-verified against the corpus itself rather than a fixture. Owner-authored content needs no admission gate — it lands as `declared` provenance under project.owner authority. Two residuals, recorded not hidden: (a) the corpus is the **seed-time** markdown state, and reconciliation against the live Neon Postgres system of record needs owner-authorized credentials (SCMS-029, blocked); (b) P1's Admission plane stays undispositioned and becomes required when third-party content arrives (E9, the friends site). | — |
| SH-10 | THIN | Backup & recovery | No RPO/RTO; no operational promises exist yet, so the promise register (P15) has nothing to check. | Declare with the E1 slice: nightly logical backup, RPO 24h → 1h post-MVP, RTO 4h; each promise entered in the register with its verifying artifact. |
| SH-11 | CAVEAT | GPL boundary | open-knowledge consumed as a service (P25) — process-boundary isolation believed sufficient; not yet reviewed by counsel. | Keep strict service boundary (no linking, no vendoring); counsel review before any distribution of a combined work. |
| ~~SH-12~~ | **RESOLVED** | Wire protocol concretes | *Closed by SCMS-024:* `schemas/scms/envelope.schema.json` (closed, hash-pattern-typed, freshness rule encoded conditionally) and `schemas/scms/golden/canonicalization.json` (4 positive vectors + 1 negative proving the check can fail). Residual limitation, recorded not hidden: no JSON-Schema library is available under the zero-dependency policy, so the schema document is not meta-validated and schema/runtime agreement is asserted case-wise. |

## Claim register

Claims this project currently makes about itself, with admissible status (ladder:
Documented ≠ Implemented ≠ Tested ≠ Deployed ≠ Verified). A claim may not be stated
above its rung.

| Claim | Rung | Evidence setting the rung | What would strengthen it |
|---|---|---|---|
| The six-plane design is coherent and buildable | **Implemented + Tested — narrow path only** | SCMS-011…019: a slice of every plane exists and composes in one run (impl/e2e, 8 vectors), CI-verified | The same at realistic scale, with durability and transport |
| Substrate gates pass | **Tested (CI-verified)** | Every run since `d6f4bfb` reports success by conclusion, not local exit code (NR-scms-002 corrected the prior false claim) | Gate self-tests staying green as gates grow |
| Review findings accurately describe the sources | **Partially verified** | scms-evidence-005: 16/20 load-bearing claims confirmed by adversarial pass, 4 partial, 0 refuted | Verification of the remaining claims |
| Dependencies are pinned and consumable | **Documented + hash-locked** | All pins content-digested (alignment record); SES and FPB re-pinned upstream-first | Admission scans (P17) per pin; UD-8/UD-9 closed |
| Surface resolution is access-safe | **Implemented + Tested** | SCMS-008/014: hidden state never enters a dependency set, and cannot move an output, trace, or invalidation (byte-identical results) | Adversarial review of the access boundary by an independent party |
| One surface can be expressed two materially different ways | **S3 conformance (narrow path)** | SCMS-009: 10 vectors, six preserved properties, morphology provably differing | S4 — and S4 must run **outside** this repository (SCMS-010) |
| Publishing is qualification **plus** promotion, never a boolean | **Implemented + Tested** | SCMS-013/020: promotion refuses non-qualified, under-verified, unauthorised, and mismatched candidates; compensation exists and round-trips | Real evidence collection and evaluator independence |
| No persistent mutation outside a registered contract | **Implemented + Tested (source-level)** | SCMS-012 write path; SCMS-023 boundary gate with a self-test proving it can fail | Runtime capability enforcement, not just source-level |
| Declared content types are enforced | **Implemented + Tested (where declared)** | SCMS-022: the governed write consults the declared type; opt-in, because types that do not exist are not pretended to exist | A declared type for every content kind in use |
| R1 live co-authoring | **Partially established** | `required` lane proven (SCMS-012), `bounded` lane proven (SCMS-021); **free lane NOT built** — blocked on P7/P22 | Owner disposition of P7/P22, then the free lane |
| R2 live propagation | **NOT established** | Nothing built: transport is P10-pending. Consistency *state* is determined (SCMS-017) but nothing moves it | Disposition of P10, then outbox + fan-out + replay |
| R3 live honesty | **Implemented + Tested (semantic core)** | SCMS-017: six states, the drafting/consequential asymmetry, chips that never claim live without a check, presence expiring by construction | Transport-side freshness under real latency |
| Real content maps into Canon without collapsing what the source keeps | **Implemented + Tested against a real corpus** | SCMS-028: 12 vectors over the actual 215-entry archive — unlisted preserved as itself, private content at owner access, model-generated field kept as a separate `derived` envelope, and the source's own status collapse surfaced as 22 findings rather than inherited | The same against the live Postgres state (SCMS-029), and a round-trip back out to a reader |
| The published artifacts match their canonical sources | **Tested** | scripts/check-projection-sync.py in CI, with a self-test | — |
| The system is empirically useful | **NOT established** — but no longer untested against reality | SCMS-028: a real 215-entry corpus maps into Canon and resolves, and the mapping found a genuine modelling collapse in the owner's live data (dual-vocabulary `status`, 22 findings). That establishes the *mapping*, not usefulness: nothing is deployed, no human has used the result, rcp-001 remains an active obligation | A person doing real work through it — which needs the authoring surface (E12/SH-8) and a deployment |

*"This register narrows claims; it does not manufacture validation."*
