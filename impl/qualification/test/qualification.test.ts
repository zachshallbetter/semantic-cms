/**
 * SCMS-013 vectors: qualification disposition, the coverage-gap vs finding
 * distinction, the RequiredEvidence equation by radius, and promotion refusing
 * every way it must before it acts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { CanonJournal } from "../../canon/src/journal.ts";
import type { Envelope, RecordState } from "../../canon/src/envelope.ts";
import { ContractRegistry, CONTENT_REVISE, reviseHandler } from "../../contracts/src/runtime.ts";
import { NOTE_PROFILE, ARTICLE_PROFILE, COMMITMENT_PROFILE, PROFILES } from "../src/eqp.ts";
import type { EvidenceRecord } from "../src/eqp.ts";
import { qualify, requiredEvidence, applyException } from "../src/qualify.ts";
import { CONTENT_PROMOTE, promoteHandler } from "../src/promote.ts";
import { RECORD_EVIDENCE, recordEvidenceHandler, ATTEST, attestHandler, attestationFor, evidenceFor } from "../src/canon-evidence.ts";

const STATE: RecordState = {
  semanticMaturity: "complete", evidenceState: "unqualified",
  publicationState: "unpublished", deliveryState: "unpropagated",
};

function note(id: string): Envelope {
  return {
    schemaVersion: "scms-0.1", subjectId: id,
    compatibility: { protocol: "scms-0.1", subjectSchema: "note@1" },
    provenance: { kind: "declared", authority: "project.owner", source: "test" },
    minimumAccess: "public", body: { kind: "Content", contentKind: "note", title: "n" }, state: STATE,
  };
}

function ev(obligation: string, rev: string, over: Partial<EvidenceRecord> = {}): EvidenceRecord {
  return {
    id: `ev_${obligation}`, obligation, result: "PASS", validity: "VALID",
    candidateRevision: rev, actor: "checker", independentEvaluator: true, ...over,
  };
}

function setup() {
  const journal = new CanonJournal();
  const seed = journal.append(note("note-1"), "tester");
  const registry = new ContractRegistry();
  registry.register(CONTENT_REVISE, reviseHandler);
  registry.register(CONTENT_PROMOTE, promoteHandler);
  registry.register(RECORD_EVIDENCE, recordEvidenceHandler);
  registry.register(ATTEST, attestHandler);
  return { journal, registry, rev: seed.envelope.revision! };
}

// Authority is the CALLER's, proven by whatever authenticated the request —
// never read from input (NR-scms-005).
const ctx = { occurredAt: "2026-08-28T12:00:00Z", instanceId: "int_p1", authority: "owner" as const };

/**
 * Land evidence and attest through contracts — the only way an attestation can
 * exist now that promotion reads it from Canon rather than accepting it from
 * input (SCMS-036). Every promotion vector below runs through this, so each one
 * exercises the real qualification path instead of a handed-in verdict.
 *
 * The pure `qualify()` unit tests above deliberately keep calling the function
 * directly: they are testing the evaluator, not the write path.
 */
/**
 * Evidence and attestations now share the journal with content, so positional
 * lookups like `current()[0]` no longer mean "the note". Ask for the subject.
 */
const noteIn = (journal: CanonJournal) =>
  journal.current().find((e) => e.envelope.subjectId === "note-1")!;
const noteHistory = (journal: CanonJournal) =>
  journal.all().filter((e) => e.envelope.subjectId === "note-1");

let attestSeq = 0;
function attestVia(
  journal: CanonJournal, registry: ContractRegistry,
  candidateRevision: string, profileId: "note" | "article" | "commitment",
  evidence: EvidenceRecord[],
) {
  for (const e of evidence) {
    registry.execute(journal, {
      contract: "icp:interaction/qualification.record-evidence@1.0.0",
      requestId: `ev-${attestSeq}`, actor: { id: "checker", role: "evaluator" },
      input: { evidence: e, observedAt: ctx.occurredAt, expiresAt: "2027-01-01T00:00:00Z" },
    } as never, { ...ctx, instanceId: `int_ev_${attestSeq++}` });
  }
  return registry.execute(journal, {
    contract: "icp:interaction/qualification.attest@1.0.0",
    requestId: `att-${attestSeq}`, actor: { id: "checker", role: "evaluator" },
    input: { candidateRevision, profileId, qualificationAuthority: "checker" },
  } as never, { ...ctx, instanceId: `int_att_${attestSeq++}` });
}
const promoteReq = (input: Record<string, unknown>) => ({
  contract: "icp:interaction/content.promote@1.0.0", requestId: "req_p1",
  actor: { id: "usr_1", role: "editor" }, input,
});

