/**
 * SCMS-052 vectors: replaying owner actions through the contracts.
 *
 * `replayActions` became load-bearing the moment the site depended on it to
 * show promoted content, and it was carrying only interaction evidence. These
 * raise it to the rung the rest of the system sits at.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync } from "node:fs";
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
import { replayActions } from "../server/replay.ts";

const OWNER = { id: "project.owner", role: "owner" };
const AT = "2026-08-29T00:00:00Z";

function world() {
  const journal = new CanonJournal();
  const registry = new ContractRegistry();
  registry.register(CONTENT_CREATE, createHandler);
  registry.register(CONTENT_REVISE, reviseHandler);
  registry.register(CONTENT_PROMOTE, promoteHandler as never);
  registry.register(RECORD_EVIDENCE, recordEvidenceHandler as never);
  registry.register(ATTEST, attestHandler as never);

  registry.execute(journal, {
    contract: "icp:interaction/content.create@1.0.0", requestId: "c1", actor: OWNER,
    input: { subjectId: "art-1", contentKind: "article", minimumAccess: "public",
             source: "test",
             body: { kind: "Content", contentKind: "article",
                     slots: { title: [{ kind: "text", value: "One" }] }, attrs: { listed: true } } },
  } as never, { occurredAt: AT, instanceId: "i1", authority: "owner" });
  return { journal, registry };
}

const logWith = (actions: unknown[]) => {
  const path = join(mkdtempSync(join(tmpdir(), "scms-replay-")), "actions.jsonl");
  writeFileSync(path, actions.map((a) => JSON.stringify(a)).join("\n") + "\n", "utf8");
  return path;
};

test("replaying qualify then promote publishes, through the contracts", () => {
  const { journal, registry } = world();
  const path = logWith([{ type: "qualify", subject: "art-1" }, { type: "promote", subject: "art-1" }]);

  const report = replayActions(journal, registry, path, OWNER, AT);
  assert.equal(report.applied, 2);
  assert.deepEqual(report.refused, []);
  assert.equal(
    journal.current().find((e) => e.envelope.subjectId === "art-1")!.envelope.state.publicationState,
    "promoted");
});

test("promoting without qualifying first is REFUSED, not silently applied", () => {
  // The control that proves replay crosses the gates rather than restoring
  // state. A log entry cannot smuggle in what the contracts would refuse.
  const { journal, registry } = world();
  const path = logWith([{ type: "promote", subject: "art-1" }]);

  const report = replayActions(journal, registry, path, OWNER, AT);
  assert.equal(report.applied, 0);
  assert.equal(report.refused.length, 1);
  assert.equal(report.refused[0].type, "promote");
  assert.notEqual(report.refused[0].outcome, "completed");
  assert.equal(
    journal.current().find((e) => e.envelope.subjectId === "art-1")!.envelope.state.publicationState,
    "unpublished", "and nothing was published");
});

test("a refusal is counted and reported, never swallowed", () => {
  const { journal, registry } = world();
  const path = logWith([
    { type: "promote", subject: "art-1" },              // refused: no attestation
    { type: "qualify", subject: "art-1" },              // applies
    { type: "promote", subject: "art-1" },              // applies
  ]);
  const report = replayActions(journal, registry, path, OWNER, AT);
  assert.equal(report.applied, 2);
  assert.equal(report.refused.length, 1);
  assert.ok(report.refused[0].outcome.length > 0, "the refusal carries its outcome class");
});

test("an action for a subject that does not exist is skipped, not an error", () => {
  const { journal, registry } = world();
  const before = journal.all().length;
  const report = replayActions(journal, registry, logWith([{ type: "qualify", subject: "ghost" }]), OWNER, AT);
  assert.equal(report.applied, 0);
  assert.deepEqual(report.refused, []);
  assert.equal(journal.all().length, before, "and it landed nothing");
});

test("a revise replays as a governed write and appends a revision", () => {
  const { journal, registry } = world();
  const before = journal.all().length;
  const path = logWith([{ type: "revise", subject: "art-1",
    changes: { slots: { title: [{ kind: "text", value: "Two" }] } } }]);

  assert.equal(replayActions(journal, registry, path, OWNER, AT).applied, 1);
  assert.equal(journal.all().length, before + 1, "append-only: a revision, not an edit");
  const body = journal.current().find((e) => e.envelope.subjectId === "art-1")!
    .envelope.body as unknown as { slots: { title: Array<{ value: string }> } };
  assert.equal(body.slots.title[0].value, "Two");
});

test("a missing log is not an error — a first run has nothing to replay", () => {
  const { journal, registry } = world();
  const report = replayActions(journal, registry, "/nonexistent/actions.jsonl", OWNER, AT);
  assert.deepEqual(report, { applied: 0, refused: [] });
});

test("replay emits, like every other governed write", () => {
  const { journal, registry } = world();
  const before = journal.events().length;
  replayActions(journal, registry,
    logWith([{ type: "qualify", subject: "art-1" }, { type: "promote", subject: "art-1" }]),
    OWNER, AT);
  assert.ok(journal.events().length > before,
    "replayed actions are writes, and nothing happens without an emission");
  assert.equal(journal.events().length, journal.receipts().length);
});
