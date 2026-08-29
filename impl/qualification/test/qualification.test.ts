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
  return { journal, registry, rev: seed.envelope.revision! };
}

// Authority is the CALLER's, proven by whatever authenticated the request —
// never read from input (NR-scms-005).
const ctx = { occurredAt: "2026-08-28T12:00:00Z", instanceId: "int_p1", authority: "owner" as const };
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
  assert.equal(journal.current()[0].envelope.state.publicationState, "unpublished");
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
  const blocked = qualify(rev, NOTE_PROFILE, [ev("ob/schema-valid", rev)], "checker", ctx.occurredAt);
  const r = registry.execute(journal, promoteReq({
    subjectId: "note-1", candidateRevision: rev, attestation: blocked, profile: NOTE_PROFILE,
    verificationPerformed: "reauthenticate", promotionAuthority: "project.owner",
  }), ctx);
  assert.equal(r.outcome, "needs_evidence");
  assert.equal(r.recovery[0].action, "replace_evidence");
  assert.match(r.recovery[0].data.missing, /ob\/access-declared/);
  assert.equal(journal.current()[0].envelope.state.publicationState, "unpublished");
});

test("promotion refuses without the verification its consequence class demands", () => {
  const { journal, registry, rev } = setup();
  const att = qualify(rev, NOTE_PROFILE, [ev("ob/schema-valid", rev), ev("ob/access-declared", rev)], "checker", ctx.occurredAt);
  const r = registry.execute(journal, promoteReq({
    subjectId: "note-1", candidateRevision: rev, attestation: att, profile: NOTE_PROFILE,
    verificationPerformed: "confirm", promotionAuthority: "project.owner",
  }), ctx);
  assert.equal(r.outcome, "verification_required");
  assert.equal(r.verification, "reauthenticate");
  assert.equal(r.recovery[0].action, "reauthenticate");
  assert.equal(journal.all().length, 1, "refusal writes nothing");
});

test("promotion refuses when no authority is named", () => {
  const { journal, registry, rev } = setup();
  const att = qualify(rev, NOTE_PROFILE, [ev("ob/schema-valid", rev), ev("ob/access-declared", rev)], "checker", ctx.occurredAt);
  const r = registry.execute(journal, promoteReq({
    subjectId: "note-1", candidateRevision: rev, attestation: att, profile: NOTE_PROFILE,
    verificationPerformed: "reauthenticate",
  }), ctx);
  assert.equal(r.outcome, "blocked");
  assert.equal(r.recovery[0].action, "request_access");
});

test("a qualified, verified, authorised promotion moves only the publication axis", () => {
  const { journal, registry, rev } = setup();
  const att = qualify(rev, NOTE_PROFILE, [ev("ob/schema-valid", rev), ev("ob/access-declared", rev)], "checker", ctx.occurredAt);
  const before = journal.get(rev)!.envelope.state;
  const r = registry.execute(journal, promoteReq({
    subjectId: "note-1", candidateRevision: rev, attestation: att, profile: NOTE_PROFILE,
    verificationPerformed: "reauthenticate", promotionAuthority: "project.owner",
  }), ctx);

  assert.equal(r.outcome, "completed");
  assert.equal(r.receipt!.changes.length, 1);
  assert.deepEqual(r.receipt!.changes[0], {
    path: "/state/publicationState", before: "unpublished", after: "promoted",
  });
  assert.equal(r.receipt!.reversibility, "compensatable");
  assert.equal(r.receipt!.compensationInteraction, "icp:interaction/content.unpublish");

  const after = journal.current()[0].envelope.state;
  assert.equal(after.publicationState, "promoted");
  assert.equal(after.semanticMaturity, before.semanticMaturity, "other axes untouched");
  assert.equal(after.evidenceState, before.evidenceState);
  assert.equal(after.deliveryState, before.deliveryState);
  assert.equal(journal.verifyChain().valid, true);
});

