/**
 * SCMS-019 — the narrowest end-to-end path, run once, in order.
 *
 * Canon → schema conformance → governed revise → qualify → promote → freeze →
 * resolve → express (twice) → cache → invalidate → consistency + chip.
 *
 * These vectors assert the SEAMS: that each stage's artefact is the next
 * stage's accepted input, and that the invariants survive composition. What
 * each package proves internally is not re-proven here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { CanonJournal } from "../../canon/src/journal.ts";
import type { Envelope, RecordState } from "../../canon/src/envelope.ts";
import { freeze } from "../../canon/src/freeze.ts";
import { ARTICLE_TYPE, checkArticle } from "../../schema/src/schema.ts";
import type { ArticleInstance } from "../../schema/src/schema.ts";
import { ContractRegistry, CONTENT_REVISE, reviseHandler } from "../../contracts/src/runtime.ts";
import { NOTE_PROFILE } from "../../qualification/src/eqp.ts";
import type { EvidenceRecord } from "../../qualification/src/eqp.ts";
import { qualify } from "../../qualification/src/qualify.ts";
import { CONTENT_PROMOTE, promoteHandler } from "../../qualification/src/promote.ts";
import { resolveSurface } from "../../surface-resolver/src/resolver.ts";
import { isFailure } from "../../surface-resolver/src/types.ts";
import type { ResolvedSurface, SurfaceRequest } from "../../surface-resolver/src/types.ts";
import { expressStructural, expressLinear } from "../../surface-expression/src/expressions.ts";
import { checkEquivalence } from "../../surface-expression/src/equivalence.ts";
import { ProjectionCache } from "../../projection-cache/src/cache.ts";
import { consistencyState, permits, chip } from "../../observation/src/consistency.ts";

const STATE: RecordState = {
  semanticMaturity: "draft", evidenceState: "unqualified",
  publicationState: "unpublished", deliveryState: "unpropagated",
};
const CTX = { occurredAt: "2026-08-28T12:00:00Z", instanceId: "int_e2e" };
const ACTOR = { id: "editor-1", role: "editor" };

function envelope(id: string, access: Envelope["minimumAccess"], body: Record<string, unknown>): Envelope {
  return {
    schemaVersion: "scms-0.1", subjectId: id,
    compatibility: { protocol: "scms-0.1", subjectSchema: "article@1" },
    provenance: { kind: "declared", authority: "project.owner", source: "e2e" },
    minimumAccess: access, body: { kind: "Content", contentKind: "article", ...body }, state: STATE,
  };
}

const conformingArticle: ArticleInstance = {
  contentKind: "article",
  slots: { title: [{ kind: "text", value: "Ship it" }], body: [{ kind: "prose", value: "Prose." }] },
};

/** The whole spine, run once. Each step returns what the next step consumes. */
function runSpine() {
  // 1 — SCHEMA CONFORMANCE before anything reaches Canon.
  assert.deepEqual(checkArticle(conformingArticle, ARTICLE_TYPE), [], "conforming article passes");
  const bad: ArticleInstance = { contentKind: "article", slots: { title: conformingArticle.slots.title } };
  assert.equal(checkArticle(bad, ARTICLE_TYPE)[0].code, "required-slot-missing");

  // 2 — CANON: land the article plus the world it lives in.
  const journal = new CanonJournal();
  const seed = journal.append(envelope("art-1", "public", { title: "Ship it", body: "Prose." }), "editor-1");
  journal.append(envelope("art-2", "public", { title: "Neighbour" }), "editor-1");
  journal.append(envelope("ent-1", "public", { title: "Gated", entitled: true }), "editor-1");
  journal.append(envelope("sec-1", "admin", { title: "Secret" }), "admin-1");
  for (const [id, to] of [["rel-1", "art-2"], ["rel-2", "ent-1"]] as const) {
    journal.append({ ...envelope(id, "public", {}), body: { kind: "Relation", from: "art-1", to, relationType: "references" } }, "editor-1");
  }
  journal.append({
    ...envelope("rel-3", "admin", {}), body: { kind: "Relation", from: "art-1", to: "sec-1", relationType: "references" },
  }, "admin-1");

  // 3 — GOVERNED WRITE: the only path into Canon for a revision.
  const registry = new ContractRegistry();
  registry.register(CONTENT_REVISE, reviseHandler);
  registry.register(CONTENT_PROMOTE, promoteHandler);
  const revise = registry.execute(journal, {
    contract: "icp:interaction/content.revise@1.0.0", requestId: "req_1", actor: ACTOR,
    input: { subjectId: "art-1", expectedRevision: seed.envelope.revision, changes: { title: "Ship it (revised)" } },
  }, CTX);
  assert.equal(revise.outcome, "completed");
  const revised = revise.receipt!.afterVersion;

  return { journal, registry, seed, revised };
}

