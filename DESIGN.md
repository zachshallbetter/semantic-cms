# Semantic CMS — Design

**Status:** Declared design candidate (documented ≠ implemented ≠ tested ≠ empirically validated)
**Authority:** project.owner
**Formal resources (to pin on bootstrap):** SES v1.0.0 · SPS v0.1.0 · ICP v0.1.0 · EQP v0.1.0 · IEPE-001 v0.2.0 · HCML corpus v2 · Fundamental Engine v0.10.1 · rr-rsp-0.1 · formal-project-bootstrap v0.5.0

---

## 1. Thesis

Every consequential fact in the system is an explicit, typed, provenance-bearing, versioned record with a named authority. Everything anyone sees — every page, feed, index, dashboard, notification, agent corpus, live signal — is a **projection** of those records that declares what it preserves, transforms, omits, and introduces. Every write crosses a **contract**. Publishing is **qualification plus promotion**, never a boolean on a row. And realtime state is **observation with an expiry** — it can inform and emphasize, but it never becomes a second source of truth.

"Realtime" is decomposed into three precise obligations:

- **R1 — Live co-authoring.** Multiple actors (human and machine) edit the same content simultaneously, with no silent conflict resolution on consequential fields.
- **R2 — Live propagation.** A committed change reaches every projection and every subscriber, with the freshness of what each viewer sees disclosed, not implied.
- **R3 — Live honesty.** The system continuously shows what it actually is — drift, staleness, presence, degradation — rather than what it intends to be.

Most realtime systems buy R1 and R2 by sacrificing R3: optimistic UI that lies about delivery, CRDTs that silently merge meaning, caches that serve superseded content with no admission. This design treats R3 as the constraint the other two must satisfy.

## 2. The six planes

Adapted from SPS's layered stack. Each plane owns one kind of truth and is prohibited from owning its neighbors'.

| Plane | Owns | Must not own |
|---|---|---|
| **1. Canon** (record graph) | Identity, revisions, typed relations, provenance, entitlement declarations | Layout, delivery state, live signals |
| **2. Contracts** (write plane — ICP) | Authority, validation, instance lifecycle, receipts, recovery | Content meaning, visual styling |
| **3. Qualification** (publish plane — EQP) | Claims, evidence, obligations, attestations | The publish decision itself (promotion is separate authority) |
| **4. Projection** (read plane — SES resolver + derivations) | Expression resolution, derived artifacts, access projection | Any mutation of canonical state |
| **5. Field** (live semantics — Fundamental) | Metrics, relationship signals, emphasis, workspace morphology | Canonical metadata — signals alter emphasis and explanation, never title, order, entitlement, or identity |
| **6. Observation** (delivery + presence — rr-rsp) | Freshness, drift, presence, degradation | Authority — observations expire and may never drive decisions after expiry |

Structural rule (ICP §4.5): read/reveal capabilities are **structurally separated** from write capabilities. The projection plane has no write path; the observation plane's only write path is appending observed records to Canon.

## 3. The record model (Canon)

### 3.1 One envelope, five body kinds

Every record is a versioned envelope (rr-rsp shape):

```
Envelope {
  schema_version      // wire protocol version, e.g. "scms-0.1"
  subject_id          // stable identity, chosen by the owning authority
  compatibility       // { protocol, subject_schema } — checked independently of identity
  provenance          // { kind, authority, source, source_hash, observed_at?, expires_at? }
  minimum_access      // access floor for the whole record
  body                // tagged union, below
}
```

Body kinds: **Schema** (content types, themes, contracts — definitions) · **Content** (documents: block/slot instances) · **Relation** (typed edges) · **Observation** (measurements, presence, delivery manifests) · **Topology** (sites, channels, renderers, edges of the delivery graph).

Schema, service manifest, live measurement, and topology are peers in one store, differentiated by tag — uniform identity, access projection, and provenance for all of them.

### 3.2 Provenance is a four-class lattice

`provenance.kind ∈ { declared, derived, observed, system-certified }`

- **declared** — asserted by the authority that owns it (an author's text, an editor's confidence rating)
- **derived** — mechanically projected from an identified source (a rendered page, a search index, a summary)
- **observed** — measured from a running system, time-bounded (presence, delivery state, engagement)
- **system-certified** — emitted by an identified trusted pipeline from validated inputs (resolver output with trace)

