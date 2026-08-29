/**
 * SCMS-012 vectors: governed writes, typed outcomes, executable recovery,
 * optimistic concurrency, and ICP §10.5 change receipts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { CanonJournal } from "../../canon/src/journal.ts";
import type { Envelope, RecordState } from "../../canon/src/envelope.ts";
import { narrowPathRegistry, receiptDigest, CONTENT_REVISE, ContractRegistry, reviseHandler } from "../src/runtime.ts";
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

const ctx = { occurredAt: "2026-08-28T12:00:00Z", instanceId: "int_0001", authority: "owner" as const };

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

// ---------------------------------------------------------------------------
// SCMS-022: declared types are load-bearing in the write path.
// ---------------------------------------------------------------------------

/** Stand-in for a declared content type: `title` is required. */
const requireTitle = (body: Record<string, unknown>) =>
  body.title === undefined || body.title === null || body.title === ""
    ? [{ code: "required-slot-missing", at: "title", detail: "slot 'title' is required" }]
    : [];

test("with a validator wired, non-conformant content is refused and nothing lands", () => {
  const { journal, registry, seed } = setup();
  const before = journal.all().length;
  const r = registry.execute(journal, request({
    subjectId: "art-1", expectedRevision: seed.envelope.revision, changes: { title: "" },
  }), { ...ctx, validateBody: requireTitle });

  assert.equal(r.outcome, "invalid_input");
  assert.equal(r.recovery[0].action, "focus_field");
  assert.equal(r.recovery[0].data.field, "title");
  assert.equal(r.recovery[0].data.code, "required-slot-missing");
  assert.equal(journal.all().length, before, "a non-conformant write lands nothing");
});

test("with a validator wired, conformant content lands normally", () => {
  const { journal, registry, seed } = setup();
  const r = registry.execute(journal, request({
    subjectId: "art-1", expectedRevision: seed.envelope.revision, changes: { title: "A real title" },
  }), { ...ctx, validateBody: requireTitle });
  assert.equal(r.outcome, "completed");
  assert.equal(journal.current()[0].envelope.revision, r.receipt!.afterVersion);
});

test("layering: the contracts package does not import the schema package", async () => {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const src = readFileSync(fileURLToPath(new URL("../src/runtime.ts", import.meta.url)), "utf8");
  assert.ok(!/from ".*schema\/src/.test(src),
    "conformance is injected as a function; contracts must not depend on schema");
});

// ── The authority gate (NR-scms-005) ────────────────────────────────────────
// Before this gate existed, every handler recorded the acting party in its
// receipt and no handler checked it: provenance was mistaken for authorization.
// These vectors hold the correction in place.

test("a contract that does not declare its authority cannot be registered", () => {
  const r = new ContractRegistry();
  assert.throws(
    () => r.register({ ...CONTENT_REVISE, minAuthority: undefined } as never, reviseHandler),
    /must declare a valid minAuthority/);
  assert.throws(
    () => r.register({ ...CONTENT_REVISE, minAuthority: "superuser" } as never, reviseHandler),
    /must declare a valid minAuthority/);
  // Types are stripped and not checked at runtime, so this must be a runtime
  // refusal or it is nothing.
});

test("an under-authorized caller is refused before the handler runs", () => {
  const { journal: j, registry } = setup();
  const before = j.all().length;
  const res = registry.execute(j, {
    contract: "icp:interaction/content.revise@1.0.0",
    requestId: "r-lowauth", actor: { id: "reader", role: "reader" },
    input: {} as never,
  }, { ...ctx, instanceId: "int_lowauth", authority: "public" });

  assert.equal(res.outcome, "blocked");
  assert.match(res.detail ?? "", /requires owner authority; caller holds public/);
  // Refused on authority, NOT on input: the input is empty, so a handler that
  // ran at all would have reported invalid_input instead. The distinction is the
  // whole point — a check that passes for the wrong reason proves nothing.
  assert.notEqual(res.outcome, "invalid_input");
  assert.deepEqual(res.recovery, [{ action: "request_access", data: {
    required: "owner", held: "public", contract: "icp:interaction/content.revise" } }]);
  assert.equal(j.all().length, before, "nothing landed");
});

