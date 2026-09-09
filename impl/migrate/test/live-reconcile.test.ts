import test from "node:test";
import assert from "node:assert/strict";
import {
  readLiveArchive,
  reconcileLiveArchive,
  planLiveCanonRevisions,
  sourceEntryFromLive,
  type ArchiveCounts,
  type LiveArchiveRead,
  type LiveEntryRow,
  type LiveRevisionRow,
} from "../src/live-reconcile.ts";
import { migrateLiveEntry } from "../src/zach-core.ts";
import { governedHistoryImport, governedImport } from "../src/governed.ts";
import { narrowPathRegistry } from "../../contracts/src/runtime.ts";
import { CanonJournal } from "../../canon/src/journal.ts";
import { freeze } from "../../canon/src/freeze.ts";

const SOURCE_REVISION = "2e05cda67ae158371cb426089c2523e206a54990";

function row(overrides: Partial<LiveEntryRow> = {}): LiveEntryRow {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    type: "article",
    slug: "private-paper",
    title: "Private paper title must not appear in output",
    summary: "Private summary must not appear in output",
    body: { format: "markdown", text: "Private body must not appear in output" },
    data: { topic: "private-topic", nested: { a: 1, b: 2 } },
    tags: ["research"],
    occurred_at: null,
    started_at: null,
    ended_at: null,
    visibility: "private",
    status: "draft",
    provenance: { source: "private-source" },
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
    deleted_at: null,
    working_copy: null,
    ...overrides,
  };
}

function counts(overrides: Partial<ArchiveCounts> = {}): ArchiveCounts {
  return {
    entries: 1,
    activeEntries: 1,
    deletedEntries: 0,
    revisions: 0,
    relations: 0,
    media: 0,
    collections: 0,
    collectionItems: 0,
    readers: 0,
    readerNotes: 0,
    revisionOrphans: 0,
    relationFromOrphans: 0,
    relationToOrphans: 0,
    mediaOrphans: 0,
    ...overrides,
  };
}

function live(entries: LiveEntryRow[], revisions: LiveRevisionRow[] = []): LiveArchiveRead {
  const deleted = entries.filter((entry) => entry.deleted_at !== null).length;
  return {
    entries,
    revisions,
    counts: counts({
      entries: entries.length,
      activeEntries: entries.length - deleted,
      deletedEntries: deleted,
      revisions: revisions.length,
    }),
  };
}

function reconcile(fixtureEntries: ReturnType<typeof sourceEntryFromLive>[], archive: LiveArchiveRead, observedAt = "2026-09-08T12:00:00.000Z") {
  return reconcileLiveArchive({ fixtureEntries, live: archive, sourceRevision: SOURCE_REVISION, observedAt });
}

test("identical fixture and live state reconcile as current-equivalent without content disclosure", () => {
  const current = row();
  const report = reconcile([sourceEntryFromLive(current)], live([current]));
  assert.equal(report.payload.dispositions["current-equivalent"], 1);
  assert.equal(report.payload.dispositions["current-divergent"], 0);
  const encoded = JSON.stringify(report);
  for (const secret of [
    String(current.slug), String(current.title), String(current.summary),
    "Private body must not appear in output", "private-topic", "private-source",
  ]) assert.equal(encoded.includes(secret), false, `report disclosed ${secret}`);
});

test("fixture-only, live-only, changed, and deleted remain distinct", () => {
  const same = row({ slug: "same", id: "id-same" });
  const changedLive = row({ slug: "changed", id: "id-changed", title: "new title" });
  const changedFixtureRow = row({ slug: "changed", id: "fixture-id", title: "old title" });
  const liveOnly = row({ slug: "live-only", id: "id-live-only" });
  const deleted = row({ slug: "deleted", id: "id-deleted", deleted_at: "2026-02-01T00:00:00.000Z" });
  const fixtureOnly = row({ slug: "fixture-only", id: "id-fixture-only" });
  const report = reconcile(
    [same, changedFixtureRow, fixtureOnly].map(sourceEntryFromLive),
    live([same, changedLive, liveOnly, deleted]),
  );
  assert.deepEqual(report.payload.dispositions, {
    "current-equivalent": 1,
    "current-divergent": 1,
    "live-only": 1,
    "fixture-only": 1,
    "deleted": 1,
  });
});

