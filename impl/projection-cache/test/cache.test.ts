/**
 * SCMS-014 vectors — including the side-channel vector this slice exists for:
 * an edit the viewer cannot observe must not invalidate their cache entry.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { CanonJournal } from "../../canon/src/journal.ts";
import type { Envelope, RecordState } from "../../canon/src/envelope.ts";
import { freeze } from "../../canon/src/freeze.ts";
import { ProjectionCache } from "../src/cache.ts";
import type { SurfaceRequest } from "../../surface-resolver/src/types.ts";

const STATE: RecordState = {
  semanticMaturity: "complete", evidenceState: "unqualified",
  publicationState: "unpublished", deliveryState: "unpropagated",
};

function content(id: string, access: Envelope["minimumAccess"], body: Record<string, unknown> = {}): Envelope {
  return {
    schemaVersion: "scms-0.1", subjectId: id,
    compatibility: { protocol: "scms-0.1", subjectSchema: "article@1" },
    provenance: { kind: "declared", authority: "project.owner", source: "test" },
    minimumAccess: access,
    body: { kind: "Content", contentKind: "article", title: "t", ...body }, state: STATE,
  };
}

function relation(id: string, from: string, to: string, access: Envelope["minimumAccess"]): Envelope {
  return {
    ...content(id, access), body: { kind: "Relation", from, to, relationType: "references" },
  };
}

/** art-1 → art-2 (public), art-1 → sec-1 (admin), art-1 → ent-1 (public, entitled). */
function world() {
  const j = new CanonJournal();
  const a1 = j.append(content("art-1", "public"), "t");
  const a2 = j.append(content("art-2", "public"), "t");
  const s1 = j.append(content("sec-1", "admin"), "t");
  const e1 = j.append(content("ent-1", "public", { entitled: true }), "t");
  j.append(relation("rel-1", "art-1", "art-2", "public"), "t");
  j.append(relation("rel-2", "art-1", "sec-1", "admin"), "t");
  j.append(relation("rel-3", "art-1", "ent-1", "public"), "t");
  return { j, a1, a2, s1, e1 };
}

const req = (access: SurfaceRequest["access"]): SurfaceRequest => ({
  profile: "focus", purpose: "understand", subject: "art-1", access,
  lens: { traversal: { radius: 1 } },
});

test("a change inside the dependency set invalidates; outside, the entry is retained", () => {
  const { j } = world();
  const cache = new ProjectionCache();
  const snap = freeze(j, "w0");
  cache.get(snap as never, req("member"), "focus:art-1");

  const retained = cache.commitWave(["unrelated-999"]);
  assert.equal(retained.decisions[0].decision, "retained");
  assert.equal(cache.peek("focus:art-1", "member")!.valid, true);

  const invalidated = cache.commitWave(["art-2"]);
  assert.equal(invalidated.decisions[0].decision, "invalidated");
  assert.equal(invalidated.decisions[0].becauseOf, "art-2", "the deciding dependency is named");
  assert.equal(cache.peek("focus:art-1", "member")!.valid, false);
});

test("side channel: an admin-only edit does not invalidate the member entry", () => {
  const { j, s1 } = world();
  const cache = new ProjectionCache();
  const snap = freeze(j, "w0");
  const memberEntry = cache.get(snap as never, req("member"), "focus:art-1");
  const ownerEntry = cache.get(snap as never, req("owner"), "focus:art-1");

  // sec-1 is admin-only: invisible at member and owner access alike, so it is
  // in neither dependency set — the resolver never made it a candidate.
  assert.ok(!memberEntry.dependencies.includes("sec-1"));
  assert.ok(!ownerEntry.dependencies.includes("sec-1"));

  const before = JSON.stringify(cache.peek("focus:art-1", "member"));
  const result = cache.commitWave([s1.envelope.subjectId]);

  for (const d of result.decisions) {
    assert.equal(d.decision, "retained", `${d.key.access} must not learn of an admin-only edit`);
  }
  // The member's cache state is byte-identical to a world where sec-1 never changed.
  assert.equal(JSON.stringify(cache.peek("focus:art-1", "member")), before);
});

