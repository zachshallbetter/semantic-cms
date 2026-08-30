/**
 * SCMS-040 vectors: what an author sees, over the owner's real archive.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CanonJournal } from "../../canon/src/journal.ts";
import { ContractRegistry, CONTENT_REVISE, reviseHandler } from "../../contracts/src/runtime.ts";
import { CONTENT_PROMOTE, promoteHandler } from "../../qualification/src/promote.ts";
import { CONTENT_UNPUBLISH, unpublishHandler } from "../../qualification/src/unpublish.ts";
import { deriveOffer } from "../../authoring/src/editor.ts";
import { migrateAll } from "../../migrate/src/zach-core.ts";
import type { SourceEntry } from "../../migrate/src/zach-core.ts";
import { editorView, editorIndex } from "../src/viewmodel.ts";
import type { EditorView } from "../src/viewmodel.ts";

const manifest = JSON.parse(readFileSync(
  fileURLToPath(new URL("../../../fixtures/zach-core-manifest.json", import.meta.url)), "utf8"),
) as { entries: SourceEntry[] };
const migrated = migrateAll(manifest.entries);
const journal = new CanonJournal();
for (const e of migrated.content) journal.append(e, "migration");

const fullOffer = (() => {
  const r = new ContractRegistry();
  r.register(CONTENT_REVISE, reviseHandler);
  r.register(CONTENT_PROMOTE, promoteHandler as never);
  r.register(CONTENT_UNPUBLISH, unpublishHandler as never);
  return deriveOffer(r);
})();

// Public AND unpublished — an entry with somewhere left to go. The first
// public entry in the corpus is already promoted, which silently made two
// early vectors assert nothing.
const publicSubject = migrated.content.find(
  (e) => e.minimumAccess === "public" && e.state.publicationState === "unpublished")!.subjectId;
const privateSubject = migrated.content.find((e) => e.minimumAccess === "owner")!.subjectId;
const promotedSubject = migrated.content.find((e) => e.state.publicationState === "promoted")!.subjectId;

const baselineFor = (subject: string, over: Partial<Record<string, unknown>> = {}) => {
  const entry = journal.current().find((e) => e.envelope.subjectId === subject)!;
  return {
    subjectId: subject, atRevision: entry.envelope.revision!, hasLocalEdits: false,
    observedCanonEntries: journal.all().length, baselineEstablished: true, ...over,
  } as never;
};
const freshness = { nowMs: 1_000_000, lastCheckedMs: 1_000_000 - 4000, snapshotLabel: "Aug 29" };

const view = (subject: string, over: Record<string, unknown> = {}): EditorView => {
  const v = editorView({
    journal, subject, access: "owner", offer: fullOffer,
    baseline: baselineFor(subject), freshness, ...over,
  } as never);
  assert.ok(!("notFound" in v), `${subject} not found`);
  return v as EditorView;
};

test("the editor opens a real entry with its four state axes intact", () => {
  const v = view(publicSubject);
  assert.ok(v.title.length > 0);
  assert.ok(v.slots.some((s) => s.name === "title"));
  // Never collapsed to one status — the collapse the source made and §3.5 forbids.
  assert.ok(v.state.semanticMaturity && v.state.evidenceState
    && v.state.publicationState && v.state.deliveryState);
});

test("publish is visibly not save", () => {
  const v = view(publicSubject, { qualified: true });
  const save = v.operations.find((o) => o.intent === "revise")!;
  const publish = v.operations.find((o) => o.intent === "promote")!;
  assert.equal(save.weight, "routine");
  assert.equal(save.effectClass, "E1");
  assert.equal(publish.weight, "consequential");
  assert.equal(publish.effectClass, "E3");
  // The way back is shown alongside the door, not discovered afterwards.
  assert.equal(publish.compensation, "icp:interaction/content.unpublish");
});

test("an unavailable operation carries its reason — never a bare greyed-out button", () => {
  const v = view(publicSubject);            // no attestation supplied
  const publish = v.operations.find((o) => o.intent === "promote")!;
  assert.equal(publish.enabled, false);
  assert.match(publish.reason!, /no qualified attestation/);
  for (const op of v.operations) {
    if (!op.enabled) assert.ok(op.reason && op.reason.length > 0, `${op.intent} disabled with no reason`);
  }
});

test("qualification enables publishing, and nothing else does", () => {
  assert.equal(view(publicSubject, { qualified: false }).operations
    .find((o) => o.intent === "promote")!.enabled, false);
  assert.equal(view(publicSubject, { qualified: true }).operations
    .find((o) => o.intent === "promote")!.enabled, true);
});

test("an already-published entry offers unpublish and not publish", () => {
  const v = view(promotedSubject, { qualified: true });
  assert.equal(v.operations.find((o) => o.intent === "promote")!.enabled, false);
  assert.match(v.operations.find((o) => o.intent === "promote")!.reason!, /already published/);
  assert.equal(v.operations.find((o) => o.intent === "unpublish")!.enabled, true);
});

test("conflict freezes publishing while typing continues — the §8.6 asymmetry, rendered", () => {
  // A baseline whose world has moved on and which holds local edits.
  const v = view(publicSubject, {
    qualified: true,
    baseline: baselineFor(publicSubject, { observedCanonEntries: 1, hasLocalEdits: true }),
  });
  assert.equal(v.canDraft, true, "a CMS that blocks typing on conflict is unusable");
  assert.ok(v.slots.every((s) => s.editable), "slots stay editable");
  if (!v.canActConsequentially) {
    assert.equal(v.operations.find((o) => o.intent === "promote")!.enabled, false,
      "one that publishes through conflict is lying");
  }
});

test("the chip never claims live without a check", () => {
  assert.match(view(publicSubject).chip, /^live · checked \d+s ago$/);
  const noCheck = view(publicSubject, { freshness: { ...freshness, lastCheckedMs: null } });
  assert.equal(noCheck.chip, "snapshot · Aug 29");
  const local = view(publicSubject, { freshness: { ...freshness, hasLocalEdits: true } });
  assert.equal(local.chip, "local · unsent");
});

test("operations nothing implements are explained, not omitted", () => {
  const thin = new ContractRegistry();
  thin.register(CONTENT_REVISE, reviseHandler);
  const v = view(publicSubject, { offer: deriveOffer(thin) });
  assert.deepEqual(v.operations.map((o) => o.intent), ["revise"]);
  assert.deepEqual(v.unavailable.map((u) => u.intent).sort(), ["promote", "unpublish"]);
  for (const u of v.unavailable) assert.match(u.reason, /no contract implements this yet/);
});

test("the 22 mixed-vocabulary findings reach the person who can settle them", () => {
  const mixed = migrated.findings.filter((f) => f.code === "status-vocabulary-mixed");
  assert.equal(mixed.length, 22);
  const slug = mixed[0].entry.replace(/^.*\//, "").replace(/\.md$/, "");
  const v = view(slug, { findings: mixed.filter((f) => f.entry === mixed[0].entry) });
  assert.equal(v.findings.length, 1);
  assert.match(v.findings[0].detail, /lifecycle label/);
  // The importer refused to guess; the editor is where the guess becomes a decision.
});

test("the index shows an author their real corpus, with the work queue on it", () => {
  const rows = editorIndex(journal, "owner", migrated.findings);
  assert.equal(rows.length, 215);
  assert.equal(rows.filter((r) => r.openFindings > 0).length, 25,
    "22 mixed-vocabulary, 2 unlisted, 1 generated-field — every question the importer declined to answer");
  assert.ok(rows.every((r) => r.title.length > 0));
  assert.deepEqual(rows.map((r) => r.title), [...rows.map((r) => r.title)].sort((a, b) => a.localeCompare(b)));
});

test("a public actor's index contains no private entry, and their editor cannot open one", () => {
  const rows = editorIndex(journal, "public");
  const privateSubjects = new Set(
    migrated.content.filter((e) => e.minimumAccess === "owner").map((e) => e.subjectId));
  assert.equal(rows.length, 73);
  for (const r of rows) assert.ok(!privateSubjects.has(r.subject));

  const v = editorView({
    journal, subject: privateSubject, access: "public", offer: fullOffer,
    baseline: baselineFor(privateSubject), freshness,
  } as never);
  assert.ok("notFound" in v, "a public actor must not open a private entry in the editor");
});

// ── Editing sessions and the P7 instrument (SCMS-042) ──────────────────────

import { narrowPathRegistry } from "../../contracts/src/runtime.ts";
import { governedImport } from "../../migrate/src/governed.ts";
import { landEdit, laneFor, summarizeP7, P7_EVIDENCE_FLOOR } from "../src/session.ts";
import type { P7Observation } from "../src/session.ts";

const editCtx = { occurredAt: "2026-08-29T01:00:00Z", authority: "owner" as const };
const editActor = { id: "project.owner", role: "owner" };

function seeded() {
  const j = new CanonJournal();
  const registry = narrowPathRegistry();
  governedImport({
    journal: j, registry, envelopes: migrated.content.slice(0, 5),
    context: editCtx, actor: editActor,
  });
  const subjectId = j.current()[0].envelope.subjectId;
  return { j, registry, subjectId, rev: j.current()[0].envelope.revision! };
}

test("an edit from the editor lands through the contract path", () => {
  const { j, registry, subjectId, rev } = seeded();
  const before = j.all().length;
  const r = landEdit({
    journal: j, registry, subjectId, session: "s1", baselineRevision: rev,
    changes: { slots: { summary: [{ kind: "text", value: "Rewritten." }] } },
    context: editCtx, actor: editActor,
  });
  assert.equal(r.outcome, "completed");
  assert.equal(j.all().length, before + 1, "a revision was appended, not an edit in place");
  assert.equal(j.events().length, 5 + 1, "and it announced itself");
});

test("prose edits fall in the free lane; structure and identity do not", () => {
  assert.equal(laneFor(["slots/body/0/value"]), "free");
  assert.equal(laneFor(["slots/summary/0/value"]), "free");
  assert.equal(laneFor(["slots/title/0/value"]), "bounded", "a title is not prose");
  assert.equal(laneFor(["tags/0"]), "bounded");
  assert.equal(laneFor(["minimumAccess"]), "required");
  assert.equal(laneFor(["slots/body/0/value", "minimumAccess"]), "required",
    "the strictest touched field decides — a mixed edit is not free");
});

test("a stale edit conflicts, writes nothing, and is recorded as an overlap", () => {
  const { j, registry, subjectId, rev } = seeded();
  // First session lands.
  landEdit({
    journal: j, registry, subjectId, session: "s1", baselineRevision: rev,
    changes: { slots: { body: [{ kind: "prose", value: "First author." }] } },
    context: editCtx, actor: editActor,
  });
  const afterFirst = j.all().length;

  // Second session still holds the original baseline and touches the same slot.
  const second = landEdit({
    journal: j, registry, subjectId, session: "s2", baselineRevision: rev,
    changes: { slots: { body: [{ kind: "prose", value: "Second author." }] } },
    context: editCtx, actor: editActor,
  });

  assert.equal(second.outcome, "conflict");
  assert.equal(j.all().length, afterFirst, "the loser wrote nothing — no silent overwrite");
  assert.equal(second.observation.overlapped, true, "and the overlap was seen");
  assert.equal(second.observation.lane, "free");
  assert.ok(second.observation.expected && second.observation.actual);
});

test("a stale edit that touches a DIFFERENT field is not counted as an overlap", () => {
  const { j, registry, subjectId, rev } = seeded();
  landEdit({
    journal: j, registry, subjectId, session: "s1", baselineRevision: rev,
    changes: { slots: { body: [{ kind: "prose", value: "Body change." }] } },
    context: editCtx, actor: editActor,
  });
  const second = landEdit({
    journal: j, registry, subjectId, session: "s2", baselineRevision: rev,
    changes: { slots: { summary: [{ kind: "text", value: "Summary change." }] } },
    context: editCtx, actor: editActor,
  });
  // Still a conflict — optimistic concurrency is per record — but NOT an
  // overlap. The distinction is the whole of what P7 turns on: edits that do
  // not touch the same text merge correctly under any model, so counting them
  // would inflate the case for convergence.
  assert.equal(second.outcome, "conflict");
  assert.equal(second.observation.overlapped, false);
});

test("P7 refuses to be decided from too little, and says so", () => {
  const thin: P7Observation[] = [
    { subjectId: "a", session: "s1", lane: "free", changedPaths: ["slots/body"], overlapped: true,
      outcome: "conflict", occurredAt: "t" },
  ];
  const s = summarizeP7(thin);
  assert.equal(s.overlappingFreeLaneEdits, 1);
  assert.equal(s.sufficient, false);
  assert.match(s.reading, /remains undecided/);
  assert.match(s.reading, new RegExp(String(P7_EVIDENCE_FLOOR)));
});

test("the summary counts only what bears on the question", () => {
  const mixed: P7Observation[] = [
    ...Array.from({ length: 40 }, (_, i) => ({
      subjectId: `a${i}`, session: "s", lane: "free" as const, changedPaths: ["slots/body"],
      overlapped: true, outcome: "conflict", occurredAt: "t" })),
    ...Array.from({ length: 100 }, (_, i) => ({
      subjectId: `b${i}`, session: "s", lane: "free" as const, changedPaths: ["slots/body"],
      overlapped: false, outcome: "completed", occurredAt: "t" })),
    ...Array.from({ length: 50 }, (_, i) => ({
      subjectId: `c${i}`, session: "s", lane: "required" as const, changedPaths: ["minimumAccess"],
      overlapped: true, outcome: "conflict", occurredAt: "t" })),
  ];
  const s = summarizeP7(mixed);
  assert.equal(s.totalEdits, 190);
  assert.equal(s.freeLaneEdits, 140);
  assert.equal(s.overlappingFreeLaneEdits, 40, "required-lane overlaps do not count toward P7");
  assert.equal(s.sufficient, true);
});

// ── SCMS-044: the editor is a surface (SH-16) ───────────────────────────────

test("the editor resolves a ResolvedSurface — it does not query Canon directly", async () => {
  const { freeze } = await import("../../canon/src/freeze.ts");
  const { resolveSurface } = await import("../../surface-resolver/src/resolver.ts");
  const { editorRequest } = await import("../../authoring/src/editor.ts");
  const { isFailure } = await import("../../surface-resolver/src/types.ts");

  const snapshot = freeze(journal, "editor");
  const surface = resolveSurface(snapshot as never, editorRequest(publicSubject, "owner", fullOffer));
  assert.ok(!isFailure(surface));
  const s = surface as { purpose: string; groups: Array<{ members: Array<{ subject: string }> }>; fingerprint: string };

  assert.equal(s.purpose, "edit", "the authoring surface declares its purpose in SSS vocabulary");
  assert.ok(s.groups.flatMap((g) => g.members.map((m) => m.subject)).includes(publicSubject));
  assert.ok(s.fingerprint.length > 0, "and it is a real surface, with a dependency fingerprint");
});

test("the authoring surface survives being expressed a SECOND way", async () => {
  // SH-16's own test: if a voice adapter cannot render the authoring surface,
  // the surface is underspecified and the hand-written page was carrying
  // meaning the model does not hold. This is the check that would catch that.
  const { freeze } = await import("../../canon/src/freeze.ts");
  const { resolveSurface } = await import("../../surface-resolver/src/resolver.ts");
  const { editorRequest } = await import("../../authoring/src/editor.ts");
  const { expressStructural, expressLinear } = await import("../../surface-expression/src/expressions.ts");

  const snapshot = freeze(journal, "editor");
  const surface = resolveSurface(
    snapshot as never, editorRequest(publicSubject, "owner", fullOffer)) as never;

  const web = expressStructural(surface);
  const voice = expressLinear(surface);

  assert.notEqual(web.modality, voice.modality, "materially different adapters");
  assert.deepEqual(web.presentedOrder, voice.presentedOrder,
    "both present the same subjects in the same order — participation is preserved");
  assert.deepEqual(
    web.exposedOperations.map((o) => o.id).sort(),
    voice.exposedOperations.map((o) => o.id).sort(),
    "and both expose the same operations — the authoring surface is not visual-only");
  assert.notDeepEqual(web.morphology, voice.morphology,
    "while morphology stays free, which is the SES boundary holding");
});

test("the editor's index and a reader's discovery differ by declared lens, not by accident", async () => {
  const { editorIndex: idx } = await import("../src/viewmodel.ts");
  const unlisted = migrated.content
    .filter((e) => ((e.body as unknown as { attrs: Record<string, unknown> }).attrs).listed === false)
    .map((e) => e.subjectId);
  assert.equal(unlisted.length, 2);

  // The author sees unlisted work; that is the job.
  const authorRows = idx(journal, "owner").map((r) => r.subject);
  for (const s of unlisted) assert.ok(authorRows.includes(s), `author cannot see unlisted ${s}`);

  // The reader's discovery surface excludes it — same resolver, different lens.
  const { freeze } = await import("../../canon/src/freeze.ts");
  const { renderRoute, isRouteFailure, READER_ROUTES } = await import("../../reader/src/routes.ts");
  const rendered = renderRoute(
    freeze(journal, "r") as never, READER_ROUTES.find((r) => r.path === "/writing")!, "public");
  assert.ok(!isRouteFailure(rendered));
  for (const s of unlisted) {
    assert.ok(!(rendered as { subjects: string[] }).subjects.includes(s),
      `reader discovery leaked unlisted ${s}`);
  }
});

// ── SCMS-047: the inspector's three tabs (owner design direction) ───────────

test("the Surface tab reports what the resolver decided", () => {
  const v = view(publicSubject);
  assert.equal(v.surface.purpose, "edit");
  assert.equal(v.surface.accessProjection, "owner");
  assert.ok(v.surface.fingerprint.length > 0);
  assert.ok(v.surface.snapshot.length > 0);
  assert.ok(v.surface.groups.length > 0);
});

test("every surface member carries WHY it participates", () => {
  // SSS §25 requires an inspectable basis for every included member. Until this
  // panel existed an author could see that a related record appeared and never
  // learn why it did.
  const v = view(publicSubject);
  const members = v.surface.groups.flatMap((g) => g.members);
  assert.ok(members.length > 0);
  for (const m of members) {
    assert.ok(m.basis.length > 0, `${m.subject} participates with no stated basis`);
    assert.ok(m.basis.every((b) => typeof b === "string" && b.length > 0));
  }
});

test("the Expression tab reports the adapter's own choices, and names what SES owns", () => {
  const v = view(publicSubject);
  assert.equal(v.expression.adapter, "structural-web");
  assert.equal(v.expression.modality, "visual-2d");
  assert.notDeepEqual(v.expression.morphology, {}, "the adapter chose container forms");
  // Recipe/Theme/Variant belong to SES, which we consume as a pinned dependency.
  // Naming them absent is the honest report; inventing them locally would be the
  // duplication the SSS/SES boundary exists to prevent.
  assert.deepEqual(v.expression.notImplemented, ["recipe", "theme", "variant"]);
});

test("the Surface tab decides participation and the Expression tab decides form — never the reverse", () => {
  const v = view(publicSubject);
  const surfaceJson = JSON.stringify(v.surface);
  for (const form of Object.values(v.expression.morphology)) {
    assert.ok(!surfaceJson.includes(`"${form}"`),
      `the surface panel leaked the container form '${form}' — morphology is the expression's alone`);
  }
  // And the expression presents exactly the surface's members, no more.
  const surfaceMembers = v.surface.groups.flatMap((g) => g.members.map((m) => m.subject)).sort();
  assert.deepEqual([...v.expression.presentedOrder].sort(), surfaceMembers);
});

// ── SCMS-072 closed: the tone is displayed, not merely computed ────────────

test("the surface panel carries an evidence tone per group", () => {
  const v = view(publicSubject);
  assert.ok(Array.isArray(v.surface.tone), "the panel exposes tone");
  assert.equal(v.surface.tone.length, v.surface.groups.length,
    "one reading per resolved group");
  for (const t of v.surface.tone) {
    assert.ok(["earned", "steady", "fading", "unevidenced"].includes(t.reading.tone));
    assert.ok(t.reading.basis.length > 0, "and states why, checkably");
  }
});

test("an unqualified corpus reads unevidenced — the panel does not flatter it", () => {
  // Nothing in the migrated corpus carries evidence yet, so the honest reading
  // is that nothing is evidenced. A panel that showed `steady` here would be
  // decoration.
  const v = view(publicSubject);
  assert.ok(v.surface.tone.every((t) => t.reading.tone === "unevidenced"),
    "tone must reflect the evidence that exists, not the content that exists");
});

test("the panel's tone names no container form", () => {
  const v = view(publicSubject);
  const text = JSON.stringify(v.surface.tone).toLowerCase();
  for (const f of ["hero", "rail", "grid", "matrix", "card", "large", "small", "column"]) {
    assert.ok(!text.includes(f), `tone leaked morphology ('${f}') into the panel`);
  }
});

// ── NR-scms-020: landEdit must not silently drop type enforcement ──────────

test("an edit that would produce schema-invalid content is refused", async () => {
  // Both editor call sites passed `validateBody` as a SIBLING of `context`,
  // where landEdit never looked — so every edit made through the editor landed
  // unchecked. An edit deleting a required slot returned `completed` and left a
  // schema-invalid record.
  const { landEdit } = await import("../src/session.ts");
  const { typeFor, checkContent } = await import("../../schema/src/schema.ts");
  const { ContractRegistry, CONTENT_CREATE, createHandler, CONTENT_REVISE, reviseHandler } =
    await import("../../contracts/src/runtime.ts");
  const { CanonJournal } = await import("../../canon/src/journal.ts");

  const j = new CanonJournal();
  const reg = new ContractRegistry();
  reg.register(CONTENT_CREATE, createHandler);
  reg.register(CONTENT_REVISE, reviseHandler);
  const actor = { id: "o", role: "owner" };
  const context = { occurredAt: "2026-08-30T00:00:00Z", authority: "owner" as const };
  const validateBody = (body: Record<string, unknown>) => {
    const t = typeFor(String((body as { contentKind?: string }).contentKind));
    return t ? checkContent(body as never, t) : [];
  };

  reg.execute(j, {
    contract: "icp:interaction/content.create@1.0.0", requestId: "c", actor,
    input: { subjectId: "vb-1", contentKind: "note", minimumAccess: "public", source: "t",
      body: { kind: "Content", contentKind: "note",
        slots: { title: [{ kind: "text", value: "T" }], body: [{ kind: "prose", value: "b" }] },
        attrs: { listed: true } } },
  } as never, { ...context, instanceId: "i", validateBody } as never);
  const rev = j.current()[0].envelope.revision!;

  const res = landEdit({
    journal: j, registry: reg, subjectId: "vb-1", session: "s",
    baselineRevision: rev, changes: { slots: { title: null } },
    context, validateBody, actor,
  } as never);

  assert.equal(res.outcome, "invalid_input", "an edit deleting a required slot must be refused");
  const after = j.current().find((e) => e.envelope.subjectId === "vb-1")!;
  assert.deepEqual(checkContent(after.envelope.body as never, typeFor("note")!), [],
    "and Canon must still hold a conformant record");
});

test("a valid edit still lands — the check is not simply refusing everything", async () => {
  const { landEdit } = await import("../src/session.ts");
  const { typeFor, checkContent } = await import("../../schema/src/schema.ts");
  const { ContractRegistry, CONTENT_CREATE, createHandler, CONTENT_REVISE, reviseHandler } =
    await import("../../contracts/src/runtime.ts");
  const { CanonJournal } = await import("../../canon/src/journal.ts");

  const j = new CanonJournal();
  const reg = new ContractRegistry();
  reg.register(CONTENT_CREATE, createHandler);
  reg.register(CONTENT_REVISE, reviseHandler);
  const actor = { id: "o", role: "owner" };
  const context = { occurredAt: "2026-08-30T00:00:00Z", authority: "owner" as const };
  const validateBody = (body: Record<string, unknown>) => {
    const t = typeFor(String((body as { contentKind?: string }).contentKind));
    return t ? checkContent(body as never, t) : [];
  };
  reg.execute(j, {
    contract: "icp:interaction/content.create@1.0.0", requestId: "c", actor,
    input: { subjectId: "vb-2", contentKind: "note", minimumAccess: "public", source: "t",
      body: { kind: "Content", contentKind: "note",
        slots: { title: [{ kind: "text", value: "T" }], body: [{ kind: "prose", value: "b" }] },
        attrs: { listed: true } } },
  } as never, { ...context, instanceId: "i", validateBody } as never);

  const res = landEdit({
    journal: j, registry: reg, subjectId: "vb-2", session: "s",
    baselineRevision: j.current()[0].envelope.revision!,
    changes: { slots: { title: [{ kind: "text", value: "Retitled" }] } },
    context, validateBody, actor,
  } as never);
  assert.equal(res.outcome, "completed");
});
