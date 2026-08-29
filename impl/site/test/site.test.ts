/**
 * SCMS-037 vectors: the site as an expression, over the owner's real archive.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CanonJournal } from "../../canon/src/journal.ts";
import { freeze } from "../../canon/src/freeze.ts";
import { migrateAll } from "../../migrate/src/zach-core.ts";
import type { SourceEntry } from "../../migrate/src/zach-core.ts";
import { READER_ROUTES, renderRoute, isRouteFailure, siteMap } from "../../reader/src/routes.ts";
import type { RenderedRoute } from "../../reader/src/routes.ts";
import { expressLinear } from "../../surface-expression/src/expressions.ts";
import { checkEquivalence } from "../../surface-expression/src/equivalence.ts";
import { expressReaderWeb } from "../src/express.ts";
import type { Hydrator } from "../src/express.ts";
import { renderRss, renderSitemap } from "../src/feeds.ts";
import { renderShell } from "../src/page.ts";

const manifest = JSON.parse(readFileSync(
  fileURLToPath(new URL("../../../fixtures/zach-core-manifest.json", import.meta.url)), "utf8"),
) as { entries: SourceEntry[] };
const migrated = migrateAll(manifest.entries);
const journal = new CanonJournal();
for (const e of [...migrated.content, ...migrated.relations]) journal.append(e, "migration");
const snapshot = freeze(journal, "site-wave-0");

const privateSubjects = new Set(
  migrated.content.filter((e) => e.minimumAccess === "owner").map((e) => e.subjectId));

const byId = new Map(journal.current().map((e) => [e.envelope.subjectId, e]));
const hydrate: Hydrator = (subject) => {
  const e = byId.get(subject);
  if (!e) return undefined;
  const b = e.envelope.body as unknown as {
    contentKind: string; slots?: Record<string, Array<{ value?: unknown }>>;
  };
  const str = (k: string) => {
    const v = b.slots?.[k]?.[0]?.value;
    return typeof v === "string" ? v : undefined;
  };
  return { title: str("title"), summary: str("summary"), body: str("body") ?? null, kind: b.contentKind };
};

const route = (p: string) => READER_ROUTES.find((r) => r.path === p)!;
const render = (p: string, access: "public" | "owner", subject?: string): RenderedRoute => {
  const r = renderRoute(snapshot, route(p), access, subject);
  assert.ok(!isRouteFailure(r), `${p} failed`);
  return r as RenderedRoute;
};

test("the site renders the real corpus as an expression, not a hand-written page", () => {
  const rendered = render("/writing", "public");
  const art = expressReaderWeb(rendered.surface, hydrate);
  assert.equal(art.expression, "reader-web");
  assert.equal(art.presentedOrder.length, rendered.subjects.length);
  assert.ok(art.output.includes("<a class=\"card\""), "the index renders real cards");
  // Real authored titles, not slugs.
  const titled = rendered.subjects.filter((s) => {
    const t = hydrate(s)?.title;
    return t && t !== s && art.output.includes(t.slice(0, 12).replace(/[&<>"]/g, ""));
  });
  assert.ok(titled.length > 0, "authored titles reached the page");
});

test("the site's renderer satisfies the SAME equivalence contract as the other adapters", () => {
  // The point of building it as an adapter: it can be held to S3 rather than
  // trusted. Compared against the voice expression of the same surface.
  const rendered = render("/work", "public");
  const web = expressReaderWeb(rendered.surface, hydrate);
  const voice = expressLinear(rendered.surface);

  const result = checkEquivalence(rendered.surface, web, voice, [...privateSubjects]);
  assert.deepEqual(result.findings, [], "equivalence findings must be empty");
  assert.equal(result.equivalent, true);
  assert.equal(result.materiallyDifferent, true, "and the two must genuinely differ in shape");
});

test("hydration is member-driven — the page cannot reach past its surface", () => {
  const rendered = render("/writing", "public");
  const asked: string[] = [];
  expressReaderWeb(rendered.surface, (s) => { asked.push(s); return hydrate(s); });
  assert.deepEqual([...new Set(asked)].sort(), [...new Set(rendered.subjects)].sort());
});

test("no private entry appears in any rendered page, feed, or sitemap", () => {
  const builtAt = "2026-08-29T00:00:00Z";
  const opts = { siteTitle: "Zach Shallbetter", origin: "https://zachshallbetter.com", builtAt };

  for (const path of ["/writing", "/work"]) {
    const rendered = render(path, "public");
    const art = expressReaderWeb(rendered.surface, hydrate);
    const page = renderShell({ title: path, siteTitle: opts.siteTitle, body: art.output });
    const rss = renderRss(rendered, hydrate, opts);

    for (const s of privateSubjects) {
      const token = new RegExp(`(^|[^a-z0-9-])${s}([^a-z0-9-]|$)`);
      assert.ok(!token.test(page), `${path} page leaked ${s}`);
      assert.ok(!token.test(rss), `${path} feed leaked ${s}`);
    }
    // Control: a public subject IS present, so the scan is meaningful.
    assert.ok(rendered.subjects.some((s) => page.includes(s)));
  }

  const map = renderSitemap(siteMap(snapshot, "public"), opts);
  for (const s of privateSubjects) {
    assert.ok(!new RegExp(`/${s}<`).test(map), `sitemap leaked ${s}`);
  }
});

test("the feed makes no access decision — it takes neither snapshot nor access level", () => {
  const rendered = render("/writing", "public");
  const asked: string[] = [];
  const rss = renderRss(rendered, (s) => { asked.push(s); return hydrate(s); },
    { siteTitle: "T", origin: "https://example.test", builtAt: "2026-08-29T00:00:00Z" });
  assert.deepEqual([...new Set(asked)].sort(), [...new Set(rendered.subjects)].sort(),
    "the feed asked for exactly the page's members");
  assert.ok(rss.startsWith('<?xml version="1.0"'));
  assert.equal((rss.match(/<item>/g) ?? []).length, rendered.subjects.length);
});

test("a detail page renders the article body and its real relation", () => {
  const rendered = render("/work/[slug]", "public", "cursed-crypt");
  const art = expressReaderWeb(rendered.surface, hydrate);
  assert.ok(art.presentedOrder.includes("cursed-crypt"));
  assert.ok(art.presentedOrder.includes("founder-cpo"), "the declared relation reached the page");
  assert.ok(art.output.includes("<article"), "the focused subject renders as an article");
  assert.notDeepEqual(art.morphology, {}, "and the adapter chose its own container forms");
});

test("the owner's view differs from the public view by exactly the private set", () => {
  const pub = new Set(render("/writing", "public").subjects);
  const owner = new Set(render("/writing", "owner").subjects);
  for (const s of pub) assert.ok(owner.has(s));
  const extra = [...owner].filter((s) => !pub.has(s));
  assert.ok(extra.length > 0);
  for (const s of extra) assert.ok(privateSubjects.has(s));
});

test("the page states what it was derived from", () => {
  const rendered = render("/writing", "public");
  const art = expressReaderWeb(rendered.surface, hydrate);
  const page = renderShell({
    title: "Writing", siteTitle: "Zach Shallbetter", body: art.output,
    provenance: { snapshot: rendered.surface.sourceSnapshot, fingerprint: rendered.surface.fingerprint },
  });
  assert.ok(page.includes("rendered from Canon"));
  assert.ok(page.includes(rendered.surface.sourceSnapshot));
});
