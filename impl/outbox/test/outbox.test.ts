/**
 * SCMS-032 vectors: "nothing happens without an emission" as a property.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CanonJournal, ValidationError } from "../../canon/src/journal.ts";
import type { OutboxEvent } from "../../canon/src/journal.ts";
import type { Envelope } from "../../canon/src/envelope.ts";
import { migrateAll } from "../../migrate/src/zach-core.ts";
import type { SourceEntry } from "../../migrate/src/zach-core.ts";
import { verifyEmissionIntegrity, verifyReplayCompleteness } from "../src/integrity.ts";

const doc = (id: string, title: string, access: "public" | "owner" = "public"): Envelope => ({
  schemaVersion: "scms-0.1", subjectId: id,
  compatibility: { protocol: "scms-0.1", subjectSchema: "article@1" },
  provenance: { kind: "declared", authority: "project.owner", source: "t" },
  minimumAccess: access,
  body: { kind: "Content", contentKind: "article", slots: { title: [{ kind: "text", value: title }] } },
  state: { semanticMaturity: "draft", evidenceState: "unqualified",
           publicationState: "unpublished", deliveryState: "unpropagated" },
} as Envelope);

test("every kind of change emits: append, supersede, revoke", () => {
  const j = new CanonJournal();
  const a = j.append(doc("d1", "One"), "tester");
  assert.equal(j.events().length, 1);
  const b = j.supersede(a.envelope.revision!, doc("d1", "Two"), "tester");
  assert.equal(j.events().length, 2);
  j.revoke(b.envelope.revision!, "tester");
  assert.equal(j.events().length, 3);
  assert.deepEqual(j.events().map((e) => e.action), ["append", "supersede", "revoke"]);
  assert.deepEqual(verifyEmissionIntegrity(j), []);
});

test("a rejected write emits nothing", () => {
  const j = new CanonJournal();
  j.append(doc("d1", "One"), "tester");
  const before = j.events().length;
  assert.throws(() => j.append({ ...doc("d2", "Bad"), subjectId: "" } as Envelope, "tester"),
    ValidationError);
  assert.equal(j.events().length, before, "a refused write must not tell anyone it happened");
  assert.equal(j.all().length, 1);
  assert.deepEqual(verifyEmissionIntegrity(j), []);
});

test("an idempotent re-land emits nothing new — at-least-once is not at-least-twice", () => {
  const j = new CanonJournal();
  j.append(doc("d1", "One"), "tester");
  j.append(doc("d1", "One"), "tester");   // identical content
  assert.equal(j.all().length, 1);
  assert.equal(j.events().length, 1, "re-landing identical content is not a change");
  assert.deepEqual(verifyEmissionIntegrity(j), []);
});

test("event ids strictly increase; gaps are legitimate", () => {
  const j = new CanonJournal();
  let prev = j.append(doc("d0", "t0"), "tester");
  for (let i = 1; i < 12; i++) prev = j.supersede(prev.envelope.revision!, doc("d0", `t${i}`), "tester");
  const ids = j.events().map((e) => e.eventId);
  for (let i = 1; i < ids.length; i++) assert.ok(ids[i] > ids[i - 1]);

  // In memory the ids happen to be contiguous, and that is an artifact rather
  // than a requirement: Postgres consumes a sequence value on rollback, so the
  // prescribed store emits 1,2,3,5 legitimately. Loss is caught by
  // receipt/event parity, not by contiguity.
  const gapped = [...j.events()].map((e, i) => ({ ...e, eventId: e.eventId * 2 }));
  const stubbed = {
    receipts: () => j.receipts(), events: () => gapped,
    eventsSince: (c: number | null) => (c === null ? gapped : gapped.filter((e) => e.eventId > c)),
  } as unknown as CanonJournal;
  assert.deepEqual(verifyEmissionIntegrity(stubbed), [],
    "widely spaced but increasing ids are fine");
});

test("the event stream and the receipt chain describe the same changes", () => {
  const j = new CanonJournal();
  const a = j.append(doc("d1", "One"), "tester");
  j.supersede(a.envelope.revision!, doc("d1", "Two"), "tester");
  const receipts = j.receipts();
  j.events().forEach((e, i) => {
    assert.equal(e.receiptSeq, receipts[i].seq);
    assert.equal(e.revision, receipts[i].revision);
    assert.equal(e.priorRevision, receipts[i].priorRevision);
  });
  assert.deepEqual(verifyEmissionIntegrity(j), []);
});

test("replay from ANY cursor loses nothing", () => {
  const j = new CanonJournal();
  let prev = j.append(doc("d0", "t0"), "tester");
  for (let i = 1; i < 8; i++) prev = j.supersede(prev.envelope.revision!, doc("d0", `t${i}`), "tester");

  // null = a new subscriber's backfill burst, then every mid-stream reconnect.
  for (const cursor of [null, ...j.events().map((e) => e.eventId)]) {
    const r = verifyReplayCompleteness(j, cursor);
    assert.ok(r.complete, `replay from ${cursor} missed ${r.missing.join(",")}`);
  }
  assert.equal(j.eventsSince(null).length, 8, "backfill is the whole stream");
  assert.equal(j.eventsSince(7).length, 0, "a caught-up client gets nothing");
  assert.equal(j.eventsSince(3).length, 4);
});

test("a cursor ahead of the stream returns silence, not an error", () => {
  const j = new CanonJournal();
  j.append(doc("d1", "One"), "tester");
  assert.deepEqual([...j.eventsSince(999)], []);
});

test("events name a revision and carry no content", () => {
  const j = new CanonJournal();
  j.append(doc("secret", "A Very Distinctive Title", "owner"), "tester");
  const e = j.events()[0];
  assert.equal(e.minimumAccess, "owner", "fan-out can filter without reading Canon back");
  assert.ok(!JSON.stringify(e).includes("A Very Distinctive Title"),
    "an event is a notification, not a copy of the record");
  assert.ok(e.revision.startsWith("sha256:"));
});

test("the integrity check can fail — otherwise it proves nothing", () => {
  const j = new CanonJournal();
  const a = j.append(doc("d1", "One"), "tester");
  j.supersede(a.envelope.revision!, doc("d1", "Two"), "tester");

  const events = [...j.events()];
  const stub = (evts: OutboxEvent[]) => ({
    receipts: () => j.receipts(), events: () => evts,
    eventsSince: (c: number | null) => (c === null ? evts : evts.filter((e) => e.eventId > c)),
  }) as unknown as CanonJournal;

  // A write that told nobody.
  assert.equal(verifyEmissionIntegrity(stub(events.slice(0, 1)))[0].code, "receipt-without-event");
  // Ids that do not increase: a cursor query would return them out of order.
  assert.equal(
    verifyEmissionIntegrity(stub([events[0], { ...events[1], eventId: 0 }]))[0].code,
    "event-id-not-monotonic");
  // Two chains disagreeing about what happened.
  assert.ok(verifyEmissionIntegrity(stub([events[0], { ...events[1], revision: "sha256:" + "9".repeat(64) }]))
    .some((f) => f.code === "event-receipt-mismatch"));
  // One change announced twice.
  assert.ok(verifyEmissionIntegrity(stub([events[0], { ...events[1], receiptSeq: 0 }]))
    .some((f) => f.code === "duplicate-emission"));
});

test("the real corpus emits once per landed record and nothing more", () => {
  const manifest = JSON.parse(readFileSync(
    fileURLToPath(new URL("../../../fixtures/zach-core-manifest.json", import.meta.url)), "utf8"),
  ) as { entries: SourceEntry[] };
  const migrated = migrateAll(manifest.entries);
  const j = new CanonJournal();
  for (const e of [...migrated.content, ...migrated.derived, ...migrated.relations]) j.append(e, "migration");

  assert.equal(j.all().length, 226);
  assert.equal(j.events().length, 226, "every landed record announced exactly once");
  assert.deepEqual(verifyEmissionIntegrity(j), []);
  assert.ok(verifyReplayCompleteness(j, 100).complete);

  // Access travels with the row, so fan-out never has to read content back.
  const ownerEvents = j.events().filter((e) => e.minimumAccess === "owner");
  assert.equal(ownerEvents.length, 142, "exactly the private drafts");
  // The one derived Semantic Article Field belongs to a PUBLIC article, so its
  // event is public too — derived access follows the parent, and does not
  // default to restricted just because the material is machine-generated.
  const derived = j.events().filter((e) => e.subjectId.endsWith("#field"));
  assert.equal(derived.length, 1);
  assert.equal(derived[0].minimumAccess, "public");
});
