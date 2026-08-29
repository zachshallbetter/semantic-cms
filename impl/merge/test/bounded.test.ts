/**
 * SCMS-021 vectors: the bounded lane merges within declared bounds and refuses
 * past them — never choosing a silent winner.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeBounded } from "../src/bounded.ts";
import type { CompositionState } from "../src/bounded.ts";
import { HOME_COMPOSITION } from "../../schema/src/schema.ts";

const base: CompositionState = {
  compositionId: "home",
  sockets: { hero: [{ block: "article-card", ref: "art-1" }], rail: [{ block: "note-card", ref: "note-1" }] },
};

const withRail = (refs: string[]): CompositionState => ({
  compositionId: "home",
  sockets: {
    hero: [{ block: "article-card", ref: "art-1" }],
    rail: refs.map((r) => ({ block: "note-card", ref: r })),
  },
});

test("disjoint edits merge cleanly and the result validates", () => {
  const a = withRail(["note-1", "note-2"]);          // editor A adds note-2
  const b = withRail(["note-1", "note-3"]);          // editor B adds note-3
  const r = mergeBounded(base, a, b, HOME_COMPOSITION);

  assert.equal(r.outcome, "merged");
  if (r.outcome !== "merged") return;
  assert.deepEqual(r.result.sockets.rail.map((o) => o.ref), ["note-1", "note-2", "note-3"]);
  assert.deepEqual(r.result.sockets.hero.map((o) => o.ref), ["art-1"]);
  // Both contributions are recorded even on success.
  assert.ok(r.contributions.some((c) => c.actor === "a" && c.added.includes("note-card:note-2")));
  assert.ok(r.contributions.some((c) => c.actor === "b" && c.added.includes("note-card:note-3")));
});

test("a merge that would exceed declared cardinality is conflicted, with no winner chosen", () => {
  // rail admits 0..6. A adds three, B adds three more → union of seven.
  const a = withRail(["note-1", "n2", "n3", "n4"]);
  const b = withRail(["note-1", "n5", "n6", "n7"]);
  const r = mergeBounded(base, a, b, HOME_COMPOSITION);

  assert.equal(r.outcome, "conflicted");
  if (r.outcome !== "conflicted" || r.reason !== "invariant-violated") {
    return assert.fail("expected an invariant violation");
  }
  assert.equal(r.findings[0].code, "socket-cardinality");
  assert.equal(r.findings[0].at, "rail");
  assert.match(r.findings[0].detail, /0\.\.6, got 7/);
  // The candidate is shown for review, but no merged RESULT is produced:
  // the outcome carries no `result` field at all.
  assert.ok(!("result" in r), "a conflicted merge produces no merged value");
  assert.equal(r.candidate.sockets.rail.length, 7, "the candidate is available to review");
});

test("a merge admitting a forbidden block is conflicted on the admission rule", () => {
  const a: CompositionState = {
    compositionId: "home",
    sockets: { ...base.sockets, hero: [{ block: "note-card", ref: "note-9" }] },
  };
  const r = mergeBounded(base, a, base, HOME_COMPOSITION);
  assert.equal(r.outcome, "conflicted");
  if (r.outcome !== "conflicted" || r.reason !== "invariant-violated") return assert.fail("expected violation");
  assert.equal(r.findings[0].code, "socket-block-not-admitted");
  assert.equal(r.findings[0].at, "hero");
});

test("concurrent edits to the same slot are reported, not resolved", () => {
  const a: CompositionState = {
    compositionId: "home", sockets: { ...base.sockets, hero: [{ block: "article-card", ref: "art-A" }] },
  };
  const b: CompositionState = {
    compositionId: "home", sockets: { ...base.sockets, hero: [{ block: "article-card", ref: "art-B" }] },
  };
  const r = mergeBounded(base, a, b, HOME_COMPOSITION);

  assert.equal(r.outcome, "conflicted");
  if (r.outcome !== "conflicted" || r.reason !== "contended-slot") return assert.fail("expected contention");
  assert.equal(r.contentions.length, 1);
  const c = r.contentions[0];
  assert.equal(c.socket, "hero");
  assert.equal(c.a!.ref, "art-A");
  assert.equal(c.b!.ref, "art-B");
  assert.equal(c.base!.ref, "art-1", "the common ancestor is preserved for review");
  assert.ok(!("result" in r), "the merge refuses to pick");
});

test("a conflicted result is reviewable, not an error", () => {
  const a = withRail(["note-1", "n2", "n3", "n4"]);
  const b = withRail(["note-1", "n5", "n6", "n7"]);
  const r = mergeBounded(base, a, b, HOME_COMPOSITION);
  if (r.outcome !== "conflicted") return assert.fail("expected conflict");
  // Both sides' contributions survive so a human can resolve deliberately.
  assert.ok(r.contributions.some((c) => c.actor === "a" && c.added.length === 3));
  assert.ok(r.contributions.some((c) => c.actor === "b" && c.added.length === 3));
});

test("removals from both sides compose without resurrecting content", () => {
  const start: CompositionState = {
    compositionId: "home",
    sockets: {
      hero: [{ block: "article-card", ref: "art-1" }],
      rail: [{ block: "note-card", ref: "n1" }, { block: "note-card", ref: "n2" }, { block: "note-card", ref: "n3" }],
    },
  };
  const a: CompositionState = { compositionId: "home", sockets: { ...start.sockets, rail: [{ block: "note-card", ref: "n2" }, { block: "note-card", ref: "n3" }] } };
  const b: CompositionState = { compositionId: "home", sockets: { ...start.sockets, rail: [{ block: "note-card", ref: "n1" }, { block: "note-card", ref: "n2" }] } };
  const r = mergeBounded(start, a, b, HOME_COMPOSITION);
  assert.equal(r.outcome, "merged");
  if (r.outcome !== "merged") return;
  // A removed n1, B removed n3 — neither returns.
  assert.deepEqual(r.result.sockets.rail.map((o) => o.ref), ["n2"]);
});

test("the merge is pure: it writes nothing and holds no state", async () => {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const src = readFileSync(fileURLToPath(new URL("../src/bounded.ts", import.meta.url)), "utf8");
  assert.ok(!/CanonJournal|\.append\(|\.supersede\(|Date\.now|Math\.random/.test(src),
    "the bounded lane must not touch Canon or ambient state; landing goes through content.revise@1");
});
