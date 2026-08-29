/**
 * SCMS-017 vectors: the six consistency states, the drafting/consequential
 * asymmetry, honest chips, and presence that expires by construction.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { CanonJournal } from "../../canon/src/journal.ts";
import type { Envelope, RecordState } from "../../canon/src/envelope.ts";
import {
  consistencyState, permits, chip, activePresence, heldLocks, CONSISTENCY_STATES, converge,
} from "../src/consistency.ts";
import type { ClientBaseline, PresenceRecord } from "../src/consistency.ts";

const STATE: RecordState = {
  semanticMaturity: "draft", evidenceState: "unqualified",
  publicationState: "unpublished", deliveryState: "unpropagated",
};

const doc = (id: string, title: string): Envelope => ({
  schemaVersion: "scms-0.1", subjectId: id,
  compatibility: { protocol: "scms-0.1", subjectSchema: "article@1" },
  provenance: { kind: "declared", authority: "project.owner", source: "test" },
  minimumAccess: "public", body: { kind: "Content", contentKind: "article", title }, state: STATE,
});

const baseline = (rev: string, over: Partial<ClientBaseline> = {}): ClientBaseline => ({
  subjectId: "art-1", atRevision: rev, hasLocalEdits: false, baselineEstablished: true,
  observedCanonEntries: 1, ...over,
});

test("current: the held revision is the current revision", () => {
  const j = new CanonJournal();
  const v1 = j.append(doc("art-1", "first"), "t");
  const a = consistencyState(baseline(v1.envelope.revision!), j);
  assert.equal(a.state, "current");
  assert.equal(permits(a.state, "draft"), true);
  assert.equal(permits(a.state, "consequential"), true);
});

test("stale-but-safe: canon advanced elsewhere — disclosed, but publishing still allowed", () => {
  const j = new CanonJournal();
  const v1 = j.append(doc("art-1", "first"), "t");
  // The client saw one entry; an unrelated record then landed.
  j.append(doc("art-2", "other"), "t");

  const a = consistencyState(baseline(v1.envelope.revision!, { observedCanonEntries: 1 }), j);
  assert.equal(a.state, "stale-but-safe");
  assert.match(a.reason, /advanced by 1 entry/);
  assert.equal(permits(a.state, "draft"), true);
  assert.equal(permits(a.state, "consequential"), true, "safe staleness does not freeze publishing");

  // A client that has caught up is simply current.
  const caught = consistencyState(baseline(v1.envelope.revision!, { observedCanonEntries: 2 }), j);
  assert.equal(caught.state, "current");
});

test("conflicted freezes consequential action while drafting continues — the asymmetry", () => {
  const j = new CanonJournal();
  const v1 = j.append(doc("art-1", "first"), "editor-a");
  j.supersede(v1.envelope.revision!, doc("art-1", "remote edit"), "editor-b");

  const a = consistencyState(baseline(v1.envelope.revision!, { hasLocalEdits: true, observedCanonEntries: 2 }), j);
  assert.equal(a.state, "conflicted");
  assert.ok(a.successor, "the successor is named so the client can converge");
  assert.equal(permits(a.state, "draft"), true, "a CMS that blocks typing on conflict is unusable");
  assert.equal(permits(a.state, "consequential"), false, "one that publishes through conflict is lying");
});

test("superseded directs to the successor; revoked stops", () => {
  const j = new CanonJournal();
  const v1 = j.append(doc("art-1", "first"), "t");
  const v2 = j.supersede(v1.envelope.revision!, doc("art-1", "second"), "t");
  const sup = consistencyState(baseline(v1.envelope.revision!, { observedCanonEntries: 2 }), j);
  assert.equal(sup.state, "superseded");
  assert.equal(sup.successor, v2.envelope.revision);
  assert.equal(permits(sup.state, "draft"), false);
  assert.equal(permits(sup.state, "consequential"), false);

  const j2 = new CanonJournal();
  const r1 = j2.append(doc("art-9", "x"), "t");
  j2.revoke(r1.envelope.revision!, "project.owner");
  const rev = consistencyState({ ...baseline(r1.envelope.revision!), subjectId: "art-9" }, j2);
  assert.equal(rev.state, "revoked");
  assert.equal(permits(rev.state, "consequential"), false);
});

test("unknown never passes as current and stops at the protected boundary", () => {
  const j = new CanonJournal();
  const v1 = j.append(doc("art-1", "first"), "t");

  const noBaseline = consistencyState(baseline(v1.envelope.revision!, { baselineEstablished: false }), j);
  assert.equal(noBaseline.state, "unknown");
  const unknownRev = consistencyState(baseline("sha256:nowhere"), j);
  assert.equal(unknownRev.state, "unknown");

  for (const u of [noBaseline, unknownRev]) {
    assert.equal(permits(u.state, "consequential"), false, "unknown must stop at the protected boundary");
    assert.equal(permits(u.state, "draft"), true, "local drafting may continue");
  }
});

test("all six states are reachable and distinct", () => {
  assert.equal(new Set(CONSISTENCY_STATES).size, 6);
  assert.deepEqual([...CONSISTENCY_STATES].sort(),
    ["conflicted", "current", "revoked", "stale-but-safe", "superseded", "unknown"]);
});

test("chips disclose truthfully and never claim live without a check", () => {
  const base = { nowMs: 10_000, snapshotLabel: "Aug 27" };
  assert.equal(chip("current", { ...base, lastCheckedMs: 6_000 }), "live · checked 4s ago");
  assert.equal(chip("current", { ...base, lastCheckedMs: null }), "snapshot · Aug 27");
  assert.equal(chip("stale-but-safe", { ...base, lastCheckedMs: 6_000, revisionsSinceBaseline: 2 }),
    "+2 revisions since snapshot");
  assert.equal(chip("current", { ...base, lastCheckedMs: 6_000, hasLocalEdits: true }), "local · unsent");
  assert.equal(chip("conflicted", { ...base, lastCheckedMs: 6_000 }), "conflicted — review");
  assert.equal(chip("revoked", { ...base, lastCheckedMs: 6_000 }), "revoked — no longer available");
  assert.equal(chip("superseded", { ...base, lastCheckedMs: 6_000 }), "superseded — open the current version");
  assert.match(chip("unknown", { ...base, lastCheckedMs: 6_000 }), /^unknown — /);
});

test("presence expires by construction: ghost cursors and stuck locks are impossible", () => {
  const records: PresenceRecord[] = [
    { actorId: "human-1", subjectId: "art-1", mode: "editing", observedAtMs: 0, expiresAtMs: 10_000, claimsLock: true },
    { actorId: "agent-1", subjectId: "art-1", mode: "writing", observedAtMs: 0, expiresAtMs: 5_000 },
    { actorId: "ghost-1", subjectId: "art-1", mode: "editing", observedAtMs: 0, expiresAtMs: 1_000, claimsLock: true },
  ];
  // At t=6s the ghost's record has expired: it is simply not present, and its
  // lock claim cannot be honoured.
  const active = activePresence(records, 6_000);
  assert.deepEqual(active.map((r) => r.actorId), ["human-1"]);
  assert.deepEqual(heldLocks(records, 6_000), [{ subjectId: "art-1", holder: "human-1" }]);

  // At t=11s every record has expired — the soft lock self-released with no
  // cleanup job and no explicit release call.
  assert.deepEqual(activePresence(records, 11_000), []);
  assert.deepEqual(heldLocks(records, 11_000), []);

  // Actor kinds stay distinguishable: agents batch-write, humans edit.
  assert.equal(records[1].mode, "writing");
  assert.equal(records[0].mode, "editing");
});

test("no ambient time or randomness: every clock is an input", async () => {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const src = readFileSync(fileURLToPath(new URL("../src/consistency.ts", import.meta.url)), "utf8");
  assert.ok(!/Date\.now|Math\.random|new Date\(\)/.test(src));
});


// ── SCMS-048: the converge step §8.6 names and nothing implemented ──────────

test("converging acknowledges remote activity and leaves the client current", () => {
  const j = new CanonJournal();
  const v1 = j.append(doc("art-1", "first"), "t");
  j.append(doc("art-2", "other"), "t");
  const b = baseline(v1.envelope.revision!, { observedCanonEntries: 1 });
  assert.equal(consistencyState(b, j).state, "stale-but-safe");

  const r = converge(b, j);
  assert.ok(r.converged);
  assert.equal(r.acknowledged, 1, "it acknowledged the entry that landed elsewhere");
  assert.equal(consistencyState(r.baseline, j).state, "current",
    "which is what §8.6's '✓ after converge' requires to mean anything");
});

test("converging does not resolve what catching up cannot resolve", () => {
  // A converge that silently adopted a successor or revived a revoked record
  // would be a quiet widening of what the word means.
  const j = new CanonJournal();
  const v1 = j.append(doc("art-1", "first"), "editor-a");
  const v2 = j.supersede(v1.envelope.revision!, doc("art-1", "remote"), "editor-b");

  const conflicted = converge(baseline(v1.envelope.revision!, { hasLocalEdits: true }), j);
  assert.equal(conflicted.converged, false);
  assert.match((conflicted as { reason: string }).reason, /conflicted/);

  const superseded = converge(baseline(v1.envelope.revision!), j);
  assert.equal(superseded.converged, false);
  assert.match((superseded as { reason: string }).reason, /superseded/);

  j.revoke(v2.envelope.revision!, "t");
  const revoked = converge(baseline(v2.envelope.revision!), j);
  assert.equal(revoked.converged, false);
  assert.match((revoked as { reason: string }).reason, /revoked/);

  const unknown = converge(baseline(v1.envelope.revision!, { baselineEstablished: false }), j);
  assert.equal(unknown.converged, false);
  assert.match((unknown as { reason: string }).reason, /unknown/);
});

test("converging when already current is refused, not a silent no-op", () => {
  const j = new CanonJournal();
  const v1 = j.append(doc("art-1", "first"), "t");
  const r = converge(baseline(v1.envelope.revision!), j);
  assert.equal(r.converged, false);
  assert.match((r as { reason: string }).reason, /already current/);
});

test("converge does not change what permits() allows — that flip stays the owner's", () => {
  // SH-17 asks whether lag should gate promotion. This supplies the mechanism
  // that question depends on and deliberately leaves the answer alone, so the
  // register keeps describing the behaviour the system actually has.
  assert.equal(permits("stale-but-safe", "consequential"), true);
  assert.equal(permits("conflicted", "consequential"), false);
});