test("observability, not membership: a withheld subject is still a dependency", () => {
  const { j, e1 } = world();
  const cache = new ProjectionCache();
  const entry = cache.get(freeze(j, "w0") as never, req("member"), "focus:art-1");

  // ent-1 is excluded from membership (withheld) but WAS evaluated — the
  // member could observe its existence, so it is an accessible dependency.
  const members = entry.surface.groups.flatMap((g) => g.members.map((m) => m.subject));
  assert.ok(!members.includes("ent-1"), "withheld: not a member");
  assert.ok(entry.dependencies.includes("ent-1"), "but still a dependency");

  const result = cache.commitWave([e1.envelope.subjectId]);
  assert.equal(result.decisions[0].decision, "invalidated");
  assert.equal(result.decisions[0].becauseOf, "ent-1");
});

test("re-resolution after invalidation recomputes a valid entry", () => {
  const { j, a2 } = world();
  const cache = new ProjectionCache();
  const first = cache.get(freeze(j, "w0") as never, req("member"), "focus:art-1");
  const originalFingerprint = first.fingerprint;
  const originalMembers = first.surface.groups.flatMap((g) => g.members.map((m) => m.subject));

  j.supersede(a2.envelope.revision!, content("art-2", "public", { title: "changed" }), "editor");
  cache.commitWave(["art-2"]);
  const second = cache.get(freeze(j, "w1") as never, req("member"), "focus:art-1");

  assert.equal(second.valid, true);
  assert.equal(second.computedAtWave, 1);
  // Participation is unchanged by an attribute edit: the same members resolve.
  assert.deepEqual(
    second.surface.groups.flatMap((g) => g.members.map((m) => m.subject)), originalMembers);

  // FIXED by SCMS-015 (closes NR-scms-003): dependency identity is now the
  // subject's own Canon revision, so a wave that changes nothing accessible
  // leaves the fingerprint alone — pinned SSS §21 ("changes outside the
  // observable dependency set should not invalidate the surface"). The entry
  // was still correctly invalidated: art-2's revision DID change.
  assert.notEqual(second.fingerprint, originalFingerprint,
    "art-2's revision changed, so its dependency identity — and the fingerprint — moved");

  // Participation change: a member disappears, which must move the fingerprint
  // under any correct implementation.
  const rel = j.current().find((e) => (e.envelope.body as { from?: string }).from === "art-1"
    && (e.envelope.body as { to?: string }).to === "art-2")!;
  j.revoke(rel.envelope.revision!, "project.owner");
  cache.commitWave(["art-2"]);
  const third = cache.get(freeze(j, "w2") as never, req("member"), "focus:art-1");
  const thirdMembers = third.surface.groups.flatMap((g) => g.members.map((m) => m.subject));
  assert.ok(!thirdMembers.includes("art-2"), "revoked relation removes the member");
  assert.notEqual(third.fingerprint, second.fingerprint);
});

test("SSS §21: a wave that changes nothing accessible leaves the fingerprint alone", () => {
  const { j, s1 } = world();
  const cache = new ProjectionCache();
  const first = cache.get(freeze(j, "w0") as never, req("member"), "focus:art-1");

  // Change only the admin-only subject, then re-freeze under a NEW snapshot id.
  j.supersede(s1.envelope.revision!, content("sec-1", "admin", { title: "secret edit" }), "admin");
  cache.commitWave(["sec-1"]);
  const second = cache.get(freeze(j, "w1") as never, req("member"), "focus:art-1");

  assert.equal(second.fingerprint, first.fingerprint,
    "no accessible dependency changed — a new wave must not move the fingerprint");
  assert.deepEqual(second.dependencies, first.dependencies);
});

test("entries are keyed per access level and decided independently", () => {
  const { j, a2 } = world();
  const cache = new ProjectionCache();
  cache.get(freeze(j, "w0") as never, req("member"), "focus:art-1");
  cache.get(freeze(j, "w0") as never, req("owner"), "focus:art-1");
  assert.equal(cache.size, 2);

  const result = cache.commitWave([a2.envelope.subjectId]);
  // art-2 is public: visible at both levels, so both invalidate — and each
  // decision names its own deciding dependency.
  assert.equal(result.decisions.length, 2);
  assert.ok(result.decisions.every((d) => d.decision === "invalidated" && d.becauseOf === "art-2"));
});

test("the cache asks one question and reads no access-scoped state", async () => {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const src = readFileSync(fileURLToPath(new URL("../src/cache.ts", import.meta.url)), "utf8");
  // No ambient time or randomness, and no access-rank comparison: invalidation
  // is decided solely by dependency-set membership.
  assert.ok(!/Date\.now|Math\.random|new Date\(\)/.test(src));
  assert.ok(!/ACCESS_RANK|minimumAccess/.test(src), "cache must not evaluate access itself");
});
