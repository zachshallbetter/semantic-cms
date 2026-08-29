/**
 * Feeds and sitemap, derived from the page's own surface (SCMS-037).
 *
 * SCMS-030 established the rule and this applies it to real wire formats:
 * **a feed is an expression of the same ResolvedSurface as its page, never a
 * second query.** These functions take a rendered route and a hydrator. They
 * take no snapshot and no access level, so they make no access decision and
 * have no route to a subject the page would not show. The parameter list is the
 * guarantee.
 */
import type { RenderedRoute } from "../../reader/src/routes.ts";
import type { Hydrator } from "./express.ts";

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");

export interface FeedOptions {
  siteTitle: string;
  origin: string;
  /** Explicit clock — no ambient time, so the output is reproducible. */
  builtAt: string;
}

function pathFor(subject: string, hydrate: Hydrator): string {
  const kind = hydrate(subject)?.kind;
  return `/${kind === "project" || kind === "role" ? "work" : "writing"}/${subject}`;
}

export function renderRss(rendered: RenderedRoute, hydrate: Hydrator, opts: FeedOptions): string {
  const items = rendered.surface.groups.flatMap((g) => g.members).map((m) => {
    const a = hydrate(m.subject);
    const link = `${opts.origin}${pathFor(m.subject, hydrate)}`;
    return [
      "    <item>",
      `      <title>${esc(a?.title ?? m.subject)}</title>`,
      `      <link>${esc(link)}</link>`,
      `      <guid isPermaLink="true">${esc(link)}</guid>`,
      ...(a?.summary ? [`      <description>${esc(a.summary)}</description>`] : []),
      "    </item>",
    ].join("\n");
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    "  <channel>",
    `    <title>${esc(opts.siteTitle)}</title>`,
    `    <link>${esc(opts.origin)}</link>`,
    `    <lastBuildDate>${esc(opts.builtAt)}</lastBuildDate>`,
    ...items,
    "  </channel>",
    "</rss>",
  ].join("\n");
}

export function renderSitemap(paths: string[], opts: Pick<FeedOptions, "origin">): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...paths.map((p) => `  <url><loc>${esc(opts.origin + p)}</loc></url>`),
    "</urlset>",
  ].join("\n");
}