test("an attestation for a different revision cannot promote this one", () => {
  const { journal, registry, rev } = setup();
  const att = qualify(rev, NOTE_PROFILE, [ev("ob/schema-valid", rev), ev("ob/access-declared", rev)], "checker", ctx.occurredAt);
  const r = registry.execute(journal, promoteReq({
    subjectId: "note-1", candidateRevision: "sha256:other", attestation: att, profile: NOTE_PROFILE,
    verificationPerformed: "reauthenticate", promotionAuthority: "project.owner",
  }), ctx);
  assert.equal(r.outcome, "conflict");
});

// ---------------------------------------------------------------------------
// SCMS-020: content.unpublish@1 — making the declared compensation real.
// ---------------------------------------------------------------------------
import { CONTENT_UNPUBLISH, unpublishHandler } from "../src/unpublish.ts";

function promoted() {
  const { journal, registry, rev } = setup();
  registry.register(CONTENT_UNPUBLISH, unpublishHandler);
  const att = qualify(rev, NOTE_PROFILE, [ev("ob/schema-valid", rev), ev("ob/access-declared", rev)], "checker", ctx.occurredAt);
  const r = registry.execute(journal, promoteReq({
    subjectId: "note-1", candidateRevision: rev, attestation: att, profile: NOTE_PROFILE,
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
  assert.equal(journal.current()[0].envelope.state.publicationState, "unpublished");
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

  const att2 = qualify(backToDraft, NOTE_PROFILE,
    [ev("ob/schema-valid", backToDraft), ev("ob/access-declared", backToDraft)], "checker", ctx.occurredAt);
  const re = registry.execute(journal, promoteReq({
    subjectId: "note-1", candidateRevision: backToDraft, attestation: att2, profile: NOTE_PROFILE,
    verificationPerformed: "reauthenticate", promotionAuthority: "project.owner",
  }), { ...ctx, instanceId: "int_u7" });

  assert.equal(re.outcome, "completed");
  assert.equal(journal.current()[0].envelope.state.publicationState, "promoted");
  // Four landings: seed, promote, unpublish, re-promote. Nothing erased.
  assert.equal(journal.all().length, 4);
  assert.equal(journal.verifyChain().valid, true);
  const publicationHistory = journal.all().map((e) => e.envelope.state.publicationState);
  assert.deepEqual(publicationHistory, ["unpublished", "promoted", "unpublished", "promoted"]);
});

// ── Consequence profiles are canonical, not supplied (NR-scms-006) ──────────

test("a forged consequence profile cannot weaken its own gate", () => {
  // COMMITMENT_PROFILE demands `prove`. The caller submits a profile object
  // that is byte-identical except for the one field that decides how hard the
  // gate is. Legitimate owner authority — no prototype trick, no stolen access.
  const { journal, registry, rev: seed } = setup();
  const res = registry.execute(journal, promoteReq({
      subjectId: "note-1", candidateRevision: seed,
      attestation: { disposition: "QUALIFIED", candidateRevision: seed, outcomes: [] },
      profile: { ...COMMITMENT_PROFILE, promotionVerification: "none" },
      verificationPerformed: "none", promotionAuthority: "self",
  }), { ...ctx, instanceId: "int-forge" });

  assert.equal(res.outcome, "verification_required",
    "the forged 'none' must not decide the gate");
  assert.equal(res.verification, "prove",
    "the canonical profile decides, and it says prove");
  assert.equal(journal.current()[0].envelope.state.publicationState, "unpublished");
});

test("an unknown profile id is refused at the strongest level, not the weakest", () => {
  const { journal, registry, rev: seed } = setup();
  const res = registry.execute(journal, promoteReq({
      subjectId: "note-1", candidateRevision: seed,
      attestation: { disposition: "QUALIFIED", candidateRevision: seed, outcomes: [] },
      profile: { id: "made-up", promotionVerification: "none" },
      verificationPerformed: "none", promotionAuthority: "self",
  }), { ...ctx, instanceId: "int-unknown" });
  assert.equal(res.outcome, "invalid_input");
  assert.equal(res.verification, "prove", "an unrecognised profile refuses at prove, never at none");
  assert.equal(journal.current()[0].envelope.state.publicationState, "unpublished");
});