test("revision order is created_at then id and exact duplicate states alone collapse", () => {
  const current = row({ slug: "history", id: "id-history", title: "current" });
  const first = row({ slug: "history", id: "id-history", title: "first" });
  const second = row({ slug: "history", id: "id-history", title: "second" });
  const revisions: LiveRevisionRow[] = [
    { id: "b", entry_id: "id-history", snapshot: second, reason: "update", created_at: "2026-01-02T00:00:00Z" },
    { id: "a", entry_id: "id-history", snapshot: first, reason: "create", created_at: "2026-01-01T00:00:00Z" },
    { id: "c", entry_id: "id-history", snapshot: second, reason: "duplicate", created_at: "2026-01-02T00:00:00Z" },
  ];
  const report = reconcile([], live([current], revisions));
  assert.equal(report.payload.history.sourceRevisionRows, 3);
  assert.equal(report.payload.history.distinctHistoricalStates, 2);
  assert.equal(report.payload.history.duplicateHistoricalStates, 1);
  assert.equal(report.payload.history.adjacentDuplicateHistoricalStates, 1);
  assert.equal(report.payload.history.revisitedHistoricalStates, 0);
  assert.equal(report.payload.history.currentDiffersFromLatestHistoricalState, 1);
  assert.equal(report.payload.entries[0].sourceRevisionRows, 3);
});

test("object key order is irrelevant while array order and values remain identity-bearing", () => {
  const first = row({ data: { outer: { a: 1, b: 2 }, list: ["a", "b"] } });
  const reordered = row({ data: { list: ["a", "b"], outer: { b: 2, a: 1 } } });
  const arrayChanged = row({ data: { list: ["b", "a"], outer: { b: 2, a: 1 } } });
  assert.equal(
    reconcile([sourceEntryFromLive(first)], live([reordered])).payload.dispositions["current-equivalent"],
    1,
  );
  assert.equal(
    reconcile([sourceEntryFromLive(first)], live([arrayChanged])).payload.dispositions["current-divergent"],
    1,
  );
});

test("unknown discriminators, missing identity, and duplicate identity fail hard", () => {
  assert.throws(() => sourceEntryFromLive(row({ visibility: "friends" })), /unknown visibility/);
  assert.throws(() => sourceEntryFromLive(row({ status: "live" })), /unknown status/);
  assert.throws(() => sourceEntryFromLive(row({ body: { format: "html", text: "x" } })), /unknown body format/);
  assert.throws(() => sourceEntryFromLive(row({ slug: null })), /entry.slug/);
  const duplicateA = row({ id: "one", slug: "duplicate" });
  const duplicateB = row({ id: "two", slug: "duplicate" });
  assert.throws(() => reconcile([], live([duplicateA, duplicateB])), /duplicate live identity/);
});

test("report digest excludes observation time and is stable across repeated runs", () => {
  const current = row();
  const fixture = [sourceEntryFromLive(current)];
  const a = reconcile(fixture, live([current]), "2026-09-08T12:00:00Z");
  const b = reconcile(fixture, live([current]), "2026-09-09T12:00:00Z");
  assert.equal(a.payloadDigest, b.payloadDigest);
  assert.notEqual(a.observedAt, b.observedAt);
});

test("redacted live identity follows source UUID across slug changes", () => {
  const before = row({ id: "stable-source-id", slug: "old-slug" });
  const after = row({ id: "stable-source-id", slug: "new-slug" });
  const beforeHash = reconcile([], live([before])).payload.entries[0].identityHash;
  const afterHash = reconcile([], live([after])).payload.entries[0].identityHash;
  assert.equal(beforeHash, afterHash);
});

test("historical slug associates a fixture with the stable live identity", () => {
  const before = row({ id: "stable-source-id", slug: "old-slug", title: "before" });
  const current = row({ id: "stable-source-id", slug: "new-slug", title: "after" });
  const revisions: LiveRevisionRow[] = [
    { id: "revision-1", entry_id: "stable-source-id", snapshot: before, reason: "update", created_at: "2026-01-01T00:00:00Z" },
  ];
  const report = reconcile([sourceEntryFromLive(before)], live([current], revisions));
  assert.equal(report.payload.dispositions["fixture-only"], 0);
  assert.equal(report.payload.dispositions["live-only"], 0);
  assert.equal(report.payload.dispositions["current-divergent"], 1);
  assert.equal(report.payload.entries.length, 1);
});

test("live migration lands and freezes under source UUID, not mutable slug", () => {
  const current = row({ id: "source-uuid", slug: "renamed-entry" });
  const mapped = migrateLiveEntry(sourceEntryFromLive(current), "source-uuid");
  assert.equal(mapped.content[0].subjectId, "source-uuid");
  const attrs = (mapped.content[0].body as { attrs: Record<string, unknown> }).attrs;
  assert.equal(attrs.slug, "renamed-entry");
  const journal = new CanonJournal();
  const report = governedImport({
    journal, registry: narrowPathRegistry(), envelopes: mapped.content,
    context: { occurredAt: "2026-09-08T00:00:00Z", authority: "owner" },
    actor: { id: "project.owner", role: "owner" },
  });
  assert.equal(report.landed.length, 1);
  assert.deepEqual(freeze(journal, "snapshot-1").subjects.map((subject) => subject.id), ["source-uuid"]);
});

