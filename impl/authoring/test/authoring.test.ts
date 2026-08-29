/**
 * SCMS-031 vectors: what an editor may offer, to whom, over the owner's real archive.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { migrateAll } from "../../migrate/src/zach-core.ts";
import type { SourceEntry } from "../../migrate/src/zach-core.ts";
import { CanonJournal } from "../../canon/src/journal.ts";
import { freeze } from "../../canon/src/freeze.ts";
import { ContractRegistry, narrowPathRegistry, CONTENT_REVISE, reviseHandler } from "../../contracts/src/runtime.ts";
import { CONTENT_PROMOTE, promoteHandler } from "../../qualification/src/promote.ts";
import { CONTENT_UNPUBLISH, unpublishHandler } from "../../qualification/src/unpublish.ts";
import { resolveSurface } from "../../surface-resolver/src/resolver.ts";
import { isFailure } from "../../surface-resolver/src/types.ts";
import type { ResolvedSurface } from "../../surface-resolver/src/types.ts";
import { deriveOffer, editorRequest } from "../src/editor.ts";

const manifest = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../../fixtures/zach-core-manifest.json", import.meta.url)), "utf8"),
) as { entries: SourceEntry[] };
const migrated = migrateAll(manifest.entries);
const journal = new CanonJournal();
for (const e of [...migrated.content, ...migrated.relations]) journal.append(e, "migration");
const snapshot = freeze(journal, "authoring-wave-0");

const somePrivate = migrated.content.find((e) => e.minimumAccess === "owner")!.subjectId;
const somePublic = migrated.content.find((e) => e.minimumAccess === "public")!.subjectId;

/** The full registry: every contract this system has actually implemented. */
function fullRegistry(): ContractRegistry {
  const r = new ContractRegistry();
  r.register(CONTENT_REVISE, reviseHandler);
  r.register(CONTENT_PROMOTE, promoteHandler as never);
  r.register(CONTENT_UNPUBLISH, unpublishHandler as never);
  return r;
}

test("the editor offers only what the registry implements", () => {
  const offer = deriveOffer(fullRegistry());
  const implemented = new Set(fullRegistry().list().map((d) => d.id));
  for (const op of offer.operations) {
    assert.ok(implemented.has(op.contract), `offered an unimplemented contract: ${op.contract}`);
  }
  assert.deepEqual(offer.operations.map((o) => o.intent).sort(), ["promote", "revise", "unpublish"]);
  assert.deepEqual(offer.withheld, []);
});

test("an unimplemented intent is withheld with a legible reason, not silently absent", () => {
  // The narrow-path registry implements revise only.
  const offer = deriveOffer(narrowPathRegistry());
  assert.deepEqual(offer.operations.map((o) => o.intent), ["revise"]);
  assert.deepEqual(offer.withheld, [
    { intent: "promote", reason: "unimplemented" },
    { intent: "unpublish", reason: "unimplemented" },
  ]);
  // A gap the editor can name is a gap someone can close; a gap it hides is not.
});

test("a compensatable operation is not offered without its compensation", () => {
  // Promote declares content.unpublish as its compensation. Register promote
  // WITHOUT it: the door exists, the way back does not.
  const r = new ContractRegistry();
  r.register(CONTENT_REVISE, reviseHandler);
  r.register(CONTENT_PROMOTE, promoteHandler as never);
  const offer = deriveOffer(r);
  assert.ok(!offer.operations.some((o) => o.intent === "promote"),
    "promote must not be offered while its compensation is unimplemented");
  assert.deepEqual(offer.withheld.find((w) => w.intent === "promote"),
    { intent: "promote", reason: "missing-compensation" });
});

test("the editor does not re-classify effects — it carries the contract's own declaration", () => {
  const offer = deriveOffer(fullRegistry());
  const revise = offer.operations.find((o) => o.intent === "revise")!;
  const promote = offer.operations.find((o) => o.intent === "promote")!;
  assert.equal(revise.effectClass, "E1");
  assert.equal(revise.reversibility, "reversible");
  assert.equal(promote.effectClass, "E3");
  assert.equal(promote.reversibility, "compensatable");
  assert.equal(promote.compensation, "icp:interaction/content.unpublish");
  // The difference is carried, so an expression cannot present publishing as saving.
  assert.notEqual(revise.effectClass, promote.effectClass);
});

test("the owner's editor surface resolves a private draft and exposes its operations", () => {
  const offer = deriveOffer(fullRegistry());
  const surface = resolveSurface(snapshot as never, editorRequest(somePrivate, "owner", offer));
  assert.ok(!isFailure(surface));
  const ops = (surface as ResolvedSurface).operations;
  assert.equal(ops.length, 3);
  assert.ok(ops.every((o) => o.exposure === "available"));
});

