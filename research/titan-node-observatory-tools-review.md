# SCMS-004 — Review: titan-node, titan-observatory, and Tools

**Status:** review complete; proposals P17–P28 await owner disposition
**Work item:** work/SCMS-004.md · board #5 · **Date:** 2026-08-28
**Method:** four bounded exploration passes (titan-node + observatory; Tools in three clusters: content/knowledge/editing, identity/graph/structure, agents/infra/analysis). Single pass; dispositions `observed`, not adversarially verified. One pass (titan-node) was re-run twice after session/API interruptions; the surviving reports are the evidence base.

**Source state (disclosed):** titan-node at `088dd4464766` with 18 dirty paths (notably: uncommitted broker coverage in `titan_preflight.sh`, an in-flight `docs/agent-consciousness/ → docs/concepts/` rename, untracked 577-line model gateway). titan-observatory is **not under version control**. Tools is ~40 independent projects, several of which are full upstream clones or empty stubs; per-project state noted inline.

---

## 1. What these are

**titan-node** is the bare-metal GPU host (3×TITAN X, `/ai` root) plus a shell-first control plane: a 434-line `titan.sh` dispatcher over sibling scripts, two canonical JSON registries (`runtime-registry.json`: 21 runtimes + 2 credential-holding brokers; `protocol-matrix.json` v1: smokes, bridge profiles, consumer smokes), preflight discipline, and 17 bridge profiles that render the fleet into consumer-shaped env contracts. Its authority pattern is explicitly three-tier: **running host > canonical files > prose** — "Deployed reality ≠ docs ≠ canonical source — they drift constantly. Trust the running host."

**titan-observatory** is a 197-line stdlib Python server + static UI that SSH-pulls a dashboard JSON from the host on a user-selectable 15/30/60s poll. Small, but it contains one genuinely novel layer: *editorial* metrics — named load bands with prose that says what **not** to conclude ("Utilization is below max because these jobs are relatively light, not because the node is failing").

**Tools** is a container of ~40 independent projects. The CMS-relevant core: **agent-control-plane** (the "ACP" now governing our tickets), **open-knowledge** (a GPL-3 clone of inkeep's CRDT knowledge base — a working implementation of roughly four of our planes), **imagetracer** and **graphify** (identity/hashing and knowledge-graph machinery), **text-diff-tool**, **markdown-native-editor**, **reference-detective**, **Context Mend** (mac-ui-lag-fixer's interaction contracts), **AntiRepoThreat** + **crx/vsix-inspector** (supply-chain gating), **stitch-skills** and **design.md** (capability packaging and lock formats). Several projects are not what their names suggest (`fingerprint` is posture scoring, `layoutmaterialization` is a deliberately "dumb" renderer, `project-graph`/`symbolic-classifier` are empty stubs).

---

## 2. Verdict summary

