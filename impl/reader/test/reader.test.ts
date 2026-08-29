/**
 * SCMS-030 vectors: the site as a reader expression of the real corpus.
 *
 * Everything here runs over the 215 migrated entries, so what is asserted is
 * asserted about the owner's actual archive, not about a shape invented to pass.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { migrateAll } from "../../migrate/src/zach-core.ts";
import type { SourceEntry } from "../../migrate/src/zach-core.ts";
import { CanonJournal } from "../../canon/src/journal.ts";
import { freeze } from "../../canon/src/freeze.ts";
import { expressStructural, expressLinear } from "../../surface-expression/src/expressions.ts";
import {
  READER_ROUTES, renderRoute, isRouteFailure, deriveFeed, canonHydrator, siteMap,
} from "../src/routes.ts";
import type { RenderedRoute } from "../src/routes.ts";

const manifest = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../../fixtures/zach-core-manifest.json", import.meta.url)), "utf8"),
) as { entries: SourceEntry[] };

const migrated = migrateAll(manifest.entries);
const journal = new CanonJournal();
for (const e of [...migrated.content, ...migrated.relations]) journal.append(e, "migration");
const snapshot = freeze(journal, "reader-wave-0");
const hydrate = canonHydrator(journal.current() as never);

const privateSubjects = new Set(
  migrated.content.filter((e) => e.minimumAccess === "owner").map((e) => e.subjectId));
const publicSubjects = new Set(
  migrated.content.filter((e) => e.minimumAccess === "public").map((e) => e.subjectId));

const route = (path: string) => READER_ROUTES.find((r) => r.path === path)!;
const render = (path: string, access: "public" | "owner", subject?: string) => {
  const r = renderRoute(snapshot, route(path), access, subject);
  assert.ok(!isRouteFailure(r), `${path} failed: ${JSON.stringify(r)}`);
  return r as RenderedRoute;
};

test("the site's real index routes resolve over the real corpus", () => {
  const writing = render("/writing", "public");
  const work = render("/work", "public");
  assert.ok(writing.subjects.length > 0, "/writing has readers' content");
  assert.ok(work.subjects.length > 0, "/work has readers' content");
  // 71 source-public entries plus the 2 unlisted ones, which are public-access
  // but appear in no index — see the unlisted vector below.
  assert.equal(publicSubjects.size, 73);
});

test("no public route exposes a private entry", () => {
  for (const path of ["/writing", "/work"]) {
    const rendered = render(path, "public");
    for (const s of rendered.subjects) {
      assert.ok(!privateSubjects.has(s), `${path} exposed private subject ${s}`);
    }
    // Control: the route is not trivially empty, so this check can fail.
    assert.ok(rendered.subjects.length > 0);
  }
});

test("a private entry's detail route is refused, not rendered empty", () => {
  const somePrivate = [...privateSubjects][0];
  const r = renderRoute(snapshot, route("/writing/[slug]"), "public", somePrivate);
  assert.ok(isRouteFailure(r), "a private subject must not resolve for a public reader");
  // The refusal names a closed class rather than leaking why.
  assert.ok(["subject-not-found", "subject-inaccessible"].includes((r as { failure: string }).failure));
});

test("the owner sees more than the public reader — the difference is exactly the private set", () => {
  const pub = new Set(render("/writing", "public").subjects);
  const owner = new Set(render("/writing", "owner").subjects);
  for (const s of pub) assert.ok(owner.has(s), "the owner sees everything the public sees");
  const extra = [...owner].filter((s) => !pub.has(s));
  assert.ok(extra.length > 0, "the owner sees drafts");
  for (const s of extra) assert.ok(privateSubjects.has(s), `${s} appeared for the owner but is not private`);
});

test("the feed is derived from the page's surface, and cannot reach past it", () => {
  const rendered = render("/writing", "public");
  const asked: string[] = [];
  const items = deriveFeed(rendered, "/writing", (s) => { asked.push(s); return hydrate(s); });

  // Hydration looked up, it did not look around.
  assert.deepEqual([...new Set(asked)].sort(), [...new Set(rendered.subjects)].sort(),
    "hydration was called for exactly the surface's members");
  assert.equal(items.length, rendered.subjects.length);
  for (const i of items) assert.ok(!privateSubjects.has(i.subject));
});

test("the feed carries real authored titles, not slugs", () => {
  const rendered = render("/writing", "public");
  const items = deriveFeed(rendered, "/writing", hydrate);
  const titled = items.filter((i) => i.title !== i.subject);
  assert.ok(titled.length > 0, "titles hydrated from Canon");
  assert.ok(titled.every((i) => i.title.length > 0));
});

test("the sitemap for a public reader lists no private path", () => {
  const paths = siteMap(snapshot, "public");
  assert.ok(paths.includes("/writing") && paths.includes("/work"));
  for (const s of privateSubjects) {
    assert.ok(!paths.some((p) => p.endsWith(`/${s}`)), `sitemap leaked ${s}`);
  }
  assert.ok(paths.length > 2, "detail paths were expanded");
});

test("a route's surface expresses two materially different ways over real content", () => {
  const rendered = render("/work", "public");
  const web = expressStructural(rendered.surface);
  const voice = expressLinear(rendered.surface);
  assert.notEqual(web.modality, voice.modality);
  assert.deepEqual(web.presentedOrder, voice.presentedOrder,
    "both expressions present the same subjects in the same order");
  assert.notDeepEqual(web.morphology, voice.morphology, "morphology is genuinely free");
});

test("no expression of a public route presents a private subject", () => {
  for (const path of ["/writing", "/work"]) {
    const rendered = render(path, "public");
    for (const artifact of [expressStructural(rendered.surface), expressLinear(rendered.surface)]) {
      for (const s of artifact.presentedOrder) {
        assert.ok(!privateSubjects.has(s), `${path} presented private subject ${s}`);
      }
      // And the emitted representation carries no private id as a whole token.
      // (Token-wise, not substring: one private entry has the slug "ma", which
      // occurs inside ordinary markup — a naive scan reports a leak that is not
      // one, and would have been "fixed" by weakening the real check.)
      const out = artifact.output;
      for (const s of privateSubjects) {
        assert.ok(!new RegExp(`(^|[^a-z0-9-])${s}([^a-z0-9-]|$)`).test(out),
          `${path} output leaked private subject ${s}`);
      }
      // Control: a public subject IS present, so the scan is meaningful.
      assert.ok([...publicSubjects].some((s) => artifact.output.includes(s)));
    }
  }
});

test("unlisted content is reachable by link and absent from every index", () => {
  const unlisted = migrated.content
    .filter((e) => ((e.body as unknown as { attrs: Record<string, unknown> }).attrs).listed === false)
    .map((e) => e.subjectId);
  assert.equal(unlisted.length, 2);

  // Absent from the index route, its feed, and the sitemap...
  const index = render("/writing", "public");
  const feedSubjects = deriveFeed(index, "/writing", hydrate).map((i) => i.subject);
  const paths = siteMap(snapshot, "public");
  for (const s of unlisted) {
    assert.ok(!index.subjects.includes(s), `${s} appeared in the index`);
    assert.ok(!feedSubjects.includes(s), `${s} appeared in the feed`);
    assert.ok(!paths.some((p) => p.endsWith(`/${s}`)), `${s} appeared in the sitemap`);
  }

  // ...but reachable by its own link, which is exactly what "unlisted" means.
  // Mapping it to private would have broken this; mapping it to public would
  // have put it in the index above.
  for (const s of unlisted) {
    const detail = renderRoute(snapshot, route("/writing/[slug]"), "public", s);
    assert.ok(!isRouteFailure(detail), `${s} should be readable by link`);
    assert.ok((detail as RenderedRoute).subjects.includes(s));
  }
});

test("a detail route resolves a real project together with its real relation", () => {
  const rendered = render("/work/[slug]", "public", "cursed-crypt");
  assert.equal(rendered.path, "/work/cursed-crypt");
  assert.ok(rendered.subjects.includes("cursed-crypt"));
  assert.ok(rendered.subjects.includes("founder-cpo"),
    "the relation declared in the owner's own frontmatter resolved into the page");
});