test("live history plan collapses adjacent duplicates but preserves revisits and lineage", () => {
  const first = row({ id: "source-uuid", slug: "entry", title: "first" });
  const second = row({ id: "source-uuid", slug: "entry", title: "second" });
  const revisions: LiveRevisionRow[] = [
    { id: "r2", entry_id: "source-uuid", snapshot: second, reason: "update", created_at: "2026-01-02T00:00:00Z" },
    { id: "r1", entry_id: "source-uuid", snapshot: first, reason: "create", created_at: "2026-01-01T00:00:00Z" },
    { id: "r2-duplicate", entry_id: "source-uuid", snapshot: second, reason: "duplicate", created_at: "2026-01-02T00:01:00Z" },
    { id: "r3", entry_id: "source-uuid", snapshot: first, reason: "revisit", created_at: "2026-01-03T00:00:00Z" },
  ];
  const plan = planLiveCanonRevisions(live([first], revisions));
  assert.deepEqual(plan.map((item) => item.sourceRevisionId), ["r1", "r2", "r3"]);
  assert.equal(new Set(plan.map((item) => item.envelope.revision)).size, 3);
  assert.ok(plan.slice(1).every((item, index) => item.envelope.supersedes === plan[index].envelope.revision));
  assert.ok(plan.every((item) => item.envelope.subjectId === "source-uuid"));
});

test("planned live history executes through governed contracts and emits source-to-target receipts", () => {
  const first = row({ id: "source-uuid", slug: "entry", title: "first" });
  const second = row({ id: "source-uuid", slug: "entry", title: "second" });
  const plan = planLiveCanonRevisions(live([second], [
    { id: "r1", entry_id: "source-uuid", snapshot: first, reason: "create", created_at: "2026-01-01T00:00:00Z" },
  ]));
  const journal = new CanonJournal();
  const result = governedHistoryImport({
    journal, registry: narrowPathRegistry(), plan,
    context: { occurredAt: "2026-09-08T00:00:00Z", authority: "owner" },
    actor: { id: "project.owner", role: "owner" },
  });
  assert.equal(result.refused.length, 0);
  assert.equal(result.receipts.length, 2);
  assert.equal(result.eventsEmitted, 2);
  assert.equal(result.receipts[0].sourceRevisionId, "r1");
  assert.equal(result.receipts[1].sourceKind, "current");
  assert.equal(result.receipts[1].priorTargetRevision, result.receipts[0].targetRevision);
  assert.equal(journal.current()[0].envelope.subjectId, "source-uuid");
});

test("live reader commits complete results and uses a read-only transaction", async () => {
  const statements: string[] = [];
  const current = row();
  const countRow = {
    entries: 1, active_entries: 1, deleted_entries: 0, revisions: 0,
    relations: 0, media: 0, collections: 0, collection_items: 0,
    readers: 0, reader_notes: 0, revision_orphans: 0,
    relation_from_orphans: 0, relation_to_orphans: 0, media_orphans: 0,
  };
  const db = { query: async (statement: string) => {
    statements.push(statement);
    if (statement.startsWith("SELECT id, type")) return { rows: [current] as unknown as Record<string, unknown>[] };
    if (statement.startsWith("SELECT id, entry_id")) return { rows: [] };
    if (statement.startsWith("SELECT\n")) return { rows: [countRow] };
    return { rows: [] };
  } };
  const result = await readLiveArchive(db);
  assert.equal(result.entries.length, 1);
  assert.equal(statements[0], "BEGIN TRANSACTION READ ONLY");
  assert.equal(statements.at(-1), "COMMIT");
  assert.equal(statements.includes("ROLLBACK"), false);
});

test("live reader rolls back and returns no partial result on query failure", async () => {
  const statements: string[] = [];
  const db = { query: async (statement: string): Promise<{ rows: Record<string, unknown>[] }> => {
    statements.push(statement);
    if (statement.startsWith("SELECT id, entry_id")) throw new Error("synthetic read failure");
    return { rows: [] };
  } };
  await assert.rejects(readLiveArchive(db), /synthetic read failure/);
  assert.equal(statements[0], "BEGIN TRANSACTION READ ONLY");
  assert.equal(statements.at(-1), "ROLLBACK");
  assert.equal(statements.includes("COMMIT"), false);
});