test("QUALIFIED requires every obligation satisfied by VALID PASS evidence", () => {
  const { rev } = setup();
  const att = qualify(rev, NOTE_PROFILE, [ev("ob/schema-valid", rev), ev("ob/access-declared", rev)], "checker", ctx.occurredAt);
  assert.equal(att.disposition, "QUALIFIED");
  assert.ok(att.outcomes.every((o) => o.satisfied));
  assert.equal(att.promotionAuthority, null, "qualification carries no promotion authority");
  assert.ok(att.limitations.length >= 2, "attestation states what it does not cover");
});

test("a coverage gap is BLOCKED, not NOT_QUALIFIED and never QUALIFIED", () => {
  const { rev } = setup();
  const missing = qualify(rev, NOTE_PROFILE, [ev("ob/schema-valid", rev)], "checker", ctx.occurredAt);
  assert.equal(missing.disposition, "BLOCKED");
  assert.notEqual(missing.disposition, "NOT_QUALIFIED");
  const gap = missing.outcomes.find((o) => o.obligation === "ob/access-declared")!;
  assert.equal(gap.result, "MISSING");
  assert.match(gap.reason, /coverage gap, not a finding/);

  const inconclusive = qualify(rev, NOTE_PROFILE,
    [ev("ob/schema-valid", rev), ev("ob/access-declared", rev, { result: "INCONCLUSIVE" })], "checker", ctx.occurredAt);
  assert.equal(inconclusive.disposition, "BLOCKED");
});

test("an evaluated failure is NOT_QUALIFIED — a finding about the candidate", () => {
  const { rev } = setup();
  const att = qualify(rev, NOTE_PROFILE,
    [ev("ob/schema-valid", rev), ev("ob/access-declared", rev, { result: "FAIL" })], "checker", ctx.occurredAt);
  assert.equal(att.disposition, "NOT_QUALIFIED");
});

test("STALE or SUPERSEDED evidence cannot qualify; exceptions cannot rewrite results", () => {
  const { rev } = setup();
  for (const validity of ["STALE", "SUPERSEDED", "INVALID", "OUT_OF_SCOPE", "UNVERIFIABLE"] as const) {
    const att = qualify(rev, NOTE_PROFILE,
      [ev("ob/schema-valid", rev), ev("ob/access-declared", rev, { validity })], "checker", ctx.occurredAt);
    assert.notEqual(att.disposition, "QUALIFIED", `${validity} must not qualify`);
  }
  assert.throws(applyException, /must not rewrite an evidence state to PASS/);
});

test("evidence from another revision does not qualify this candidate", () => {
  const { rev } = setup();
  const att = qualify(rev, NOTE_PROFILE,
    [ev("ob/schema-valid", rev), ev("ob/access-declared", "sha256:other")], "checker", ctx.occurredAt);
  assert.equal(att.disposition, "BLOCKED", "evidence is bound to one exact candidate");
});

test("qualification does not publish: publicationState is untouched", () => {
  const { journal, rev } = setup();
  qualify(rev, NOTE_PROFILE, [ev("ob/schema-valid", rev), ev("ob/access-declared", rev)], "checker", ctx.occurredAt);
  assert.equal(noteIn(journal).envelope.state.publicationState, "unpublished");
  assert.equal(journal.all().length, 1, "qualifying writes nothing to Canon");
});

test("RequiredEvidence: radius scopes re-qualification; alwaysReRun is the floor", () => {
  // R1 editorial change → only the always-re-run set plus R1-invalidated obligations.
  assert.deepEqual(requiredEvidence(NOTE_PROFILE, "R1"), ["ob/schema-valid"]);
  // R2 reaches access-declared.
  assert.deepEqual(requiredEvidence(NOTE_PROFILE, "R2"), ["ob/access-declared", "ob/schema-valid"]);
  // R3 on the commitment profile reaches the R3 obligations too.
  const r3 = requiredEvidence(COMMITMENT_PROFILE, "R3");
  assert.ok(r3.includes("ob/entitlement-declared") && r3.includes("ob/recipient-contract"));
  // A new claim pulls its obligation in regardless of radius.
  assert.ok(requiredEvidence(ARTICLE_PROFILE, "R1", ["claim/references-sound"]).includes("ob/links-resolve"));
  // The radius term is real: R1 !== R2 for the note profile.
  assert.notDeepEqual(requiredEvidence(NOTE_PROFILE, "R1"), requiredEvidence(NOTE_PROFILE, "R2"));
});