1. **ACP is the work-governance spine, and it's ours.** Apache-2.0, zero-dependency, already deployed (Railway `acp-gateway`, production). Its five-decision vocabulary, closed issue-packet schema, five-tier evidence ladder, approval provenance grades, and degraded/paused operating modes are ready to adopt as the Contracts-plane discipline for how work (and later, content operations) is governed. The gateway is the credential-isolation pattern: agents read Project state without ever holding a GitHub token, and failure returns a typed `DEGRADED` decision with capability lists, not an error.
2. **open-knowledge is a working preview of the CMS's collaboration core** — Y.Text-as-canon with derived views, an append-only shadow-git journal with a writer-ID taxonomy, three-way reconciliation with `refused` as a bounded outcome, layered-liveness agent presence, and warnings that ride success envelopes. GPL-3 forces a process boundary: pin the CLI, consume the MCP/HTTP surface as a service, never link.
3. **Identity discipline gets its missing refinements.** imagetracer's two-tier hash (structural vs contract identity), graphify's metadata-stripped semantic hashing and dual staleness axes, domain-separated hashes, quantize-before-hash — these upgrade DESIGN.md §3.3 from "canonical hash" to a real identity policy.
4. **The dependency doctrine gains its enforcement layer.** The survey found the doctrine's worked positive example (titan-node's `patches/` — diffs captured as receipts against upstream, no fork, debt recorded), its one clear violation (blender-mcp's permanent local fork "not intended for upstream PR"), its lock format already implemented (`design.md/skills-lock.json`: `{source, sourceType, computedHash}`), and its admission tooling (AntiRepoThreat's full-history scanning; crx-inspector's convergent-evidence scoring).
5. **Observation gets operational patterns born from paid-for bugs:** `private_expected` as a severity (correctly-refused ≠ failure), `next_action` on every finding, edge-triggered alerting against persisted state, reference-fingerprint drift detection, declared-kind vs deployed-artifact verification, and consumer-supplied qualification evidence.
6. **The cautionary tale is uniform across all three roots:** *a declaration format richer than the checker that consumes it silently becomes decoration.* titan-node's `smoke[]`/`failure_classes` are declared but never executed; its manifests forked the port map and drifted; wysiwig-editor's API spec doesn't compile; data-agent's README describes a system that doesn't exist. This review proposes making declaration-consumer parity a gate (P27).

---

## 3. Plane-by-plane findings

Classification: **[C]** confirms design · **[B]** better mechanism · **[N]** novel, applicable · (§5 covers dependency findings; §7 housekeeping).

### 3.1 Canon [C, B]

- **[B] Two-tier identity** (imagetracer `paths.py`): `geometry_hash` over the canonical rings only; `payload_hash` over the contract subset (name/version, dims, offsets, hints). "Did the content change" and "did the rendering agreement change" are different questions with different hashes — presentation churn stops invalidating content-keyed caches. Enforced by a code rule worth quoting: *"Never recompute rings from path_d. Never hash path_d"* — hash the source, never the projection, never round-trip.
- **[B] Semantic content hashing** (graphify `cache.py`): YAML frontmatter stripped before hashing `.md` — setting `reviewed: true` must not invalidate every downstream rendering. Hashes are domain-separated (`\x00`) and bound to *relative* paths (portable across machines/CI).
- **[B] Two independent staleness axes** (graphify): per-file `ast_hash` (cheap derivation) and `semantic_hash` (expensive LLM derivation) invalidate independently, in namespaced caches. Without this, every trivial edit re-runs the costly work.
- **[N] Quantize before hashing** (fingerprint `bucket_value`): continuous metrics entering an identity are bucketed first, or hashes churn on measurement noise. Its sibling pattern — the UTC date folded into a presence HMAC key — is identity that **expires by construction**: wrong for Canon, exactly right for Observation-plane presence.
- **[B] Provenance in commit bodies** (open-knowledge shadow repo): `ok-actor:` / `ok-contributors:` / `ok-checkpoint-v1:` JSON trailers make every journal record self-describing with no registry join; a writer-ID taxonomy distinguishes `agent-*` / `principal-*` / `git-author-<digest>` / `file-system` / `git-upstream` at the ref level; `previous_paths` anchors rename chains so derived indices are rebuildable from the journal alone.
- **[N] A declared loss hierarchy per field**: malformed `summaries` drops just that field, keeping attribution, because "decorative loss is preferable to attribution loss." Canon should declare which fields are load-bearing.
- **[B] Evidence travels inside the hashed artifact** (imagetracer): coded `validations[]` (13 codes + a global invariant `bleed ≥ truth ≥ safe`) ship inside the content-addressed payload — qualification cannot desynchronize from content.

### 3.2 Contracts [C, B, N]

- **[B] ACP's authorization boundary**: a *closed* issue packet (`additionalProperties: false`; required `authorized_paths`, `exclusions`, `acceptance_criteria`, `evidence_requirements`, `definition_of_done`) + five typed decisions (`INVALID / BLOCKED / APPROVED / REJECTED / QUALIFIED`) + content-addressed decision IDs (`sha256({decision, policy_version, payload})[:20]` — replay-stable) + scope audit diffing changed files against the packet + a single `Controller` allowed to merge. "Silence, a repeated 'continue,' a green local test, or a browser session is not approval."
- **[N] Operating modes with degraded ≠ paused** (ACP): rate-limited/unavailable → `degraded` (inspect, prepare, queue — work continues without authority); unauthorized/not-found → `paused` ("require correction rather than waiting"). Plus `continuation`: a valid lease lets reversible work finish during an outage but forbids lease renewal and authority mutations — authority decays gracefully instead of cliff-edging. The mode machine reaches the HTTP boundary: gateway failures return `DEGRADED` with allow/block capability lists.
- **[N] `BLOCKED` is productive and resumable**: resolve only the named blocker, resubmit the *same packet*. Idempotent under interruption.
- **[B] Authority with expiry and reversal** (Context Mend): capability records expire ≤30 days; expired authority fails closed **and resumes previously suspended processes** — expiry has an *undo obligation*, not just a stop.
- **[N] Plan identity with an explicit exclusion list** (Context Mend): SHA-256 over canonical JSON where *time, randomness, unordered iteration, and display strings are named as excluded from identity*. Naming what does not contribute to identity is what makes a frozen plan re-verifiable.
- **[N] Per-tool-call interception** (copilot-mcp's `on_pre_tool_use → permissionDecision`): a governance decision point at every tool invocation — finer grain than per-packet admission; the hook shape, not the stub, is the takeaway.
- **[B] Cross-repo contract verification** (titan-node): the provider reads the *consumer's* committed contract (`runtime_contract.json`) and asserts it field-by-field — service names, paths, env keys, response fields. Contracts checked from both sides.

### 3.3 Qualification [C, B, N]

- **[B] The five-tier evidence ladder** (ACP): `Documented ≠ Implemented ≠ Tested ≠ Deployed ≠ Browser-verified`, "no lower tier may satisfy a higher-tier requirement" — extends our four-tier ladder with the deployment/delivery distinction the CMS needs.
- **[N] Approval provenance grades** (ACP): `self-approved` vs `independent-approved`, with an explicit prohibition on representing one as the other. Our design treats "human approved" as a boolean; it is not.
- **[N] `private_expected` as a severity** (titan-node): a 401 from an unauthenticated probe against a gated surface is *correctly refused* — positive evidence, neither pass nor fail. Every finding also carries `next_action` — machine-readable remediation in the record schema.
- **[N] Consumer-supplied qualification evidence** (titan-node `consumer_smokes`): the provider's gate runs the *dependent's* test suite in the dependent's checkout. Publish-readiness attested by consumers, not self-attested.
- **[B] Quote-anchored evidence with calibration** (reference-detective): `EvidenceSignal{quote, signalId (closed vocabulary), pointsTo[], rationale, weightHint}`; inference results carry `taxonomyVersion` (find stale inferences when the vocabulary moves), `otherProbabilityMass` (reserved mass for unmodeled hypotheses), `entropy`/`isUniformish` (a self-reported "I don't know"), and `CONTRADICTION_PAIRS` (mutual-exclusion constraints as a model-free hallucination detector). Sanitization *counts* what it dropped (`SanitizeReport{droppedSignals, invalidPointsTo}`).
- **[B] Provenance-typed confidence** (graphify): `EXTRACTED / INFERRED / AMBIGUOUS` — answering *how do we know*, which is what a gate needs; low-provenance edges held to stricter structural bars. The anti-pattern is documented next door: fingerprint's `0.4 + n×0.08` measures input completeness and calls it confidence.
- **[N] Gold-standard exemplars in CI** (stitch-skills): a capability ships a canonical output and CI proves the validator still accepts it on every push.
- **[N] The claim register** (Context Mend): every claim the *system makes about itself* listed with current admissible status and the evidence that would strengthen it ("Cleanup reduces lag: **Not established**"). Qualification for self-description, beside our content gates.

### 3.4 Projection [C, B]

- **[B] Round-trip fidelity as a tested contract** (markdown-native-editor): `serialize(parse(markdown)) === markdown` with corpus goldens, a benchmark gate, a release gate, and a declared stable/in-progress support matrix — "no silent data loss for supported syntax." The cleanest statement of projection fidelity: a rendering is legitimate only if it inverts. Its 237-line MIT `markdown-core.ts` is the liftable artifact.
- **[B] Y.Text-is-truth** (open-knowledge): raw user bytes are canon; the rendered fragment is derived; writes update both atomically in one transaction with paired-origin short-circuiting. The dynamic twin of the static round-trip invariant.
- **[C] The decision-free renderer** (layoutmaterialization): "This service is a dumb renderer. It makes NO geometric decisions" — our projection-purity contract, independently derived, worth writing into the resolver spec verbatim.
- **[B] Compiled context with freshness as an admission gate** (ACP `.llms/`): per-file SHA-256 manifest + `policy_version`; a stale corpus is a hard `BLOCKED` at admission. Fuses our compiled-context projection with Observation freshness.
- **[N] Authoring forms that auto-promote** (open-knowledge `palette`): markdown-native forms promote to themed canonical components at parse time; embeds render in sandboxed null-origin iframes — network reachable, knowledge base unreachable.
- **[N] Preserve-lists on destructive projection** (titan-node sync): `rsync --delete` with host-owned secrets excluded — a rendering that mirrors aggressively while protecting locally-owned facts.

### 3.5 Field [C — design still leads; N additions]

- **[N] Continuous semantic axes with declared incompleteness** (reference-detective `StyleSignature` + sparse-touched softmax): six normalized 0–1 axes per document; posterior never sums to 1.0 over the closed vocabulary — the residual is the honest part.
- **[N] Interpretation attached to metrics** (titan-observatory): named bands plus prose stating what *not* to conclude — a Field metric shipped with its own misreading guard. Pair with predicted-vs-actual budget deltas (token-optimizer's `calculate_accuracy_metrics`) as a first-class calibration metric.
- **[N] Similarity guards** (graphify): entropy gates before dedup; `_is_variant_pair` protections (Jaro-Winkler's prefix bonus will merge `v2` into `v2-final`); stable community IDs from unstable clustering (ordered by size — diffable across runs).

### 3.6 Observation [C, B, N]

- **[N] Edge-triggered observation** (titan-node `preflight_check.py`): notify only on `OK→FAIL` / `FAIL→OK` transitions against persisted state — a drift *event log*, not a poll log; standing outages don't spam.
- **[N] Reference-fingerprint drift**: designate one artifact as the reference, compare `sha256[:8]` of everything else against it — fleet-wide consistency without centralizing the value.
- **[N] Declared-kind vs deployed-artifact verification**: `ExecStart` must contain `target/release` when `kind=rust` — born from a real clobber incident. The projection analogue: does the rendered artifact match its declared renderer?
- **[B] Five observation states with a no-fabrication rule** (Context Mend): `measured / disabled / unavailable / unsupported / stale` — three different silences most systems collapse into one null — and "no non-measured state may be converted to zero, 'Normal,' or another plausible value."
- **[B] Layered liveness with a stated primary** (open-knowledge presence): WS-close authoritative; 5s client TTL and 20s server eviction named as belt-and-suspenders. `'writing'` ≠ `'editing'` — presence vocabulary distinguishes actor kinds. `currentDoc: null` means "not working" — presence means doing work now.
- **[B] Absence encodings** (open-knowledge): `brokenLinks: []` is a positive assertion ("every link verified"); `warnings: undefined` is absence of evidence; an errored conflict list *refuses* to return `{list: []}` because that is byte-identical to "no conflicts." Two epistemic states, two encodings, enforced.
- **[N] The negative example** (titan-observatory): real provenance (`generated_at`) but **no staleness disclosure and failure that doesn't propagate** — a dead SSH path renders identically to a healthy idle fleet while sparklines silently stop advancing. Precisely the R3 failure our provenance chips exist to prevent; cite it in the chip spec.

### 3.7 The realtime obligations

- **R1:** text-diff-tool's `generateMergedText(changes, Map<hunk, accept|reject|keep>)` — **merge as a pure function of an explicit, serializable decision map**, attachable to a Canon record as the merge's justification and replayable to reproduce it. open-knowledge adds: `ReconcileOutcome` includes `refused` (both for semantic reasons and a stated resource bound, `MAX_LCS_CELLS`); conflict `shape` (`both-modified / delete-modify / modify-delete`) selects the legal strategies; `ours` is the live document the human sees, not disk. wysiwig-editor's Socket.IO layer (debounced full-content last-write-wins, no CRDT) is the named negative example.
- **R2:** open-knowledge's derived-view invalidation (100ms debounce, typed channels) and CC1 versioned stateless broadcasts (channels structurally separate from awareness state) confirm the lens/notify design at editor scale.
- **R3:** **warnings on success envelopes** — open-knowledge's `content-divergence` rides a 200: the write landed *and* diverged, converged bytes inline under a 50KB cap so the agent recovers without a second read; `disk-edit-reconciled` says "an out-of-band edit was folded in before yours; re-read." The honesty channel is grouped **by remedy, not severity**. Our Contracts plane needs the "accepted with disclosed anomaly" outcome class.

---

## 4. Dependency-doctrine findings (the consumability ledger)

**The lock format exists:** `Tools/design.md/skills-lock.json` pins capabilities as `{source, sourceType, computedHash}` — content-hash-pinned references with an upstream source of record. The root `Tools/skills-lock.json` is the empty version of the same mechanism. **Adopt this shape for scms pins.**

**Pin now** (license + manifest + maturity all clear):
- `agent-control-plane` 0.1.0 — Apache-2.0, zero-dep, `pip install -e .`, stable JSON + exit-code contract (0/1/78). Adopt schemas/vocabulary immediately; contribute live adapters upstream.
- `graphifyy` 0.8.37 — MIT, PyPI, CI. Pin from PyPI and delete the 36k-file vendored copy ("a fork in all but name").
- `@mlc-ai/web-llm` — Apache-2.0 from npm at a pinned version, never from the local clone.
- `stitch-skills` — Apache-2.0, git-ref + sparse-path pinnable; regardless of use, copy its packaging model (marketplace policy + plugin manifests + gold-standard CI).

**Pin across a process boundary only:**
- `open-knowledge` — **GPL-3.0-or-later**; only the CLI is published. Run it as a service (MCP stdio/HTTP + REST routes); never link or vendor; upstream repairs to `inkeep/open-knowledge`. Counsel review before shipping.

**Pin after upstream repair** (each repair is itself doctrine-conformant work):
- `text-diff-tool` — MIT-intended but the LICENSE file is missing; unbounded LCS needs imagetracer/open-knowledge's resource bound; dual lockfiles; unpublished.
- `imagetracer` — highest conceptual value, blocked on a license contradiction (manifest says Unlicense/public-domain with a third-party author; HEAD commit says proprietary; no LICENSE file). Resolve provenance first.
- `markdown-native-editor` — split `markdown-core.ts` into its own MIT package with the round-trip corpus tests, publish, then pin.
- titan-node — consume the **JSON interfaces** (registries, `--json` outputs, the finding schema) as the dependency and treat the shell as private implementation; needs a `version` field on `runtime-registry.json`, relativized `cwd` paths, and the secret moved to host-resolution.

**Inform only** (reimplement the ideas; do not depend): Context Mend's interaction contracts (the survey's highest-value document — unlicensed, no remote), reference-detective's evidence/calibration model, AntiRepoThreat's techniques, crx/vsix-inspector's convergent-evidence framing, productionfeasibility's typed-finding triad, har's structure-preserving redaction, seekscan's status-enum + append-only versions, dossiers' report skeleton (and its Dolt dossier — the nearest prior art to Canon+Contracts), progress-rings' `RingStatus` vocabulary, copilot-mcp's hook shape, self-similar-stamp's errata-derived confidence.

**Doctrine violations and exceptions found:**
- **Violation:** `blender-mcp` — a permanent local fork explicitly "not intended for upstream PR." Remedy: refactor the (additive) semantic layer into a downstream package depending on pinned upstream `blender-mcp>=1.8.7`.
- **Worked positive example:** titan-node `patches/record-runtime-nodes.patch` — the change deployed live, the diff captured *as a receipt against upstream*, the debt recorded, no vendored source. Missing piece: enforcement — the debt is a prose TODO. P28 proposes the ratchet.
- **Hygiene:** full unmodified clones of `rust-lang/rust` (59k files) and `web-llm` inside Tools; ~284MB of `.vsix` artifacts in markdown-native-editor; committed venvs elsewhere. Replace clones with pins.

---

## 5. Proposed amendments P17–P28 (for owner disposition — not applied)

- **P17. Dependency admission gate.** Extend the SCMS-003 doctrine with enforcement: every pin passes a supply-chain admission check (full-history scan incl. deleted content, base64/whitespace-evasion detection, lifecycle-hook triggers, exact-or-subdomain allowlist matching); pins recorded as `{source, sourceType, computedHash}` (the skills-lock shape); risk scored by convergent evidence ("a fingerprint match is a pointer, not a verdict"). [AntiRepoThreat, crx-inspector, design.md]
- **P18. Adopt ACP as the work-governance spine.** Pin `agent-control-plane@0.1.0`; adopt the five-decision vocabulary, closed issue packets, the five-tier evidence ladder, approval provenance grades, corpus-freshness-as-admission-blocker, and `Gate`/`Evidence State` as board fields; route CMS work through the Railway gateway's credential-isolation boundary. [ACP]
- **P19. Claim register + controlled vocabulary with prohibited substitutions.** A register of the system's claims about itself (status + strengthening evidence); plane vocabulary defined with forbidden synonyms (greppable); five observation states with the no-fabrication rule; plan/decision identity with explicit exclusion lists. [Context Mend]
- **P20. Two-tier identity hashing.** Split structural identity from contract identity; domain-separate all hashes; bind to relative paths; strip presentation metadata from content identity; quantize continuous inputs; run cheap and expensive derivation staleness on independent axes. [imagetracer, graphify, fingerprint]
- **P21. Evidence upgrades.** Provenance-typed confidence (`EXTRACTED/INFERRED/AMBIGUOUS`); evidence codes inside the hashed artifact; quote-anchored signals with closed vocabularies; `taxonomyVersion` on every inference; `otherProbabilityMass` + entropy self-reports; contradiction pairs as hallucination tripwires; sanitize-and-count-losses for machine output. [graphify, imagetracer, reference-detective]
- **P22. Merge as a decision map** (extends P7): serializable per-hunk `accept/reject/keep` maps as the justification artifact for merges; `refused` as a bounded reconcile outcome; conflict shapes selecting legal strategies; reconcile against the live view, not disk. [text-diff-tool, open-knowledge]
- **P23. Warnings on success.** An "accepted with disclosed anomaly" outcome class; honesty channels grouped by remedy; `[]`-as-positive-assertion vs absence-of-evidence encodings; per-element parse tolerance with counted losses; a declared per-field loss hierarchy. [open-knowledge, reference-detective]
- **P24. Round-trip fidelity as a tested contract.** `serialize(parse(x)) === x` with corpus goldens and a declared support matrix for every projection that claims editability; publish `markdown-core` upstream and pin it as the first instance. [markdown-native-editor]
- **P25. Consume open-knowledge as a service** for the collaboration core preview (CRDT co-authoring, journal provenance, presence), across a process boundary (GPL); adopt its writer-ID taxonomy and layered-liveness contract natively where we build our own. [open-knowledge]
- **P26. Observation operational patterns.** `private_expected` severity + `next_action` in the finding schema; edge-triggered alerting; reference-fingerprint drift; declared-kind vs deployed-artifact checks; consumer-supplied qualification evidence; metrics shipped with misreading guards; incident-derived rule lists ("the bugs we already paid for") as policy provenance. [titan-node, titan-observatory]
- **P27. Declaration-consumer parity gate.** Every declared schema field must have an executing consumer or be flagged `inert` — "a declaration format richer than the checker that consumes it silently becomes decoration." (The schema-level twin of IV's operational-promise register, P15.) [titan-node's inert `smoke[]`/`failure_classes`, drifted manifests]
- **P28. Upstream-debt ratchet.** Formalize patches-as-receipts: a `pending_upstream_patches[]` registry with aging warnings→errors; refactor blender-mcp's fork into a downstream package; replace vendored upstream clones with pins. [titan-node, blender-mcp]

## 6. Portfolio housekeeping (owner attention, outside CMS scope)

1. **Committed shared secret:** `COORDINATOR_JWT_SECRET=local-coordinator-secret-2026` is hardcoded in 8 bridge profiles and both titan-node manifests — contradicting `runtime_ops.sh`'s own "never bake it into the repo" doctrine (which resolves from host env correctly). Rotate on-host and strip from the repo.
2. **AntiRepoThreat reports contain personal data** (named individuals, addresses, DOBs from a threat campaign) — keep out of any vendored/public location.
3. **titan-observatory is not under version control**, and the always-on `preflight_check.py` timer lacks the (uncommitted) broker coverage — the credential-holding components are the unwatched ones.
4. **imagetracer's license contradiction** (public-domain manifest vs proprietary rebrand commit) blocks its own reuse.
5. Inert declarations and drifted duplicates in titan-node (manifest port-map fork, dead `install_runtime_services.sh`, `.new` files older than their originals, runtime counts disagreeing three ways) — the P27 gate applied to titan-node itself would catch all of these.

### 6.1 Addendum — post-review remediation (2026-08-28, later the same day)

A separate fix session closed the **shell-injection exposure in titan-observatory's log endpoint**. Verified against the working tree: `remote_log_tail` now applies `shlex.quote()` to both the remote root and the log path and clamps the line count (`max(10, min(lines, 400))`) before embedding them in the SSH command — layered *on top of* the pre-existing `validate_log_path` allowlist (flat file under `results/titan_logs/`, conservative charset, no `..`/`-`/`.` prefixes). Two independent defenses now stand where the review observed one.

Housekeeping item 3 **stands, sharpened**: titan-observatory remains outside version control, so this security fix itself exists only as unversioned working-tree state — one errant `rm` or disk fault reverts it silently, and no record proves when it landed. Recommended follow-up (upstream, per the doctrine): `git init` + initial commit in titan-observatory, capturing the fix as its first recorded revision.

## 7. Maturity caveats

ACP is "a tested operational MVP" by its own accounting — production-grade contracts, a thin reference runtime (628 lines), with the Railway gateway as the one battle-complete component. open-knowledge is mature upstream OSS, but our copy is an unversioned clone standing ahead of its published packages. titan-node's observation machinery is battle-derived while its declaration machinery has outrun enforcement (its own README says so). Roughly half the Tools projects have no license and several are stubs or scaffolds; per-tool verdicts in §4 are the operative guidance. This review is a single `observed` pass.

## 8. Review traceability

Synthesized from four bounded exploration passes executed 2026-08-28 against the local working trees: (1) Tools structure cluster; (2) Tools agents cluster; (3) Tools content cluster; (4) titan-node + titan-observatory (re-run after two interruptions; the completed pass is the evidence base). File references are to the reviewed trees at their 2026-08-28 state. Prior review: research/titan-infinite-verse-review.md (P1–P16).
