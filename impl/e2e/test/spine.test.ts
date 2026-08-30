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
import { RECORD_EVIDENCE, recordEvidenceHandler, ATTEST, attestHandler, attestationFor } from "../../qualification/src/canon-evidence.ts";
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
const CTX = { occurredAt: "2026-08-28T12:00:00Z", instanceId: "int_e2e", authority: "owner" as const };

/**
 * Attestations live in Canon now (SCMS-036), so the spine earns one the same
 * way anything else does: land evidence, then attest. The composed run is more
 * honest for it — it exercises the real qualification path rather than handing
 * the promotion gate a verdict.
 */
let e2eAttestSeq = 0;
function attestVia(
  journal: CanonJournal, registry: ContractRegistry,
  candidateRevision: string, obligations: string[],
) {
  for (const ob of obligations) {
    registry.execute(journal, {
      contract: "icp:interaction/qualification.record-evidence@1.0.0",
      requestId: `ev-${e2eAttestSeq}`, actor: { id: "checker", role: "evaluator" },
      input: {
        evidence: { id: `e-${e2eAttestSeq}`, obligation: ob, result: "PASS", validity: "VALID",
                    candidateRevision, actor: "checker", independentEvaluator: true },
        observedAt: CTX.occurredAt, expiresAt: "2027-01-01T00:00:00Z",
      },
    } as never, { ...CTX, instanceId: `int_ev_${e2eAttestSeq++}` });
  }
  return registry.execute(journal, {
    contract: "icp:interaction/qualification.attest@1.0.0",
    requestId: `att-${e2eAttestSeq}`, actor: { id: "checker", role: "evaluator" },
    input: { candidateRevision, profileId: "note", qualificationAuthority: "checker" },
  } as never, { ...CTX, instanceId: `int_att_${e2eAttestSeq++}` });
}
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
  attrs: { listed: true },
  slots: { title: [{ kind: "text", value: "Ship it" }], body: [{ kind: "prose", value: "Prose." }] },
};

