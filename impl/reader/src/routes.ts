/**
 * The reader expression of the site (SCMS-030, epic E8).
 *
 * zachshallbetter.com's real reader routes, produced from Canon rather than from
 * a second content query. The consolidation the owner directed — one project,
 * CMS as substrate and site as reader expression — means the site stops being a
 * system that *fetches* content and becomes a set of declared surfaces over it.
 *
 * One rule carries most of the safety here:
 *
 *   **A feed is an expression of the same ResolvedSurface as its page — never a
 *   second query.**
 *
 * Index routes carry `where listed === true`. Unlisted content is public — a
 * reader with the link may read it — but it appears in no index, no feed, and no
 * sitemap. Discovery *includes* on the flag rather than excluding on its
 * negation, so an entry with no flag at all stays out of the index.
 *
 * Feeds leak drafts in practice not because anyone intends it but because the
 * feed is built by a separate code path that reimplements "which entries count"
 * and drifts from the page's rules. Deriving the feed from the already-resolved
 * surface makes that drift structurally impossible: if a subject is not in the
 * surface, there is nothing for the feed to render, because the feed never sees
 * the store at all (DESIGN.md §5 — access is decided once, at resolution).
 */
import { resolveSurface } from "../../surface-resolver/src/resolver.ts";
import { isFailure } from "../../surface-resolver/src/types.ts";
import type { ResolvedSurface, SurfaceRequest, AccessLevel } from "../../surface-resolver/src/types.ts";

export interface RouteDeclaration {
  /** The site path, as readers know it. */
  path: string;
  /** How the route asks Canon for its content. Access is the READER's, not the route's. */
  request: (access: AccessLevel, subject?: string) => SurfaceRequest;
  /** Detail routes take a subject from the path; index routes do not. */
  parameterized: boolean;
}

/** The real reader routes, excluding owner-gated ones (those are E12's problem). */
export const READER_ROUTES: RouteDeclaration[] = [
  {
    path: "/writing",
    parameterized: false,
    request: (access) => ({
      profile: "collection", purpose: "discover", access,
      lens: { include: { kinds: ["article", "note"] }, where: [{ attr: "listed", equals: true }] },
    }),
  },
  {
    path: "/writing/[slug]",
    parameterized: true,
    request: (access, subject) => ({
      profile: "focus", purpose: "understand", subject, access,
      lens: { traversal: { radius: 1 } },
    }),
  },
  {
    path: "/work",
    parameterized: false,
    request: (access) => ({
      profile: "collection", purpose: "discover", access,
      lens: { include: { kinds: ["project", "role"] }, where: [{ attr: "listed", equals: true }] },
    }),
  },
  {
    path: "/work/[slug]",
    parameterized: true,
    request: (access, subject) => ({
      profile: "focus", purpose: "understand", subject, access,
      lens: { traversal: { radius: 1 } },
    }),
  },
];

export interface RenderedRoute {
  path: string;
  surface: ResolvedSurface;
  subjects: string[];
}

/** Resolve one route for one reader. Failure is returned, never rendered around. */
export function renderRoute(
  snapshot: unknown, route: RouteDeclaration, access: AccessLevel, subject?: string,
): RenderedRoute | { path: string; failure: string } {
  const surface = resolveSurface(snapshot as never, route.request(access, subject));
  if (isFailure(surface)) return { path: route.path, failure: surface.failure };
  return {
    path: route.parameterized ? route.path.replace("[slug]", subject ?? "") : route.path,
    surface,
    subjects: surface.groups.flatMap((g) => g.members.map((m) => m.subject)),
  };
}

export function isRouteFailure(
  r: RenderedRoute | { path: string; failure: string },
): r is { path: string; failure: string } {
  return "failure" in r;
}

export interface FeedItem { subject: string; title: string; path: string }

/** Supplies display material for ONE subject. Injected, so hydration cannot browse. */
export type Hydrator = (subject: string) => { title?: string } | undefined;

/**
 * A feed derived from an ALREADY-RESOLVED surface.
 *
 * It takes no snapshot and no access level, because it makes no access decision.
 * Display material arrives through a `Hydrator` that is called **only for
 * subjects the surface already admitted** — hydration can look up, never look
 * around. That is what keeps the classic feed leak structurally impossible: the
 * feed has no path to a subject the page would not show, so it cannot drift from
 * the page's rules even if someone later edits it carelessly.
 */
export function deriveFeed(rendered: RenderedRoute, basePath: string, hydrate: Hydrator): FeedItem[] {
  return rendered.surface.groups
    .flatMap((g) => g.members)
    .map((m) => ({
      subject: m.subject,
      title: hydrate(m.subject)?.title ?? m.subject,
      path: `${basePath}/${m.subject}`,
    }));
}

/** Build a Hydrator over a Canon journal. Titles are authored content, so they live in Canon. */
export function canonHydrator(entries: Array<{ envelope: { subjectId: string; body: unknown } }>): Hydrator {
  const byId = new Map<string, { title?: string }>();
  for (const e of entries) {
    const slots = (e.envelope.body as { slots?: Record<string, Array<{ value?: unknown }>> }).slots;
    const t = slots?.title?.[0]?.value;
    byId.set(e.envelope.subjectId, typeof t === "string" ? { title: t } : {});
  }
  return (subject) => byId.get(subject);
}

/** Every route a reader at this access level can reach, with detail pages expanded. */
export function siteMap(snapshot: unknown, access: AccessLevel): string[] {
  const paths: string[] = [];
  for (const route of READER_ROUTES) {
    if (route.parameterized) continue;
    const rendered = renderRoute(snapshot, route, access);
    if (isRouteFailure(rendered)) continue;
    paths.push(rendered.path);
    for (const s of rendered.subjects) paths.push(`${route.path.replace("/[slug]", "")}/${s}`);
  }
  return paths.sort();
}
