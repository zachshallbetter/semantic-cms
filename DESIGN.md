# Semantic CMS — Design

**Status:** Declared design, **v2 candidate** — integrates amendments P1–P28 from SCMS-002 and SCMS-004 for owner disposition. Each integrated passage is tagged `[P#]`; strike or amend per hunk. (documented ≠ implemented ≠ tested ≠ deployed ≠ verified)
**Authority:** project.owner
**Formal resources (pinned):** SES v1.0.0 · SPS v0.1.0 · ICP v0.1.0 · EQP v0.1.0 · IEPE-001 v0.2.0 · HCML corpus v2 · Fundamental Engine v0.10.1 · rr-rsp-0.1 (provisional, UD-8) · formal-project-bootstrap v0.5.0 — plus, on acceptance of P18: agent-control-plane 0.1.0
**Companions:** SPEC_HEALTH.md (deferred decisions + claim register) · records/upstream-debts.jsonl · research/ (evidence base)

---

## 1. Thesis

Every consequential fact in the system is an explicit, typed, provenance-bearing, versioned record with a named authority. Everything anyone sees — every page, feed, index, dashboard, notification, agent corpus, live signal — is a **projection** of those records that declares what it preserves, transforms, omits, and introduces. Every write crosses a **contract**. Publishing is **qualification plus promotion**, never a boolean on a row. And realtime state is **observation with an expiry** — it can inform and emphasize, but it never becomes a second source of truth.

"Realtime" is decomposed into three precise obligations:

- **R1 — Live co-authoring.** Multiple actors (human and machine) edit the same content simultaneously, with no silent conflict resolution on consequential fields.
- **R2 — Live propagation.** A committed change reaches every projection and every subscriber, with the freshness of what each viewer sees disclosed, not implied.
- **R3 — Live honesty.** The system continuously shows what it actually is — drift, staleness, presence, degradation — rather than what it intends to be.

Most realtime systems buy R1 and R2 by sacrificing R3. This design treats R3 as the constraint the other two must satisfy.

## 2. The planes

Adapted from SPS's layered stack, extended by review. Each plane owns one kind of truth, is prohibited from owning its neighbors' — and declares what it **must never become** `[P6]`.

| Plane | Owns | Must not own | Must never become `[P6]` |
|---|---|---|---|
| **0. Admission** `[P1]` | Source intake: custody, rights scope, processing authority, retention | Content meaning, identity resolution | A byte-processing authority for sources admitted metadata-only |
| **1. Canon** | Identity, revisions, typed relations, provenance, entitlement declarations | Layout, delivery state, live signals | A mutable store; a second vocabulary authority |
| **2. Contracts** | Authority, validation, instance lifecycle, receipts, recovery | Content meaning, visual styling | A hidden actor graph; a credential sink |
| **3. Qualification** | Claims, evidence, obligations, attestations | The publish decision (promotion is separate authority) | A self-certifying scheme — its gates carry self-tests |
| **4. Projection** | Expression resolution, derived artifacts, access projection | Any mutation of canonical state | A decision-maker — renderers are contractually decision-free |
| **5. Field** | Live metrics, relationship signals, emphasis, workspace morphology | Canonical metadata | An identity system — only lossy verdicts cross its boundary; it does not know subject identities `[P13]` |
| **6. Observation** | Freshness, drift, presence, degradation | Authority — observations expire | A second truth; a permanent behavioral history `[P13]` |

Structural rules: read/reveal capabilities are structurally separated from write capabilities (ICP §4.5). `[P6]` Every plane component ships a custody declaration — *owns / may consume / may issue / must never become*, with `forbidden_reads` / `forbidden_writes` / `forbidden_calls` — derived from its actual surface by tooling and confirmed by a human, and enforced by **constitutional CI**: doctrine compiled into executable checks (pattern rejection, forbidden-vocabulary lints, an illegal-states table of *anti-pattern → prevention mechanism → status → evidence*).

## 3. The record model (Canon)

### 3.0 Admission `[P1]`