test("profiles declare their end — no gate creep", () => {
  assert.ok(NOTE_PROFILE.declaredEnd.length > 0);
  assert.equal(NOTE_PROFILE.obligations.length, 2, "a note is gated as a note");
  assert.ok(ARTICLE_PROFILE.obligations.length > NOTE_PROFILE.obligations.length);
  assert.ok(COMMITMENT_PROFILE.obligations.length > ARTICLE_PROFILE.obligations.length);
  assert.equal(Object.keys(PROFILES).length, 3);
});

test("promotion refuses a non-qualified candidate with executable recovery", () => {
  const { journal, registry, rev } = setup();
  attestVia(journal, registry, rev, "note", [ev("ob/schema-valid", rev)]);
  const r = registry.execute(journal, promoteReq({
    subjectId: "note-1", candidateRevision: rev, profile: NOTE_PROFILE,
    verificationPerformed: "reauthenticate", promotionAuthority: "project.owner",
  }), ctx);
  assert.equal(r.outcome, "needs_evidence");
  assert.equal(r.recovery[0].action, "replace_evidence");
  assert.match(r.recovery[0].data.missing, /ob\/access-declared/);
  assert.equal(noteIn(journal).envelope.state.publicationState, "unpublished");
});

test("promotion refuses without the verification its consequence class demands", () => {
  const { journal, registry, rev } = setup();
  attestVia(journal, registry, rev, "note", [ev("ob/schema-valid", rev), ev("ob/access-declared", rev)]);
  const r = registry.execute(journal, promoteReq({
    subjectId: "note-1", candidateRevision: rev, profile: NOTE_PROFILE,
    verificationPerformed: "confirm", promotionAuthority: "project.owner",
  }), ctx);
  assert.equal(r.outcome, "verification_required");
  assert.equal(r.verification, "reauthenticate");
  assert.equal(r.recovery[0].action, "reauthenticate");
  assert.equal(noteHistory(journal).length, 1, "refusal writes nothing to the record");
});

test("promotion refuses when no authority is named", () => {
  const { journal, registry, rev } = setup();
  attestVia(journal, registry, rev, "note", [ev("ob/schema-valid", rev), ev("ob/access-declared", rev)]);
  const r = registry.execute(journal, promoteReq({
    subjectId: "note-1", candidateRevision: rev, profile: NOTE_PROFILE,
    verificationPerformed: "reauthenticate",
  }), ctx);
  assert.equal(r.outcome, "blocked");
  assert.equal(r.recovery[0].action, "request_access");
});

test("a qualified, verified, authorised promotion moves only the publication axis", () => {
  const { journal, registry, rev } = setup();
  attestVia(journal, registry, rev, "note", [ev("ob/schema-valid", rev), ev("ob/access-declared", rev)]);
  const before = journal.get(rev)!.envelope.state;
  const r = registry.execute(journal, promoteReq({
    subjectId: "note-1", candidateRevision: rev, profile: NOTE_PROFILE,
    verificationPerformed: "reauthenticate", promotionAuthority: "project.owner",
  }), ctx);

  assert.equal(r.outcome, "completed");
  assert.equal(r.receipt!.changes.length, 1);
  assert.deepEqual(r.receipt!.changes[0], {
    path: "/state/publicationState", before: "unpublished", after: "promoted",
  });
  assert.equal(r.receipt!.reversibility, "compensatable");
  assert.equal(r.receipt!.compensationInteraction, "icp:interaction/content.unpublish");

  const after = noteIn(journal).envelope.state;
  assert.equal(after.publicationState, "promoted");
  assert.equal(after.semanticMaturity, before.semanticMaturity, "other axes untouched");
  assert.equal(after.evidenceState, before.evidenceState);
  assert.equal(after.deliveryState, before.deliveryState);
  assert.equal(journal.verifyChain().valid, true);
});

