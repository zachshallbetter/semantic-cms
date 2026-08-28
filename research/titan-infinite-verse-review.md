# SCMS-002 — Review: Titan and Infinite-Verse

**Status:** review complete; proposals await owner disposition
**Work item:** work/SCMS-002.md · **Date:** 2026-08-28
**Method:** four bounded exploration passes over the projects' compiled corpora (llms-full files) with direct file reads where corpora were incomplete or empty. Single review pass; dispositions `observed`, not adversarially verified.

**Source state at review time (disclosed):**
- Titan (`/Users/zachshallbetter/Projects/Titan`, platform name "Chroma", formerly S2Forge/SparX Forge): root corpus 1.77 MB; Systems corpus complete for docs but omits source; Research/Experiments/Security/Tools corpora are empty stubs (read directly). Not inspected for VCS state.
- Infinite-Verse (`/Users/zachshallbetter/Projects/Infinite-Verse`): corpus 4.5 MB, self-digesting header reporting its own payload SHA-256, per-submodule dirty flags, and a `STALE INPUT` banner (1 submodule behind origin). Superproject at `00e543c1 (dirty)`.
- Both systems' doctrine runs ahead of their enforcement in places, and both say so in writing; maturity caveats in §9 bound every claim here.

---

## 1. What the two systems are

**Titan / Chroma** is a multi-product platform (Snack, Book, FactoryAtlas, FleetMap, IP Navigator, IdentityBridge, Orchestration, Pipeline) over a shared fleet of 32 runtimes in 11 capability groups. Its doctrine (`Systems/SYSTEMS_CONTRACT.md`) inverts the usual question: not *who is this user?* but *what is allowed right now?* — collapse resistance, scoped authority, boundary-native architecture, plane isolation, temporal containment. Composition chain: `Product → Runtime → Contract → Broker → Provider → Receipt → Runtime → Product`, with "credential boundary = product boundary" and contracts as "the only allowed language between systems."

**Infinite-Verse** is a semantic cultural knowledge and experience platform — "admits authorized physical and digital sources, resolves durable publication and corpus identity, records meaning with provenance and confidence, and powers integrated products through governed projections." Manga Verse is the first domain. It is IEPE-adopted, pins the same protocol suite this project pins, plus **iPub** (its publication format: immutable, versioned publication descriptions over CAS bytes, with semantic envelopes attached by reference). It is, in effect, a sibling attempt at this project's thesis, with an unusually well-specified contract corpus and a partial implementation.

**Relationship to the CMS:** Infinite-Verse confirms the design's spine and is ahead of it on qualification/projection governance; Titan supplies the operational machinery (custody, realtime transport, observation, constitutional CI) the design describes but does not yet specify. The Field plane is the one place the CMS design leads both.

---

## 2. Verdict summary

1. **The six-plane architecture survives contact.** Both systems independently converged on the same separations: append-only truth + governed writes + evidence-gated promotion + regenerable projections + disclosed observation. Nothing found contradicts DESIGN.md's spine.
2. **Two planes are missing.** Infinite-Verse demonstrates that **Admission** (what may enter, under what rights) and **Entitlement** (who may see what, at section granularity) are distinct planes, not fields on existing ones. A CMS that skips them grows them accidentally, per-projection.
3. **Qualification needs a fourth verdict column.** Both systems learned the same lesson: "could not run" and "never ran" must block promotion exactly like "failed," and gates must be provably able to fail (vacuous-pass detection, evaluator self-tests). Our PASS/FAIL/INCONCLUSIVE vocabulary is necessary but the *promotion rule* over it must be full-coverage-or-refuse.
4. **R1 has a second lawful answer.** Titan's Generative Relationship Protocol demonstrates divergence-first co-authoring — permanent legal branches over an immutable DAG, merge as an explicit authored act — which composes with append-only Canon better than convergence does. The design's concurrency-from-invariance table stands, but `free` should not imply "always converge."
5. **R2 has a proven transport shape.** Transactional outbox → LISTEN/NOTIFY fanout → backfill-then-live → `last_event_id` replay → `lagged` disclosure. No new infrastructure, no event loss, staleness disclosed as protocol messages.
6. **R3 is richer than the design knows.** Two-clock freshness (server time + tracked skew), hysteresis on state transitions, presence announced not inferred ("missing" and "healthy" must not look identical), UNKNOWN as a rendered state distinct from OFFLINE, and absence carrying a reason code.

