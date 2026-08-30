/**
 * SCMS-065 vectors: the adapter must agree with the journal, not be trusted.
 *
 * These run against a real Postgres. The store is the durability layer for
 * semantics the in-memory journal already defines and 20 packages already
 * vector, so the question is not "does the adapter work" but "does a corpus put
 * through it come back the same".
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { CanonJournal } from "../../canon/src/journal.ts";
import type { Envelope } from "../../canon/src/envelope.ts";
import { freeze } from "../../canon/src/freeze.ts";
import { resolveSurface } from "../../surface-resolver/src/resolver.ts";
import type { ResolvedSurface } from "../../surface-resolver/src/types.ts";
import { landRecord, landRevocation, readAll, eventsSince } from "../src/adapter.ts";

const DB = process.env.SCMS_ADAPTER_DB ?? "scms_adapter_test";
let client: pg.Client;

const note = (id: string, access: "public" | "owner" = "public", extra = {}): Envelope => ({
  schemaVersion: "scms-0.1", subjectId: id,
  compatibility: { protocol: "scms-0.1", subjectSchema: "note@1" },
  provenance: { kind: "declared", authority: "project.owner", source: "t" },
  minimumAccess: access,
  body: { kind: "Content", contentKind: "note",
          slots: { title: [{ kind: "text", value: `T ${id}` }], body: [{ kind: "prose", value: "b" }] },
          attrs: { listed: true } },
  state: { semanticMaturity: "draft", evidenceState: "unqualified",
           publicationState: "unpublished", deliveryState: "unpropagated" },
  ...extra,
} as Envelope);

before(async () => {
  try { execFileSync("dropdb", ["--if-exists", DB], { stdio: "ignore" }); } catch { /* fresh */ }
  execFileSync("createdb", [DB]);
  for (const f of ["001-canon.sql", "002-blobs.sql"]) {
    execFileSync("psql", ["-q", "-d", DB, "-f", new URL(`../sql/${f}`, import.meta.url).pathname]);
  }
  client = new pg.Client({ database: DB });
  await client.connect();
});

after(async () => {
  await client?.end();
  try { execFileSync("dropdb", ["--if-exists", DB], { stdio: "ignore" }); } catch { /* gone */ }
});

/** Land the same content in both, so the two can be compared. */
async function mirror(journal: CanonJournal, envelopes: Envelope[]) {
  for (const e of envelopes) {
    const entry = journal.append(e, "tester");
    const receipt = journal.receipts()[entry.receiptSeq];
    await landRecord(client, entry.envelope as Envelope, receipt);
  }
}

test("a corpus written through the adapter reads back identical to the journal", async () => {
  const journal = new CanonJournal();
  await mirror(journal, [note("a"), note("b", "owner"), note("c")]);

  const stored = await readAll(client);
  const inMemory = journal.all();

  assert.equal(stored.length, inMemory.length);
  for (let i = 0; i < stored.length; i++) {
    // The envelope is the thing that must survive the round trip byte for byte:
    // it is content-addressed, so any drift changes its identity.
    assert.equal(stored[i].envelope.revision, inMemory[i].envelope.revision,
      "revision must survive the round trip");
    assert.deepEqual(stored[i].envelope.body, inMemory[i].envelope.body);
    assert.deepEqual(stored[i].envelope.state, inMemory[i].envelope.state);
    assert.equal(stored[i].envelope.minimumAccess, inMemory[i].envelope.minimumAccess);
  }
});

