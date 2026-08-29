/**
 * SCMS-035 vectors: the chip is driven by the transport, not by a caller's word.
 */
import { test } from "node:test";
import assert from "node:assert/strict";


// ── SCMS-035: freshness comes from the transport (R2 meets R3) ──────────────

test("a client that never received a delivery never claims live", async () => {
  const { freshnessFrom, NEVER_CONNECTED } = await import("../src/freshness.ts");
  const { chip } = await import("../../observation/src/consistency.ts");
  const f = freshnessFrom(NEVER_CONNECTED, { nowMs: 1_000_000, snapshotLabel: "Aug 29" });
  assert.equal(f.lastCheckedMs, null);
  assert.equal(chip("current", f), "snapshot · Aug 29");
  // There is no input to freshnessFrom that yields a live claim without a
  // delivery — that is the property, not the wording.
});

test("a live delivery is a check the chip can point at", async () => {
  const { freshnessFrom } = await import("../src/freshness.ts");
  const { chip } = await import("../../observation/src/consistency.ts");
  const f = freshnessFrom(
    { connected: true, lastDelivery: { phase: "live", cursor: 12, atMs: 1_000_000 - 4000 } },
    { nowMs: 1_000_000, snapshotLabel: "Aug 29" });
  assert.equal(chip("current", f), "live · checked 4s ago");
});

test("a lagged delivery discloses the shortfall instead of claiming currency", async () => {
  const { freshnessFrom } = await import("../src/freshness.ts");
  const { chip } = await import("../../observation/src/consistency.ts");
  const f = freshnessFrom(
    { connected: true, lastDelivery: { phase: "lagged", cursor: 5, atMs: 1_000_000, behind: 37 } },
    { nowMs: 1_000_000, snapshotLabel: "Aug 29" });
  assert.equal(f.revisionsSinceBaseline, 37);
  assert.equal(chip("stale-but-safe", f), "+37 revisions since snapshot");
  assert.notEqual(chip("stale-but-safe", f).startsWith("live"), true);
});

test("a dropped connection ages the last real check rather than backdating it", async () => {
  const { freshnessFrom } = await import("../src/freshness.ts");
  const { chip } = await import("../../observation/src/consistency.ts");
  const state = { connected: false, lastDelivery: { phase: "live" as const, cursor: 3, atMs: 1_000_000 } };
  assert.equal(chip("current", freshnessFrom(state, { nowMs: 1_000_000 + 60_000, snapshotLabel: "x" })),
    "live · checked 60s ago");
  // The claim stays truthful as it decays: it says when, not that it is fresh.
});

test("local edits outrank any transport claim", async () => {
  const { freshnessFrom } = await import("../src/freshness.ts");
  const { chip } = await import("../../observation/src/consistency.ts");
  const f = freshnessFrom(
    { connected: true, lastDelivery: { phase: "live", cursor: 9, atMs: 1_000_000 } },
    { nowMs: 1_000_000, snapshotLabel: "Aug 29", hasLocalEdits: true });
  assert.equal(chip("current", f), "local · unsent");
});
