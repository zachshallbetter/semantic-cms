/**
 * SCMS-012 vectors: governed writes, typed outcomes, executable recovery,
 * optimistic concurrency, and ICP §10.5 change receipts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { CanonJournal } from "../../canon/src/journal.ts";
import type { Envelope, RecordState } from "../../canon/src/envelope.ts";
import { narrowPathRegistry, receiptDigest, CONTENT_REVISE } from "../src/runtime.ts";
import type { ExecutionRequest } from "../src/runtime.ts";
import { INSTANCE_STATES, OUTCOME_CLASSES, RECOVERY_ACTIONS } from "../src/icp.ts";

const STATE: RecordState = {
  semanticMaturity: "draft", evidenceState: "unqualified",
  publicationState: "unpublished", deliveryState: "unpropagated",
};

function article(id: string, body: Record<string, unknown> = {}): Envelope {
  return {
    schemaVersion: "scms-0.1", subjectId: id,
    compatibility: { protocol: "scms-0.1", subjectSchema: "article@1" },
    provenance: { kind: "declared", authority: "project.owner", source: "test" },
    minimumAccess: "public",
    body: { kind: "Content", contentKind: "article", title: "first", ...body },
    state: STATE,
  };
}

function setup() {
  const journal = new CanonJournal();
  const seed = journal.append(article("art-1"), "tester");
  return { journal, registry: narrowPathRegistry(), seed };
}

const ctx = { occurredAt: "2026-08-28T12:00:00Z", instanceId: "int_0001" };

function request(input: Record<string, unknown>, contract = "icp:interaction/content.revise@1.0.0"): ExecutionRequest {
  return { contract, requestId: "req_0001", actor: { id: "usr_1", role: "editor" }, input };
}

test("an unregistered contract cannot execute and writes nothing", () => {
  const { journal, registry, seed } = setup();
  const before = journal.all().length;
  const r = registry.execute(journal, request({ subjectId: "art-1" }, "icp:interaction/content.delete@9"), ctx);
  assert.equal(r.outcome, "not_found");
  assert.equal(journal.all().length, before, "no journal write");
  assert.ok(r.terminalReason, "terminal outcome without recovery must declare a reason");
  assert.equal(journal.current()[0].envelope.revision, seed.envelope.revision);
});

test("a valid revise lands a superseding revision with a verifiable receipt", () => {
  const { journal, registry, seed } = setup();
  const r = registry.execute(journal, request({
    subjectId: "art-1", expectedRevision: seed.envelope.revision, changes: { title: "second" },
  }), ctx);

  assert.equal(r.outcome, "completed");
  assert.deepEqual(r.states, ["declared", "ready", "started", "validating", "processing", "completed"]);
  assert.equal(r.verification, "none", "E1 reversible draft mutation needs no verification");

  const receipt = r.receipt!;
  assert.equal(receipt.beforeVersion, seed.envelope.revision);
  assert.equal(receipt.afterVersion, journal.current()[0].envelope.revision);
  assert.deepEqual(receipt.changes, [{ path: "/body/title", before: "first", after: "second" }]);
  assert.equal(receipt.reversibility, "reversible");
  // Integrity digest verifies over the receipt's own content.
  const { integrity, ...base } = receipt;
  assert.equal(integrity.digest, receiptDigest(base));
  assert.equal(integrity.algorithm, "sha-256");

  // Canon: appended, predecessor retained, chain intact.
  assert.equal(journal.all().length, 2);
  assert.equal(journal.get(seed.envelope.revision!)!.supersededBy, receipt.afterVersion);
  assert.equal(journal.verifyChain().valid, true);
});

test("stale expectedRevision yields conflict with recovery and writes nothing", () => {
  const { journal, registry, seed } = setup();
  // First writer wins.
  registry.execute(journal, request({
    subjectId: "art-1", expectedRevision: seed.envelope.revision, changes: { title: "second" },
  }), ctx);
  const afterFirst = journal.all().length;

  // Second writer holds the stale revision.
  const r = registry.execute(journal, request({
    subjectId: "art-1", expectedRevision: seed.envelope.revision, changes: { title: "concurrent" },
  }), { ...ctx, instanceId: "int_0002" });

  assert.equal(r.outcome, "conflict");
  assert.ok(r.states.includes("conflicted"));
  assert.equal(journal.all().length, afterFirst, "conflict wrote nothing — no partial write");
  const actions = r.recovery.map((x) => x.action);
  assert.deepEqual(actions, ["refresh_record", "review_conflict"]);
  // Recovery carries enough typed data to execute it.
  assert.equal(r.recovery[0].data.currentRevision, journal.current()[0].envelope.revision);
  assert.equal(r.recovery[1].data.expected, seed.envelope.revision);
});

test("invalid input is a typed outcome with focus_field recovery, not an error", () => {
  const { journal, registry } = setup();
  const before = journal.all().length;
  const r = registry.execute(journal, request({ subjectId: "art-1" }), ctx);
  assert.equal(r.outcome, "invalid_input");
  assert.equal(journal.all().length, before);
  assert.deepEqual(r.recovery.map((x) => x.data.field).sort(), ["changes", "expectedRevision"]);
  assert.ok(r.recovery.every((x) => x.action === "focus_field"));
});

test("every non-completed outcome carries recovery or a declared terminal reason", () => {
  const { journal, registry, seed } = setup();
  const results = [
    registry.execute(journal, request({ subjectId: "art-1" }), ctx),                                  // invalid_input
    registry.execute(journal, request({ subjectId: "x", expectedRevision: "sha256:none", changes: {} }), ctx), // not_found
    registry.execute(journal, request({}, "unregistered@1"), ctx),                                     // not_found
  ];
  for (const r of results) {
    assert.notEqual(r.outcome, "completed");
    assert.ok(r.recovery.length > 0 || r.terminalReason, `outcome ${r.outcome} has neither recovery nor reason`);
  }
  assert.equal(journal.current()[0].envelope.revision, seed.envelope.revision, "no writes from failed executions");
});

test("all emitted states, outcomes, and recovery actions are ICP-canonical", () => {
  const { journal, registry, seed } = setup();
  const results = [
    registry.execute(journal, request({ subjectId: "art-1" }), ctx),
    registry.execute(journal, request({ subjectId: "art-1", expectedRevision: seed.envelope.revision, changes: { title: "x" } }), ctx),
    registry.execute(journal, request({ subjectId: "art-1", expectedRevision: seed.envelope.revision, changes: { title: "y" } }), ctx),
  ];
  for (const r of results) {
    assert.ok((OUTCOME_CLASSES as readonly string[]).includes(r.outcome), `non-canonical outcome ${r.outcome}`);
    for (const s of r.states) assert.ok((INSTANCE_STATES as readonly string[]).includes(s), `non-canonical state ${s}`);
    for (const rec of r.recovery) {
      assert.ok((RECOVERY_ACTIONS as readonly string[]).includes(rec.action), `non-canonical recovery ${rec.action}`);
    }
  }
});

test("the registry is the write surface: the contract definition declares its effect class", () => {
  const { registry } = setup();
  const defs = registry.list();
  assert.equal(defs.length, 1, "narrow path registers exactly one contract");
  assert.equal(defs[0].id, CONTENT_REVISE.id);
  assert.equal(defs[0].effectClass, "E1");
  assert.equal(defs[0].reversibility, "reversible");
});

test("no ambient time or randomness in the contract runtime", async () => {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  for (const rel of ["../src/runtime.ts", "../src/icp.ts"]) {
    const src = readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
    assert.ok(!/Date\.now|Math\.random|new Date\(\)/.test(src), `${rel} references ambient time/randomness`);
  }
});
