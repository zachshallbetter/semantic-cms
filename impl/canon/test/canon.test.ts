/**
 * SCMS-011 vectors: envelope validation, revision identity, append-only
 * behaviour, hash-linked receipts, and the Canon→surface spine.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateEnvelope, revisionHash, canonicalJson } from "../src/envelope.ts";
import type { Envelope, RecordState } from "../src/envelope.ts";
import { CanonJournal, AppendOnlyViolation, ValidationError } from "../src/journal.ts";
import { freeze, excludedFromSnapshot, observationsFor } from "../src/freeze.ts";
import { resolveSurface } from "../../surface-resolver/src/resolver.ts";
import { isFailure } from "../../surface-resolver/src/types.ts";
import type { ResolvedSurface } from "../../surface-resolver/src/types.ts";

const STATE: RecordState = {
  semanticMaturity: "complete", evidenceState: "unqualified",
  publicationState: "unpublished", deliveryState: "unpropagated",
};

function article(id: string, over: Partial<Envelope> = {}, body: Record<string, unknown> = {}): Envelope {
  return {
    schemaVersion: "scms-0.1",
    subjectId: id,
    compatibility: { protocol: "scms-0.1", subjectSchema: "article@1" },
    provenance: { kind: "declared", authority: "project.owner", source: "test" },
    minimumAccess: "public",
    body: { kind: "Content", contentKind: "article", ...body },
    state: STATE,
    ...over,
  };
}

test("validation: observed requires time bounds; declared/derived must not carry them", () => {
  const obsBad = article("o-1", { provenance: { kind: "observed", authority: "a", source: "s" } });
  assert.ok(validateEnvelope(obsBad).some((f) => f.code === "observed-missing-time-bounds"));

  const obsGood = article("o-2", {
    provenance: { kind: "observed", authority: "a", source: "s",
      observedAt: "2026-08-28T00:00:00Z", expiresAt: "2026-08-28T00:00:10Z" },
    body: { kind: "Observation" },
  });
  assert.deepEqual(validateEnvelope(obsGood), []);

  const declBad = article("d-1", {
    provenance: { kind: "declared", authority: "a", source: "s", observedAt: "2026-08-28T00:00:00Z" },
  });
  assert.ok(declBad && validateEnvelope(declBad).some((f) => f.code === "non-observed-carries-time-bounds"));

  const expiryBad = article("o-3", {
    provenance: { kind: "observed", authority: "a", source: "s",
      observedAt: "2026-08-28T00:00:10Z", expiresAt: "2026-08-28T00:00:10Z" },
    body: { kind: "Observation" },
  });
  assert.ok(validateEnvelope(expiryBad).some((f) => f.code === "expiry-not-after-observation"));
});

test("validation: unknown kinds and the prohibited single status field are rejected", () => {
  const badProv = article("x-1", { provenance: { kind: "guessed" as never, authority: "a", source: "s" } });
  assert.ok(validateEnvelope(badProv).some((f) => f.code === "unknown-provenance-kind"));
  const badBody = article("x-2", { body: { kind: "Nonsense" as never } });
  assert.ok(validateEnvelope(badBody).some((f) => f.code === "unknown-body-kind"));
  const withStatus = { ...article("x-3"), status: "published" } as unknown as Envelope;
  assert.ok(validateEnvelope(withStatus).some((f) => f.code === "single-status-field-prohibited"));
});

test("identity: stable under key reordering, excludes itself, distinguishes bodies", () => {
  const a = article("art-1", {}, { attrs: { lang: "en", year: 2026 } });
  const reordered: Envelope = {
    state: STATE, body: { kind: "Content", contentKind: "article", attrs: { year: 2026, lang: "en" } },
    minimumAccess: "public", provenance: { source: "test", authority: "project.owner", kind: "declared" },
    compatibility: { subjectSchema: "article@1", protocol: "scms-0.1" },
    subjectId: "art-1", schemaVersion: "scms-0.1",
  };
  assert.equal(revisionHash(a), revisionHash(reordered));
  assert.equal(revisionHash(a), revisionHash({ ...a, revision: "sha256:whatever" }));
  assert.notEqual(revisionHash(a), revisionHash(article("art-1", {}, { attrs: { lang: "de" } })));
  assert.equal(canonicalJson({ b: 1, a: undefined }), '{"b":1}');
  assert.match(revisionHash(a), /^sha256:[0-9a-f]{64}$/);
});

test("journal: append is idempotent for identical content; landed envelopes are frozen", () => {
  const j = new CanonJournal();
  const e1 = j.append(article("art-1"), "tester");
  const e2 = j.append(article("art-1"), "tester");
  assert.equal(e1.envelope.revision, e2.envelope.revision);
  assert.equal(j.all().length, 1);
  assert.throws(() => { (e1.envelope as { subjectId: string }).subjectId = "hacked"; });
  assert.throws(() => j.append({ ...article("bad"), provenance: { kind: "nope" as never, authority: "a", source: "s" } }, "t"), ValidationError);
});

test("journal: supersede appends and retains the predecessor as history", () => {
  const j = new CanonJournal();
  const v1 = j.append(article("art-1", {}, { attrs: { title: "first" } }), "tester");
  const v2 = j.supersede(v1.envelope.revision!, article("art-1", {}, { attrs: { title: "second" } }), "tester");

  assert.equal(j.all().length, 2, "supersede appends, never replaces");
  assert.equal(j.get(v1.envelope.revision!)!.supersededBy, v2.envelope.revision);
  assert.equal(v2.envelope.supersedes, v1.envelope.revision);
  // Predecessor content is unchanged and still readable.
  assert.deepEqual((j.get(v1.envelope.revision!)!.envelope.body as { attrs: unknown }).attrs, { title: "first" });
  assert.deepEqual(j.current().map((e) => e.envelope.revision), [v2.envelope.revision]);
  assert.throws(() => j.supersede("sha256:missing", article("art-1"), "t"), AppendOnlyViolation);
});

test("journal: revoke prevents current use but retains provenance", () => {
  const j = new CanonJournal();
  const e = j.append(article("art-9"), "tester");
  j.revoke(e.envelope.revision!, "project.owner");
  assert.equal(j.current().length, 0);
  const retained = j.get(e.envelope.revision!)!;
  assert.equal(retained.revoked, true);
  assert.equal(retained.envelope.provenance.authority, "project.owner");
  assert.equal(j.all().length, 1, "revocation removes nothing");
});

test("receipts: hash-linked chain verifies and is tamper-evident", () => {
  const j = new CanonJournal();
  const a = j.append(article("art-1"), "tester");
  j.supersede(a.envelope.revision!, article("art-1", {}, { attrs: { v: 2 } }), "tester");
  j.append(article("art-2"), "tester");
  assert.deepEqual(j.verifyChain(), { valid: true, brokenAt: null });

  const receipts = j.receipts() as Array<{ actor: string }>;
  const original = receipts[1].actor;
  receipts[1].actor = "someone-else";           // tamper with history
  const broken = j.verifyChain();
  assert.equal(broken.valid, false);
  assert.equal(broken.brokenAt, 1);
  receipts[1].actor = original;
  assert.equal(j.verifyChain().valid, true);
});

test("spine: Canon → freeze → resolver, unmodified, with entitlement withheld not absent", () => {
  const j = new CanonJournal();
  j.append(article("art-1", {}, { attrs: { year: 2026 } }), "tester");
  j.append(article("art-2", {}, { attrs: { year: 2024 } }), "tester");
  j.append(article("ent-1", {}, { entitled: true }), "tester");
  j.append(article("sec-1", { minimumAccess: "admin" }), "tester");
  const stale = j.append(article("art-old", {}, { attrs: { v: 1 } }), "tester");
  j.revoke(stale.envelope.revision!, "project.owner");
  j.append({
    ...article("rel-1"), body: { kind: "Relation", from: "art-1", to: "art-2", relationType: "references" },
  }, "tester");
  j.append({
    ...article("rel-2"), body: { kind: "Relation", from: "art-1", to: "ent-1", relationType: "references" },
  }, "tester");
  j.append({
    ...article("rel-3"), minimumAccess: "admin",
    body: { kind: "Relation", from: "art-1", to: "sec-1", relationType: "references" },
  }, "tester");

  const snapshot = freeze(j, "snap-canon-1");
  assert.ok(!snapshot.subjects.some((s) => s.id === "art-old"), "revoked record absent from current snapshot");
  assert.equal(excludedFromSnapshot(j).length, 1);

  const result = resolveSurface(snapshot as never, {
    profile: "focus", purpose: "understand", subject: "art-1", access: "member",
    lens: { traversal: { radius: 1 } },
    operations: [{ id: "open-article", exposure: "available" }],
  });
  assert.ok(!isFailure(result));
  const surface = result as ResolvedSurface;

  const members = surface.groups.flatMap((g) => g.members.map((m) => m.subject));
  assert.deepEqual(members.sort(), ["art-1", "art-2"]);
  // Entitlement declared in Canon surfaces as withheld — not absent.
  const withheld = surface.explanation.excluded.find((e) => e.subject === "ent-1");
  assert.equal(withheld?.eligibility, "withheld");
  // Admin-only record and its relation never reach a member-access surface.
  assert.ok(!JSON.stringify(surface).includes("sec-1"));
});

test("freeze is explicit: no ambient time or randomness in canon sources", async () => {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  for (const rel of ["../src/envelope.ts", "../src/journal.ts", "../src/freeze.ts"]) {
    const src = readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
    assert.ok(!/Date\.now|Math\.random|new Date\(\)/.test(src), `${rel} references ambient time/randomness`);
  }
});

// ---------------------------------------------------------------------------
// SCMS-024: the wire-protocol schema and golden canonicalization vectors.
// ---------------------------------------------------------------------------

const readJson = async (rel: string) => {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  return JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8"));
};

test("the interchange schema is closed and types hashes by pattern", async () => {
  const schema = await readJson("../../../schemas/scms/envelope.schema.json");
  assert.equal(schema.properties.schemaVersion.const, "scms-0.1");
  assert.equal(schema.additionalProperties, false, "an unknown field must be a typed failure");
  assert.equal(schema.properties.state.additionalProperties, false);
  assert.equal(schema.properties.provenance.additionalProperties, false);
  const HASH = "^sha256:[0-9a-f]{64}$";
  assert.equal(schema.properties.revision.pattern, HASH);
  assert.equal(schema.properties.supersedes.pattern, HASH);
  assert.equal(schema.properties.provenance.properties.sourceHash.pattern, HASH);
  // The four axes are present and no single `status` field exists.
  assert.deepEqual(Object.keys(schema.properties.state.properties).sort(),
    ["deliveryState", "evidenceState", "publicationState", "semanticMaturity"]);
  assert.ok(!("status" in schema.properties), "a single status field is prohibited");
});

test("golden canonicalization vectors reproduce exactly", async () => {
  const golden = await readJson("../../../schemas/scms/golden/canonicalization.json");
  const positives = golden.vectors.filter((v: { negative?: boolean }) => !v.negative);
  assert.ok(positives.length >= 4);
  for (const v of positives) {
    if (v.envelope) {
      assert.equal(canonicalJson({ ...v.envelope, revision: undefined }), v.canonical, `${v.name}: canonical string`);
      assert.equal(revisionHash(v.envelope), v.revision, `${v.name}: digest`);
    } else {
      assert.equal(canonicalJson(v.input), v.canonical, `${v.name}: canonical string`);
    }
  }
});

test("the negative vector fails, proving the golden check can fail", async () => {
  const golden = await readJson("../../../schemas/scms/golden/canonicalization.json");
  const negative = golden.vectors.find((v: { negative?: boolean }) => v.negative);
  assert.ok(negative, "the suite must ship a negative vector");
  assert.notEqual(revisionHash(negative.envelope), negative.revision,
    "the recorded digest is deliberately wrong; a suite reporting it as passing checks nothing");
});

test("schema and runtime validator agree on the freshness rule", async () => {
  const schema = await readJson("../../../schemas/scms/envelope.schema.json");
  // The schema encodes it conditionally; the runtime validator encodes it in code.
  // Agreement is asserted case-wise (no JSON-Schema library is available here).
  const conditional = schema.properties.provenance.allOf[0];
  assert.equal(conditional.if.properties.kind.const, "observed");
  assert.ok(conditional.then.required.includes("observedAt") && conditional.then.required.includes("expiresAt"));
  assert.ok(conditional.else.not.anyOf.some((a: { required: string[] }) => a.required.includes("observedAt")));

  const obsMissing = article("o-x", { provenance: { kind: "observed", authority: "a", source: "s" } });
  assert.ok(validateEnvelope(obsMissing).some((f) => f.code === "observed-missing-time-bounds"));
  const declWithBounds = article("d-x", {
    provenance: { kind: "declared", authority: "a", source: "s", expiresAt: "2026-08-28T00:00:00Z" },
  });
  assert.ok(validateEnvelope(declWithBounds).some((f) => f.code === "non-observed-carries-time-bounds"));
});

// ── SCMS-046: observations are signals, not participants (closes SH-14) ─────

test("an observation never becomes a surface subject", () => {
  const j = new CanonJournal();
  j.append(article("art-1"), "t");
  j.append({
    schemaVersion: "scms-0.1", subjectId: "art-1#field",
    compatibility: { protocol: "scms-0.1", subjectSchema: "observation@1" },
    provenance: { kind: "derived", authority: "project.owner", source: "model" },
    minimumAccess: "public",
    body: { kind: "Observation", observationKind: "semantic-article-field",
            about: "art-1", field: { archetype: "explainer" } },
    state: { semanticMaturity: "complete", evidenceState: "unqualified",
             publicationState: "unpublished", deliveryState: "unpropagated" },
  } as never, "t");

  const snap = freeze(j, "w");
  assert.ok(!snap.subjects.some((s) => s.id === "art-1#field"),
    "a model's claim about an article must not become a member a reader lands on");
  assert.equal(snap.observations.length, 1);
  assert.equal(snap.observations[0].about, "art-1");
});

test("the derived field is reachable — projecting it is not decoration", () => {
  // SCMS-028's derived Semantic Article Field used to land in Canon and become
  // invisible to everything including its owner. Adding a snapshot field with
  // no reader would have been the fifth instance of the failure P27 names, so
  // the reader lands with it.
  const j = new CanonJournal();
  j.append(article("art-1"), "t");
  j.append({
    schemaVersion: "scms-0.1", subjectId: "art-1#field",
    compatibility: { protocol: "scms-0.1", subjectSchema: "observation@1" },
    provenance: { kind: "derived", authority: "project.owner", source: "model" },
    minimumAccess: "public",
    body: { kind: "Observation", observationKind: "semantic-article-field", about: "art-1" },
    state: { semanticMaturity: "complete", evidenceState: "unqualified",
             publicationState: "unpublished", deliveryState: "unpropagated" },
  } as never, "t");

  const snap = freeze(j, "w");
  const found = observationsFor(snap, "art-1", "public");
  assert.equal(found.length, 1);
  assert.equal(found[0].kind, "semantic-article-field");
  assert.deepEqual(observationsFor(snap, "art-2", "public"), [], "and only about its own subject");
});

test("an observation's access is its own, not its subject's", () => {
  // A private note about a public article stays private. Inheriting the
  // subject's access would publish the note by association.
  const j = new CanonJournal();
  j.append(article("art-1"), "t");
  j.append({
    schemaVersion: "scms-0.1", subjectId: "art-1#note",
    compatibility: { protocol: "scms-0.1", subjectSchema: "observation@1" },
    // `observed` provenance must carry time bounds (§8.4) — the validator
    // enforces it, which is why an expiring working copy (SCMS-045) gets its
    // self-release for free rather than by remembering to add one.
    provenance: {
      kind: "observed", authority: "project.owner", source: "editor",
      observedAt: "2026-08-29T00:00:00Z", expiresAt: "2026-08-29T00:10:00Z",
    },
    minimumAccess: "owner",
    body: { kind: "Observation", observationKind: "editor-note", about: "art-1" },
    state: { semanticMaturity: "draft", evidenceState: "unqualified",
             publicationState: "unpublished", deliveryState: "unpropagated" },
  } as never, "t");

  const snap = freeze(j, "w");
  assert.deepEqual(observationsFor(snap, "art-1", "public"), [],
    "a public reader must not see an owner-scoped note about a public article");
  assert.equal(observationsFor(snap, "art-1", "owner").length, 1);
});

// ── SCMS-056: supersession and revocation are derived (closes SH-23) ────────

test("superseding rewrites no row — the successor carries the pointer", () => {
  const j = new CanonJournal();
  const v1 = j.append(article("art-1"), "t");
  const before = JSON.stringify(j.all().map((e) => e.envelope));

  const v2 = j.supersede(v1.envelope.revision!, article("art-1", {}, { extra: 1 }), "t");

  // Every envelope that existed before is byte-identical after. Under §3.4's
  // no-UPDATE grant this is the difference between possible and impossible.
  const after = JSON.stringify(j.all().slice(0, 1).map((e) => e.envelope));
  assert.equal(after, before, "the predecessor's row was rewritten");

  // And supersession is still visible — read off the successor's own pointer.
  assert.equal(j.get(v1.envelope.revision!)!.supersededBy, v2.envelope.revision);
  assert.equal(v2.envelope.supersedes, v1.envelope.revision);
});

test("revoking rewrites no row — the receipt chain carries it", () => {
  const j = new CanonJournal();
  const v1 = j.append(article("art-1"), "t");
  const before = JSON.stringify(j.all().map((e) => e.envelope));

  j.revoke(v1.envelope.revision!, "t");

  assert.equal(JSON.stringify(j.all().map((e) => e.envelope)), before,
    "revocation must not rewrite the row");
  assert.equal(j.get(v1.envelope.revision!)!.revoked, true);
  assert.ok(j.receipts().some((r) => r.action === "revoke" && r.revision === v1.envelope.revision));
});

test("the derived indexes are only a cache — recomputation reproduces them exactly", () => {
  // The property that keeps an index from quietly becoming the source of truth.
  // If this ever fails, some state is being maintained that append-only data
  // cannot reconstruct — which is precisely what would not survive a store.
  const j = new CanonJournal();
  const a = j.append(article("art-1"), "t");
  const b = j.supersede(a.envelope.revision!, article("art-1", {}, { v: 2 }), "t");
  const c = j.supersede(b.envelope.revision!, article("art-1", {}, { v: 3 }), "t");
  j.append(article("art-2"), "t");
  j.revoke(c.envelope.revision!, "t");

  const derived = j.deriveIndexes();

  // Compare against what the journal is actually using, via the public shape.
  for (const entry of j.all()) {
    const rev = entry.envelope.revision!;
    assert.equal(entry.supersededBy, derived.successorOf.get(rev) ?? null,
      `supersededBy for ${rev} disagrees with recomputation`);
    assert.equal(entry.revoked, derived.revoked.has(rev),
      `revoked for ${rev} disagrees with recomputation`);
  }
  assert.equal(derived.successorOf.size, 2, "two supersessions in the chain");
  assert.deepEqual([...derived.revoked], [c.envelope.revision]);
});

test("current() is a query, expressible as the Postgres view it will become", () => {
  const j = new CanonJournal();
  const a = j.append(article("art-1"), "t");
  const b = j.supersede(a.envelope.revision!, article("art-1", {}, { v: 2 }), "t");
  const other = j.append(article("art-2"), "t");
  j.revoke(other.envelope.revision!, "t");

  // "A row is current when nothing supersedes it and no revoke receipt names
  // it" — computed here from append-only data alone, with no help from the
  // journal's own indexes.
  const { successorOf, revoked } = j.deriveIndexes();
  const expected = j.all()
    .map((e) => e.envelope.revision!)
    .filter((rev) => !successorOf.has(rev) && !revoked.has(rev))
    .sort();

  assert.deepEqual(j.current().map((e) => e.envelope.revision!).sort(), expected);
  assert.deepEqual(expected, [b.envelope.revision!].sort());
});