test("an attestation for one revision cannot be borrowed by another", () => {
  const { journal, registry, rev } = setup();
  attestVia(journal, registry, rev, "note", [ev("ob/schema-valid", rev), ev("ob/access-declared", rev)]);
  const r = registry.execute(journal, promoteReq({
    subjectId: "note-1", candidateRevision: "sha256:other", profile: NOTE_PROFILE,
    verificationPerformed: "reauthenticate", promotionAuthority: "project.owner",
  }), ctx);
  // Stronger than before. The attestation used to arrive in the request, so a
  // mismatched one had to be *detected* and the outcome was `conflict`. It is
  // now looked up in Canon BY the requested revision, so a borrowed attestation
  // cannot be presented at all — the request simply has none, and promotion
  // refuses for want of evidence. The mismatch became unrepresentable rather
  // than merely caught.
  assert.equal(r.outcome, "blocked");
  assert.match(r.detail ?? "", /requires a QUALIFIED attestation; got none/);
  assert.equal(noteIn(journal).envelope.state.publicationState, "unpublished");
});

// ---------------------------------------------------------------------------
// SCMS-020: content.unpublish@1 — making the declared compensation real.
// ---------------------------------------------------------------------------
import { CONTENT_UNPUBLISH, unpublishHandler } from "../src/unpublish.ts";

function promoted() {
  const { journal, registry, rev } = setup();
  registry.register(CONTENT_UNPUBLISH, unpublishHandler);
  attestVia(journal, registry, rev, "note", [ev("ob/schema-valid", rev), ev("ob/access-declared", rev)]);
  const r = registry.execute(journal, promoteReq({
    subjectId: "note-1", candidateRevision: rev, profile: NOTE_PROFILE,
    verificationPerformed: "reauthenticate", promotionAuthority: "project.owner",
  }), ctx);
  return { journal, registry, promotedRevision: r.receipt!.afterVersion, promoteReceipt: r.receipt! };
}

const unpublishReq = (input: Record<string, unknown>) => ({
  contract: "icp:interaction/content.unpublish@1.0.0", requestId: "req_u1",
  actor: { id: "usr_1", role: "editor" }, input,
});

test("promote's declared compensation now resolves in the registry", () => {
  const { registry, promoteReceipt } = promoted();
  const ids = registry.list().map((d) => `${d.id}`);
  assert.ok(ids.includes(promoteReceipt.compensationInteraction!),
    "the compensation named on every promotion receipt exists as a registered contract");
});

test("unpublish compensates forward: a new revision, nothing erased", () => {
  const { journal, registry, promotedRevision } = promoted();
  const before = journal.all().length;
  const r = registry.execute(journal, unpublishReq({
    subjectId: "note-1", promotedRevision, verificationPerformed: "confirm", authority: "project.owner",
  }), { ...ctx, instanceId: "int_u1" });

  assert.equal(r.outcome, "compensated");
  assert.ok(r.states.includes("compensating"));
  assert.equal(r.verification, "confirm", "E2 needs confirm, not promote's reauthenticate");
  assert.deepEqual(r.receipt!.changes, [{ path: "/state/publicationState", before: "promoted", after: "unpublished" }]);
  assert.equal(journal.all().length, before + 1, "compensation appends");
  assert.equal(journal.get(promotedRevision)!.envelope.state.publicationState, "promoted",
    "the promoted revision is retained as history, unedited");
  assert.equal(noteIn(journal).envelope.state.publicationState, "unpublished");
  assert.equal(journal.verifyChain().valid, true);
});