test("a context with no proven authority fails closed", () => {
  const { journal: j, registry } = setup();
  const before = j.all().length;
  const res = registry.execute(j, {
    contract: "icp:interaction/content.revise@1.0.0",
    requestId: "r-noauth", actor: { id: "x", role: "x" }, input: {} as never,
  }, { occurredAt: "2026-08-29T00:00:00Z", instanceId: "int_noauth" } as never);
  assert.equal(res.outcome, "blocked");
  assert.match(res.detail ?? "", /no valid proven authority/);
  assert.equal(j.all().length, before);
});

// ── The fail-open the gate itself had (NR-scms-006) ─────────────────────────
// Found by an adversarial pass over the SCMS-031 gate. `level in ACCESS_RANK`
// walked the prototype chain, so inherited property names passed as
// authorities; the lookup then returned a function, and `function < number` is
// `NaN < number` → false, so the guard concluded "not less than required".
// The guard against unauthorized writes failed OPEN.

const PROTOTYPE_KEYS = [
  "constructor", "toString", "__proto__", "hasOwnProperty",
  "valueOf", "isPrototypeOf", "propertyIsEnumerable",
];

test("an inherited property name is not an authority", () => {
  // Each request below is otherwise VALID — real subject, real current revision,
  // well-formed changes — so the only thing that can refuse it is the authority
  // gate. Refusing a malformed request would prove nothing.
  for (const authority of PROTOTYPE_KEYS) {
    const { journal: j, registry, seed } = setup();
    const before = j.all().length;
    const res = registry.execute(j, {
      contract: "icp:interaction/content.revise@1.0.0",
      requestId: `r-${authority}`, actor: { id: "attacker", role: "anonymous" },
      input: { subjectId: "art-1", expectedRevision: seed.envelope.revision!,
               changes: { slots: { title: [{ kind: "text", value: "PWNED" }] } } },
    }, { ...ctx, instanceId: `int-${authority}`, authority: authority as never });

    assert.equal(res.outcome, "blocked", `authority '${authority}' was accepted`);
    assert.equal(j.all().length, before, `authority '${authority}' landed a write`);
  }
});

test("an inherited property name is not a declarable minAuthority", () => {
  for (const key of PROTOTYPE_KEYS) {
    const r = new ContractRegistry();
    assert.throws(
      () => r.register({ ...CONTENT_REVISE, minAuthority: key } as never, reviseHandler),
      /must declare a valid minAuthority/,
      `minAuthority '${key}' was accepted`);
  }
});

test("a non-string authority is refused rather than coerced", () => {
  for (const authority of [null, undefined, 0, 2, true, {}, []]) {
    const { journal: j, registry, seed } = setup();
    const before = j.all().length;
    const res = registry.execute(j, {
      contract: "icp:interaction/content.revise@1.0.0",
      requestId: "r-nonstring", actor: { id: "x", role: "x" },
      input: { subjectId: "art-1", expectedRevision: seed.envelope.revision!,
               changes: { slots: { title: [{ kind: "text", value: "X" }] } } },
    }, { ...ctx, instanceId: "int-nonstring", authority: authority as never });
    assert.equal(res.outcome, "blocked", `authority ${JSON.stringify(authority)} was accepted`);
    assert.equal(j.all().length, before);
  }
  // Note `2` in that list: it is the numeric rank of "owner". A guard that
  // compared ranks without checking the input was a declared level would have
  // let it through.
});

test("the legitimate owner path still works — the gate is not refusing everything", () => {
  const { journal: j, registry, seed } = setup();
  const res = registry.execute(j, {
    contract: "icp:interaction/content.revise@1.0.0",
    requestId: "r-ok", actor: { id: "owner", role: "owner" },
    input: { subjectId: "art-1", expectedRevision: seed.envelope.revision!,
             changes: { slots: { title: [{ kind: "text", value: "Revised" }] } } },
  }, { ...ctx, instanceId: "int-ok", authority: "owner" });
  assert.equal(res.outcome, "completed");
  assert.equal(j.all().length, 2);
});
