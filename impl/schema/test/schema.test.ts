/**
 * SCMS-016 vectors: the two §14 schema records land in Canon like any other
 * record, and content conforms to its declared type or fails with typed findings.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { CanonJournal } from "../../canon/src/journal.ts";
import { validateEnvelope } from "../../canon/src/envelope.ts";
import {
  ARTICLE_TYPE, HOME_COMPOSITION, ARTICLE_SCHEMA_RECORD, HOME_SCHEMA_RECORD,
  checkArticle, checkComposition,
} from "../src/schema.ts";
import type { ArticleInstance, CompositionInstance } from "../src/schema.ts";

const goodArticle: ArticleInstance = {
  contentKind: "article",
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
  const noMeta: ArticleInstance = { contentKind: "article", slots: { title: goodArticle.slots.title, body: goodArticle.slots.body } };
  assert.deepEqual(checkArticle(noMeta, ARTICLE_TYPE), []);
});

test("a missing required slot is a typed finding naming the slot", () => {
  const noBody: ArticleInstance = { contentKind: "article", slots: { title: goodArticle.slots.title } };
  const findings = checkArticle(noBody, ARTICLE_TYPE);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].code, "required-slot-missing");
  assert.equal(findings[0].at, "body");
});

test("a content type is closed: an undeclared slot fails", () => {
  const extra: ArticleInstance = { contentKind: "article", slots: { ...goodArticle.slots, sidebar: [{ kind: "text", value: "x" }] } };
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