test("a public reader gets no authoring operation, and no editor surface on private content", () => {
  const offer = deriveOffer(fullRegistry());

  // On public content the surface resolves — reading is allowed — but every
  // authoring operation is withheld.
  const onPublic = resolveSurface(snapshot as never, editorRequest(somePublic, "public", offer));
  assert.ok(!isFailure(onPublic));
  const ops = (onPublic as ResolvedSurface).operations;
  assert.equal(ops.length, 3);
  assert.ok(ops.every((o) => o.exposure === "withheld"),
    "authoring operations must be withheld from a public reader");

  // On private content there is no surface at all.
  const onPrivate = resolveSurface(snapshot as never, editorRequest(somePrivate, "public", offer));
  assert.ok(isFailure(onPrivate));
});

test("offering is not permission: the surface was never the guard (NR-scms-005)", () => {
  // The public reader saw every authoring operation `withheld`. This bypasses
  // the surface entirely and invokes the contract directly, with input crafted
  // to clear every gate the handler itself applies: a QUALIFIED attestation the
  // caller wrote, a profile demanding no verification, and a promotionAuthority
  // string naming the caller as the authority.
  //
  // That input DID succeed before the authority gate existed — an anonymous
  // caller promoted an owner-private draft to `promoted`. Every gate the handler
  // owned was satisfiable by the party being gated, because authority arrived in
  // the payload. It now arrives on the execution context instead, established by
  // whatever authenticated the request, and no payload can assert it.
  const registry = fullRegistry();
  const j = new CanonJournal();
  j.append(migrated.content.find((e) => e.subjectId === somePrivate)!, "migration");
  const revision = j.current()[0].envelope.revision!;
  const before = j.all().length;

  const result = registry.execute(j, {
    contract: "icp:interaction/content.promote@1.0.0",
    requestId: "r-bypass", actor: { id: "attacker", role: "anonymous" },
    input: {
      subjectId: somePrivate, candidateRevision: revision,
      attestation: { disposition: "QUALIFIED", candidateRevision: revision, outcomes: [] },
      profile: { id: "p", promotionVerification: "none" },
      verificationPerformed: "none",
      promotionAuthority: "attacker-says-so",
    } as never,
  }, { occurredAt: "2026-08-29T00:00:00Z", instanceId: "i-bypass", authority: "public" });

  assert.equal(result.outcome, "blocked");
  assert.match(result.detail ?? "", /requires owner authority; caller holds public/,
    "refused on authority — not on the input, which was crafted to satisfy every handler gate");

  const after = j.current().find((e) => e.envelope.subjectId === somePrivate)!;
  assert.equal(after.envelope.state.publicationState, "unpublished", "the draft stayed unpublished");
  assert.equal(after.envelope.minimumAccess, "owner");
  assert.equal(j.all().length, before, "nothing landed");
});

test("the same request from a proven owner is not blocked on authority", () => {
  // The control: without this, the vector above would pass on a system that
  // refuses everything.
  const registry = fullRegistry();
  const j = new CanonJournal();
  j.append(migrated.content.find((e) => e.subjectId === somePrivate)!, "migration");
  const revision = j.current()[0].envelope.revision!;

  const result = registry.execute(j, {
    contract: "icp:interaction/content.promote@1.0.0",
    requestId: "r-owner", actor: { id: "owner", role: "owner" },
    input: {
      subjectId: somePrivate, candidateRevision: revision,
      attestation: { disposition: "QUALIFIED", candidateRevision: revision, outcomes: [] },
      profile: { id: "p", promotionVerification: "none" },
      verificationPerformed: "none", promotionAuthority: "project.owner",
    } as never,
  }, { occurredAt: "2026-08-29T00:00:00Z", instanceId: "i-owner", authority: "owner" });

  assert.doesNotMatch(result.detail ?? "", /requires owner authority/,
    "a proven owner passes the authority gate; what happens next is the handler's business");
});

test("an unregistered contract cannot mutate anything, however it is invoked", () => {
  const registry = fullRegistry();
  const j = new CanonJournal();
  for (const e of migrated.content) j.append(e, "migration");
  const before = j.all().length;
  const result = registry.execute(j, {
    contract: "icp:interaction/content.delete@1.0.0", input: {},
  } as never, {
    instanceId: "i-ghost", actor: { id: "owner", class: "owner" }, access: "owner",
  } as never);
  assert.equal(result.outcome, "not_found");
  assert.equal(j.all().length, before);
});
