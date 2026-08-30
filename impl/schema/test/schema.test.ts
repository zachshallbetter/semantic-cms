/**
 * SCMS-016 vectors: the two §14 schema records land in Canon like any other
 * record, and content conforms to its declared type or fails with typed findings.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { CanonJournal } from "../../canon/src/journal.ts";
import { validateEnvelope } from "../../canon/src/envelope.ts";
import { ARTICLE_TYPE, HOME_COMPOSITION, ARTICLE_SCHEMA_RECORD, HOME_SCHEMA_RECORD,
  checkArticle, checkComposition, checkContent, typeFor, CONTENT_TYPES, ROLE_TYPE, PROJECT_TYPE } from "../src/schema.ts";
import type { ArticleInstance, CompositionInstance, ContentInstance } from "../src/schema.ts";

const goodArticle: ArticleInstance = {
  contentKind: "article",
  // Every real record carries `listed`; the type requires it because the
  // reader's discovery lens includes on it (SCMS-076).
  attrs: { listed: true },
  slots: {
    title: [{ kind: "text", value: "A title" }],
    body: [{ kind: "prose", value: "Some prose." }],
    meta: [{ kind: "text", value: "2026-08-28" }, { kind: "text", value: "essay" }],
  },
};

const goodHome: CompositionInstance = {
  compositionId: "home",
  sockets: { hero: [{ block: "article-card" }], rail: [{ block: "note-card" }, { block: "article-card" }] },
};

test("both schema records validate as envelopes and land in Canon like any record", () => {
  assert.deepEqual(validateEnvelope(ARTICLE_SCHEMA_RECORD), []);
  assert.deepEqual(validateEnvelope(HOME_SCHEMA_RECORD), []);
  const j = new CanonJournal();
  const a = j.append(ARTICLE_SCHEMA_RECORD, "project.owner");
  const h = j.append(HOME_SCHEMA_RECORD, "project.owner");
  assert.equal((a.envelope.body as { kind: string }).kind, "Schema");
  assert.equal(j.current().length, 2);
  assert.match(a.envelope.revision!, /^sha256:/);
  assert.notEqual(a.envelope.revision, h.envelope.revision);
});

test("a conforming Article passes; optional slots may be absent", () => {
  assert.deepEqual(checkArticle(goodArticle, ARTICLE_TYPE), []);
  const noMeta: ArticleInstance = { contentKind: "article", attrs: { listed: true }, slots: { title: goodArticle.slots.title, body: goodArticle.slots.body } };
  assert.deepEqual(checkArticle(noMeta, ARTICLE_TYPE), []);
});

test("a missing required slot is a typed finding naming the slot", () => {
  const noBody: ArticleInstance = { contentKind: "article", attrs: { listed: true }, slots: { title: goodArticle.slots.title } };
  const findings = checkArticle(noBody, ARTICLE_TYPE);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].code, "required-slot-missing");
  assert.equal(findings[0].at, "body");
});

test("a content type is closed: an undeclared slot fails", () => {
  const extra: ArticleInstance = { contentKind: "article", attrs: { listed: true }, slots: { ...goodArticle.slots, sidebar: [{ kind: "text", value: "x" }] } };
  const findings = checkArticle(extra, ARTICLE_TYPE);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].code, "undeclared-slot");
  assert.equal(findings[0].at, "sidebar");
});

test("slot admission and cardinality are enforced", () => {
  const wrongKind: ArticleInstance = {
    contentKind: "article",
    slots: { ...goodArticle.slots, media: [{ kind: "audio", value: "a.mp3" }] },
  };
  assert.equal(checkArticle(wrongKind, ARTICLE_TYPE)[0].code, "slot-kind-not-admitted");

  const tooManyTitles: ArticleInstance = {
    contentKind: "article",
    slots: { ...goodArticle.slots, title: [{ kind: "text", value: "a" }, { kind: "text", value: "b" }] },
  };
  assert.equal(checkArticle(tooManyTitles, ARTICLE_TYPE)[0].code, "slot-cardinality");
});

test("socket admission and cardinality are enforced", () => {
  assert.deepEqual(checkComposition(goodHome, HOME_COMPOSITION), []);

  const wrongBlock: CompositionInstance = { compositionId: "home", sockets: { hero: [{ block: "note-card" }] } };
  const f1 = checkComposition(wrongBlock, HOME_COMPOSITION);
  assert.equal(f1[0].code, "socket-block-not-admitted");
  assert.equal(f1[0].at, "hero");

  const emptyHero: CompositionInstance = { compositionId: "home", sockets: { hero: [] } };
  assert.equal(checkComposition(emptyHero, HOME_COMPOSITION)[0].code, "socket-cardinality");

  const overfullRail: CompositionInstance = {
    compositionId: "home",
    sockets: { hero: [{ block: "article-card" }], rail: Array.from({ length: 7 }, () => ({ block: "note-card" })) },
  };
  assert.equal(checkComposition(overfullRail, HOME_COMPOSITION)[0].code, "socket-cardinality");

  const unknown: CompositionInstance = { compositionId: "home", sockets: { hero: [{ block: "article-card" }], footer: [] } };
  assert.equal(checkComposition(unknown, HOME_COMPOSITION)[0].code, "unknown-socket");
});

test("a schema record supersedes like any other record — no special case", () => {
  const j = new CanonJournal();
  const v1 = j.append(ARTICLE_SCHEMA_RECORD, "project.owner");
  const widened = {
    ...ARTICLE_SCHEMA_RECORD,
    body: { ...ARTICLE_SCHEMA_RECORD.body, slots: [...ARTICLE_TYPE.slots, { name: "summary", required: false, admits: ["text"] }] },
  };
  const v2 = j.supersede(v1.envelope.revision!, widened as typeof ARTICLE_SCHEMA_RECORD, "project.owner");
  assert.equal(j.all().length, 2);
  assert.equal(j.get(v1.envelope.revision!)!.supersededBy, v2.envelope.revision);
  assert.equal(j.verifyChain().valid, true);
});

test("no finding references expression: sockets say what may participate, not how it looks", async () => {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const src = readFileSync(fileURLToPath(new URL("../src/schema.ts", import.meta.url)), "utf8");
  // Importance is semantic; morphology, theme, and visual form belong to SES.
  for (const forbidden of ["hero-style", "morphology", "theme", "recipe", "css", "layout"]) {
    assert.ok(!new RegExp(`\\b${forbidden}\\b`, "i").test(src.replace(/\/\*[\s\S]*?\*\//g, "")),
      `schema module must not reference '${forbidden}'`);
  }
  assert.equal(HOME_COMPOSITION.sockets[0].importance, "required");
});

// ── SCMS-076: declared types for every kind in the corpus ──────────────────

test("every content kind in the corpus has a declared type", async () => {
  const { migrateAll } = await import("../../migrate/src/zach-core.ts");
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const manifest = JSON.parse(readFileSync(
    fileURLToPath(new URL("../../../fixtures/zach-core-manifest.json", import.meta.url)), "utf8"));
  const migrated = migrateAll(manifest.entries);

  const kinds = new Set(migrated.content.map((e: never) =>
    (e as { body: { contentKind: string } }).body.contentKind));
  for (const k of kinds) {
    assert.ok(typeFor(k), `kind '${k}' has no declared type — 17 records had none before SCMS-076`);
  }

  // And every record satisfies its own type, or fails for a reason true of the
  // content. Zero failures over the real corpus.
  let failures = 0;
  for (const e of migrated.content) {
    const body = (e as { body: ContentInstance }).body;
    const type = typeFor(body.contentKind)!;
    if (checkContent(body, type).length > 0) failures++;
  }
  assert.equal(failures, 0, "all 215 records conform to their declared type");
});

test("a required attr is enforced — the type is not decoration", () => {
  const role: ContentInstance = {
    contentKind: "role",
    slots: { title: [{ kind: "text", value: "T" }], body: [{ kind: "prose", value: "b" }] },
    attrs: { listed: true, period: "2020–2024", skills: ["a"] },   // no company
  };
  const findings = checkContent(role, ROLE_TYPE);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].at, "attrs/company");
  // A role without an employer is not an under-described role; it is a
  // different thing — which is why this one is required and `featured` is not.
});

test("an attr of the wrong shape is a finding", () => {
  const role: ContentInstance = {
    contentKind: "role",
    slots: { title: [{ kind: "text", value: "T" }], body: [{ kind: "prose", value: "b" }] },
    attrs: { listed: true, company: "C", period: "P", skills: "not-a-list" },
  };
  const findings = checkContent(role, ROLE_TYPE);
  assert.ok(findings.some((f) => f.at === "attrs/skills" && f.code === "slot-kind-not-admitted"));
});

test("slots are closed and attrs are open — the asymmetry is deliberate", () => {
  const base = {
    slots: { title: [{ kind: "text", value: "T" }], body: [{ kind: "prose", value: "b" }] },
    attrs: { listed: true, category: "c" },
  };

  // An undeclared ATTR is carried. The corpus has one-off attrs on single
  // entries — a note with `awards`, another with `stats` — and closing the set
  // would make the type reject real content rather than describe it.
  assert.deepEqual(
    checkContent({ ...base, contentKind: "project", attrs: { ...base.attrs, invented: 1 } }, PROJECT_TYPE),
    []);

  // An undeclared SLOT is still a finding: slots are the authored structure the
  // type owns.
  const extraSlot = checkContent(
    { ...base, contentKind: "project", slots: { ...base.slots, sidebar: [{ kind: "text", value: "x" }] } },
    PROJECT_TYPE);
  assert.ok(extraSlot.some((f) => f.code === "undeclared-slot" && f.at === "sidebar"));
});

test("`listed` is required on every kind, because discovery depends on it", () => {
  for (const [kind, type] of Object.entries(CONTENT_TYPES)) {
    const inst: ContentInstance = {
      contentKind: kind,
      slots: { title: [{ kind: "text", value: "T" }], body: [{ kind: "prose", value: "b" }] },
      attrs: { company: "C", period: "P", skills: [], category: "c" },   // everything but `listed`
    };
    assert.ok(checkContent(inst, type).some((f) => f.at === "attrs/listed"),
      `type '${kind}' does not require listed — an absent value would default rather than fail (NR-scms-004)`);
  }
});

test("typeFor does not answer for inherited property names", () => {
  // The NR-scms-006 lesson: a lookup that gates a decision must not walk the
  // prototype chain. `CONTENT_TYPES["constructor"]` would otherwise be a function.
  for (const key of ["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf"]) {
    assert.equal(typeFor(key), undefined, `typeFor('${key}') must not resolve`);
  }
  assert.ok(typeFor("article"), "and real kinds still resolve");
});
