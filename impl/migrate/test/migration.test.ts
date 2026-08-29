/**
 * SCMS-028 vectors: the first real workload.
 *
 * These run against the ACTUAL zach-core corpus manifest (215 entries), not a
 * fixture invented for the test. What they assert is fidelity and non-collapse:
 * that real content survives the mapping, and that distinctions the source keeps
 * are kept — while a distinction the source *collapses* is surfaced rather than
 * inherited.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { migrateAll, migrateEntry, unresolvedRelations } from "../src/zach-core.ts";
import type { SourceEntry } from "../src/zach-core.ts";
import { validateEnvelope } from "../../canon/src/envelope.ts";
import { CanonJournal } from "../../canon/src/journal.ts";
import { freeze } from "../../canon/src/freeze.ts";
import { resolveSurface } from "../../surface-resolver/src/resolver.ts";
import { isFailure } from "../../surface-resolver/src/types.ts";
import type { ResolvedSurface } from "../../surface-resolver/src/types.ts";

const manifest = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../../fixtures/zach-core-manifest.json", import.meta.url)), "utf8"),
) as { entryCount: number; entries: SourceEntry[] };

const result = migrateAll(manifest.entries);

test("the real corpus imports: every entry becomes exactly one content record", () => {
  assert.equal(manifest.entryCount, 215, "the corpus is the real one");
  assert.equal(result.content.length, 215, "no entry silently dropped");
  const slugs = new Set(result.content.map((e) => e.subjectId));
  assert.equal(slugs.size, 215, "slugs are unique — identity survives as the schema key");
});

test("every produced envelope is valid Canon", () => {
  for (const e of [...result.content, ...result.derived, ...result.relations]) {
    assert.deepEqual(validateEnvelope(e), [], `invalid envelope: ${e.subjectId}`);
  }
});

test("body bytes are carried by digest, so fidelity is checkable without vendoring prose", () => {
  for (const e of result.content) {
    const body = (e.body as unknown as { slots: { body: Array<{ sha256: string; length: number }> } }).slots.body[0];
    assert.match(body.sha256, /^[0-9a-f]{64}$/);
    assert.ok(body.length >= 0);
  }
  // Spot-check against the manifest: the digest travelled unchanged.
  const first = manifest.entries[0];
  const mapped = migrateEntry(first).content[0];
  const carried = (mapped.body as unknown as { slots: { body: Array<{ sha256: string }> } }).slots.body[0];
  assert.equal(carried.sha256, first.bodySha256);
});

test("the two-axis source state maps without collapsing: 51 published, 164 not", () => {
  const promoted = result.content.filter((e) => e.state.publicationState === "promoted");
  // The source has 51 status:published entries.
  assert.equal(promoted.length, 51);
  const drafts = result.content.filter((e) => e.state.publicationState === "unpublished");
  assert.equal(drafts.length, 164);
  // Publication and maturity remain independent: nothing infers one from the other
  // beyond the declared mapping, and no entry arrives 'qualified' by being migrated.
  assert.ok(result.content.every((e) => e.state.evidenceState === "unqualified"),
    "migrating content qualifies nothing — evidence is earned, never inherited from a source");
});

test("the source's mixed status vocabulary is SURFACED, not inherited", () => {
  const mixed = result.findings.filter((f) => f.code === "status-vocabulary-mixed");
  // dev(6) + oss(13) + npm(1) + live(1) + demo-pending(1) = 22 lifecycle labels
  assert.equal(mixed.length, 22, "every lifecycle label produced a finding");
  // Those entries kept their label verbatim rather than being guessed into a
  // publication state.
  for (const f of mixed) {
    const slug = f.entry;
    const env = result.content.find((e) => (e.provenance.source ?? "").includes(slug))!;
    const attrs = (env.body as unknown as { attrs: Record<string, unknown> }).attrs;
    assert.ok(attrs.lifecycleLabel, `${slug} lost its lifecycle label`);
    assert.equal(env.state.publicationState, "unpublished",
      "a lifecycle label says nothing about publication, so publication was not inferred from it");
  }
});

test("unlisted is preserved as itself — neither public nor private", () => {
  const attrsOf = (e: { body: unknown }) => (e.body as { attrs: Record<string, unknown> }).attrs;
  const unlisted = result.content.filter((e) => attrsOf(e).listed === false);
  assert.equal(unlisted.length, 2, "the source's 2 unlisted entries");
  for (const e of unlisted) {
    assert.equal(e.minimumAccess, "public", "reachable by link");
  }
  // The flag is positive and present on EVERY record, so discovery (which
  // includes on listed === true) excludes on absence rather than admitting.
  assert.ok(result.content.every((e) => typeof attrsOf(e).listed === "boolean"),
    "every record declares its listability explicitly");
  assert.equal(result.findings.filter((f) => f.code === "unlisted-preserved").length, 2);
});

test("private content lands at owner access and never at public", () => {
  const owner = result.content.filter((e) => e.minimumAccess === "owner");
  assert.equal(owner.length, 142, "the 142 private Medium-import drafts");
  assert.ok(owner.every((e) => e.state.publicationState === "unpublished"));
});

test("machine-generated material lands as DERIVED, separate from authored content", () => {
  assert.equal(result.derived.length, 1, "the one entry carrying a Semantic Article Field");
  const field = result.derived[0];
  assert.equal(field.provenance.kind, "derived");
  assert.match(field.subjectId, /#field$/);
  // The authored record does not carry it: no promotion by adjacency.
  const article = result.content.find((e) => `${e.subjectId}#field` === field.subjectId)!;
  assert.ok(!JSON.stringify(article.body).includes("archetype"),
    "model output must not be merged into the authored record");
  assert.equal(result.findings.filter((f) => f.code === "generated-field-separated").length, 1);
});

test("relations become records, and every target resolves", () => {
  // 13 source files declare a `relations:` key; three declare it EMPTY, so the
  // corpus holds exactly 10 edges. Asserting both numbers keeps the distinction
  // visible — an earlier draft of this vector conflated them, which is precisely
  // the confusion these counts exist to prevent.
  const filesDeclaringKey = manifest.entries.filter((e) => e.frontmatter.relations !== undefined).length;
  const emptyDeclarations = manifest.entries.filter(
    (e) => Array.isArray(e.frontmatter.relations) && (e.frontmatter.relations as unknown[]).length === 0).length;
  assert.equal(filesDeclaringKey, 13);
  assert.equal(emptyDeclarations, 3);
  assert.equal(result.relations.length, 10, "13 files declare the key, 3 declare it empty → 10 edges");
  assert.deepEqual(unresolvedRelations(result), [], "no dangling edge");
  for (const r of result.relations) {
    const body = r.body as unknown as { kind: string; from: string; to: string; relationType: string };
    assert.equal(body.kind, "Relation");
    assert.ok(body.from && body.to && body.relationType);
  }
});

test("model-inferred relationships stay inside the derived field, never Canon edges", () => {
  // Two articles carry `field.relationships` (concept-level, model-generated).
  // Those are NOT declared relations and must not become Canon Relation records:
  // a machine's claim about how concepts relate is not an authored edge.
  const relationTargets = new Set(result.relations.map(
    (r) => (r.body as unknown as { to: string }).to));
  assert.ok(!relationTargets.has("supports") && !relationTargets.has("weakens"),
    "semantic-field relationship types must not leak in as edge targets");
  const fieldEnvelope = result.derived[0];
  assert.ok(JSON.stringify(fieldEnvelope.body).includes("relationships"),
    "they remain inside the derived field envelope, where their provenance travels with them");
});

test("the migrated corpus lands in Canon and resolves as a surface", () => {
  const journal = new CanonJournal();
  for (const e of [...result.content, ...result.derived, ...result.relations]) {
    journal.append(e, "migration");
  }
  assert.equal(journal.all().length, 215 + 1 + 10);
  assert.equal(journal.verifyChain().valid, true);

  // A public reader resolves a real project and sees its real relation.
  const snapshot = freeze(journal, "migration-wave-0");
  const surface = resolveSurface(snapshot as never, {
    profile: "focus", purpose: "understand", subject: "cursed-crypt", access: "public",
    lens: { traversal: { radius: 1 } },
  });
  assert.ok(!isFailure(surface));
  const members = (surface as ResolvedSurface).groups.flatMap((g) => g.members.map((m) => m.subject));
  assert.ok(members.includes("cursed-crypt"));
  assert.ok(members.includes("founder-cpo"), "the real declared relation resolved");
});

test("access holds over real content: a public reader sees no private entry", () => {
  const journal = new CanonJournal();
  for (const e of result.content) journal.append(e, "migration");
  const publicSnapshot = freeze(journal, "w-public");

  const privateSlugs = new Set(result.content.filter((e) => e.minimumAccess === "owner").map((e) => e.subjectId));
  const surface = resolveSurface(publicSnapshot as never, {
    profile: "collection", purpose: "discover", access: "public",
    lens: { include: { kinds: ["article"] } },
  }) as ResolvedSurface;

  const visible = JSON.stringify(surface);
  let leaked = 0;
  for (const slug of privateSlugs) if (visible.includes(`"${slug}"`)) leaked++;
  assert.equal(leaked, 0, "no private entry appears in a public surface");
  // Control: at least one public article does appear, so the check can fail.
  assert.ok(surface.groups[0].members.length > 0, "public articles resolve");
});
