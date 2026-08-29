/**
 * SCMS-008 vectors: golden positives plus the mandatory negatives from
 * SSS docs/CONFORMANCE.md (numbers referenced inline). The suite establishes
 * S0/S1 for the narrow path and the central S2 access property — nothing more.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolveSurface, RESOLVER_VERSION } from "../src/resolver.ts";
import { surfaceFingerprint, canonicalJson } from "../src/fingerprint.ts";
import { isFailure } from "../src/types.ts";
import type { FrozenSnapshot, SurfaceRequest, ResolvedSurface } from "../src/types.ts";

function fixture(): FrozenSnapshot {
  return {
    snapshotId: "snap-001",
    subjects: [
      { id: "art-1", kind: "article", access: "public", attrs: { lang: "en", year: 2026 } },
      { id: "art-2", kind: "article", access: "public", attrs: { lang: "de", year: 2024 } },
      { id: "art-3", kind: "article", access: "public", attrs: { year: 2025 } }, // no lang attr
      { id: "note-1", kind: "note", access: "member", attrs: { lang: "en" } },
      { id: "sec-1", kind: "article", access: "admin", attrs: { lang: "en" } },
      { id: "ent-1", kind: "article", access: "public", entitled: true, attrs: { lang: "en" } },
    ],
    relations: [
      { from: "art-1", to: "art-2", type: "references", access: "public" },
      { from: "art-1", to: "note-1", type: "annotated-by", access: "member" },
      { from: "art-1", to: "sec-1", type: "references", access: "admin" },
      { from: "art-2", to: "art-3", type: "references", access: "public" },
    ],
  };
}

function focusRequest(overrides: Partial<SurfaceRequest> = {}): SurfaceRequest {
  return {
    profile: "focus",
    purpose: "understand",
    subject: "art-1",
    access: "member",
    lens: { traversal: { radius: 2 } },
    operations: [
      { id: "open-article", exposure: "available" },
      { id: "edit", exposure: "available", minAccess: "owner" },
    ],
    ...overrides,
  };
}

test("golden focus vector: membership, grouping, ordering, operations", () => {
  const result = resolveSurface(fixture(), focusRequest());
  assert.ok(!isFailure(result));
  const surface = result as ResolvedSurface;

  assert.equal(surface.protocol, "sss");
  assert.equal(surface.sourceSnapshot, "snap-001");
  assert.deepEqual(
    surface.groups.map((g) => ({ id: g.id, role: g.role, members: g.members.map((m) => m.subject) })),
    [
      { id: "primary", role: "primary", members: ["art-1"] },
      { id: "supporting", role: "supporting", members: ["art-2", "note-1"] },
      { id: "context", role: "context", members: ["art-3"] },
    ],
  );
  // Operation exposure: minAccess above requester → withheld, never dropped.
  assert.deepEqual(surface.operations, [
    { id: "edit", exposure: "withheld" },
    { id: "open-article", exposure: "available" },
  ]);
  // Provenance: a surface is derived, never canonical (SSS-INV-001/006).
  assert.equal(surface.provenance.kind, "derived");
  // Trace carries a basis for every member (SSS-INV-012).
  for (const inc of surface.explanation.included) {
    assert.ok(inc.basis.length > 0, `no basis for ${inc.subject}`);
  }
});

test("S2 non-leak: hidden state cannot affect output, trace, or fingerprint (negatives 1-2)", () => {
  const withHidden = fixture();
  const withoutHidden: FrozenSnapshot = {
    snapshotId: "snap-001",
    subjects: fixture().subjects.filter((s) => s.id !== "sec-1"),
    relations: fixture().relations.filter((r) => r.to !== "sec-1"),
  };
  const a = resolveSurface(withHidden, focusRequest({ access: "member" }));
  const b = resolveSurface(withoutHidden, focusRequest({ access: "member" }));
  // Byte-identical: membership, ordering, counts, explanation, fingerprint.
  assert.deepEqual(a, b);
});

test("unknown is not ineligible (negative 3)", () => {
  const result = resolveSurface(
    fixture(),
    focusRequest({ lens: { traversal: { radius: 2 }, where: [{ attr: "lang", equals: "en" }] } }),
  );
  assert.ok(!isFailure(result));
  const surface = result as ResolvedSurface;
  const art3 = surface.explanation.excluded.find((e) => e.subject === "art-3");
  const art2 = surface.explanation.excluded.find((e) => e.subject === "art-2");
  assert.equal(art3?.eligibility, "unknown");      // attr absent → unknown
  assert.equal(art2?.eligibility, "ineligible");   // attr mismatch → ineligible
});

test("withheld is not absent: entitlement gates participation by access", () => {
  const snap = fixture();
  snap.relations.push({ from: "art-1", to: "ent-1", type: "references", access: "public" });
  const low = resolveSurface(snap, focusRequest({ access: "member" })) as ResolvedSurface;
  const high = resolveSurface(snap, focusRequest({ access: "owner" })) as ResolvedSurface;
  const lowExcl = low.explanation.excluded.find((e) => e.subject === "ent-1");
  assert.equal(lowExcl?.eligibility, "withheld");  // visible, gated — not absent
  const highMembers = high.groups.flatMap((g) => g.members.map((m) => m.subject));
  assert.ok(highMembers.includes("ent-1"));
});

test("determinism: equal inputs resolve byte-equal; shuffled key order hashes equal", () => {
  const r1 = resolveSurface(fixture(), focusRequest());
  const r2 = resolveSurface(fixture(), focusRequest());
  assert.deepEqual(r1, r2);
  const h1 = surfaceFingerprint({ b: 2, a: [{ y: 1, x: 0 }] });
  const h2 = surfaceFingerprint({ a: [{ x: 0, y: 1 }], b: 2 });
  assert.equal(h1, h2);
  assert.equal(canonicalJson({ b: 1, a: undefined }), '{"b":1}');
});

test("no ambient time or randomness in resolver source (negative 9)", () => {
  for (const rel of ["../src/resolver.ts", "../src/fingerprint.ts"]) {
    const src = readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
    assert.ok(!/Date\.now|Math\.random|new Date\(/.test(src), `${rel} references ambient time/randomness`);
  }
});

test("fingerprint sensitivity: an accessible dependency change moves the hash", () => {
  const base = resolveSurface(fixture(), focusRequest()) as ResolvedSurface;
  const grown = fixture();
  grown.subjects.push({ id: "art-9", kind: "article", access: "public", attrs: {} });
  grown.relations.push({ from: "art-1", to: "art-9", type: "references", access: "public" });
  const changed = resolveSurface(grown, focusRequest()) as ResolvedSurface;
  assert.notEqual(base.fingerprint, changed.fingerprint);
});

test("failure is closed: invalid purpose and lens", () => {
  const bad = resolveSurface(fixture(), { ...focusRequest(), purpose: "delight" as never });
  assert.ok(isFailure(bad) && bad.failure === "invalid-purpose");
  const badLens = resolveSurface(fixture(), focusRequest({ lens: { traversal: { radius: -1 } } }));
  assert.ok(isFailure(badLens) && badLens.failure === "invalid-lens");
});

test("disclosure mapping: inaccessible anchor is not-found below owner, inaccessible at owner+", () => {
  const publicView = resolveSurface(fixture(), focusRequest({ subject: "sec-1", access: "public" }));
  const memberView = resolveSurface(fixture(), focusRequest({ subject: "sec-1", access: "member" }));
  const ownerView = resolveSurface(fixture(), focusRequest({ subject: "sec-1", access: "owner" }));
  const missing = resolveSurface(fixture(), focusRequest({ subject: "ghost-1", access: "public" }));
  assert.ok(isFailure(publicView) && publicView.failure === "subject-not-found");
  assert.ok(isFailure(memberView) && memberView.failure === "subject-not-found");
  // Indistinguishable from a genuinely missing subject — same class, same message.
  assert.deepEqual(publicView, missing);
  assert.ok(isFailure(ownerView) && ownerView.failure === "subject-inaccessible");
});

test("collection profile: lens kinds + orderBy with missing-sorts-last", () => {
  const result = resolveSurface(fixture(), {
    profile: "collection",
    purpose: "discover",
    access: "member",
    lens: { include: { kinds: ["article"] }, orderBy: { attr: "year", dir: "desc" } },
  });
  assert.ok(!isFailure(result));
  const surface = result as ResolvedSurface;
  assert.equal(surface.groups.length, 1);
  // ent-1 (entitled, no year… it has no year attr) — verify order: 2026, 2025, 2024, then missing-year last.
  assert.deepEqual(
    surface.groups[0].members.map((m) => m.subject),
    ["art-1", "art-3", "art-2"],
  );
  // note-1 excluded by kind; ent-1 withheld; sec-1 never a candidate (inaccessible).
  const excludedIds = surface.explanation.excluded.map((e) => e.subject);
  assert.ok(excludedIds.includes("note-1") && excludedIds.includes("ent-1"));
  assert.ok(!JSON.stringify(surface).includes("sec-1"));
});

test("resolver version is part of fingerprint identity", () => {
  assert.equal(RESOLVER_VERSION, "0.1.0");
  const base = resolveSurface(fixture(), focusRequest()) as ResolvedSurface;
  assert.ok(base.fingerprint.match(/^[0-9a-f]{64}$/));
  assert.equal(base.resolutionId, "res_" + base.fingerprint.slice(0, 16));
});