---

## 3. Plane-by-plane findings

Classification: **[C]** confirms design · **[B]** better mechanism than design currently specifies · **[N]** novel, applicable · (§8 holds novel-but-not-applicable).

### 3.0 Admission — a plane the design lacks [N]

Infinite-Verse `docs/SOURCE_ADMISSION.md`: every source intake records `sourceType, sourceRef, custody, processingAuthority, rightsScope, acquiredAt, digest, provider/actor, retentionPolicy, identityDisposition`. `processingAuthority` is a *set* of permitted operations — `inspect | normalize | ingest | enrich | train | redistribute` — because "a physical purchase does not automatically authorize digitization, ingestion, model training, or redistribution." Four outcomes: `rejected` (typed reason), `held-for-review`, `admitted`, and **`metadata-only`** — a source that participates in discovery, collection, and progress with zero byte-processing authority.

The ingestion contract (`docs/INGEST_CONTRACT.md`) adds the transactional rule: *"A file becomes a publication in one transaction; it becomes comprehended afterwards, asynchronously, and never blocks becoming readable"* — with enrichment enqueued inside the same transaction so no work can be silently missing.

### 3.1 Canon [C, B]

**Confirmed:** append-only enforced in the store (IV: `publication_revision_immutable` trigger; Titan Event Plane: "contains no UPDATE or DELETE paths"; PDP-style grants in both). JCS→SHA-256 content identity (IV `manifestHash`). Supersession lineage instead of UPDATE. Receipts hash-linked.

**Better mechanisms found:**
- **Teaching triggers** (IV `0024`): the append-only trigger's exception message states the correct procedure ("re-project into a new revision under a newer ruleset_version, never edit what a previous rule set observed"). Enforcement that educates.
- **Identity is minted, never derived** (IV `0025`): a per-job mint ledger inside the commit transaction makes retried commits look up what they minted (idempotent) while new jobs mint fresh identity for identical bytes. An `identity_scheme` column with **no DEFAULT** ("a default would silently label a row nobody classified") and grandfathered values proven against stored digests. Compare GRP's inverse discipline: **hash-input selection as a design act** — IDs derive from `sha256` over *explicitly chosen* fields, deliberately excluding timestamps and model output so retries converge (`Math.random()` and UUIDs "brutally banned" on identity paths). Both resolve to the same rule: *decide, per identity, what it may depend on; nothing derived from a detector/model output is stable across versions* (IV `0041`).
- **Idempotency conflict detection** (Titan event-runtime): same key + same payload → dedup, original returned; same key + *different* payload → `422`, "prevents silent corruption." A Canon ingest primitive the design implies but never states.
- **Transactional outbox** (Snack P.1): the domain write and its event row commit in one transaction; a drain worker publishes. Downstream outage queues rather than loses. Audit INSERT shares the BEGIN/COMMIT with the state UPDATE — optimistic-lock failure rolls back both.
- **Event plane bounds**: 64 KB payload cap, large bodies by URI; `causal_parents` on event records (GRP) making history itself a DAG.
- **Migrations as design records** (IV `0034`: 312 lines, ~70% argument, including "What this migration deliberately does NOT do"). Canon schema evolution should carry its reasoning in the migration.
- **Vocabulary version witnesses** on every row (`kind_vocabulary_version`, `ruleset_version`, `parser_or_model_version`) — "which rows predate the fix?" becomes a query, not archaeology. Open vocabularies deliberately reject CHECK enums ("a new kind must not require a migration").

### 3.2 Contracts [C, B]

**Confirmed:** single write door (IV `executeInteraction`; Titan "no persistent mutation outside a registered contract" equivalent via coordinator chains); typed outcomes; executable recovery; verification derived from consequence; 409-carrying-current-state optimistic concurrency (Snack `UPDATE … WHERE status = $from`; IV `expected_base_digest` rebase-once).