test("seam 1-3: conformance gates Canon, and the governed write emits a verifiable receipt", () => {
  const { journal, revised, seed } = runSpine();
  assert.equal(journal.get(seed.envelope.revision!)!.supersededBy, revised);
  assert.equal(journal.verifyChain().valid, true);
  assert.equal(journal.current().find((e) => e.envelope.subjectId === "art-1")!.envelope.revision, revised);
});

test("seam 4-5: qualification gates promotion, and promotion moves only the publication axis", () => {
  const { journal, registry, revised } = runSpine();
  const ev = (obligation: string): EvidenceRecord => ({
    id: `ev_${obligation}`, obligation, result: "PASS", validity: "VALID",
    candidateRevision: revised, actor: "checker", independentEvaluator: true,
  });

  // A missing obligation blocks promotion — a coverage gap, not a finding.
  const blocked = qualify(revised, NOTE_PROFILE, [ev("ob/schema-valid")], "checker", CTX.occurredAt);
  assert.equal(blocked.disposition, "BLOCKED");
  const refused = registry.execute(journal, {
    contract: "icp:interaction/content.promote@1.0.0", requestId: "req_2", actor: ACTOR,
    input: { subjectId: "art-1", candidateRevision: revised, attestation: blocked, profile: NOTE_PROFILE,
      verificationPerformed: "reauthenticate", promotionAuthority: "project.owner" },
  }, CTX);
  assert.equal(refused.outcome, "needs_evidence");
  assert.equal(journal.current().find((e) => e.envelope.subjectId === "art-1")!.envelope.state.publicationState, "unpublished");

  // Complete evidence qualifies; promotion then moves exactly one axis.
  const att = qualify(revised, NOTE_PROFILE, [ev("ob/schema-valid"), ev("ob/access-declared")], "checker", CTX.occurredAt);
  assert.equal(att.disposition, "QUALIFIED");
  const promoted = registry.execute(journal, {
    contract: "icp:interaction/content.promote@1.0.0", requestId: "req_3", actor: ACTOR,
    input: { subjectId: "art-1", candidateRevision: revised, attestation: att, profile: NOTE_PROFILE,
      verificationPerformed: "reauthenticate", promotionAuthority: "project.owner" },
  }, CTX);
  assert.equal(promoted.outcome, "completed");
  assert.deepEqual(promoted.receipt!.changes, [{ path: "/state/publicationState", before: "unpublished", after: "promoted" }]);
  const now = journal.current().find((e) => e.envelope.subjectId === "art-1")!.envelope.state;
  assert.equal(now.publicationState, "promoted");
  assert.equal(now.semanticMaturity, "draft", "promotion touched no other axis");
  assert.equal(journal.verifyChain().valid, true);
});

test("seam 6-7: freeze feeds the resolver; entitlement is withheld, admin state is absent", () => {
  const { journal } = runSpine();
  const snapshot = freeze(journal, "wave-0");
  const request: SurfaceRequest = {
    profile: "focus", purpose: "understand", subject: "art-1", access: "member",
    lens: { traversal: { radius: 1 } }, operations: [{ id: "open-article", exposure: "available" }],
  };
  const result = resolveSurface(snapshot as never, request);
  assert.ok(!isFailure(result));
  const surface = result as ResolvedSurface;

  const members = surface.groups.flatMap((g) => g.members.map((m) => m.subject));
  assert.deepEqual(members.sort(), ["art-1", "art-2"]);
  assert.equal(surface.explanation.excluded.find((e) => e.subject === "ent-1")?.eligibility, "withheld");
  assert.ok(!JSON.stringify(surface).includes("sec-1"));
});

test("seam 8: both expressions consume one surface and preserve the S3 properties", () => {
  const { journal } = runSpine();
  const snapshot = freeze(journal, "wave-0");
  const surface = resolveSurface(snapshot as never, {
    profile: "focus", purpose: "understand", subject: "art-1", access: "member",
    lens: { traversal: { radius: 1 } }, operations: [{ id: "open-article", exposure: "available" }],
  }) as ResolvedSurface;

  const a = expressStructural(surface);
  const b = expressLinear(surface);
  const eq = checkEquivalence(surface, a, b, ["sec-1"]);
  assert.deepEqual(eq.findings, []);
  assert.equal(eq.materiallyDifferent, true);
});

