# Recommended dispositions — the 25 open proposals (SCMS-039)

**Status: recommendations only. Nothing here is ratified, and I will not ratify it.**
Accepting a proposal changes what this system claims to be, which is owner authority (§12.1).
What this document does is remove the cold-read problem: each proposal below carries a
recommendation, the reasoning, and — where it exists — **evidence this project has since produced
that bears on it**. Several of these are no longer open questions; they are questions we have
accidentally answered by failing.

Dispositioned already: **P7 deferred**, **P10 accepted**, **P22 accepted** (2026-08-28).

Recommendation vocabulary: **Accept** · **Accept, narrowed** · **Accept, scheduled later** ·
**Defer** · **Decline as stated**.

---

## Tier 1 — Accept. Our own failures are the argument.

### P27. Declaration–consumer parity gate — **Accept, and make it a CI gate**
> *"A declaration format richer than the checker that consumes it silently becomes decoration."*

This project has now committed that exact failure **four times**, and each one was found by
accident rather than by a gate:

| Instance | The declaration | The missing consumer |
|---|---|---|
| SCMS-020 | `promote` declared a compensation interaction | `content.unpublish` did not exist |
| SCMS-022 | A declared content type | Nothing validated against it in the write path |
| NR-scms-004 | `attrs.unlisted`, documented as "so discovery lenses can exclude it" | No lens consumed it; both unlisted entries went into the public index |
| SCMS-044 | `editorRequest` in `impl/authoring`, built for the editor | The editor read Canon directly and never called it |

P27 is the only proposal on this list with a four-instance empirical case, made by the system that
wrote it down. Recommend accepting it **as an executable gate**, not as doctrine — doctrine is what
we already had. Concretely: every declared field in `schemas/` must be referenced by non-test
source, or carry an explicit `inert: true` with a reason. Same shape as
`check-canon-write-boundary.py`, and it must ship with a self-test proving it can fail.

### P23. Warnings on success — **Accept**
An "accepted with disclosed anomaly" outcome class. We built one without naming it: `governedImport`
returns `publicationNotCarried`, which is precisely a success that must disclose what it could not
carry — 61 records arrived unpublished tonight and the server prints it. ICP's outcome vocabulary
has no slot for that, so it lives in a bespoke report field. Accepting P23 would give it a home and
make the pattern reusable rather than incidental.

### P15. Prose gates — **Accept (mostly already built; finish it)**
The claim register exists in `SPEC_HEALTH.md` and `check-projection-sync.py` runs in CI. What is
missing is the **operational-promise register** and the **deviation register with auto-escalation**.
Cheap to finish, and the claim register has already proved its worth: it is where NR-scms-005's
false "refuses unauthorised candidates" claim was caught and corrected in place.

### P8. `changeCertainty` + `receiptSurrogate` on Contracts — **Accept**
Asserted / derived / indeterminate on every outcome, with `indeterminate` binding retry to the
original idempotency key. This matters more now that a transport exists: a client that reconnects
mid-write cannot currently distinguish "the write did not happen" from "the write happened and the
acknowledgement was lost." Today every outcome is implicitly *asserted*, which is a claim we cannot
always support. This is the same class as NR-scms-010 — asserting a certainty we had not
established.

---

## Tier 2 — Accept, narrowed.

### P3. Harden qualification verdicts — **Accept the four-column verdict and the vacuous-pass gate; defer the rest**
Directly bears on **SH-13**, the open self-attestation hole. The valuable half is: `could-not-run`
and `not-run` must block promotion exactly as failure does, `BLOCKED` must never collapse, and every
evaluator must carry a self-test proving it can fail. We already apply that last rule to the CI
gates; extending it to evaluators is consistent and cheap. "Qualify the served artifact" is the
expensive half and should wait until there is a served artifact worth qualifying.

### P11. Extend Observation — **Accept the freshness and absence parts; defer presence×transport**
Two-clock freshness with tracked skew is half-built already (SCMS-035 derives freshness from
delivery, but there is no skew tracking and no second clock). `absent_reason` codes with
off-ladder-sorts-last is a real gap: our surfaces distinguish `unknown` from `withheld` from
`ineligible` internally, and no expression renders that distinction. Presence×transport axes need a
real connection first — there is no socket yet.

### P1. Admission plane — **Accept, scheduled at E9, not now**
SH-9 already records why: owner-authored content needs no admission gate, because it lands as
`declared` provenance under `project.owner` authority. Admission becomes *required* the moment
third-party content arrives, which is the friends site (E9). Accepting it now would build a plane
with nothing to admit; accepting it at E9 is forced. Recommend accepting the **principle** now and
binding the work item to E9.

### P2. Entitlement as a cross-plane model — **Accept 404-not-403 (already true); defer the rest**
We already return `subject-not-found` for both absent and inaccessible, at the resolver and in the
editor and site — distinguishing them tells an unauthorized caller the subject exists. The
section-level `open`/`entitled` classes need entitled content to exist, and none does.

### P4. `computed_from` + declared refresh policy — **Accept, with the caveat already recorded**
Staleness as a queryable join beside fingerprint invalidation is right, and `projection-cache`
would take it cleanly. The recorded caveat stands: its source (IV doc 19) is **unratified upstream**
and marks its own hooks "recommendations only," so this is a design adoption on our authority, not
an inherited contract.