test("unpublish refuses a no-op, weak verification, and unnamed authority", () => {
  const { journal, registry, promotedRevision } = promoted();

  const weak = registry.execute(journal, unpublishReq({
    subjectId: "note-1", promotedRevision, verificationPerformed: "none", authority: "project.owner",
  }), { ...ctx, instanceId: "int_u2" });
  assert.equal(weak.outcome, "verification_required");

  const anon = registry.execute(journal, unpublishReq({
    subjectId: "note-1", promotedRevision, verificationPerformed: "confirm",
  }), { ...ctx, instanceId: "int_u3" });
  assert.equal(anon.outcome, "blocked");
  assert.equal(anon.recovery[0].action, "request_access");

  // Now actually unpublish, then try again: the second attempt is a refused
  // no-op, not a silent success.
  const done = registry.execute(journal, unpublishReq({
    subjectId: "note-1", promotedRevision, verificationPerformed: "confirm", authority: "project.owner",
  }), { ...ctx, instanceId: "int_u4" });
  assert.equal(done.outcome, "compensated");
  const again = registry.execute(journal, unpublishReq({
    subjectId: "note-1", promotedRevision, verificationPerformed: "confirm", authority: "project.owner",
  }), { ...ctx, instanceId: "int_u5" });
  assert.equal(again.outcome, "conflict", "the promoted revision was superseded by the compensation");
  assert.ok(again.recovery.length > 0);
});

test("round trip: promote → unpublish → promote, with all three landings in history", () => {
  const { journal, registry, promotedRevision } = promoted();
  const un = registry.execute(journal, unpublishReq({
    subjectId: "note-1", promotedRevision, verificationPerformed: "confirm", authority: "project.owner",
  }), { ...ctx, instanceId: "int_u6" });
  const backToDraft = un.receipt!.afterVersion;

  attestVia(journal, registry, backToDraft, "note", [ev("ob/schema-valid", backToDraft), ev("ob/access-declared", backToDraft)]);
  const re = registry.execute(journal, promoteReq({
    subjectId: "note-1", candidateRevision: backToDraft, profile: NOTE_PROFILE,
    verificationPerformed: "reauthenticate", promotionAuthority: "project.owner",
  }), { ...ctx, instanceId: "int_u7" });

  assert.equal(re.outcome, "completed");
  assert.equal(noteIn(journal).envelope.state.publicationState, "promoted");
  // Four landings: seed, promote, unpublish, re-promote. Nothing erased.
  assert.equal(noteHistory(journal).length, 4);
  assert.equal(journal.verifyChain().valid, true);
  const publicationHistory = noteHistory(journal).map((e) => e.envelope.state.publicationState);
  assert.deepEqual(publicationHistory, ["unpublished", "promoted", "unpublished", "promoted"]);
});

// ── Consequence profiles are canonical, not supplied (NR-scms-006) ──────────

test("a forged consequence profile cannot weaken its own gate", () => {
  // COMMITMENT_PROFILE demands `prove`. The caller submits a profile object
  // that is byte-identical except for the one field that decides how hard the
  // gate is. Legitimate owner authority — no prototype trick, no stolen access.
  const { journal, registry, rev: seed } = setup();
  attestVia(journal, registry, seed, "note", [ev("ob/schema-valid", seed), ev("ob/access-declared", seed)]);
  const res = registry.execute(journal, promoteReq({
      subjectId: "note-1", candidateRevision: seed,
      profile: { ...COMMITMENT_PROFILE, promotionVerification: "none" },
      verificationPerformed: "none", promotionAuthority: "self",
  }), { ...ctx, instanceId: "int-forge" });

  assert.equal(res.outcome, "verification_required",
    "the forged 'none' must not decide the gate");
  assert.equal(res.verification, "prove",
    "the canonical profile decides, and it says prove");
  assert.equal(noteIn(journal).envelope.state.publicationState, "unpublished");
});

test("an unknown profile id is refused at the strongest level, not the weakest", () => {
  const { journal, registry, rev: seed } = setup();
  attestVia(journal, registry, seed, "note", [ev("ob/schema-valid", seed), ev("ob/access-declared", seed)]);
  const res = registry.execute(journal, promoteReq({
      subjectId: "note-1", candidateRevision: seed,
      profile: { id: "made-up", promotionVerification: "none" },
      verificationPerformed: "none", promotionAuthority: "self",
  }), { ...ctx, instanceId: "int-unknown" });
  assert.equal(res.outcome, "invalid_input");
  assert.equal(res.verification, "prove", "an unrecognised profile refuses at prove, never at none");
  assert.equal(noteIn(journal).envelope.state.publicationState, "unpublished");
});

// ── Gate inputs come from Canon, never from the caller (SCMS-036) ──────────

