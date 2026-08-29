/**
 * SCMS-033/034 vectors: delivery, replay, and honest lag.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { CanonJournal } from "../../canon/src/journal.ts";
import type { Envelope } from "../../canon/src/envelope.ts";
import { deliver, catchUp } from "../src/wire.ts";
import type { Connection } from "../src/wire.ts";

const doc = (id: string, title: string, access: "public" | "owner" = "public"): Envelope => ({
  schemaVersion: "scms-0.1", subjectId: id,
  compatibility: { protocol: "scms-0.1", subjectSchema: "article@1" },
  provenance: { kind: "declared", authority: "project.owner", source: "t" },
  minimumAccess: access,
  body: { kind: "Content", contentKind: "article", slots: { title: [{ kind: "text", value: title }] } },
  state: { semanticMaturity: "draft", evidenceState: "unqualified",
           publicationState: "unpublished", deliveryState: "unpropagated" },
} as Envelope);

/** A world with two visible subjects and one the subscriber cannot see. */
function world() {
  const j = new CanonJournal();
  j.append(doc("a", "A"), "t");
  j.append(doc("b", "B"), "t");
  j.append(doc("secret", "S", "owner"), "t");
  return j;
}
const conn = (lastEventId: number | null, over: Partial<Connection> = {}): Connection => ({
  subscription: { id: "sub-1", access: "public", dependencies: ["a", "b"] },
  lastEventId, ...over,
});

test("a new subscriber gets a backfill burst of everything it may see", () => {
  const j = world();
  const d = deliver(j, conn(null))!;
  assert.equal(d.phase, "backfill");
  assert.deepEqual(d.keys, ["a", "b"]);
  assert.equal(d.cursor, 1, "the cursor stops at the last RELEVANT event, not the last event");
});

test("a caught-up subscriber hears nothing, and silence carries no information", () => {
  const j = world();
  const first = deliver(j, conn(null))!;
  assert.equal(deliver(j, conn(first.cursor)), null);

  // A change it cannot see produces no message at all — not an empty one.
  const secret = j.current().find((e) => e.envelope.subjectId === "secret")!;
  j.supersede(secret.envelope.revision!, doc("secret", "S2", "owner"), "t");
  assert.equal(deliver(j, conn(first.cursor)), null,
    "an empty notification would itself announce that a wave occurred");
});

test("live delivery follows backfill", () => {
  const j = world();
  const first = deliver(j, conn(null))!;
  const a = j.current().find((e) => e.envelope.subjectId === "a")!;
  j.supersede(a.envelope.revision!, doc("a", "A2"), "t");

  const d = deliver(j, conn(first.cursor))!;
  assert.equal(d.phase, "live");
  assert.deepEqual(d.keys, ["a"]);
});

test("replay from any cursor loses nothing a subscriber may see", () => {
  const j = world();
  for (let i = 0; i < 6; i++) {
    const a = j.current().find((e) => e.envelope.subjectId === "a")!;
    j.supersede(a.envelope.revision!, doc("a", `A${i}`), "t");
  }
  const everyVisible = j.events().filter((e) => ["a", "b"].includes(e.subjectId)).map((e) => e.eventId);

  for (const start of [null, ...j.events().map((e) => e.eventId)]) {
    const { deliveries } = catchUp(j, conn(start));
    const covered = new Set<number>();
    for (const d of deliveries) {
      for (const id of everyVisible) if (id > (start ?? -1) && id <= d.cursor) covered.add(id);
    }
    const missed = everyVisible.filter((id) => id > (start ?? -1) && !covered.has(id));
    assert.deepEqual(missed, [], `replay from ${start} missed ${missed.join(",")}`);
  }
});

test("a lagged subscriber is told so, and told how to recover", () => {
  const j = world();
  for (let i = 0; i < 10; i++) {
    const a = j.current().find((e) => e.envelope.subjectId === "a")!;
    j.supersede(a.envelope.revision!, doc("a", `A${i}`), "t");
  }
  const d = deliver(j, conn(null), { maxBurst: 3 })!;
  assert.equal(d.phase, "lagged");
  assert.equal(d.lag!.recovery, "catch-up-then-live");
  assert.ok(d.lag!.behind > 0);
  // Staleness as a protocol message, not as a silent gap.
});

test("catch-up-then-live is executable, and ends in a non-lagged phase", () => {
  const j = world();
  for (let i = 0; i < 10; i++) {
    const a = j.current().find((e) => e.envelope.subjectId === "a")!;
    j.supersede(a.envelope.revision!, doc("a", `A${i}`), "t");
  }
  const { deliveries, connection } = catchUp(j, conn(null), { maxBurst: 3 });
  assert.ok(deliveries.length > 1);
  assert.equal(deliveries[deliveries.length - 1].phase !== "lagged", true, "it terminates caught up");
  assert.equal(deliver(j, connection, { maxBurst: 3 }), null, "and then there is nothing left to say");
});

test("lag is measured in what the subscriber may see, not in what happened", () => {
  const j = world();
  // A hundred changes to a subject this subscriber cannot see.
  for (let i = 0; i < 100; i++) {
    const s = j.current().find((e) => e.envelope.subjectId === "secret")!;
    j.supersede(s.envelope.revision!, doc("secret", `S${i}`, "owner"), "t");
  }
  const d = deliver(j, conn(null), { maxBurst: 5 })!;
  assert.equal(d.phase, "backfill", "not lagged — only two events were ever this subscriber's business");
  assert.equal(d.lag, undefined);
  assert.deepEqual(d.keys, ["a", "b"]);
  // Reporting "you are 100 behind" here would turn the lag disclosure into a
  // side channel for global write volume — the same inference SCMS-026 closed
  // by sending silence rather than empty notifications.
});

test("a lens narrows and can never widen", () => {
  const j = world();
  const unlensed = deliver(j, conn(null))!;
  const lensed = deliver(j, conn(null, { lens: { subjects: ["a"] } }))!;
  assert.deepEqual(unlensed.keys, ["a", "b"]);
  assert.deepEqual(lensed.keys, ["a"]);
  assert.ok(lensed.keys.every((k) => unlensed.keys.includes(k)));

  // A lens naming a subject outside the dependency set grants nothing.
  const overreaching = deliver(j, conn(null, { lens: { subjects: ["a", "secret"] } }))!;
  assert.deepEqual(overreaching.keys, ["a"], "the lens cannot reach past access");
});

test("an action lens filters by change kind without widening reach", () => {
  const j = world();
  const a = j.current().find((e) => e.envelope.subjectId === "a")!;
  j.supersede(a.envelope.revision!, doc("a", "A2"), "t");

  const appendsOnly = deliver(j, conn(null, { lens: { actions: ["append"] } }))!;
  assert.deepEqual(appendsOnly.keys, ["a", "b"]);
  const supersedesOnly = deliver(j, conn(null, { lens: { actions: ["supersede"] } }))!;
  assert.deepEqual(supersedesOnly.keys, ["a"]);
});

test("the wire carries keys, never content", () => {
  const j = new CanonJournal();
  j.append(doc("a", "A Very Distinctive Title"), "t");
  const d = deliver(j, conn(null))!;
  assert.ok(!JSON.stringify(d).includes("A Very Distinctive Title"),
    "a client re-fetches through access projection; the wire must not shortcut it");
  assert.deepEqual(d.keys, ["a"]);
});
