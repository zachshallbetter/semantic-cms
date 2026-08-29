/**
 * The site, running (SCMS-037, epic E8).
 *
 * Serves zachshallbetter.com's real reader routes from Canon. This is the
 * consolidation's reader half: the site is not a client that fetches content,
 * it is an expression of resolved surfaces.
 *
 * **Public access only, and deliberately.** There is no authentication here and
 * none is implied — every request resolves at `public`, so the question "who is
 * asking" never arises. The owner's view lives in the editor, a separate process
 * with its own gate. A flag here that switched to owner access would be an
 * authorization decision made by a query parameter, which is exactly the shape
 * of NR-scms-005.
 *
 * Nothing is deployed by running this.
 */
import { createServer } from "node:http";
import type { ServerResponse } from "node:http";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CanonJournal } from "../../canon/src/journal.ts";
import { freeze } from "../../canon/src/freeze.ts";
import { narrowPathRegistry } from "../../contracts/src/runtime.ts";
import { governedImport } from "../../migrate/src/governed.ts";
import { migrateAll } from "../../migrate/src/zach-core.ts";
import type { SourceEntry } from "../../migrate/src/zach-core.ts";
import { READER_ROUTES, renderRoute, isRouteFailure, siteMap } from "../../reader/src/routes.ts";
import type { RenderedRoute } from "../../reader/src/routes.ts";
import { expressReaderWeb } from "../src/express.ts";
import type { Hydrator } from "../src/express.ts";
import { renderRss, renderSitemap } from "../src/feeds.ts";
import { renderShell } from "../src/page.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (n: string, d: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const CONTENT_DIR = arg("content", join(process.env.HOME ?? "", "Projects/zach-core/content"));
const PORT = Number(arg("port", "8789"));
const ORIGIN = arg("origin", `http://localhost:${PORT}`);
const SITE_TITLE = "Zach Shallbetter";

/** Prose comes from the owner's checkout at runtime; the repo holds only digests. */
function loadBodies(): Map<string, string> {
  const out = new Map<string, string>();
  if (!existsSync(CONTENT_DIR)) return out;
  for (const kind of readdirSync(CONTENT_DIR)) {
    let files: string[] = [];
    try { files = readdirSync(join(CONTENT_DIR, kind)).filter((f) => f.endsWith(".md")); } catch { continue; }
    for (const f of files) {
      const raw = readFileSync(join(CONTENT_DIR, kind, f), "utf8");
      const m = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(raw);
      out.set(f.replace(/\.md$/, ""), m ? raw.slice(m[0].length) : raw);
    }
  }
  return out;
}

const manifest = JSON.parse(
  readFileSync(join(HERE, "../../../fixtures/zach-core-manifest.json"), "utf8")) as { entries: SourceEntry[] };
const prose = loadBodies();
const migrated = migrateAll(manifest.entries.map((e) => ({
  ...e, body: prose.get(String(e.frontmatter.slug ?? "")) ?? undefined,
})));

/**
 * Content enters through `content.create@1`, not `journal.append`. The write
 * boundary gate caught this server doing the latter, which is exactly the rule
 * SCMS-041 established and DESIGN.md §5 states: Canon mutation belongs behind a
 * registered contract, and "it is only a reader loading fixtures" is not an
 * exemption — it is how the exemption starts.
 *
 * A consequence worth stating rather than hiding: `content.create@1` forces
 * publication state to `unpublished`, because a caller must not be able to
 * create already-published content (the NR-scms-006 rule — the party being
 * gated does not supply the value that decides the gate). So the 51 entries
 * that were promoted in the source arrive unpublished here, and the import
 * reports it. The reader routes select on kind and listedness rather than
 * publication, so the site still renders them; the discrepancy is real, is
 * reported at startup, and belongs to SCMS-029's reconciliation rather than to
 * a quiet workaround here.
 */
const journal = new CanonJournal();
const registry = narrowPathRegistry();
const imported = governedImport({
  journal, registry,
  envelopes: [...migrated.content, ...migrated.relations],
  context: { occurredAt: new Date().toISOString(), authority: "owner" },
  actor: { id: "project.owner", role: "owner" },
});
const snapshot = freeze(journal, "site");

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

const routeFor = (p: string) => READER_ROUTES.find((r) => r.path === p)!;

function page(rendered: RenderedRoute, title: string): string {
  const art = expressReaderWeb(rendered.surface, hydrate);
  return renderShell({
    title: `${title} · ${SITE_TITLE}`, siteTitle: SITE_TITLE, body: art.output,
    provenance: { snapshot: rendered.surface.sourceSnapshot, fingerprint: rendered.surface.fingerprint },
  });
}

const send = (res: ServerResponse, code: number, type: string, body: string) => {
  res.writeHead(code, { "content-type": type });
  res.end(body);
};

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", ORIGIN);
  const path = url.pathname.replace(/\/$/, "") || "/";

  const notFound = () => send(res, 404, "text/html; charset=utf-8", renderShell({
    title: `Not found · ${SITE_TITLE}`, siteTitle: SITE_TITLE,
    body: '<h1>Not found</h1><p class="dek">No such page.</p>',
  }));

  if (path === "/" || path === "/writing" || path === "/work") {
    const target = path === "/" ? "/writing" : path;
    const r = renderRoute(snapshot, routeFor(target), "public");
    if (isRouteFailure(r)) return notFound();
    return send(res, 200, "text/html; charset=utf-8",
      page(r as RenderedRoute, target === "/writing" ? "Writing" : "Work"));
  }

  const detail = /^\/(writing|work)\/(.+)$/.exec(path);
  if (detail) {
    const r = renderRoute(snapshot, routeFor(`/${detail[1]}/[slug]`), "public", decodeURIComponent(detail[2]));
    // A private subject fails here exactly as it fails for any reader: the page
    // has no path to it, so 404 is the truth rather than a policy.
    if (isRouteFailure(r)) return notFound();
    const rendered = r as RenderedRoute;
    return send(res, 200, "text/html; charset=utf-8",
      page(rendered, hydrate(rendered.subjects[0])?.title ?? detail[2]));
  }

  if (path === "/rss.xml") {
    const r = renderRoute(snapshot, routeFor("/writing"), "public");
    if (isRouteFailure(r)) return notFound();
    return send(res, 200, "application/rss+xml; charset=utf-8",
      renderRss(r as RenderedRoute, hydrate,
        { siteTitle: SITE_TITLE, origin: ORIGIN, builtAt: new Date().toISOString() }));
  }

  if (path === "/sitemap.xml") {
    return send(res, 200, "application/xml; charset=utf-8",
      renderSitemap(siteMap(snapshot, "public"), { origin: ORIGIN }));
  }

  return notFound();
});

server.listen(PORT, () => {
  const pub = migrated.content.filter((e) => e.minimumAccess === "public").length;
  process.stdout.write(
    `Site on ${ORIGIN}\n`
    + `  ${imported.landed.length} records created through content.create@1`
    + `${imported.refused.length ? `, ${imported.refused.length} refused` : ""}\n`
    + `  ${pub} entries reachable at public access\n`
    + `  bodies from ${CONTENT_DIR}: ${prose.size}\n`
    + `  ${imported.publicationNotCarried.length} entries were promoted in the source and arrive `
    + `unpublished — creation cannot carry publication state (SCMS-029 reconciles this)\n`
    + `  public access only — no auth here, and none implied\n`);
});