test("a caller cannot hand in a QUALIFIED disposition — there is nowhere to put one", () => {
  const { journal, registry, rev } = setup();
  // No evidence, no attestation. The request carries a forged attestation in
  // every field a caller might hope is read.
  const r = registry.execute(journal, promoteReq({
    subjectId: "note-1", candidateRevision: rev, profile: NOTE_PROFILE,
    verificationPerformed: "reauthenticate", promotionAuthority: "project.owner",
    attestation: { disposition: "QUALIFIED", candidateRevision: rev, outcomes: [], limitations: [] },
  } as never), ctx);

  assert.equal(r.outcome, "blocked");
  assert.match(r.detail ?? "", /got none/, "the input attestation was not read at all");
  assert.equal(noteIn(journal).envelope.state.publicationState, "unpublished");
});

test("a caller cannot hand in the evidence that decides its own attestation", () => {
  const { journal, registry, rev } = setup();
  // Attest with no evidence in Canon, while offering evidence in the request.
  const r = registry.execute(journal, {
    contract: "icp:interaction/qualification.attest@1.0.0",
    requestId: "att-forge", actor: { id: "checker", role: "evaluator" },
    input: {
      candidateRevision: rev, profileId: "note", qualificationAuthority: "checker",
      evidence: [ev("ob/schema-valid", rev), ev("ob/access-declared", rev)],
    },
  } as never, { ...ctx, instanceId: "int-att-forge" });

  assert.equal(r.outcome, "completed");
  assert.match(r.detail ?? "", /BLOCKED/,
    "with no evidence in Canon the disposition is a coverage gap, whatever the request offered");
  assert.equal(attestationFor(journal, rev)!.disposition, "BLOCKED");
  // Moving attestations into Canon without moving evidence would only have
  // relocated the hole: a caller who cannot forge a disposition would forge the
  // evidence it is computed from.
});

test("evidence must say when it was observed and when it stops counting", () => {
  const { journal, registry, rev } = setup();
  const r = registry.execute(journal, {
    contract: "icp:interaction/qualification.record-evidence@1.0.0",
    requestId: "ev-nobounds", actor: { id: "checker", role: "evaluator" },
    input: { evidence: ev("ob/schema-valid", rev) },
  } as never, { ...ctx, instanceId: "int-ev-nobounds" });

  assert.equal(r.outcome, "invalid_input");
  assert.deepEqual(r.recovery.map((x) => x.data.field).sort(), ["expiresAt", "observedAt"]);
  assert.equal(evidenceFor(journal, rev).length, 0);
  // Evidence is genuinely observed, and rr-rsp says observed records carry time
  // bounds. Recording it without an expiry would mean classifying it as
  // something it is not in order to avoid saying how long it is good for.
});

test("attesting requires owner authority, like every other write", () => {
  const { journal, registry, rev } = setup();
  const r = registry.execute(journal, {
    contract: "icp:interaction/qualification.attest@1.0.0",
    requestId: "att-anon", actor: { id: "anon", role: "anonymous" },
    input: { candidateRevision: rev, profileId: "note", qualificationAuthority: "anon" },
  } as never, { ...ctx, instanceId: "int-att-anon", authority: "public" });
  assert.equal(r.outcome, "blocked");
  assert.equal(attestationFor(journal, rev), undefined);
});

test("re-attesting supersedes the prior verdict rather than adding a second one", () => {
  const { journal, registry, rev } = setup();
  // First pass: one obligation covered, one not — a coverage gap.
  attestVia(journal, registry, rev, "note", [ev("ob/schema-valid", rev)]);
  assert.equal(attestationFor(journal, rev)!.disposition, "BLOCKED");

  // The gap is closed and the candidate re-evaluated.
  attestVia(journal, registry, rev, "note", [ev("ob/schema-valid", rev), ev("ob/access-declared", rev)]);
  assert.equal(attestationFor(journal, rev)!.disposition, "QUALIFIED");

  const currentAttestations = journal.current().filter(
    (e) => e.envelope.subjectId === `attestation:${rev}`);
  assert.equal(currentAttestations.length, 1, "exactly one current verdict");
  const allAttestations = journal.all().filter(
    (e) => e.envelope.subjectId === `attestation:${rev}`);
  assert.equal(allAttestations.length, 2, "and both are kept in history");
  assert.equal(journal.verifyChain().valid, true);

  // Appending a second current record under the same subject would leave the
  // gate reading whichever came first — the withdrawn one. A re-evaluation
  // nobody can read is worse than none at all.
});