test("seam 9: the cache retains on an invisible change and invalidates on a visible one", () => {
  const { journal } = runSpine();
  const cache = new ProjectionCache();
  const request: SurfaceRequest = {
    profile: "focus", purpose: "understand", subject: "art-1", access: "member",
    lens: { traversal: { radius: 1 } },
  };
  const first = cache.get(freeze(journal, "wave-0") as never, request, "focus:art-1");

  // An admin-only edit: invisible to this viewer, so nothing may change for them.
  const sec = journal.current().find((e) => e.envelope.subjectId === "sec-1")!;
  journal.supersede(sec.envelope.revision!, envelope("sec-1", "admin", { title: "Secret v2" }), "admin-1");
  const invisible = cache.commitWave(["sec-1"]);
  assert.ok(invisible.decisions.every((d) => d.decision === "retained"));
  const after = cache.get(freeze(journal, "wave-1") as never, request, "focus:art-1");
  assert.equal(after.fingerprint, first.fingerprint, "an invisible change moves nothing for this viewer");

  // A visible edit invalidates and names its cause.
  const art2 = journal.current().find((e) => e.envelope.subjectId === "art-2")!;
  journal.supersede(art2.envelope.revision!, envelope("art-2", "public", { title: "Neighbour v2" }), "editor-1");
  const visible = cache.commitWave(["art-2"]);
  assert.equal(visible.decisions[0].decision, "invalidated");
  assert.equal(visible.decisions[0].becauseOf, "art-2");
});

test("seam 10: a client on the pre-revision baseline is told the truth", () => {
  const { journal, seed } = runSpine();
  const base = {
    subjectId: "art-1", atRevision: seed.envelope.revision!, baselineEstablished: true,
    observedCanonEntries: 7,
  };

  const clean = consistencyState({ ...base, hasLocalEdits: false }, journal);
  assert.equal(clean.state, "superseded");
  assert.equal(permits(clean.state, "consequential"), false);
  assert.equal(chip(clean.state, { nowMs: 10_000, lastCheckedMs: 9_000, snapshotLabel: "Aug 28" }),
    "superseded — open the current version");

  const withEdits = consistencyState({ ...base, hasLocalEdits: true }, journal);
  assert.equal(withEdits.state, "conflicted");
  assert.equal(permits(withEdits.state, "draft"), true, "drafting continues");
  assert.equal(permits(withEdits.state, "consequential"), false, "publishing does not");
  assert.equal(chip(withEdits.state, { nowMs: 10_000, lastCheckedMs: 9_000, snapshotLabel: "Aug 28" }),
    "conflicted — review");
});

test("composite invariant: no hidden subject appears anywhere in the whole run", () => {
  const { journal, registry, revised } = runSpine();
  const ev = (o: string): EvidenceRecord => ({
    id: `ev_${o}`, obligation: o, result: "PASS", validity: "VALID",
    candidateRevision: revised, actor: "checker", independentEvaluator: true,
  });
  const att = qualify(revised, NOTE_PROFILE, [ev("ob/schema-valid"), ev("ob/access-declared")], "checker", CTX.occurredAt);
  const promoted = registry.execute(journal, {
    contract: "icp:interaction/content.promote@1.0.0", requestId: "req_4", actor: ACTOR,
    input: { subjectId: "art-1", candidateRevision: revised, attestation: att, profile: NOTE_PROFILE,
      verificationPerformed: "reauthenticate", promotionAuthority: "project.owner" },
  }, CTX);

  const request: SurfaceRequest = {
    profile: "focus", purpose: "understand", subject: "art-1", access: "member",
    lens: { traversal: { radius: 1 } }, operations: [{ id: "open-article", exposure: "available" }],
  };
  const cache = new ProjectionCache();
  const entry = cache.get(freeze(journal, "wave-0") as never, request, "focus:art-1");
  const a = expressStructural(entry.surface);
  const b = expressLinear(entry.surface);
  const state = consistencyState({
    subjectId: "art-1", atRevision: entry.surface.sourceSnapshot, hasLocalEdits: false,
    baselineEstablished: true, observedCanonEntries: 99,
  }, journal);

  // Everything a member-access viewer could ever see, in one string.
  const everythingVisible = JSON.stringify({
    surface: entry.surface, cacheEntry: { fp: entry.fingerprint, deps: entry.dependencies },
    expressions: [a, b], attestation: att, promotionReceipt: promoted.receipt,
    consistency: state, chip: chip(state.state, { nowMs: 1, lastCheckedMs: 0, snapshotLabel: "Aug 28" }),
  });
  assert.ok(!everythingVisible.includes("sec-1"), "no hidden subject leaked into any stage");
  assert.ok(!everythingVisible.includes("Secret"), "nor its content");
  // The gate can fail: the same assertion over a subject that IS visible finds it.
  assert.ok(everythingVisible.includes("art-2"), "control: a visible subject does appear");
});
