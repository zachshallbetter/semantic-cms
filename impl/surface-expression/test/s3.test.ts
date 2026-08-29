/**
 * S3 cross-expression conformance vectors (SCMS-009).
 *
 * One ResolvedSurface, two materially different expressions, six preserved
 * properties — plus failing-mutation vectors proving the checker can fail
 * (a conformance instrument that cannot fail is not an instrument).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveSurface } from "../../surface-resolver/src/resolver.ts";
import { isFailure } from "../../surface-resolver/src/types.ts";
import type { FrozenSnapshot, ResolvedSurface, SurfaceRequest } from "../../surface-resolver/src/types.ts";
import { expressStructural, expressLinear, DECLARED_INVARIANCE } from "../src/expressions.ts";
import type { ExpressionArtifact } from "../src/expressions.ts";
import { checkEquivalence } from "../src/equivalence.ts";

function snapshot(): FrozenSnapshot {
  return {
    snapshotId: "snap-s3",
    subjects: [
      { id: "art-1", kind: "article", access: "public", attrs: { year: 2026 } },
      { id: "art-2", kind: "article", access: "public", attrs: { year: 2024 } },
      { id: "note-1", kind: "note", access: "member", attrs: {} },
      { id: "art-3", kind: "article", access: "public", attrs: { year: 2025 } },
      { id: "sec-1", kind: "article", access: "admin", attrs: {} },
    ],
    relations: [
      { from: "art-1", to: "art-2", type: "references", access: "public" },
      { from: "art-1", to: "note-1", type: "annotated-by", access: "member" },
      { from: "art-2", to: "art-3", type: "references", access: "public" },
      { from: "art-1", to: "sec-1", type: "references", access: "admin" },
    ],
  };
}

const request: SurfaceRequest = {
  profile: "focus", purpose: "understand", subject: "art-1", access: "member",
  lens: { traversal: { radius: 2 } },
  operations: [
    { id: "open-article", exposure: "available" },
    { id: "edit", exposure: "available", minAccess: "owner" },
  ],
};

function surface(): ResolvedSurface {
  const r = resolveSurface(snapshot(), request);
  assert.ok(!isFailure(r));
  return r as ResolvedSurface;
}

test("S3: one surface, two materially different expressions, semantics preserved", () => {
  const s = surface();
  const a = expressStructural(s);
  const b = expressLinear(s);
  const result = checkEquivalence(s, a, b, ["sec-1"]);

  assert.deepEqual(result.findings, [], "no equivalence findings expected");
  assert.equal(result.equivalent, true);
  assert.equal(result.materiallyDifferent, true);
  // The two adapters genuinely chose different shapes for the same semantics.
  assert.equal(result.morphologies["structural-web"].primary, "hero");
  assert.equal(result.morphologies["linear-voice"].primary, "utterance-run");
});

test("negative 6: role=primary does not force hero morphology", () => {
  const s = surface();
  const a = expressStructural(s);
  const b = expressLinear(s);
  // Same role, two lawful and different realizations — the invariant holds
  // because both conform while disagreeing about form.
  assert.equal(s.groups[0].role, "primary");
  assert.notEqual(a.morphology["primary"], b.morphology["primary"]);
  assert.equal(checkEquivalence(s, a, b, ["sec-1"]).equivalent, true);
});

test("access constraint: neither expression contains higher-access state", () => {
  const s = surface();
  const a = expressStructural(s);
  const b = expressLinear(s);
  assert.ok(!a.output.includes("sec-1"));
  assert.ok(!b.output.includes("sec-1"));
  assert.equal(checkEquivalence(s, a, b, ["sec-1"]).equivalent, true);
});

test("checker fails when an expression introduces a member not on the surface", () => {
  const s = surface();
  const a = expressStructural(s);
  const b = expressLinear(s);
  const tampered: ExpressionArtifact = {
    ...b,
    presentedOrder: [...b.presentedOrder, "ghost-1"],
    presentedGroups: { ...b.presentedGroups, primary: [...b.presentedGroups.primary, "ghost-1"] },
  };
  const result = checkEquivalence(s, a, tampered, ["sec-1"]);
  assert.equal(result.equivalent, false);
  assert.ok(result.findings.some((f) => f.property === "member-identity"));
});

test("checker fails when an expression silently drops a withheld operation", () => {
  const s = surface();
  const a = expressStructural(s);
  const b = expressLinear(s);
  const tampered: ExpressionArtifact = {
    ...b,
    exposedOperations: b.exposedOperations.filter((o) => o.exposure !== "withheld"),
  };
  const result = checkEquivalence(s, a, tampered, ["sec-1"]);
  assert.equal(result.equivalent, false);
  assert.ok(result.findings.some((f) => f.property === "operation-exposure"));
});

test("checker fails when an expression leaks inaccessible state", () => {
  const s = surface();
  const a = expressStructural(s);
  const leaky: ExpressionArtifact = { ...expressLinear(s), output: expressLinear(s).output + "\nsec-1 exists." };
  const result = checkEquivalence(s, a, leaky, ["sec-1"]);
  assert.equal(result.equivalent, false);
  assert.ok(result.findings.some((f) => f.property === "access-constraint"));
});

test("checker fails when an expression inverts required priority", () => {
  const s = surface();
  const a = expressStructural(s);
  const b = expressLinear(s);
  const inverted: ExpressionArtifact = { ...b, presentedOrder: [...b.presentedOrder].reverse() };
  const result = checkEquivalence(s, a, inverted, ["sec-1"]);
  assert.equal(result.equivalent, false);
  assert.ok(result.findings.some((f) => f.property === "required-priority"));
});

test("materially-different guard: two identical-shape expressions do not prove S3", () => {
  const s = surface();
  const a = expressStructural(s);
  const clone: ExpressionArtifact = { ...a, expression: "structural-web-copy" };
  const result = checkEquivalence(s, a, clone, ["sec-1"]);
  // Semantics match trivially, but S3 is unproven — the guard fires.
  assert.equal(result.materiallyDifferent, false);
  assert.ok(result.findings.some((f) => f.property === "materially-different"));
});

test("expressions consume only the surface; declared invariance is the SES profile", () => {
  const s = surface();
  // Adapters take a ResolvedSurface and nothing else — no canon, no snapshot.
  assert.equal(expressStructural.length, 1);
  assert.equal(expressLinear.length, 1);
  assert.deepEqual(DECLARED_INVARIANCE, {
    semantic: "required", behavioral: "required", actionIdentity: "required",
    structural: "bounded", morphological: "free", visual: "free",
  });
  // Explanation identity travels with both expressions.
  assert.equal(expressStructural(s).explanationRef, s.resolutionId);
  assert.equal(expressLinear(s).explanationRef, s.resolutionId);
});

test("withheld operation is exposed-as-withheld in both modalities, never dropped", () => {
  const s = surface();
  const a = expressStructural(s);
  const b = expressLinear(s);
  assert.ok(a.output.includes('data-operation="edit"') && a.output.includes("disabled"));
  assert.ok(b.output.includes("edit is withheld here"));
  assert.deepEqual(
    a.exposedOperations.find((o) => o.id === "edit"),
    { id: "edit", exposure: "withheld" },
  );
});