Nothing enters Canon without an admission record: `sourceType, sourceRef, custody, processingAuthority, rightsScope, acquiredAt, digest, actor, retentionPolicy, identityDisposition`. `processingAuthority` is a **set** of permitted operations — `inspect | normalize | ingest | enrich | train | redistribute` — because possession does not authorize processing. Outcomes: `rejected` (typed reason) · `held-for-review` · `admitted` · **`metadata-only`** (participates in discovery and collection with zero byte-processing authority). Comprehension is asynchronous: a source becomes a record in one transaction and becomes *understood* afterwards, never blocking readability — with enrichment enqueued inside the admitting transaction so no work can be silently missing.

### 3.1 One envelope, five body kinds

```
Envelope {
  schema_version      // wire protocol version, e.g. "scms-0.1"
  subject_id          // stable identity, chosen by the owning authority
  compatibility       // { protocol, subject_schema } — checked independently of identity
  provenance          // { kind, authority, source, source_hash, observed_at?, expires_at? }
  minimum_access      // access floor for the whole record
  body                // tagged: Schema | Content | Relation | Observation | Topology
}
```

Content types, themes, and contract definitions (`Schema`), documents (`Content`), typed edges (`Relation`), measurements and presence (`Observation`), and the delivery graph (`Topology`) are peers in one store — uniform identity, access projection, and provenance for all.

### 3.2 Provenance is a four-class lattice

`provenance.kind ∈ { declared, derived, observed, system-certified }`. **Consumers must not promote one class into another.** Observed envelopes MUST carry `observed_at` + `expires_at`; declared/derived MUST NOT. Expiry governs *authority to decide*, not deletion — expired observations are retained for replay.

### 3.3 Identity

Four identity classes, never conflated:

| Class | Stability contract | CMS instance |
|---|---|---|
| Process-local | one session | editing session id, subscription id |
| Build-local | one artifact | revision hash (JCS → SHA-256) |
| Schema key | stable across declared-compatible releases | content id, semantic slug namespace |
| Human name | display only, no uniqueness | title, byline |

A semantic replacement gets a **new id**; editorial correction keeps the id. Content hash answers "same bytes"; compatibility answers "may be exchanged."

