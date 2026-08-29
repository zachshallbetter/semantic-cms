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

const ctx = { occurredAt: "2026-08-28T12:00:00Z", instanceId: "int_p1" };
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