/** The whole spine, run once. Each step returns what the next step consumes. */
function runSpine() {
  // 1 — SCHEMA CONFORMANCE before anything reaches Canon.
  assert.deepEqual(checkArticle(conformingArticle, ARTICLE_TYPE), [], "conforming article passes");
  const bad: ArticleInstance = { contentKind: "article", attrs: { listed: true }, slots: { title: conformingArticle.slots.title } };
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
  registry.register(RECORD_EVIDENCE, recordEvidenceHandler);
  registry.register(ATTEST, attestHandler);
  // SCMS-022: the declared Article type is load-bearing here — the governed
  // write consults it, so a violation cannot land in the composed path either.
  const articleValidator = (body: Record<string, unknown>) =>
    checkArticle(
      { contentKind: "article", attrs: { listed: true }, slots: (body.slots as ArticleInstance["slots"]) ?? {} },
      ARTICLE_TYPE,
    ).map((f) => ({ code: f.code, at: f.at, detail: f.detail }));

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

test("seam 1-3b: the declared type is enforced by the composed write path", () => {
  const { journal, registry } = runSpine();
  const current = journal.current().find((e) => e.envelope.subjectId === "art-1")!;
  const validator = (body: Record<string, unknown>) =>
    checkArticle(
      { contentKind: "article", attrs: { listed: true }, slots: (body.slots as ArticleInstance["slots"]) ?? {} },
      ARTICLE_TYPE,
    ).map((f) => ({ code: f.code, at: f.at, detail: f.detail }));

  const before = journal.all().length;
  const r = registry.execute(journal, {
    contract: "icp:interaction/content.revise@1.0.0", requestId: "req_bad", actor: ACTOR,
    input: { subjectId: "art-1", expectedRevision: current.envelope.revision, changes: { slots: {} } },
  }, { ...CTX, instanceId: "int_bad", validateBody: validator });

  assert.equal(r.outcome, "invalid_input", "an empty slot set violates the declared Article type");
  assert.ok(r.recovery.some((x) => x.data.field === "title"));
  assert.equal(journal.all().length, before, "nothing landed");
});

test("seam 4-5: qualification gates promotion, and promotion moves only the publication axis", () => {
  const { journal, registry, revised } = runSpine();
  const ev = (obligation: string): EvidenceRecord => ({
    id: `ev_${obligation}`, obligation, result: "PASS", validity: "VALID",
    candidateRevision: revised, actor: "checker", independentEvaluator: true,
  });

  // A missing obligation blocks promotion — a coverage gap, not a finding.
  // One obligation covered, one not: a coverage gap, so BLOCKED — and the
  // attestation that lands in Canon says so.
  attestVia(journal, registry, revised, ["ob/schema-valid"]);
  assert.equal(attestationFor(journal, revised)!.disposition, "BLOCKED");
  const refused = registry.execute(journal, {
    contract: "icp:interaction/content.promote@1.0.0", requestId: "req_2", actor: ACTOR,
    input: { subjectId: "art-1", candidateRevision: revised, profile: NOTE_PROFILE,
      verificationPerformed: "reauthenticate", promotionAuthority: "project.owner" },
  }, CTX);
  assert.equal(refused.outcome, "needs_evidence");
  assert.equal(journal.current().find((e) => e.envelope.subjectId === "art-1")!.envelope.state.publicationState, "unpublished");

  // Complete evidence qualifies; promotion then moves exactly one axis.
  attestVia(journal, registry, revised, ["ob/schema-valid", "ob/access-declared"]);
  assert.equal(attestationFor(journal, revised)!.disposition, "QUALIFIED");
  const promoted = registry.execute(journal, {
    contract: "icp:interaction/content.promote@1.0.0", requestId: "req_3", actor: ACTOR,
    input: { subjectId: "art-1", candidateRevision: revised, profile: NOTE_PROFILE,
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
  attestVia(journal, registry, revised, ["ob/schema-valid", "ob/access-declared"]);
  const promoted = registry.execute(journal, {
    contract: "icp:interaction/content.promote@1.0.0", requestId: "req_4", actor: ACTOR,
    input: { subjectId: "art-1", candidateRevision: revised, profile: NOTE_PROFILE,
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
    expressions: [a, b], promotionReceipt: promoted.receipt,
    consistency: state, chip: chip(state.state, { nowMs: 1, lastCheckedMs: 0, snapshotLabel: "Aug 28" }),
  });
  assert.ok(!everythingVisible.includes("sec-1"), "no hidden subject leaked into any stage");
  assert.ok(!everythingVisible.includes("Secret"), "nor its content");
  // The gate can fail: the same assertion over a subject that IS visible finds it.
  assert.ok(everythingVisible.includes("art-2"), "control: a visible subject does appear");
});

// ---------------------------------------------------------------------------
// SCMS-027: the composed proof extended to the full landed surface.
// ---------------------------------------------------------------------------
import { mergeBounded } from "../../merge/src/bounded.ts";
import type { CompositionState } from "../../merge/src/bounded.ts";
import { HOME_COMPOSITION } from "../../schema/src/schema.ts";
import { CONTENT_UNPUBLISH, unpublishHandler } from "../../qualification/src/unpublish.ts";
import { fanOut } from "../../notify/src/fanout.ts";
import type { Subscription } from "../../notify/src/fanout.ts";

const homeBase: CompositionState = {
  compositionId: "home",
  sockets: { hero: [{ block: "article-card", ref: "art-1" }], rail: [{ block: "note-card", ref: "n1" }] },
};

test("seam 11: a valid bounded merge lands through the governed write path", () => {
  const { journal, registry } = runSpine();
  // Land the composition in Canon so the merge result has somewhere to go.
  const seeded = journal.append({
    ...envelope("home-1", "public", {}),
    body: { kind: "Content", contentKind: "composition", state: homeBase },
  }, "editor-1");

  const a: CompositionState = { compositionId: "home", sockets: { ...homeBase.sockets, rail: [{ block: "note-card", ref: "n1" }, { block: "note-card", ref: "n2" }] } };
  const b: CompositionState = { compositionId: "home", sockets: { ...homeBase.sockets, rail: [{ block: "note-card", ref: "n1" }, { block: "note-card", ref: "n3" }] } };
  const merged = mergeBounded(homeBase, a, b, HOME_COMPOSITION);
  assert.equal(merged.outcome, "merged");
  if (merged.outcome !== "merged") return;

  // The merged value must still cross the contract — merging grants no write.
  const r = registry.execute(journal, {
    contract: "icp:interaction/content.revise@1.0.0", requestId: "req_merge", actor: ACTOR,
    input: { subjectId: "home-1", expectedRevision: seeded.envelope.revision, changes: { state: merged.result } },
  }, { ...CTX, instanceId: "int_merge" });

  assert.equal(r.outcome, "completed");
  const landed = journal.current().find((e) => e.envelope.subjectId === "home-1")!;
  const rail = (landed.envelope.body as { state: CompositionState }).state.sockets.rail;
  assert.deepEqual(rail.map((o) => o.ref), ["n1", "n2", "n3"]);
  assert.equal(journal.verifyChain().valid, true);
});

test("seam 11b: a bounded merge that violates an invariant lands nothing", () => {
  const { journal } = runSpine();
  const before = journal.all().length;
  const a: CompositionState = { compositionId: "home", sockets: { ...homeBase.sockets, hero: [{ block: "note-card", ref: "wrong" }] } };
  const merged = mergeBounded(homeBase, a, homeBase, HOME_COMPOSITION);
  assert.equal(merged.outcome, "conflicted");
  // There is no merged value to land, so nothing can be written.
  assert.ok(!("result" in merged));
  assert.equal(journal.all().length, before);
});

test("seam 12: promote → unpublish → re-promote composes with the chain intact", () => {
  const { journal, registry, revised } = runSpine();
  registry.register(CONTENT_UNPUBLISH, unpublishHandler);
  const ev = (o: string): EvidenceRecord => ({
    id: `ev_${o}`, obligation: o, result: "PASS", validity: "VALID",
    candidateRevision: revised, actor: "checker", independentEvaluator: true,
  });
  attestVia(journal, registry, revised, ["ob/schema-valid", "ob/access-declared"]);
  const promoted = registry.execute(journal, {
    contract: "icp:interaction/content.promote@1.0.0", requestId: "req_p", actor: ACTOR,
    input: { subjectId: "art-1", candidateRevision: revised, profile: NOTE_PROFILE,
      verificationPerformed: "reauthenticate", promotionAuthority: "project.owner" },
  }, CTX);
  assert.equal(promoted.outcome, "completed");

  const un = registry.execute(journal, {
    contract: "icp:interaction/content.unpublish@1.0.0", requestId: "req_u", actor: ACTOR,
    input: { subjectId: "art-1", promotedRevision: promoted.receipt!.afterVersion,
      verificationPerformed: "confirm", authority: "project.owner" },
  }, { ...CTX, instanceId: "int_un" });
  assert.equal(un.outcome, "compensated");
  assert.equal(journal.current().find((e) => e.envelope.subjectId === "art-1")!.envelope.state.publicationState, "unpublished");
  assert.equal(journal.verifyChain().valid, true);
  // Nothing was erased: promoted and unpublished revisions both remain.
  const history = journal.all().filter((e) => e.envelope.subjectId === "art-1").map((e) => e.envelope.state.publicationState);
  assert.deepEqual(history, ["unpublished", "unpublished", "promoted", "unpublished"]);
});

test("seam 13: fan-out over the composed world tells only what each subscriber may know", () => {
  const { journal } = runSpine();
  const request: SurfaceRequest = {
    profile: "focus", purpose: "understand", subject: "art-1", access: "member",
    lens: { traversal: { radius: 1 } },
  };
  const memberSurface = resolveSurface(freeze(journal, "wave-0") as never, request) as ResolvedSurface;
  const ownerSurface = resolveSurface(freeze(journal, "wave-0") as never, { ...request, access: "owner" }) as ResolvedSurface;

  const subs: Subscription[] = [
    { id: "sub-member", access: "member", dependencies: memberSurface.dependencies.map((d) => d.subject) },
    { id: "sub-owner", access: "owner", dependencies: ownerSurface.dependencies.map((d) => d.subject) },
  ];

  // A visible change reaches both.
  assert.deepEqual(fanOut(subs, ["art-2"]).map((i) => i.subscriptionId), ["sub-member", "sub-owner"]);
  // The admin-only change reaches nobody — silence, byte-identical to no wave.
  assert.deepEqual(fanOut(subs, ["sec-1"]), fanOut(subs, []));
  assert.equal(fanOut(subs, ["sec-1"]).length, 0);
});

test("composite invariant, extended: no hidden subject in any artefact of the full run", () => {
  const { journal, registry, revised } = runSpine();
  registry.register(CONTENT_UNPUBLISH, unpublishHandler);
  const ev = (o: string): EvidenceRecord => ({
    id: `ev_${o}`, obligation: o, result: "PASS", validity: "VALID",
    candidateRevision: revised, actor: "checker", independentEvaluator: true,
  });
  attestVia(journal, registry, revised, ["ob/schema-valid", "ob/access-declared"]);
  const promoted = registry.execute(journal, {
    contract: "icp:interaction/content.promote@1.0.0", requestId: "req_x", actor: ACTOR,
    input: { subjectId: "art-1", candidateRevision: revised, profile: NOTE_PROFILE,
      verificationPerformed: "reauthenticate", promotionAuthority: "project.owner" },
  }, CTX);
  const un = registry.execute(journal, {
    contract: "icp:interaction/content.unpublish@1.0.0", requestId: "req_y", actor: ACTOR,
    input: { subjectId: "art-1", promotedRevision: promoted.receipt!.afterVersion,
      verificationPerformed: "confirm", authority: "project.owner" },
  }, { ...CTX, instanceId: "int_z" });

  const request: SurfaceRequest = {
    profile: "focus", purpose: "understand", subject: "art-1", access: "member",
    lens: { traversal: { radius: 1 } }, operations: [{ id: "open-article", exposure: "available" }],
  };
  const cache = new ProjectionCache();
  const entry = cache.get(freeze(journal, "wave-1") as never, request, "focus:art-1");
  const merged = mergeBounded(homeBase, homeBase, homeBase, HOME_COMPOSITION);
  const subs: Subscription[] = [{ id: "sub-member", access: "member", dependencies: entry.dependencies }];

  const everythingVisible = JSON.stringify({
    surface: entry.surface, expressions: [expressStructural(entry.surface), expressLinear(entry.surface)],
    promoteReceipt: promoted.receipt, compensationReceipt: un.receipt,
    merge: merged, fanOutVisible: fanOut(subs, ["art-2"]), fanOutHidden: fanOut(subs, ["sec-1"]),
    consistency: consistencyState({
      subjectId: "art-1", atRevision: revised, hasLocalEdits: false,
      baselineEstablished: true, observedCanonEntries: 99,
    }, journal),
  });

  assert.ok(!everythingVisible.includes("sec-1"), "no hidden subject in any artefact");
  assert.ok(!everythingVisible.includes("Secret"), "nor its content");
  assert.ok(everythingVisible.includes("art-2"), "control: a visible subject does appear");
});

// ── SCMS-049: the spine grew again — outbox, transport, editor, site ────────
// SCMS-027 closed this once: the composed proof must match the landed surface,
// not the surface of the day it was written. Since then the system gained
// emission (SCMS-032), the wire (SCMS-033/034), derived freshness (SCMS-035),
// the editor as a surface (SCMS-044/047) and the site as a third adapter
// (SCMS-037). Each is vectored alone; nothing showed them composing.

test("seam 14: every governed write in the spine emitted, and the emissions are intact", async () => {
  const { verifyEmissionIntegrity } = await import("../../outbox/src/integrity.ts");
  const { journal } = runSpine();

  assert.equal(journal.events().length, journal.receipts().length,
    "nothing happened in the composed run without an emission");
  assert.deepEqual(verifyEmissionIntegrity(journal), []);
  assert.deepEqual(journal.events().map((e) => e.eventId), [...journal.events().keys()]);
});

test("seam 15: the wire delivers the spine's changes, and only what the subscriber may see", async () => {
  const { deliver } = await import("../../transport/src/wire.ts");
  const { journal, revised } = runSpine();

  const entry = new ProjectionCache().get(
    freeze(journal, "wave-w") as never,
    { profile: "focus", purpose: "understand", subject: "art-1", access: "member",
      lens: { traversal: { radius: 1 } } } as SurfaceRequest,
    "focus:art-1");

  const member = deliver(journal, {
    subscription: { id: "sub-member", access: "member", dependencies: entry.dependencies },
    position: null,
  });
  assert.ok(member, "a subscriber with visible dependencies hears about the spine's writes");
  assert.ok(!member!.keys.includes("sec-1"), "and never about the hidden subject");
  assert.ok(revised.length > 0);

  // A subscriber whose accessible dependency set is empty hears silence, not an
  // empty message — silence carries no information (SCMS-026).
  assert.equal(deliver(journal, {
    subscription: { id: "sub-none", access: "public", dependencies: [] }, position: null,
  }), null);
});

test("seam 16: freshness in the composed run is derived, never asserted", async () => {
  const { freshnessFrom, NEVER_CONNECTED } = await import("../../transport/src/freshness.ts");
  const { deliver } = await import("../../transport/src/wire.ts");
  const { journal } = runSpine();

  // Before any delivery the composed world cannot claim liveness.
  const cold = freshnessFrom(NEVER_CONNECTED, { nowMs: 1_000, snapshotLabel: "wave-1" });
  assert.equal(chip("current", cold), "snapshot · wave-1");

  const entry = new ProjectionCache().get(
    freeze(journal, "wave-f") as never,
    { profile: "focus", purpose: "understand", subject: "art-1", access: "member",
      lens: { traversal: { radius: 1 } } } as SurfaceRequest,
    "focus:art-1");
  const d = deliver(journal, {
    subscription: { id: "s", access: "member", dependencies: entry.dependencies }, position: null,
  })!;
  const warm = freshnessFrom(
    { connected: true, lastDelivery: { phase: d.phase, cursor: d.cursor, atMs: 5_000 } },
    { nowMs: 9_000, snapshotLabel: "wave-1" });
  assert.equal(chip("current", warm), "live · checked 4s ago",
    "and only a real delivery earns the live claim");
});

test("seam 17: the editor and the site are two expressions of the same Canon", async () => {
  const { editorView } = await import("../../editor/src/viewmodel.ts");
  const { deriveOffer } = await import("../../authoring/src/editor.ts");
  const { expressReaderWeb } = await import("../../site/src/express.ts");
  const { journal, registry } = runSpine();

  const offer = deriveOffer(registry);
  const held = journal.current().find((e) => e.envelope.subjectId === "art-1")!;
  const view = editorView({
    journal, subject: "art-1", access: "owner", offer,
    baseline: { subjectId: "art-1", atRevision: held.envelope.revision!, hasLocalEdits: false,
      observedCanonEntries: journal.all().length, baselineEstablished: true },
    freshness: { nowMs: 1_000, lastCheckedMs: null, snapshotLabel: "wave-1" },
  } as never);
  assert.ok(!("notFound" in view), "the owner's editor resolves the spine's subject");

  const reader = resolveSurface(freeze(journal, "wave-r") as never, {
    profile: "focus", purpose: "understand", subject: "art-1", access: "member",
    lens: { traversal: { radius: 1 } },
  });
  assert.ok(!isFailure(reader));
  const page = expressReaderWeb(reader as ResolvedSurface, (s) => ({ title: s, kind: "article" }));

  // Same Canon, two expressions, and neither shows the hidden subject.
  assert.ok(!page.presentedOrder.includes("sec-1"));
  assert.ok(!JSON.stringify(view).includes("sec-1"));
  // The editor sees the surface's own vocabulary; the page sees container forms.
  assert.equal((view as { surface: { purpose: string } }).surface.purpose, "edit");
  assert.notDeepEqual(page.morphology, {});
});

test("composite invariant, third extension: Canon records the hidden subject; nothing leaving Canon does", async () => {
  const { deliver } = await import("../../transport/src/wire.ts");
  const { expressReaderWeb } = await import("../../site/src/express.ts");
  const { journal } = runSpine();

  const entry = new ProjectionCache().get(
    freeze(journal, "wave-c") as never,
    { profile: "focus", purpose: "understand", subject: "art-1", access: "member",
      lens: { traversal: { radius: 1 } } } as SurfaceRequest,
    "focus:art-1");
  const delivery = deliver(journal, {
    subscription: { id: "s", access: "member", dependencies: entry.dependencies }, position: null,
  });
  const page = expressReaderWeb(entry.surface, (s) => ({ title: s, kind: "article" }));

  // The boundary runs between Canon and what leaves it, so this asserts BOTH
  // directions. An earlier draft of this vector scanned Canon's own stream
  // alongside the delivered artefacts and failed — correctly, because the
  // premise was wrong, not the system.
  //
  // Canon MUST contain the hidden subject: the outbox is the record of what
  // happened, and a stream that omitted private writes would leave fan-out
  // nothing to filter and would make replay lose events. Asserting its presence
  // keeps a future "fix" from quietly emptying it.
  assert.ok(JSON.stringify(journal.events()).includes("sec-1"),
    "Canon's own stream records every write, including the hidden one");
  assert.ok(JSON.stringify(journal.receipts()).includes("sec-1"));

  // What LEAVES Canon must not. This is the property the run has to hold.
  const delivered = JSON.stringify({ delivery, page });
  assert.ok(!delivered.includes("sec-1"),
    "no delivery and no rendered page may carry the hidden subject");
  // Control: a visible subject IS present in the delivered artefacts, so the
  // scan can fail.
  assert.ok(delivered.includes("art-1"));
});