**Consumers must not promote one class into another.** An observed engagement spike does not become declared importance. A derived summary does not become authored text. Observed envelopes MUST carry `observed_at` + `expires_at`; declared/derived envelopes MUST NOT. Expiry governs *authority to decide*, not deletion — expired observations are retained for replay.

### 3.3 Four identity classes, never conflated

| Class | Stability contract | CMS instance |
|---|---|---|
| Process-local | one session | editing session id, subscription id |
| Build-local | one artifact | revision hash (JCS canonicalization → SHA-256) |
| Schema key | stable across declared-compatible releases | content id, semantic slug namespace |
| Human name | display only, no uniqueness | title, byline |

A semantic replacement gets a **new id**; editorial correction keeps the id. Content hash answers "same bytes"; compatibility answers "may be exchanged" — different questions, checked by different mechanisms.

### 3.4 Append-only, enforced by grants

Revisions are append-only rows with **no UPDATE grant** (PDP's custody-in-the-database pattern). There is no destructive edit and no destructive delete — only:

- **Supersession** — a new revision names what it supersedes; the old becomes historical-only.
- **Revocation** — prevents new use; retains all provenance needed to explain past use.
- **Entitlement hiding** — content participates in discovery as a *protected resource* (geometry, relations, metrics visible; text layer gated).

The receipt chain is hash-linked. Negative results (failed qualification, rejected candidates, discredited metrics) are permanent project memory — never deleted, renumbered, or rewritten.

### 3.5 Multi-axis state — the one-enum `status` field is prohibited

A document's condition is four orthogonal axes, never one value:

- **Semantic maturity:** `draft → complete → superseded`
- **Evidence state:** `unqualified → qualified → stale → invalidated`
- **Publication state:** `unpublished → promoted → embargoed → superseded → revoked`
- **Delivery state:** `unpropagated → propagating → synchronized → drifted`

And absence vocabulary never collapses: `hidden ≠ unavailable ≠ absent ≠ unknown ≠ unsupported ≠ missing`. A renderer that merges any two of them has changed the reader's understanding without computing anything.

### 3.6 Relations associate; patterns couple

Typed edges (`supports`, `contradicts`, `precedes`, `part-of`, `adapts`, `references`, `same-creator`…) are **non-causal by default**. An edge moves nothing — no feed reordering, no emphasis change — until a named field pattern explicitly turns the association into a coupling, with the coupling declared in the pattern's passport. This is the guardrail that keeps the system semantic and authorable rather than haunted.

## 4. Content types (the SES semantic model)

The content type system is SES's semantic model, mapped:

| SES primitive | CMS meaning |
|---|---|
| **Element** | Smallest meaningful unit (heading, image, button). Owns semantics + accessibility, minimal visual identity |
| **Slot** | A field: named, typed content participation *inside* a block (`title`, `media`, `meta`, `actions`…) |
| **Block** | A content component (Article body section, MediaCard, Hero) — semantic composition of elements and slots |
| **Socket** | A region with an **admission policy**: which blocks, what cardinality, what importance, which operations required |
| **Composition** | A page type: semantic arrangement of sockets — hierarchy and participation, not pixel layout |
| **Variant / State** | Semantic specialization (`primary`, `quiet`) / condition (`selected`, `loading`, `read`, `locked`) |
| **Operation** | Stable action identity (`open-article`, `save`, `request-access`) shared by UI, API, and agents — one operation, many actors |

Expression is separate and *granted*: Visual Language → Theme → Recipe, resolved through a **pure, deterministic 12-layer cascade** with a per-field trace (source layer, prior value, resulting value, permitting contract clause, merge rule). Failure is closed: unknown token, unknown asset, undeclared transform, ambiguous conflict — all typed hard failures, never silent defaults.

Each rendering surface holds a **Projection Contract**: `preserve / transform / mayOmit / mayIntroduce`, plus six invariance dimensions (`semantic, behavioral, actionIdentity, structural, morphological, visual`), each `required | bounded | free`. Two renderings of the same content are *equivalent* iff identities, required content and priority, operation identity/exposure/reachability, accessible names/roles/order, and responsive reachability all match. **Pixel equality is explicitly not required.** That is the definition of "the same page in two themes."

Protected fields (identity, required content types, semantic roles, operation identity, contract invariance levels, routing intent) are never overridable by any layer — including accessibility overrides and user style options.

## 5. The write path (Contracts)

**No persistent mutation executes outside a registered contract.** Contract definitions are versioned records (`content.revise@1.0`, `content.promote@1.0`, `entitlement.grant@1.0`, `schema.migrate@1.0`); executions are instances with the ICP canonical lifecycle (`declared → ready → started → validating → … → completed | blocked | conflicted | …`). `blocked` is not `error`; every blocking outcome carries an executable recovery action (`refresh_record`, `review_conflict`, `reauthenticate`, `provide_proof`…) or a declared terminal reason.

Verification level is **derived from consequence, not UI preference**:

| Effect class | Example | Verification |
|---|---|---|
| E0 observational | read, subscribe | none |
| E1 reversible draft mutation | keystrokes, block reorder in draft | none — batched, receipted at session granularity |
| E2 compensable operational | unpublish, cache purge | confirm |
| E3 consequential external | publish, entitlement change, price/legal content | confirm → reauthenticate |
| E4 durable/irreversible | revocation with takedown obligations | prove |

Every mutation that lands produces a **change receipt**: actor, resource, before/after revision, path-level changes, evidence ids, verification id, reversibility class, compensation interaction, integrity digest — hash-chained into the append-only ledger.

## 6. The publish path (Qualification, then Promotion)

Publishing decomposes into two gates that must not collapse:

1. **Qualification (EQP):** given this exact revision, this exact claim set, this exact context — is the required evidence present, valid, current, and sufficient? Evidence results keep `PASS / FAIL / PARTIAL / INCONCLUSIVE / BLOCKED / NOT_RUN` distinct; missing evidence yields `inconclusive`, never pass.
2. **Promotion:** a separate E3 contract executed by a named authority. `QUALIFIED` does not mean live. Embargo is promotion with a declared world-time trigger.

Re-qualification is incremental — the design's realtime publish equation:

```
RequiredEvidence(rev_n) = InvalidatedEvidence(rev_{n-1} → rev_n)
                        + EvidenceForNewClaims(rev_n)
                        + MandatoryProfileEvidence
```

Editing a typo invalidates nothing structural (radius R1 — local); changing a slug is R2 (references, redirects must re-verify); changing a content-type schema is R3 (every instance re-validates); changing shared vocabulary is R4. The editor watches obligations resolve **live**: "publishable — blocked on 2 obligations" is a realtime surface, updating as evidence runs.

### 6.1 Consequence profiles — the stopping condition

Formalism's warning is honored in the schema: the specify→check loop needs an exit that is part of the specification. Every content class declares its **gate roster and its end**:

| Profile | Example | Required evidence | Explicitly not required |
|---|---|---|---|
| **note** | personal post, changelog entry | schema-valid, access declared | link checks, review, a11y audit beyond defaults |
| **article** | essay, feature | + links resolve, media has alt text, relations valid | legal review, human comprehension evidence |
| **commitment** | pricing, legal, medical, promises to named recipients | + entitlement declared, recipient contract present, reauthenticated promotion, second attestation | — |

"No further gates" is a declared statement, not silence. A draft note must never be gated like a legal page; a legal page must never ship like a note.

## 7. Projections (the read path)

Every consumable artifact is a derived projection of Canon: HTML pages, feeds, search index, sitemaps, notifications, embeddings, OG images, and the **agent corpus** (`llms.txt` / `llms-full.txt` — compiled context whose validity is an aggregate source digest; contradictions are repaired in the source and recompiled, never by editing the projection).

Three disciplines govern derivation:

- **Frozen snapshot, one-way materialization.** Derivation runs against frozen state S0, produces G0, materializes S1 = S0 + G0. Generated artifacts are not visible to their own producing pass — no fixed-point loops. Derived content (summaries, embeddings, cross-links) enters future passes as input only explicitly, as `derived` records.
- **Access projection before serialization.** `project_for(access)` removes invisible members and dangling edges *before* any handle exists. Projection is subtractive with respect to power: it may hide, withhold, relabel, understate; it may never manufacture capability or grant permission. Internally, `exposed / hidden / unavailable` stay unmerged; outwardly, mapping hidden→absent for low-access viewers is a *declared omission* in that surface's projection contract.
- **Fingerprint-scoped invalidation.** Every derived artifact records fine-grained dependency edges on its *access-projected* inputs, and receives a structural fingerprint independent of execution order. A change to a field a given projection could not observe produces **no invalidation for it** — which is simultaneously the correct caching model and a side-channel guarantee (invalidation timing cannot leak hidden edits).

Every projection stage is classified in a published **transformation ledger**: `lossless / lossy-disclosed / interpretive / unsupported` — with `unsupported` transformations listed so the refusal is auditable. A renderer can compute nothing and still mislead; the ledger is how it proves it didn't.

## 8. Realtime machinery

### 8.1 The commit cycle

One one-way loop per commit wave, the frame-scheduler discipline applied to a CMS:

```
ingest → freeze → derive → commit → notify → observe
```

1. **ingest** — contract instances validate and land revisions + receipts (the only writes)
2. **freeze** — snapshot S0 of Canon for this wave
3. **derive** — pure resolvers produce projections against S0; no reads of live state, no side effects
4. **commit** — S1 materializes; projection versions recorded as `derived` records
5. **notify** — fingerprint invalidations fan out through lenses
6. **observe** — delivery and client acknowledgments return as `observed` records for the *next* wave

No phase reads what a later phase writes; derived output never feeds its own pass.

### 8.2 Subscriptions are lenses

A subscription is a declarative, **allow-list** scope: records, metrics, relationship types, radius around a subject — composed with the subscriber's access projection. A lens narrows; it can never widen power. The wire format is the envelope itself: provenance travels with every message, and clients are bound by the no-promotion rule (an `observed` push can update a chip; it cannot overwrite a `declared` field in the local model).

### 8.3 Invalidation, not state push

Readers hold a **committed snapshot baseline** (SSR truth, no-JS truth, deterministic builds). The notify phase pushes invalidation keys; clients re-fetch through access projection. If the live channel fails, the client silently keeps its snapshot and says so — failure degrades to truth, not to a spinner.

Every live surface carries a **provenance chip** — the UI of the consistency state machine:

> `live · checked 4s ago` · `snapshot · Aug 27` · `+2 revisions since snapshot` · `local, unsent` · `conflicted — review`

### 8.4 Presence is observation

Cursors, selections, "Zach is editing," view counts, soft locks: all `observed` envelopes with mandatory `observed_at` + `expires_at`. Consequences fall out structurally:

- **Soft locks self-release** — an expired presence record may not drive decisions, so an abandoned lock cannot hold content hostage.
- **Ghost cursors are impossible by construction** — an expired cursor is no longer authoritative for rendering decisions.
- Presence history is retained after expiry for replay, never for authority.
- Cadence honesty: presence at seconds, metrics at their real rate, daily aggregates once per visit — polling a daily aggregate is theater, and the surfaces say so.

### 8.5 Concurrency discipline is derived from invariance

The same typed invariance that governs what a theme may change governs what concurrent editors may merge. One declaration, two enforcement surfaces:

| Invariance of the field | Projection meaning | Concurrency discipline |
|---|---|---|
| **free** (visual, morphological; prose body text) | themes may restyle freely | CRDT/OT merge; concurrent edits combine; E1, no ceremony |
| **bounded** (structural: block order, slot membership, socket population) | themes may rearrange within declared bounds | merge, then validate against admission/cardinality invariants; violation → `conflicted`, surfaced — never a silent fallback winner |
| **required** (identity, operations, entitlement, schema refs, routing) | no surface may alter | serialized through a contract; the second concurrent attempt gets outcome `conflict` + executable recovery (`refresh_record`, `review_conflict`) |

Silent merge is a *granted* behavior, granted exactly where meaning is not at stake.

### 8.6 Consistency states (HCML)

Each client's relationship to each record is one of six states, and the state — not optimism — decides what is permitted:

| State | Meaning | Drafting | Consequential action (publish, entitle) |
|---|---|---|---|
| **Current** | in sync | ✓ | ✓ |
| **Stale-but-safe** | remote commits observed, no overlap on required fields | ✓ (disclosed, converging) | ✓ after converge |
| **Conflicted** | overlap on bounded/required fields | ✓ continues | **frozen** — conflict surfaced, never auto-merged |
| **Superseded** | this revision is historical-only | read-only | ✗ (act on successor) |
| **Revoked** | authority withdrawn | ✗ | stop; compensate in-flight work |
| **Unknown** | consistency cannot be established | ✓ local-only, disclosed | **stop at the protected boundary** |

The load-bearing asymmetry: conflict freezes *consequential* action while drafting continues. A CMS that blocks typing on conflict is unusable; one that publishes through conflict is lying.

### 8.7 Events are edges, not a firehose

Live signals cross thresholds hysteretically (enter at 0.6, exit at 0.2) and emit one clean edge per crossing: `content:trending`, `content:staleness-warning`, `presence:entered/left`, `qualification:blocked/cleared`, `delivery:drifted/synchronized`. Subscribers get transitions, not ticks.

### 8.8 Degradation is governed and asymmetric

Under load, a quality governor sheds *cadence*, never *correctness*: projection refresh and notification frequency step down quickly (a few over-budget waves) and recover slowly (a sustained run of clean ones). The contract, qualification, and receipt planes never degrade. Degraded state is itself an observed record — visible on the chip, honest on the status page.

## 9. The field plane (live semantics)

The workspace is a Fundamental field in which records are bodies (identity doctrine: `id / namespace / kind / host`) and typed relations are edges with fast `strength` and slow `memory`.

**Meaning maps to measurable channels** (the semantic layer table): importance→attention · urgency,recency→heat · confidence→coherence · uncertainty→entropy · relationship,history→memory · status→phase · hierarchy→pressure. The editorial dashboard is a *reading* of these channels: what is hot, what is stale, what is conflicted, what is quietly accumulating memory.

**Metric provenance is typed:**

- **computed** — the engine writes it (attention, recency, staleness)
- **supplied-only** — only present when a human supplies it; *never inferred*: `confidence` ("a citation is not certainty") and `risk` ("'no risk' is a claim, not a safe blank" — never defaulted to 0)
- **designed** — pattern-referenced lanes the host must supply, or they are flagged inert by lint

**Workspace morphology is resolved, not templated** (SPS's contribution): each shelf of the editorial UI declares `{ purpose, lens, form }`, and its container form (`hero / banner / rail / split / matrix / portals`) resolves from semantic purpose **plus evidence density** — with an evidence tone (`earned / steady / fading`) reflecting how many records actually satisfy the lens. The layout is a function of how much evidence supports the grouping. No generic dashboard shell.

**Editorial time is five separate senses:** simulation time ticks (the field), host time is supplied (the platform), world time is declared (`publishedAt`, embargo instants — declaration beats inference), semantic time is derived (freshness half-lives per content class, imminence ramps toward embargo horizons, retention curves for archives), replay time is reconstructed (audit).

**Analytics claims sit on the causality ladder** — `observed → attributed → explained → replayed → predicted` — and every surface quotes the highest level its data supports, and no higher. "Attention 0.8" is observed; "the rise is attributable to feed placement" is attributed; "readers love this" requires human evidence and is otherwise unsupported. Prohibited interpretations ship with the metric.

## 10. Access, entitlement, and delivery honesty

- **Discovery without exposure.** Entitlement-gated content participates in search, relations, and field signals through geometry, metadata, and observations — the text layer is a protected resource behind a `staged-access-request` state and an entitlement contract.
- **Delivery is observed, drift is explicit.** Topology records declare what each edge/channel *should* serve; observed manifests report what it *does* serve. Divergence is `ObservationStatus: Drifted` with an explicit `differences[]` list — driving purge contracts and shown honestly on status surfaces.
- **Gates must be able to fail.** Every health check and CI gate has a declared trigger, a declared evidence requirement, and a demonstrable failure mode — a checker that crashes green, or a validator that no-ops outside its artifact class and exits 0, is a finding, not a gate. Validators report how many checks *actually ran*.
- **The wallpaper rule applies to the UI.** Any surface that appears live must be derived from real state or declared as decoration — remedies in order: derive, declare, demote, sugar. Determinism is part of honesty: injected clocks, seeded randomness; an unseeded animation claiming to be a replay is a false claim.

## 11. Agents and AI participation

- **Read:** agents receive *semantic slices* — radius-bounded, access-filtered neighborhoods with provenance flags traveling with the slice — plus the `agent-json` projection surface and the compiled corpus (`llms.txt` / `llms-full.txt`). The read facade is safe by shape: there is nothing on it to call that mutates.
- **Write:** machine output enters as a **Candidate** and never self-promotes. Candidate → qualified → accepted crosses the same EQP evidence and promotion authority as human work. An agent's draft revision, suggested relation, or generated summary is `derived`/`declared-by-agent` provenance, visibly so.
- **Decide:** high-uncertainty editorial decisions (takedowns, disputed corrections, taxonomy changes) may convene a PDP panel — consensus discounted by shared provenance (agreement counts once per independent axis), invalidation conditions pre-committed and asymmetric to pressure, and the human owning the weights, the stakes, and the exit. A model that flips under pressure has produced information about the model, not about the decision.
- **For whom:** content classes may require an RCP recipient record — a named person, their need in their framing, an obligation with a date. Status is derived, never assigned: `active / delivered / lapsed / primitive`. A lapsed recipient is retained, never deleted.

## 12. Versioning, schema change, and compatibility

Five version axes move independently: content identity · content-type schema · theme/visual language · resolver/pipeline · wire protocol. **Equal version numbers imply nothing.** Cross-axis compatibility is a declared conformance record over six dimensions (`syntax, schema, behavior, semantics, authority, evidence`) — never inferred.

Schema changes are classed (documentation / additive / conformance-tightening / breaking-semantic / breaking-expression / deprecation), each with required review; deprecated semantic identities remain resolvable through a declared compatibility window; a breaking-semantic migration is a qualification event at radius R3+ with its own evidence.

### 12.1 Dependency doctrine (owner directive, 2026-08-28)

The system is built **in isolation**. Formal resources and capabilities — SES, SPS, ICP, EQP, IEPE, HCML, Fundamental Engine, rr-rsp, and any reference system later accepted — are consumed **as dependencies**: pinned by version and revision/digest in `FORMAL_RESOURCE_MANIFEST.json`, imported through declared bindings, never absorbed into this codebase.

- **Consumption mechanisms** (whichever fits the artifact): a package/crate dependency, a schema-pack import, or a mechanical sync from a pinned upstream revision. A synced copy is a cache of the pin, not a fork.
- **Upstream-first repair.** When a capability is needed, broken, or missing in a dependency, the change is made *in the owning project*, under that project's own authority and process; this project then re-pins the new revision. Local modification of consumed code or specs is prohibited.
- **Divergence is a deviation.** If temporary divergence is unavoidable, it is a typed, owner-authorized deviation record — bounded, visible, with the upstream fix landing as its reversal trigger — never a silent patch.
- **Re-pin is a compatibility event.** Equal version numbers imply nothing (§12); a re-pin therefore carries a declared compatibility statement and may trigger re-qualification at the appropriate radius.
- Worked example of the doctrine: SES currently ships no package manifest. If the implementation needs SES as an installable dependency, packaging is added upstream in `semantic-expression-system` and pulled — not vendored ad hoc here.

## 13. Reference implementation sketch (non-normative)

- **Store:** Postgres. Revision and receipt tables append-only *by grant* (no UPDATE/DELETE for the runtime role). Logical decoding feeds the notify phase.
- **Resolver:** one pure TypeScript library (no ambient time, no I/O) shared by server, edge, and client — the same cascade everywhere, held to golden conformance vectors (construct → canonicalize → hash → compare, with a negative vector proving the gate can fail).
- **Wire:** WebSocket lenses with SSE fallback; JSON envelopes; JCS canonicalization for hashing; Ed25519 attestation on promoted projections (verification keys distributed out-of-band — a key carried alongside untrusted content only authenticates the attacker to itself).
- **Editor:** CRDT (e.g. Yjs) strictly for invariance-`free` fields; `bounded`/`required` fields go through contract RPC. Presence over the observation channel with short expiries.
- **Edge:** projection versions in KV; edges report served-version manifests back as observations; drift drives purge contracts.
- **The project itself** bootstraps under formal-project-bootstrap v0.5.0: `PROJECT_INTENT.md`, `PROJECT_PROFILE.json`, pinned formal-resource manifest (the eight resources above, by revision digest), `records/*.jsonl`, compiled context, and CI gates that demonstrably fail.

## 14. Narrowest end-to-end path (first milestone, exit evidence not features)

1. Canon holding one content type (**Article**: title/media/body/meta slots) and one composition (**Home**: hero + rail sockets) as Schema records.
2. `content.revise@1` contract landing draft revisions with session receipts.
3. Two-editor live drafting: body text merges (free), block reorder validates (bounded), slug conflicts freeze publish (required) — R1 demonstrated.
4. Live qualification panel resolving the **note** profile's obligations as evidence runs — the incremental RequiredEvidence equation observable.
5. `content.promote@1` with confirm verification, producing a receipt and an attested projection version.
6. Reader page rendered from renderer-neutral output under **two themes**, passing the projection-equivalence vectors (identical semantics, radically different pixels).
7. Provenance chip cycling `snapshot → live → stale → live` under induced channel failure — R3 demonstrated.
8. Fingerprint invalidation: an edit to an entitlement-hidden field produces no invalidation on the public lens — cache-correctness and non-leakage in one test.
9. `llms.txt` corpus projection regenerating deterministically, diff-gated in CI.

Each step lands with evidence records; the milestone's exit is the evidence set, not the feature list.

## 15. Traceability

| Design element | Concept | Source |
|---|---|---|
| Envelope, provenance lattice, no-promotion rule | rr-rsp descriptor protocol | reflective-rust |
| Four identity classes; hash ≠ compatibility | runtime identity doctrine | reflective-rust |
| Append-only by grants; hash-chained ledger | custody in the database | PDP |
| Multi-axis state; no single status enum | multi-dimensional maturity | CALP exemplar / bootstrap |
| Slot/Block/Socket/Composition/Operation type system | semantic model | SES |
| Projection Contracts; typed invariance; equivalence without pixels | expression governance | SES |
| Pure 12-layer resolver; closed failure; field-level trace | resolution model | SES |
| Contract-gated writes; receipts; blocked ≠ error; executable recovery | interaction lifecycle | ICP |
| Qualification vs promotion; incremental RequiredEvidence; radius | evidence discipline | EQP |
| Consequence profiles as declared stopping condition | the formalist's correction | Formalism essay |
| Consistency states; conflict freezes consequence, not drafting | temporal consistency | HCML |
| Candidate never self-promotes; typed uncertainty retained | shared-state invariants | HCML / IEPE |
| Records as bodies; meaning→metric; supplied-only confidence/risk | semantic layers, metric provenance | Fundamental |
| Association ≠ coupling; no haunted feeds | dimensional coupling | Fundamental |
| Evidence-resolved morphology; no dashboard template | shelf resolver | SPS |
| Provenance chips; snapshot-first; cadence honesty | live-data contract | Fundamental |
| Hysteretic events; asymmetric degradation | event agent, quality governor | Fundamental |
| Frozen-snapshot derivation; fingerprint invalidation | staging model, dependency tracking | reflective-rust |
| Transformation ledger; non-collapsible absence vocabulary | Observatory | Fundamental |
| Discovery without text exposure; reader ≠ detail projections | publication boundaries | SPS |
| Gates that can fail; validator applicability | register findings | Gate & Protocol Register / NPS |
| Compiled agent corpus; digest validity; never hand-edited | context compilation | IEPE / bootstrap |
| Recipient contracts; derived status | RCP | Register |
| Five senses of time; declaration beats inference | temporal model | Fundamental |
| Causality ladder for analytics claims | causality and truth | Fundamental |

---

*This document is a `declared` record. Its rendered artifact is a `derived` projection of it. Contradictions are repaired here and re-projected — never by editing the projection.*
