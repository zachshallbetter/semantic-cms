/**
 * SCMS-026 vectors: fan-out tells the right subscribers and stays silent to
 * the rest — including the fan-out non-leak.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fanOut } from "../src/fanout.ts";
import type { Subscription } from "../src/fanout.ts";

/** Two viewers of the same subject at different access levels. */
const subs: Subscription[] = [
  { id: "sub-member", access: "member", dependencies: ["art-1", "art-2", "ent-1"] },
  { id: "sub-owner", access: "owner", dependencies: ["art-1", "art-2", "ent-1"] },
  { id: "sub-elsewhere", access: "member", dependencies: ["other-9"] },
];

test("a subscriber whose set contains the change is told, naming it", () => {
  const out = fanOut(subs, ["art-2"]);
  assert.deepEqual(out, [
    { subscriptionId: "sub-member", keys: ["art-2"] },
    { subscriptionId: "sub-owner", keys: ["art-2"] },
  ]);
});

test("a subscriber with nothing to hear receives silence, not an empty message", () => {
  const out = fanOut(subs, ["art-2"]);
  assert.ok(!out.some((i) => i.subscriptionId === "sub-elsewhere"),
    "an empty notification would itself signal that a wave occurred");
});

test("fan-out non-leak: an invisible change produces byte-identical output", () => {
  // sec-1 is admin-only, so it appears in no subscriber's dependency set.
  const withChange = fanOut(subs, ["sec-1"]);
  const withoutChange = fanOut(subs, []);
  assert.deepEqual(withChange, withoutChange);
  assert.equal(JSON.stringify(withChange), JSON.stringify(withoutChange));
  assert.equal(withChange.length, 0, "nobody is told about a change nobody can see");
});

test("a mixed wave tells each subscriber only what it may know", () => {
  const out = fanOut(subs, ["sec-1", "art-1", "other-9"]);
  assert.deepEqual(out, [
    { subscriptionId: "sub-elsewhere", keys: ["other-9"] },
    { subscriptionId: "sub-member", keys: ["art-1"] },
    { subscriptionId: "sub-owner", keys: ["art-1"] },
  ]);
  // sec-1 appears in nobody's keys, at any access level.
  assert.ok(!JSON.stringify(out).includes("sec-1"));
});

test("subscriptions at different access levels are decided independently", () => {
  const asymmetric: Subscription[] = [
    { id: "low", access: "member", dependencies: ["art-1"] },
    { id: "high", access: "owner", dependencies: ["art-1", "sec-1"] },   // owner can see sec-1
  ];
  const out = fanOut(asymmetric, ["sec-1"]);
  assert.deepEqual(out, [{ subscriptionId: "high", keys: ["sec-1"] }]);
  assert.ok(!out.some((i) => i.subscriptionId === "low"));
});

test("fan-out is pure and performs no access comparison of its own", async () => {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const src = readFileSync(fileURLToPath(new URL("../src/fanout.ts", import.meta.url)), "utf8");
  const code = src.replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.ok(!/ACCESS_RANK|minimumAccess|\.access\s*[<>=]/.test(code),
    "correctness must follow from the post-access dependency set, not a second check");
  assert.ok(!/Date\.now|Math\.random|await |fetch\(/.test(code), "no ambient state, no transport");
});