### P24. Round-trip fidelity as a tested contract — **Accept the contract; decline the packaging**
`serialize(parse(x)) === x` with corpus goldens for any projection claiming editability is exactly
right, and we now have a corpus to test it against — the editor round-trips 215 real bodies. Decline
"publish `markdown-core` upstream and pin it as the first instance" as premature: that names a
solution before we have measured the problem, and our editor currently does no markdown parsing at
all.

---

## Tier 3 — Defer, with the condition that would change the answer.

### P12. Delivery-time citation gate — **Defer until generated content exists**
The system generates nothing today. The one piece of model output in the corpus (the Semantic
Article Field) is carried as a separate `derived` envelope and never merged. Revisit when the CMS
itself generates prose.

### P13. Deepen the Field plane — **Defer**
SH-7 records that the Field plane is the least concrete despite being "ours." Deepening the
evidence governance of a plane with no implementation would be specifying ahead of building, which
§16 declares the stopping condition against. Build a thin Field slice first, then revisit.

### P18. Adopt ACP as the work-governance spine — **Defer**
The five-decision vocabulary and evidence ladder are already in use informally through
`records/*.jsonl` and the claim register, and that machinery is working — it caught four negative
results this week. Adopting ACP wholesale is a large dependency for a benefit we are currently
getting. Revisit if the records approach breaks down at multi-project scale (E9–E11).

### P20. Two-tier identity hashing — **Defer**
Domain separation is already done (`scms:receipt:v1`, `scms:change-receipt:v1`, and the fingerprint
domain). Splitting structural from contract identity is speculative until something needs to
compare across schema versions.

### P25. Consume open-knowledge as a service — **Defer, blocked on counsel**
SH-11 stands: GPL-3, process-boundary isolation believed sufficient, **not reviewed by counsel**.
Do not pin, do not link, do not vendor before that review. The writer-ID taxonomy and layered
liveness contract are worth reading and reimplementing natively regardless.

### P17. Dependency admission gate — **Defer the scanner; accept the lock shape now**
`{source, sourceType, computedHash}` is a cheap, immediate improvement and should be adopted for
pins. The full supply-chain scanner (history scan, evasion detection, lifecycle-hook triggers) is a
substantial build; defer until a pin comes from outside the owner's own repositories.

---

## Tier 4 — Decline as stated.

### P16. Record the Titan "plane" vocabulary collision — **Decline as an amendment; record as an alignment entry**
This is a real observation but not a design amendment — nothing in DESIGN.md changes. It belongs in
`records/alignment.jsonl` as a noted divergence, which costs nothing and keeps DESIGN.md from
accumulating entries that amend nothing.

### P6. Extend custody declarations — **Decline the "constitutional CI" half; accept *must never become***
Adding `must never become` + `forbidden_reads/writes/calls` per plane component is good and we
partially have it (the write-boundary gate is exactly a forbidden-write check). "Doctrine-as-greps"
as a general mechanism is where I would push back: a grep-based rule is a check that looks like
enforcement and is trivially evaded by renaming. Our two grep-shaped gates work because they guard
narrow, well-named APIs; generalising the technique would produce gates that certify nothing. Accept
the declarations, decline the generalised mechanism.

### P26. Observation operational patterns — **Decline as a bundle; accept two of the seven**
`private_expected` severity + `next_action` in the finding schema is genuinely good and cheap —
our findings already carry a `code` and a `detail` but no remedy, which makes them descriptions
rather than instructions. Edge-triggered alerting is already in §8.7. The remaining five
(reference-fingerprint drift, declared-kind vs deployed-artifact, consumer-supplied qualification
evidence, misreading guards, incident-derived rule lists) are operational patterns for a deployed
fleet; we have no deployment. Accepting them now would be adopting answers to questions we have not
yet asked.

---

## P5, P9, P14, P19, P21, P28 — brief

- **P5. Two-tier materiality** — *Accept.* Machine attachments non-material, human promotion mints
  revisions. This is already how the derived Semantic Article Field behaves; naming it makes it a
  rule instead of a coincidence.
- **P9. Rendered-set-bounded destructive operations** — *Accept.* Authorising a delete only against
  what the actor was shown is a genuine safety property and composes exactly with `ResolvedSurface`
  membership, which we now have everywhere. Cheap given the surface pipeline.
- **P14. Identity discipline** — *Accept, narrowed.* "Nothing detector-derived is identity-stable"
  and "hash-input selection documented per identity" are right and cheap. The mint ledger is a build
  with no current need.
- **P19. Claim register + prohibited substitutions** — *Accept.* The register exists; the greppable
  forbidden-synonym list does not, and it is cheap. Note the honest limit: this is a grep, so it
  catches drift, not disguise.
- **P21. Evidence upgrades** — *Accept, narrowed.* Provenance-typed confidence
  (`EXTRACTED/INFERRED/AMBIGUOUS`) and `taxonomyVersion` on every inference are directly applicable
  to the migration's findings and the derived field. `otherProbabilityMass` and entropy self-reports
  presuppose a probabilistic evaluator we do not have.
- **P28. Upstream-debt ratchet** — *Accept (already partly landed).* The owner's own correction on
  2026-08-28 fixed the wording so a deployed local patch requires a live deviation, not merely a
  recorded debt. What remains is the aging warnings→errors registry.

---

## If you want to act on only three

1. **P27** as a CI gate — the four-instance case is ours, and the fifth instance is a matter of time.
2. **P8** — a transport now exists, so "the write happened but the ack was lost" is reachable today.
3. **P3's vacuous-pass gate** — it is the cheapest thing that bears on SH-13, the open hole where an
   owner can self-certify a publish.