**Better mechanisms found:**
- **The fourth custody clause** (Titan): every component declares *owns / may consume / may issue / **must never become***, with `forbidden_reads` / `forbidden_writes` in `runtime.toml` — and the declarations are **derived from the actual route surface** by tooling, flagged `review_status = "derived"` until a human confirms. The named failure set: "coordinator → hidden user graph, broker → credential sink, runtime → tenant state holder, provider → identity authority, client → trusted state source."
- **Constitutional CI**: `check_boundaries.sh` compiles doctrine into greps — "must not persist memory" enforced by grepping for ORM/session imports; forbidden-vocabulary lints; illegal-state tables (illegal state → prevention mechanism → status → evidence).
- **Contracts as data-only, enforced by crate split** (`fleet-contract` types / `fleet-tracker` behavior); additive-only versioning with the written consumer rule **"absent ≠ false"** — absent fields mean *not declared*, never a positive assertion (plus `connections_declared: bool` as an explicit "I haven't told you" flag).
- **Closed error vocabulary with product `subcode`** ("adding a variant: don't") — fleet-stable codes, product nuance without forking.
- **PATCH tri-state** (IV): absent key ≠ explicit `null` ≠ `{}`, body assembled key-by-key because a spread collapses them.
- **Client pre-flight three-law** (IV): never looser than the server, never masks a server decision, counts code points not UTF-16 units. Contracts may declare *stricter* verification than the server — the only direction ICP §22 allows.
- **Legal-transition truth table + explanatory refusal** (Snack): illegal transition → 422 *carrying the legal next-state list*; the UI greys out illegal targets from the same table.

### 3.3 Qualification [C, B, N]

**Confirmed:** qualification ≠ promotion (IV attestations carry `qualificationAuthority: "scripts/qualify-deployment.py"` with `promotionAuthority: null` — structurally separated); evidence enums keeping BLOCKED/INCONCLUSIVE distinct from PASS; attestations append-only with `limitations[]`.

