/**
 * SCMS-063 vectors: the live channel tells each client only what it may hear.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CanonJournal } from "../../canon/src/journal.ts";
import {
  ContractRegistry, CONTENT_CREATE, createHandler, CONTENT_REVISE, reviseHandler,
} from "../../contracts/src/runtime.ts";
import { CONTENT_PROMOTE, promoteHandler } from "../../qualification/src/promote.ts";
import {
  RECORD_EVIDENCE, recordEvidenceHandler, ATTEST, attestHandler,
} from "../../qualification/src/canon-evidence.ts";
import { openLiveChannel } from "../server/live.ts";

const OWNER = { id: "project.owner", role: "owner" };
const AT = "2026-08-29T00:00:00Z";

/** Captures what a client was actually sent. */
function fakeRes() {
  const frames: string[] = [];
  return {
    frames,
    writeHead() {}, end() {}, on() {},
    write(chunk: string) { frames.push(chunk); return true; },
    events() {
      return frames.map((f) => {
        const ev = /event: (\w+)/.exec(f)?.[1] ?? "";
        const data = /data: (.*)\n\n/.exec(f)?.[1] ?? "{}";
        return { event: ev, data: JSON.parse(data) as Record<string, unknown> };
      });
    },
  };
}

function world() {
  const journal = new CanonJournal();
  const registry = new ContractRegistry();
  registry.register(CONTENT_CREATE, createHandler);
  registry.register(CONTENT_REVISE, reviseHandler);
  registry.register(CONTENT_PROMOTE, promoteHandler as never);
  registry.register(RECORD_EVIDENCE, recordEvidenceHandler as never);
  registry.register(ATTEST, attestHandler as never);
  for (const [id, access] of [["public-1", "public"], ["private-1", "owner"]] as const) {
    registry.execute(journal, {
      contract: "icp:interaction/content.create@1.0.0", requestId: `c-${id}`, actor: OWNER,
      input: { subjectId: id, contentKind: "note", minimumAccess: access, source: "t",
               body: { kind: "Content", contentKind: "note",
                       slots: { title: [{ kind: "text", value: id }], body: [{ kind: "prose", value: "b" }] },
                       attrs: { listed: true } } },
    } as never, { occurredAt: AT, instanceId: `i-${id}`, authority: "owner" });
  }
  const logPath = join(mkdtempSync(join(tmpdir(), "scms-live-")), "actions.jsonl");
  writeFileSync(logPath, "", "utf8");
  return { journal, registry, logPath };
}

const channel = (w: ReturnType<typeof world>) => openLiveChannel({
  journal: w.journal, registry: w.registry, logPath: w.logPath,
  actor: OWNER, now: () => AT,
});

test("a connecting client is caught up, not backfilled with what it already sees", () => {
  const w = world();
  const live = channel(w);
  const res = fakeRes();
  live.attach(res as never, "c1", ["public-1"]);

  const evs = res.events();
  assert.equal(evs.length, 1, "connecting sends exactly one frame");
  assert.equal(evs[0].event, "ready");
  assert.ok(typeof evs[0].data.position === "number",
    "and states the position it is caught up to");
  live.close();
});

test("a public client is never told about an owner-scoped change (NR-scms-018)", () => {
  // The defect this vector exists for: the first version computed the wave from
  // journal.events() directly and sent every changed subject id to every
  // client, including owner-scoped evidence and attestation records.
  const w = world();
  const live = channel(w);
  const res = fakeRes();
  live.attach(res as never, "c1", ["public-1"]);

  // A qualification wave touches owner-scoped evidence and attestation records.
  appendFileSync(w.logPath, JSON.stringify({ type: "qualify", subject: "public-1" }) + "\n");
  live.pump();

  const sent = JSON.stringify(res.events());
  assert.ok(!sent.includes("evidence:"), "evidence subject ids must not reach a public client");
  assert.ok(!sent.includes("attestation:"), "nor attestation ids");
  live.close();
});

test("a client hears about a subject its page actually depends on", () => {
  const w = world();
  const live = channel(w);
  const res = fakeRes();
  live.attach(res as never, "c1", ["public-1"]);

  appendFileSync(w.logPath,
    JSON.stringify({ type: "revise", subject: "public-1",
                     changes: { slots: { title: [{ kind: "text", value: "changed" }] } } }) + "\n");
  live.pump();

  const inv = res.events().filter((e) => e.event === "invalidate");
  assert.equal(inv.length, 1);
  assert.deepEqual(inv[0].data.keys, ["public-1"]);
  live.close();
});

test("silence carries no information — a client with nothing to hear gets no frame", () => {
  const w = world();
  const live = channel(w);
  const res = fakeRes();
  // This client's page depends on nothing that is about to change.
  live.attach(res as never, "c1", ["some-other-subject"]);
  const before = res.frames.length;

  appendFileSync(w.logPath,
    JSON.stringify({ type: "revise", subject: "public-1",
                     changes: { slots: { title: [{ kind: "text", value: "changed" }] } } }) + "\n");
  live.pump();

  assert.equal(res.frames.length, before,
    "an empty notification would announce that a wave occurred");
  live.close();
});

test("the wire carries keys, never content", () => {
  const w = world();
  const live = channel(w);
  const res = fakeRes();
  live.attach(res as never, "c1", ["public-1"]);

  appendFileSync(w.logPath,
    JSON.stringify({ type: "revise", subject: "public-1",
                     changes: { slots: { title: [{ kind: "text", value: "SECRET-TITLE-TEXT" }] } } }) + "\n");
  live.pump();

  assert.ok(!JSON.stringify(res.events()).includes("SECRET-TITLE-TEXT"),
    "an invalidation names a subject; the client re-fetches through access projection");
  live.close();
});

test("a refused action produces no wave — Canon decides, not the log", () => {
  // Replay re-crosses the gates, so a log entry is a request rather than a fact.
  // Promoting without qualifying first is refused, and a reader must not be told
  // that something happened when nothing did.
  const w = world();
  const live = channel(w);
  const res = fakeRes();
  live.attach(res as never, "c1", ["public-1"]);
  const before = res.frames.length;

  appendFileSync(w.logPath, JSON.stringify({ type: "promote", subject: "public-1" }) + "\n");
  live.pump();

  assert.equal(res.frames.length, before, "a refused promotion is not a change");
  live.close();
});