`[P20]` **Hashing discipline.** Identity hashes are two-tier: a **structural hash** over the canonical content alone, and a **contract hash** over the rendering/exchange agreement (schema name+version, declared offsets, hints) — so presentation-policy churn never invalidates content-keyed caches. Rules: hash the source, never a derived rendering, and never round-trip a projection back into identity; domain-separate every hash (a separator byte + purpose tag) and bind to relative, portable paths; strip presentation metadata (frontmatter-class fields) from content identity so `reviewed: true` invalidates nothing downstream; **quantize continuous inputs before hashing** so measurement noise cannot churn identity; run cheap and expensive derivations on **independent staleness axes** (a tree-level hash and a semantic-level hash that invalidate separately). *(Design adopted from imagetracer/graphify; imagetracer's reference implementation of the contract hash is defective — see UD-11 — adopt the design, not the code.)*

`[P14]` **Minting discipline.** Identity is minted, never derived from anything a downstream process can change: a per-job mint ledger inside the committing transaction makes retried commits idempotent while new jobs mint fresh identity for identical bytes; identity-scheme version columns carry **no DEFAULT** (a default silently labels rows nobody classified); every identity documents its hash inputs **and its exclusion list** `[P19]` — time, randomness, iteration order, and display strings are named as excluded, which is what makes a frozen record re-verifiable. Nothing derived from a detector or model output is identity-stable across detector versions.

### 3.4 Append-only, enforced by grants

Revisions and receipts are append-only rows with no UPDATE grant. No destructive edit, no destructive delete — only **supersession**, **revocation** (retaining the provenance that explains past use), and **entitlement hiding** (content participates in discovery as a protected resource). The receipt chain is hash-linked. Negative results are permanent memory. Enforcement educates: append-only triggers state the correct alternative procedure in their error messages. Every record family declares a **loss hierarchy** `[P23]`: which fields are load-bearing (attribution — never dropped) and which are decorative (droppable individually, with the loss counted and reported).

### 3.5 Multi-axis state — the one-enum `status` field is prohibited

Semantic maturity · evidence state · publication state · delivery state: orthogonal axes, never one value. Absence vocabulary never collapses: `hidden ≠ unavailable ≠ absent ≠ unknown ≠ unsupported ≠ missing`.

### 3.6 Relations associate; patterns couple

Typed edges are non-causal by default; only a named field pattern turns association into coupling, declared in the pattern's passport. `[P7]` Additionally, edge *semantics* and edge *reachability* are separate declarations: every relation type states whether it is **traversable** for context derivation — `contradicts` and `questions` are recorded but do not propagate into derived context unless declared so.

## 4. Content types (the SES semantic model)

Element / Slot / Block / Socket / Composition / Variant / State / Operation, mapped as v1 §4. Expression is granted through Visual Language → Theme → Recipe, resolved by a pure deterministic 12-layer cascade with per-field trace; failure is closed. Each rendering surface holds a **Projection Contract** — `preserve / transform / mayOmit / mayIntroduce` plus six invariance dimensions each `required | bounded | free`. Protected fields are never overridable. Two renderings are equivalent iff identities, required content and priority, operation identity/exposure/reachability, accessible names/roles/order, and responsive reachability match — pixel equality explicitly not required.

## 5. The write path (Contracts)

No persistent mutation executes outside a registered contract. Contract definitions are versioned records; executions are ICP instances (`declared → ready → started → validating → … → completed | blocked | conflicted`); `blocked` is not `error`; every blocking outcome carries executable recovery or a declared terminal reason. Verification levels derive from effect class (E0–E4), not UI preference. Every landed mutation produces a hash-chained **change receipt**.

`[P8]` **Write outcomes carry certainty.** Alongside `changed: boolean`, every outcome states `changeCertainty ∈ { asserted, derived, indeterminate }` — *asserted* (the server said), *derived* (contract semantics settle it: a 409 from an optimistic endpoint cannot have committed), *indeterminate* (unknown). An `indeterminate` outcome MUST carry a retry bound to the **original** idempotency key — "we don't know whether it saved" is the only state whose safe remedy is resend-same. Receipt-shaped responses that are not receipts travel as **`receiptSurrogate`**, named as such with their gap documented — a client that constructs a receipt has produced an audit record for an event it did not witness.

`[P23]` **Accepted-with-disclosed-anomaly is an outcome class.** A write may land *and* diverge (the converged state differs from what the writer composed): the success envelope then carries a warning with the converged content inline (bounded size) so the writer recovers without a second read. The honesty channel is grouped **by remedy, not severity** — re-read anomalies vs. fix-and-re-edit anomalies — and encodes absence precisely: an empty array is a positive assertion ("all links verified"); an absent field is absence of evidence; an errored listing refuses to return empty (byte-identical to "all clear" otherwise).

`[P9]` **Destructive operations are rendered-set-bounded.** A delete or retirement is authorized only for records the actor was actually shown, fenced by the shown-ID set and the context it was rendered for; omitting the set means "shown nothing," so nothing may be deleted. On stale-view conflicts there is deliberately no "try again" recovery where resending would discard another writer's work — retry only where retrying helps.

Ingest idempotency: same key + same payload → deduplicate and return the original; same key + **different** payload → typed conflict (422-class), never silent overwrite.

## 6. The publish path (Qualification, then Promotion)

Two gates that must not collapse: **qualification** (is the required evidence present, valid, current, sufficient — for this exact revision and claim set) and **promotion** (a separate E3 contract by a named authority; `QUALIFIED` does not mean live; embargo is promotion with a world-time trigger). Re-qualification is incremental (the `RequiredEvidence` equation, v1 §6) at the appropriate radius R1–R4.

`[P3]` **Verdicts are four-column.** Every qualification run reports `passed / failed / could-not-run / not-run` as separate lists — and **all three non-pass columns block promotion identically**: promotion over partial coverage asserts more than was established; full coverage or no promotion. `UNKNOWN` never collapses into a neighbor — an obligation that could not be evaluated is a coverage gap, not a finding, and yields disposition `BLOCKED`, distinct from `NOT_QUALIFIED`. Every evaluator ships a **self-test proving it can fail**, and a **vacuous-pass gate** runs each evaluator against a populated corpus and an empty one — an evaluator that can observe absence must not return green on the empty corpus. Each obligation declares its own **freshness/invalidation event** ("a redeploy invalidates it") so evidence currency derives from the claim, not a global TTL — and qualification examines **what is served, not what is configured**.

`[P5]` **Two-tier materiality.** Machine-produced attachments are **non-material**: they attach beside canon (multiplicity is the default — disagreement stays visible), mint no revision, and are superseded only within their own producer class, by declaration, never by timestamp inference; human re-verification is never displaced by a machine re-run. Human-verified work may be **promoted to material attachment**, which writes into the record and mints a revision — editorial judgment becomes part of content identity; machine output never does on its own.

`[P21]` **Evidence discipline.** Confidence is provenance-typed — `EXTRACTED / INFERRED / AMBIGUOUS` — answering *how do we know*; scalar confidence without provenance is prohibited (a completeness count is not confidence). Evidence codes travel **inside** the content-addressed artifact they qualify, so qualification cannot desynchronize from content. Machine-asserted evidence is quote-anchored (the literal span, a typed signal from a closed vocabulary, the hypotheses it supports, a strength hint); every inference is stamped with its `taxonomyVersion` so vocabulary drift is findable; calibrated outputs reserve probability mass for unmodeled hypotheses and self-report entropy ("I don't know" as a value); declared **contradiction pairs** act as model-free hallucination tripwires; sanitization of machine output **counts and reports** what it dropped.

`[P12]` **Delivery-time qualification** for generated or cited content: every citation in a generated response must resolve into the exact evidence set retrieved *for that request* — one unresolvable citation blocks the entire artifact, never a partial. A conditional adversarial challenger may force regeneration under an injected constraint; the challenger is **non-blocking** (its errors degrade, never break). The *decision* is fingerprinted — over policy version, outcome, attempts, and the verified set — so a block is as auditable and reproducible as a publish, and a policy change provably changes the fingerprint.

**Consequence profiles** (v1 §6.1) remain the stopping condition: every content class declares its gate roster *and its end*; "no further gates" is a declared statement, not silence.

## 7. Projections (the read path)

Every consumable artifact is a derived projection: pages, feeds, indexes, notifications, embeddings, the agent corpus. Discipline (v1 §7): frozen-snapshot one-way materialization; access projection before serialization (subtractive with respect to power; `exposed / hidden / unavailable` unmerged internally); fingerprint-scoped invalidation along observable edges only (cache correctness and side-channel safety in one mechanism); a published transformation ledger (`lossless / lossy-disclosed / interpretive / unsupported`).

`[P4]` **Staleness is queryable, refresh is declared.** Every projection row carries `computed_from` — the set of input digests it was computed from. *Stale* is a join against append-only invalidation records; *never-computed* is distinct from stale; stale-while-revalidate is permitted only while the marker stays visible. Each projection declares its **refresh policy** — `eager` (writer pays) / `lazy-on-read` (first reader pays) / `scheduled` (batch pays) — defaulting to lazy, with one override: **human-verified corrections recompute eagerly regardless of policy**, because serving a machine's superseded guess after a human ruled squanders exactly the authority the two-tier model protects. Supersession between derived documents is declared (same scope, same producer class, explicit lineage), never inferred from timestamps.

`[P24]` **Editable projections carry a round-trip contract.** Any projection that claims to be editable states and *tests* its inversion — `serialize(parse(x)) === x` — against a corpus of goldens, with a declared support matrix separating stable constructs from in-progress ones: no silent data loss for supported syntax. A rendering is legitimate only if it inverts. (First instance: the markdown core — UD-3.)

The read surface is **enriched, not multiplied**: governance context (backlinks, history, applicable constraints) arrives with the content rather than on a second round-trip. Renderers are contractually decision-free. Destructive re-projection (mirror-style) carries preserve-lists protecting locally-owned facts.

## 8. Realtime machinery

### 8.1 The commit cycle

`ingest → freeze → derive → commit → notify → observe`, one one-way loop per commit wave (v1 §8.1). No phase reads what a later phase writes; derived output and observations enter only the next wave.

### 8.2–8.3 Transport `[P10]`

The **transactional outbox is the sole emission source**: the domain write and its event row commit in one transaction — "nothing happens without an emission" — and the audit trail, dashboards, dead-letter queue, SLA monitors, and replicas are all subscribers to the same stream the system needs for its own integrity. Fan-out via the store's native notification channel (no second infrastructure); subscriptions are access-projected lenses. Clients connect with **backfill-burst-then-live**; reconnect replays from the outbox by `last_event_id` ("no event loss" is an acceptance criterion, not a hope); a subscriber that falls behind receives a **`lagged`** disclosure — staleness as a protocol message — with catch-up-then-live as the canonical recovery. Readers hold a committed snapshot baseline; failure degrades to truth, not to a spinner; every live surface carries the provenance chip.

### 8.4 Presence is observation `[P11]`

Presence has **two independent axes**: presence state (`hot / active / idle / stale / offline / unknown`) and transport state (`healthy / degraded / unhealthy / offline / unknown`) — with **UNKNOWN rendered** as its own state ("we don't know" ≠ "not here"). Presence is **announced, not inferred**: an actor that starts healthy and never transitions must not be indistinguishable from one that is gone. Freshness is computed against **server-issued time with tracked skew** — an "updated 3s ago" badge against a client clock is a lie. State transitions carry **hysteresis** (anti-flicker buffering, instrumented) and fire as **edges against persisted state**, not ticks. Presence vocabulary distinguishes actor kinds (`writing` for batch-writing agents ≠ `editing` for humans); a presence entry with no current subject means "not working." All presence records carry mandatory expiry: soft locks self-release; ghost cursors are impossible by construction; cadence matches the source's real rate.

### 8.5 Concurrency discipline is derived from invariance

The invariance table (v1 §8.5) stands: `free` → convergent merge; `bounded` → merge-then-validate, violations surface as `conflicted`, never a silent fallback winner; `required` → serialized through a contract, the loser receiving `conflict` + executable recovery.

`[P7]` **The divergence-first lane.** Convergent merging (CRDT) is confined to *intra-draft* `free` fields. At document scale, divergence is lawful and durable: branches over the immutable record DAG, structurally invisible to each other, with **merge as an explicit authored act** in declared modes (`synthesize / replace / augment / overlay / compare_then_merge` — overlay preserving each voice) and multi-parent lineage recorded. `[P22]` **Every merge is justified by a serializable decision map** — per-hunk `accept / reject / keep` — replayable to reproduce the result and attached to the merged record as its justification. Reconciliation outcomes include **`refused`** as a legitimate, disclosed terminal state, for semantic reasons (the input carries conflict markers) and for resource reasons (a stated computation bound); conflict *shape* (`both-modified / delete-modify / modify-delete`) selects the legal strategies; reconciliation runs against the **live view the human sees**, never against disk behind their back.

### 8.6 Consistency states

Current / Stale-but-safe / Conflicted / Superseded / Revoked / Unknown (v1 §8.6): conflict freezes *consequential* action while drafting continues.

### 8.7–8.8 Events and degradation

Hysteretic edge-triggered events, never a firehose. Degradation sheds cadence, never correctness, asymmetrically (fast down, slow recover); degraded state is itself an observed record.

## 9. The field plane

Records as bodies; meaning mapped to measurable channels; metric provenance typed (`computed` / `supplied-only` — confidence never inferred, risk never defaulted / `designed` with inert-lint); association ≠ coupling; workspace morphology resolved from purpose + evidence density; five senses of time; the causality ladder for analytics claims (v1 §9).

`[P13]` **Evidence governance in the Field.** The evidence floor is a *surfaced, unit-labeled control*, not a buried constant. Derived groupings earn names only when their signature matches a curated lexicon **and** cohesion clears a declared floor — otherwise the surface renders the machine description *and the refusal, with the actual and required numbers*. Cluster lifecycle (`strong / steady / weak — name withheld`) is a drift signal. A standing **expectation harness** — assertions about the corpus re-evaluated on every measurement pass, "N of M hold" visible — tests *meaning* over live data, not code. Field observations are **revision-scoped with named confounds** (the same work measures differently per edition; normalize per revision before clustering). Derived behavioral metrics carry **mandatory TTLs** — permanent behavioral histories are forbidden — and only coarse, lossy verdicts cross the Field boundary outward; the Field does not know subject identities. Every metric that can be misread ships its **misreading guard**: prose stating what the number does *not* mean. Fields carry **truth types** (`semantic / canonical / operational / abstain`) driving both retrieval policy and re-derivation policy (parser change → reprocess; vocabulary change → re-label; model change → re-run), with stale-operational-data as a named error class and over/under-confidence as first-class calibration failures.

## 10. Access, entitlement, and delivery honesty

`[P2]` **Entitlement is a cross-plane model, specified to the field level.** Every semantic section of a record is classed `open` (geometry, structure, metrics, relation topology — what discovery, shelves, and similarity run on) or `entitled` (text layers and anything precise enough to reconstruct the work); the classing rule is mechanical (text is never `open`), and **one shared restriction function** serves every surface, so no route can become a second, laxer definition of open. Externally-sourced entitlements keep the five-record independence chain — provider assertion ≠ provider transaction ≠ entitlement claim ≠ entitlement projection ≠ library entry — evidence flowing one way, claims never destructively merged, projections **recomputable from claims** with a fixture-replay gate making the requirement executable. Owner-scoped absence answers **404-not-403**: absence copy must not confirm existence to a prober.

Delivery is observed, drift explicit (`differences[]` driving purge contracts, honest status surfaces). Gates have a declared trigger, evidence requirement, and demonstrable failure mode; validators report how many checks *actually ran*. `[P27]` **Declaration-consumer parity is itself a gate**: every declared schema field, smoke, or contract clause must have an executing consumer — or be flagged `inert` — because a declaration richer than its checker silently becomes decoration. `[P26]` Findings carry `next_action` (machine-readable remediation) and use `private_expected` as a first-class severity — a 401 from a gated surface is positive evidence, neither pass nor fail. Fleet-wide consistency uses **reference fingerprints** (one artifact designated the reference, everything hashed against it). Deployed artifacts are verified against their declared kind. Policy rules carry their provenance — incident-derived rule lists ("the bugs we already paid for"). `[P15]` **Prose is gated too**: a claim-reconciliation table scores every public claim against code evidence ("anything not ✅ does not ship in copy"); an **operational promise register** extracts promises with no code identifier ("nightly backups") into machine-checked entries — verifiable claims fail loudly, promises fail silently; a **spec-health register** (GUESS/GAP/THIN/CAVEAT) beside this document keeps ambiguity a decision rather than an invention (see SPEC_HEALTH.md); deviations are typed, owned, and auto-escalate if unfiled. `[P19]` The system maintains a **claim register** about itself — every claim, its admissible rung on the evidence ladder, and the evidence that would strengthen it — and its vocabulary is controlled with **prohibited substitutions** (each term defined with the synonyms it must never be called, greppable). Observation states are five-valued — `measured / disabled / unavailable / unsupported / stale` — with the no-fabrication rule: no non-measured state may be rendered as zero, "Normal," or any plausible value.

The wallpaper rule applies to the UI: derive, declare, demote, or sugar — never fake. Determinism is part of honesty.

## 11. Agents and AI participation

Read: bounded semantic slices, provenance-flagged; the agent-json surface; the compiled corpus (digest-valid, never hand-edited — and **corpus staleness is an admission blocker** `[P18]`). Write: machine output enters as a Candidate and never self-promotes; agent provenance is visible for as long as the content lives; generated/cited output passes delivery-time qualification `[P12]`. Decide: PDP panels for high-uncertainty editorial decisions — consensus discounted by shared provenance, invalidation conditions pre-committed, the human owning weights, stakes, and exit. For whom: content classes may require a recipient record — named person, need in their framing, obligation with a date; status derived, never assigned (the project's own recipient register lives at records/recipients.jsonl).

## 12. Versioning, compatibility, and dependencies

Five version axes move independently; equal numbers imply nothing; cross-axis compatibility is a declared six-dimensional conformance record. Schema changes are classed with required review; deprecated identities resolve through a declared window; breaking migrations are qualification events at R3+.

`[P16]` **Vocabulary collisions with pinned resources are bindings decisions.** Where an imported system's terms collide with this design's (e.g. Titan's "planes": Record/Event/Workflow/Policy/Retrieval vs. our six), the binding explicitly aligns or diverges per term in `bindings/PROJECT_BINDINGS.yaml` — silence is drift.

### 12.1 Dependency doctrine (owner directive, 2026-08-28)

The system is built in isolation; capabilities are consumed as pinned dependencies; repair is upstream-first; divergence is a typed deviation; a re-pin is a compatibility event (v1 §12.1 in full).

`[P17]` **Admission gate for dependencies.** Every pin passes a supply-chain admission check before entering the manifest: full-history scanning (including deleted content), encoded-payload and whitespace-evasion detection, lifecycle-hook triggers, and **exact-or-subdomain** allowlist matching (substring matching is an evasion invitation). Pins are recorded content-hash-locked — `{source, sourceType, computedHash}` — and risk is scored by **convergent evidence**: a fingerprint match is a pointer, not a verdict; N independent signals agreeing outweigh any single flag.

`[P28]` **The upstream-debt ratchet.** The ratchet is memory and pressure, never permission. Deploying a locally patched dependency requires this section's **deviation instrument first** — typed, owner-authorized, bounded, with the upstream fix landing as its reversal trigger — before any patched artifact runs; a debt record does not establish that authorization, and filing one grants nothing. At deviation approval, the patch is captured as a diff against the owning project (a receipt, never a vendored fork) and a debt is registered in `records/upstream-debts.jsonl` **referencing the deviation**. Registered debts **age** — a standing warning that escalates — so neither the deviation nor its debt can sit open indefinitely; closing the debt (upstream fix landed, re-pinned here) discharges the deviation. Vendored upstream clones are replaced with pins; permanent forks are violations to remediate; and a deployed local patch without a live deviation is the same violation, however faithfully its debt is recorded.

## 13. Reference implementation sketch (non-normative)

As v1 §13 (store with append-only grants; one pure resolver library shared server/edge/client with golden vectors including a negative vector; envelope wire with JCS hashing and out-of-band attestation keys; CRDT confined to invariance-free fields; edge KV with observed manifests), plus: `[P25]` the collaboration core may be previewed by consuming **open-knowledge as a service** across a strict process boundary (GPL-3: pin the published CLI, drive the MCP/HTTP surface, never link or vendor; counsel review before distribution) — while its writer-ID taxonomy, layered-liveness presence contract, and warning-on-success envelopes are adopted natively in our own planes. Stack defaults and open implementation decisions live in SPEC_HEALTH.md, not here.

## 14. Narrowest end-to-end path

The nine-step first milestone (v1 §14) stands, exit by evidence — targeting the confirmed recipient workload (records/recipients.jsonl · rcp-001, pending owner confirmation). Quantitative acceptance numbers are proposed in SPEC_HEALTH.md SH-6.

## 15. Traceability

v1's traceability table stands for the original design. Integrated amendments trace as follows: P1–P16 to research/titan-infinite-verse-review.md §6 (sources: Infinite-Verse, Titan, GRP, Formalism); P17–P28 to research/titan-node-observatory-tools-review.md §5 (sources: agent-control-plane, open-knowledge, imagetracer, graphify, text-diff-tool, markdown-native-editor, reference-detective, Context Mend, titan-node, titan-observatory, AntiRepoThreat, stitch-skills, design.md). Verification status of the underlying claims: records/evidence.jsonl (adversarial passes, SCMS-005).

## 16. Operating the project `[P18]`

Work on this system is governed the way the system governs content. The board of record is GitHub, worked through the **agent-control-plane** (pinned dependency): work enters as closed **issue packets** (authorized paths, exclusions, acceptance criteria, evidence requirements, definition of done — `additionalProperties: false`); admission yields one of five typed decisions (`INVALID / BLOCKED / APPROVED / REJECTED / QUALIFIED`) with content-addressed decision IDs; evidence climbs the five-tier ladder (`Documented ≠ Implemented ≠ Tested ≠ Deployed ≠ Browser-verified`, no lower tier satisfying a higher requirement); approval carries provenance (`self-approved` ≠ `independent-approved`, never interchangeable); provider outages produce **degraded** operation (prepare, queue, inspect — never mutate) and authorization failures produce **paused** (correction, not waiting); a stale compiled corpus blocks admission; the board carries `Gate` and `Evidence State` as first-class fields. Credentials stay behind the hosted gateway — agents read project state without ever holding a token.

**Design-iteration stopping condition** (the formalist's correction, applied to ourselves): with v2 dispositioned, no further review sweeps or amendment batches are undertaken until the E1 vertical slice (§14 steps 1–2) lands with its gates green. Reviews resume only when building surfaces questions the design cannot answer.

---

*This document is a `declared` record; v2 is a Candidate and does not self-promote — it becomes canonical only by owner disposition of this PR. Its rendered artifact is a `derived` projection, republished on acceptance (the projection-sync gate enforces this).*