**Better mechanisms found:**
- **Four-column verdicts** (IV promotion machine): `passed / failed / could-not-run / not-run` in separate lists, and *all three non-pass columns block promotion identically*: "promotion over partial coverage asserts more than was established. Full coverage or no promotion." UNKNOWN → BLOCKED, never collapsed into a neighbor. "An obligation that could not be evaluated is a gap in coverage, not a finding about the candidate."
- **The vacuous-pass gate** (IV CI-2D): run every evaluator against a populated corpus and an empty one; if output differs, it can observe absence — and must not return green on the empty one. Behavioral, not syntactic (a syntactic screen missed the worst offender). Measured impact: 22 phantom passes before it existed. Plus **evaluator self-tests** — half the gate roster ships a twin proving the gate can fail. This operationalizes the Register's "a gate that cannot fail is a finding."
- **Delivery-time qualification** (Book's LIAC gate): every citation in a generated response must resolve into the *exact evidence set retrieved for this request*; one unresolvable citation blocks the entire artifact (503, never partial). The conditional adversarial challenger (MADA) is **non-blocking** — its errors degrade, never break. And the **decision is fingerprinted**, not just the artifact: `verdict_fingerprint` over `(namespace, policy_version, outcome, attempts, verified_ids)` — a *block* is as auditable and reproducible as a publish, and a policy change provably changes the fingerprint (Titan `grounding-gate`).
- **Two-tier materiality** (IV iPub §17.3): machine envelopes attach non-materially (re-detection mints no revision); human-verified work may be *promoted to material attachment*, which writes into the manifest and mints a revision — "making editorial work part of publication identity." This gives the design's qualification/promotion boundary a concrete record-level meaning.
- **Freshness as an obligation field** (IV EQP profile): each obligation names its own invalidation event ("a redeploy invalidates it"), so evidence currency derives from the claim, not a global TTL. And **qualify what is served, not what is configured** — the qualifier reads the live artifact ("config is not the artifact").
- **Content-safe promotion** (IV): "Ancestry lies" — compare *trees* (content digests), not commit graphs, when deciding a promotion is safe. Promotion lock loss exits 78 (could-not-verify), never 1 (refusal): concurrency in governance is a coverage gap, not a verdict.
- **Promotion gates on prose** [N]: claim-reconciliation tables (✅/⚠️/❌/❓ per public claim with code-evidence cells; "anything not ✅ should not appear in copy") and the **operational promise register** (IV CI-3V) — prose promises with no code identifier ("nightly WAL snapshots") extracted into a machine-checked register, because "verifiable claims fail loudly; promises fail silently."
- **Metadata fabrication lint** (IV CI-3Q): "absent stays absent" — no `.unwrap_or("ja")` defaults; a guess must be declared as a diagnostic. "This gate is the memory" of five hand-removed fabrications.

### 3.4 Projection [C, B]

**Confirmed:** stored-vs-derived doctrine everywhere ("Measured, with provenance and confidence" vs "Regenerable. Never written back into the publication" — IV catalog ch.12; "claims are the observations; the projection is the label" — entitlement model; shelves/rankings/similarity in the exclusion list of publication facts). Six-dimension projection profiles (`semantic/behavioral/actionIdentity = required`) running in production registries. Pure projection modules with ID bijections. Renderer-neutral read models ("The UI never reads tables. It requests a view" — Snack).

**Better mechanisms found:**
- **`computed_from` lineage** (IV doc 19): every projection row carries the set of input digests it was computed from; *stale* is a join against invalidation records (never-computed ≠ stale); stale-while-revalidate permitted only if the marker stays visible. **Declared refresh policy per projection** — `eager` (writer pays) / `lazy-on-read` (first reader pays) / `scheduled` (batch pays), default lazy with an explicit cost argument — and **human-verification eagerness overrides every declared policy** ("a human corrects a speaker attribution and the search document still serving the machine's guess an hour later squanders exactly the authority the two-tier model exists to protect"). This composes with the design's fingerprint invalidation: fingerprints propagate *invalidity*; `computed_from` makes *staleness queryable*.
- **Supersession is declared, never inferred** (doc 19): same scope + same detector class + explicit `supersedes` digest; "timestamps or version-string comparison must not be used to guess an ordering"; human documents never superseded by machine re-runs — a re-run attaches *beside* them. **Multiplicity over supersession as the default**: disagreement stays visible.
- **The read-side merge is one function** (IV `semantics.rs`): machine documents first, then human documents (same-id human wins), `rejected` absent, response carries `sources: {machine, human}` — and reader and owner run the *same* merge with access as a parameter, "so a reader and an owner can never see two different merges of the same documents."
- **Derivative classes, not encodings** (iPub §12.1): manifests declare `thumbnail | preview | reader-medium | reader-large`; codecs live in a delivery projection so re-encoding can't change content identity.
- **Internal→audience vocabulary mapping** as a Projection concern with versioned templates (`template_id + hash`) (Snack P.10).
- **Production bundles** (Snack): derived artifacts shipped as an immutable folder with per-file SHA-256 checksums and cross-derivation consistency by construction.

### 3.5 Field [C — design leads; N additions]

Both systems have *what to measure* (IV's eight normalized page dimensions; Titan's signals taxonomy) but no live field; the design's Fundamental-based Field plane leads. Additions worth taking:

- **The Library Substrate canvas** (IV) is the Field plane's missing evidence layer, working: 10 z-normalized dimensions; k-means shelves with `cohesion`; an **evidence floor as a live, unit-labeled UI control** (default 0.45); **name qualification** — a curated name applies only when its signature matches AND cohesion ≥ 0.55, otherwise the refusal is *rendered with the actual and required numbers* and the cluster keeps its machine description ("negative space +1.42σ · dialogue density −0.88σ"); cluster lifecycle chips (`strong / steady / weak — name withheld`); **an expectation harness** — 12 standing assertions about the corpus re-evaluated on every measurement pass, "N of 12 assertions hold" in the header. Tests of *meaning* over live data. This deepens DESIGN.md §9's evidence-resolved morphology from container choice into named-meaning governance.
- **Revision-scoped observations with named confounds** (IV): the same work measures differently across editions (`sfx +1.02σ` hardcover vs standard; legacy scans inflate ink `+0.6σ`) — "ink coverage must be normalised per revision before clustering." Field observations must be revision-scoped; cross-edition normalization is an identity-model concern.
- **Signals governance** (Titan): metric classes A (server-truth) / B (client-reported, advisory only, "never contributes to allow/deny by itself") / C (derived, ephemeral, **mandatory max TTL**, "permanent behavioral histories are forbidden"); and **the deliberately lossy boundary** — only a coarse Verdict (`verdict, score, requirements[], constraints, reason_code`) crosses out of the Field, never a rich profile; the Field "does not know handles exist." Fail-closed to high-friction posture when the Field is unavailable.
- **Truth-type classification per field** (Titan Parametric): `semantic | canonical | operational | abstain` driving both retrieval policy and re-derivation policy (parser change → reprocess structured; ontology change → re-label; model change → retrain), with `stale_operational_data` as a named error class and over/under-confidence as first-class calibration failures.
- **Epistemic actions** before any generation: `answer | retrieve | request | abstain` — "the agent doesn't know what it doesn't know."

### 3.6 Observation [C, B, N]

**Confirmed:** expiring observations; drift explicit; degradation governed; provenance chips (IV's data-posture badge and `Provenance{status, confidence, source}` primitives are the same chip family; the badge "renders nothing when all domains are live… disappears on its own rather than becoming furniture").

**Better mechanisms found:**
- **Presence and transport are two axes** (Snack): `PresenceState HOT/ACTIVE/IDLE/STALE/OFFLINE/UNKNOWN` × `TransportState HEALTHY/DEGRADED/UNHEALTHY/OFFLINE/UNKNOWN`, with **UNKNOWN rendered** (a question mark, not a blank) — "we don't know" ≠ "not here."
- **Two-clock freshness**: staleness computed against server-issued `serverTime` with tracked skew — "every 'updated 3s ago' badge you'd otherwise ship is a lie on a skewed client." Titan's realtime frames carry `protocolVersion + serverTime + (entity, id, action)` on every push.
- **Hysteresis with instrumentation**: anti-flicker buffering (2s / 2 consecutive evaluations) on state transitions, transitions themselves logged.
- **Presence must be announced, not inferred** (Titan fleet-tracker): a runtime that starts healthy and never transitions is invisible to its observer — "'missing' and 'healthy' look identical" (measured: 23 configured, 1 event seen). Fix: announce on start. Heartbeats fire **on edges, not ticks**, with auto-composed numeric `reason`; `Degraded` is a *serving* state distinct from `Down` (liveness ≠ serviceability); `DependencyStatus` lets a node report its upstreams.
- **Disclosed subscriber staleness** (Titan observer): SSE emits `lagged` when a subscriber falls behind the broadcast buffer — "refetch since… to catch up" — staleness as a protocol message. Catch-up + live is the canonical consumer shape (`?since=` replay → EventSource).
- **Absence with a reason code** (IV): every scalar is `{value, source, confidence, absent_reason}` (`NO_STORE / NO_WRITER / NOT_CAPTURED`), sources sit on a precedence ladder, off-ladder observations render `(off-ladder)` and **sort last, visibly**. "If the server did not say, the view says the server did not say." Three absence granularities — `empty` (shelf) / `absent` (service) / `error` (read failed) — never merged, rendered at page, panel, and rail scale; **named-absence routes** stay deep-linkable with `declared: false` distinguishable from designed absence.
- **DLQ as a first-class surface** ("what failed that we haven't dealt with"), per-stage SLA budgets with violation badges, and drift/recovery acceptance tests ("introduce a drift case; the system flags it within one probe cycle"; "a fresh contributor can reproduce operational state from documentation alone").

### 3.7 Entitlement — a cross-plane concern the design underspecifies [N]

Infinite-Verse treats entitlement as its own model, twice over:

- **Section-level access classes** (iPub §17.4): every semantic envelope section is `open` (geometry, regions, observations, metrics, relation topology — "what shelves and similarity run on") or `entitled` (all text layers, anything "precise enough to reconstruct narrative"); rule 16″ makes it mechanical (an open section contains no text; textLayers can never be open); one shared `restrict_to_open` function serves every surface "so this route cannot become a second, laxer definition of what open means." This is DESIGN.md §10's "discovery without exposure," specified to the field level.
- **The five-record independence rule** (federation): `ProviderAssertion ≠ ProviderTransaction ≠ EntitlementClaim ≠ EntitlementProjection ≠ LibraryEntry`, evidence flowing strictly one way, claims from different issuers never merged destructively, projections recomputable-from-claims with a fixture-replay gate making the MUST executable, and typed refusal codes for each collapse. "Claims are the observations; the projection is the label."
- **404-not-403** non-probing discipline for owner-scoped reads, uniformly applied.

---

## 4. The realtime obligations, revisited

**R1 — live co-authoring.** Three additions to DESIGN.md §8.5:
1. **A divergence-first lane** (GRP): neither Titan nor IV uses CRDTs anywhere. GRP's answer — immutable typed nodes, 23 edge types, paths as projections over the DAG, sibling branches structurally invisible to each other, and **merge as an explicit authored act** in five modes (`synthesize / replace / augment / overlay / compare_then_merge`, with `overlay` "preserving each voice") — composes with append-only Canon in a way silent convergence cannot. The **traversable-relationship whitelist** (only 6 of 23 edge types carry context into derivation; `contradicts` and `questions` are recorded but do not propagate) separates edge *semantics* from edge *reachability*. Proposal: keep CRDT for micro-convergence inside a draft's `free` fields; adopt branch/authored-merge for document-scale divergence.
2. **`changeCertainty`** (IV): every write outcome carries `asserted | derived | indeterminate` alongside `changed` — "a 409 from an optimistic endpoint cannot have committed" is *derived*; `indeterminate` is required to carry a retry bound to the **original** idempotency key. The difference between "your edit didn't save" and "we don't know whether it saved" — only the second has a safe remedy. Companion: **`receiptSurrogate`** — receipt-shaped server responses that are not receipts are carried under a different name with the gap documented; "a client that constructs one has produced an audit record for an event it did not witness."
3. **Rendered-set-bounded deletion** (IV panels): deletes are authorized only for records the actor was actually shown (`renderedRegionIds` + the item they were rendered for); omitting the set means "shown nothing," so nothing may be deleted. Shipped-bug provenance: a diff against a fetched-but-unshown envelope turned one mark into 1 add + 20 deletes, reported as success. Directly transferable: a stale editor view must not be able to delete blocks a concurrent writer added. Also: on stale reorder, deliberately **no "try again"** recovery — re-sending would discard the other writer's work; retry only where retrying helps.

**R2 — live propagation.** The proven transport (Snack P.2 + Titan observer): **transactional outbox** as the emission source ("nothing happens without an emission" — audit log, dashboard, DLQ, SLA monitor, and replicas all subscribe to *the stream the system needed for its own integrity*), Postgres LISTEN/NOTIFY fanout (horizontal-safe, no new infra), scoped subscriptions, **backfill-burst-then-live** on connect, reconnect with `last_event_id` replayed from the outbox, explicit "no event loss" acceptance, and `lagged` overflow disclosure. IV's client-side seam confirms the shape: a `Stream<T>` contract that mocks drive with scripted frames "so realtime code paths run for real long before a socket gateway exists."

**R3 — live honesty.** Two-clock freshness; hysteresis; announce-on-start; UNKNOWN rendered; `mockIsSilent` as a *defect class* (mock data present without a URL-discoverable override — "a screenshot of mock content was verified as 'live mode'"); staleness disclosures on frozen projections ("the two offline bundles predate the theme consolidation; they need re-export"); and IV's corpus header self-report (payload hash + dirty flags + STALE INPUT banner) as the pattern for our own compiled-context honesty.

---

## 5. Cross-cutting governance findings

- **Gates must be able to fail — operationalized.** Vacuous-pass detection (CI-2D), evaluator self-test twins, gate-enumeration and invocation-coverage gates, `provenance()` stamping base SHA + `+dirty` on every run ("a bare '29/29' cannot be verified by anyone, including its author a day later"), and validator-applicability reporting (how many checks *actually ran*).
- **Deviation register with escalation** (Titan): violations are permitted *if filed* — credential name, why custody isn't possible, blast radius, rotation, **reversal trigger**, owner — and any violation without a filed deviation auto-escalates one severity level. Converts "we know it's wrong" into a dated, owned, reversible record.
- **Assurance is multi-dimensional and never aggregated** (IV, ICP §15.2): ten independent dimensions (`declared … independently_reviewed`), generated from the registry so it can't drift, with **deliberately no aggregate score** — "a percentage is how a table like this starts lying."
- **The spec-health register** (IV): a tagged list (`GUESS / GAP / THIN / CAVEAT`) of exactly where a spec is ambiguous enough that a builder must invent — "listed so the invention becomes a decision instead." DESIGN.md should ship one.
- **Doc-vs-code drift as a typed finding** (Titan audits): VIOLATION (code wrong) vs INACCURACY (docs wrong, sub-classed), plus Built/Partial/Paper self-labels and per-claim authority labels (Implemented/Evidenced/Conceptual/Blocked).
- **Naming collision to resolve deliberately**: Titan uses "plane" for Record/Event/Workflow/Policy/Retrieval (and Identity/Intelligence/Domain/Integration); our six planes overlap but differ. A bindings entry should either align or explicitly diverge — silence would be drift.

---

## 6. Proposed design amendments (for owner disposition — not applied)

Numbered for reference; each names its source and the DESIGN.md section it would amend.

- **P1. Add an Admission plane** (new §3.0): source-admission records with `processingAuthority` sets, rights scope, retention, and the `metadata-only` outcome; comprehension asynchronous and never blocking readability. [IV]
- **P2. Specify Entitlement as a cross-plane model** (§10): section-level `open`/`entitled` classes with a single shared restriction function; the five-record independence chain for externally-sourced entitlements; 404-not-403. [IV]
- **P3. Harden Qualification verdicts** (§6): four-column verdicts with could-not-run and not-run blocking promotion like failure; BLOCKED never collapsing; vacuous-pass gate + self-tests required of every evaluator; freshness as a per-obligation invalidation event; qualify the served artifact. [IV, Titan]
- **P4. Add `computed_from` + declared refresh policy to Projection** (§7): staleness as a queryable join beside fingerprint invalidation; eager/lazy-on-read/scheduled with lazy default; human-verification eagerness override; supersession declared never inferred; multiplicity default. [IV]
- **P5. Adopt two-tier materiality in Canon/Qualification** (§3, §6): machine attachments non-material; human promotion mints revisions. [IV]
- **P6. Extend custody declarations** (§2): add *must never become* + `forbidden_reads/writes/calls` per plane component; derive declarations from actual surfaces; constitutional CI (doctrine-as-greps, illegal-states table). [Titan]
- **P7. Add the divergence-first lane to R1** (§8.5): branch/authored-merge (five modes) at document scale; traversable-edge whitelist; CRDT retained only for intra-draft `free` convergence. [Titan GRP]
- **P8. Add `changeCertainty` + `receiptSurrogate` to Contracts** (§5): asserted/derived/indeterminate on every outcome; indeterminate binds retry to the original idempotency key; receipt-shaped non-receipts named as such. [IV]
- **P9. Rendered-set-bounded destructive operations** (§8.5): deletes/retirements authorized only against what the actor was shown. [IV]
- **P10. Specify the R2 transport** (§8.1–8.3): transactional outbox as the sole emission source; backfill-then-live; `last_event_id` replay; `lagged` disclosure; scoped subscriptions; idempotency-conflict 422 on ingest. [Titan, Snack]
- **P11. Extend Observation** (§8.4, §8.6): presence × transport axes; UNKNOWN rendered; hysteresis; announce-on-start; two-clock freshness with tracked skew; `absent_reason` codes with off-ladder-sorts-last; three absence granularities; named-absence routes. [Titan, IV]
- **P12. Add delivery-time qualification for generated/cited content** (§6, §11): LIAC-shaped known-set citation gate (one failure blocks the artifact); non-blocking adversarial challenger; fingerprint the decision including policy version. [Titan Book, grounding-gate]
- **P13. Deepen the Field plane's evidence governance** (§9): evidence floor as a surfaced, unit-labeled control; name qualification with rendered refusals; cluster lifecycle chips; a standing expectation harness ("N of M assertions hold") as meaning-tests; revision-scoped observations with named confounds; metric TTLs and the lossy verdict-only boundary; truth-type classification driving re-derivation policy. [IV, Titan]
- **P14. Identity discipline** (§3.3): mint ledger for retry-idempotent identity; scheme-version columns without DEFAULTs; hash-input selection documented per identity; nothing detector-derived is identity-stable. [IV, GRP]
- **P15. Prose gates** (§10, §13): claim-reconciliation table and operational-promise register wired into CI; spec-health register appended to DESIGN.md; deviation register with auto-escalation. [Titan, IV]
- **P16. Bindings addition**: record the Titan "plane" vocabulary collision as an explicit alignment-or-divergence decision. [review §5]

## 7. Proposed resource pins (for owner disposition — not applied)

Candidates for FORMAL_RESOURCE_MANIFEST.json, all as `kind: reference` (informing, not normative), pending owner decision and clean pin states:

- `titan-systems` — SYSTEMS_CONTRACT, RUNTIME_CUSTODY_AND_AUTHORITY, BOUNDARIES, fleet-contract/fleet-tracker, grounding-gate, canonical-serializer, event-runtime protocol. (No VCS state inspected; pin method TBD.)
- `infinite-verse` — iPub docs 03/17/18/19/20/21, SOURCE_ADMISSION, INGEST_CONTRACT, federation/02-entitlement-model, eqp deployment profile, promote-staging/qualify-deployment, check-vacuous-pass, migrations 0024/0025/0034/0041. (Superproject dirty at review time; pin after commit.)
- `grp` — Experiments/Generative Relationship Protocol types + lineage CTE + merge modes. (Inside Titan.)

## 8. Not applicable now, but generative

- **FastBLT's verified speculative decoding** — cheap draft accepted only when an expensive verifier agrees, with proven baseline equivalence: the exact contract shape for optimistic local rendering with server verification, if the CMS ever wants it. Its "Non-Claims" section is a doc pattern to steal regardless.
- **`text-streaming.html`'s eleven renderers over one `tokenProg` settling-tail model** — one progress abstraction, N presentation mappings: streaming visual style as a theme rather than a rewrite. Directly liftable when the CMS streams generated content.
- **The single-file offline projection** (IV's 22 MB bundles): UUID→base64 manifest, blob rematerialization, and a strict direct-parent-only frame relay (root never sends upward, because `window.top` may be foreign) — a serious model for "export this space as one durable offline artifact," security model included; paired with an honest staleness disclosure when the export falls behind.
- **Trail decay as a freshness metaphor** (location-client): recency rendered as literal visual decay.
- **The 17-page design-system-as-bound-volume** and plates-valid-in-exactly-one-theme-state rule; **component contracts shipping their own `.prompt.md` + specimen** — every CMS block type could ship its authoring prompt and rendered specimen beside its schema.
- **IP-as-content** (Titan): patents with lifecycles, service↔IP mappings, coverage-gap flags, drift detection when architecture changes without IP review — a worked example of a `commitment`-class content type.
- **"No calendar promises in doctrine"** — roadmap artifacts carry dependency order only.

## 9. Maturity caveats (both systems' own accounting)

- Titan: `Systems/Planes/` doesn't exist; 1 of 32 runtimes has the mandatory RUNTIME_AUTHORITY.md; the SEC-* policy suite is referenced everywhere and exists nowhere; the safety gate "fails open" (route/shape mismatch); no CI workflows in runtimes; several product docs point at absent files. What survives its own reality check — and is safest to copy — is the code-backed set: fleet-contract/tracker, grounding-gate, canonical-serializer, event-runtime, check_boundaries.sh, manifest generation.
- Infinite-Verse: the 26-gap iPub implementation register is scrupulous — no `work` table, manifests not served, `manifestHash` not yet a hash, locators not yet `ipub://`; "members of twenty-two implemented conformantly end-to-end: still none." Treat it as a well-argued contract corpus with partial implementation; borrow on the strength of the reasoning, not on scale evidence.
- This review is a single pass (`observed`); nothing here has been adversarially verified against the sources.

## 10. Review traceability

Findings synthesized from four bounded exploration passes executed 2026-08-28: (1) Titan doctrine + Systems via `Systems/llms-full-tsys.txt` + code fallbacks; (2) Titan Products/Research/Experiments/Business via `Products/llms-full-tprod.txt` + direct reads (Research/Experiments corpora were empty stubs); (3) Infinite-Verse doctrine + iPub + Platform via `.agents/llms-full-iv.txt` + migrations/broker sources; (4) Infinite-Verse Apps/UI/promotion via direct reads (canvases and attestations absent from the corpus). File references throughout are to the reviewed repositories at their 2026-08-28 state.