test("supersession and revocation come back derived, exactly as in memory", async () => {
  const journal = new CanonJournal();
  const first = journal.append(note("d"), "tester");
  await landRecord(client, first.envelope as Envelope, journal.receipts()[first.receiptSeq]);

  const second = journal.supersede(first.envelope.revision!, note("d", "public", { v: 2 }), "tester");
  await landRecord(client, second.envelope as Envelope, journal.receipts()[second.receiptSeq]);

  const revoked = journal.append(note("e"), "tester");
  await landRecord(client, revoked.envelope as Envelope, journal.receipts()[revoked.receiptSeq]);
  const revReceipt = journal.revoke(revoked.envelope.revision!, "tester");
  await landRevocation(client, revReceipt);

  const stored = await readAll(client);
  const byRev = new Map(stored.map((s) => [s.envelope.revision!, s]));

  assert.equal(byRev.get(first.envelope.revision!)!.supersededBy, second.envelope.revision,
    "the view derives supersession from the successor's pointer");
  assert.equal(byRev.get(second.envelope.revision!)!.supersededBy, null);
  assert.equal(byRev.get(revoked.envelope.revision!)!.revoked, true,
    "and revocation from the receipt chain");
});

test("the store's own outbox agrees with the journal's, event for event", async () => {
  const journal = new CanonJournal();
  await mirror(journal, [note("f"), note("g")]);

  // The database is shared across these tests, as a real store would be, so the
  // comparison is scoped to the subjects this test created rather than to
  // global counts.
  const mine = new Set(["f", "g"]);
  const stored = (await eventsSince(client, null)).filter((e) => mine.has(e.subjectId));
  const inMemory = journal.events().filter((e) => mine.has(e.subjectId));

  // Ids differ — Postgres sequences leave gaps and the in-memory index does not
  // (NR-scms-017) — so what must agree is the SEQUENCE OF CHANGES, not the
  // numbering. That was the whole point of replacing gaplessness with parity.
  assert.equal(stored.length, inMemory.length);
  for (let i = 0; i < stored.length; i++) {
    assert.equal(stored[i].subjectId, inMemory[i].subjectId);
    assert.equal(stored[i].revision, inMemory[i].revision);
    assert.equal(stored[i].action, inMemory[i].action);
    assert.equal(stored[i].minimumAccess, inMemory[i].minimumAccess,
      "access travels on the row, so fan-out need not read content back");
  }
  const ids = stored.map((e) => e.eventId);
  for (let i = 1; i < ids.length; i++) assert.ok(ids[i] > ids[i - 1], "monotonic, gaps allowed");
});

test("a surface resolved from the store is identical to one resolved from memory", async () => {
  // The end of the chain: if this holds, every resolver, expression and reader
  // vector already written applies to the durable store too.
  const journal = new CanonJournal();
  await mirror(journal, [note("h"), note("i", "owner"), note("j")]);

  const mine = new Set(["h", "i", "j"]);
  const fromStore = new CanonJournal();
  for (const s of await readAll(client)) {
    if (s.revoked || s.supersededBy || !mine.has(s.envelope.subjectId)) continue;
    fromStore.append({ ...s.envelope, revision: undefined } as Envelope, "rehydrate");
  }

  const ask = (j: CanonJournal) => resolveSurface(freeze(j, "fixed") as never, {
    profile: "collection", purpose: "discover", access: "public",
    lens: { include: { kinds: ["note"] } },
  }) as ResolvedSurface;

  const onlyMine = new CanonJournal();
  for (const e of journal.current()) {
    if (mine.has(e.envelope.subjectId)) {
      onlyMine.append({ ...e.envelope, revision: undefined } as Envelope, "rehydrate");
    }
  }
  const a = ask(onlyMine);
  const b = ask(fromStore);
  assert.deepEqual(
    b.groups.flatMap((g) => g.members.map((m) => m.subject)).sort(),
    a.groups.flatMap((g) => g.members.map((m) => m.subject)).sort());
  assert.equal(b.fingerprint, a.fingerprint,
    "same content, same snapshot id, same fingerprint — the store changes nothing observable");
});

test("the adapter cannot rewrite a landed row, because the grants forbid it", async () => {
  const journal = new CanonJournal();
  const e = journal.append(note("k"), "tester");
  await landRecord(client, e.envelope as Envelope, journal.receipts()[e.receiptSeq]);

  await client.query("SET ROLE scms_runtime");
  await assert.rejects(
    () => client.query("UPDATE canon_record SET actor = 'tamper'"),
    /permission denied/i,
    "append-only is a grant, and the adapter is subject to it like anything else");
  await client.query("RESET ROLE");
});
