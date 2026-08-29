/**
 * SCMS-062 vectors: static pages over the owner's real archive.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CanonJournal } from "../../canon/src/journal.ts";
import { freeze } from "../../canon/src/freeze.ts";
import { migrateAll } from "../../migrate/src/zach-core.ts";
import type { SourceEntry } from "../../migrate/src/zach-core.ts";
import { READER_ROUTES, renderRoute, isRouteFailure } from "../../reader/src/routes.ts";
import type { RenderedRoute } from "../../reader/src/routes.ts";
import { expressReaderWeb } from "../../site/src/express.ts";
import { expressLinear } from "../../surface-expression/src/expressions.ts";
import { materialize, digestOf, artifactKey, invalidatedBy } from "../src/materialize.ts";

const manifest = JSON.parse(readFileSync(
  fileURLToPath(new URL("../../../fixtures/zach-core-manifest.json", import.meta.url)), "utf8"),
) as { entries: SourceEntry[] };
const migrated = migrateAll(manifest.entries);

/** A journal with one entry promoted, so a reader route is non-empty. */
function world() {
  const j = new CanonJournal();
  for (const e of migrated.content) {
    const promoted = e.subjectId === "cipm-the-cognitive-information-processing-model";
    j.append(promoted
      ? { ...e, state: { ...e.state, publicationState: "promoted" } } as never
      : e, "t");
  }
  for (const r of migrated.relations) j.append(r, "t");
  return j;
}

const hydrate = (j: CanonJournal) => {
  const byId = new Map(j.current().map((e) => [e.envelope.subjectId, e]));
  return (subject: string) => {
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
};

function page(j: CanonJournal, access: "public" | "owner" = "public") {
  const snap = freeze(j, "w");
  const r = renderRoute(snap as never, READER_ROUTES.find((x) => x.path === "/writing")!, access);
  assert.ok(!isRouteFailure(r));
  const rendered = r as RenderedRoute;
  return materialize(rendered.surface, expressReaderWeb(rendered.surface, hydrate(j)), "/writing");
}

test("a page materializes as bytes named by their content", () => {
  const a = page(world());
  assert.match(a.digest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(a.digest, digestOf(a.bytes));
  assert.equal(a.byteLength, Buffer.byteLength(a.bytes, "utf8"));
  assert.ok(a.bytes.includes("CIPM"), "the promoted article reached the page");
});

test("materializing is deterministic — same Canon, same bytes, same digest", () => {
  // The property that makes `Cache-Control: immutable` honest rather than
  // optimistic. If this ever fails, something ambient leaked into rendering.
  assert.equal(page(world()).digest, page(world()).digest);
});

test("the invalidation key is the surface fingerprint, not the content digest", () => {
  const a = page(world());
  const snap = freeze(world(), "w");
  const r = renderRoute(snap as never, READER_ROUTES.find((x) => x.path === "/writing")!, "public");
  assert.equal(a.fingerprint, (r as RenderedRoute).surface.fingerprint);

  // They are different keys for different jobs: two surfaces with different
  // dependency sets can render identical bytes and must still invalidate
  // independently. Keying only by content would merge them and one would stale.
  assert.notEqual(a.fingerprint, a.digest);
});

test("access is part of the artifact key, so a cache cannot cross levels", () => {
  const j = world();
  const pub = page(j, "public");
  const owner = page(j, "owner");
  assert.notEqual(artifactKey(pub), artifactKey(owner));
  assert.ok(artifactKey(pub).startsWith("public:"));
  assert.ok(artifactKey(owner).startsWith("owner:"));
});

test("a public artifact carries no private subject, in bytes or dependencies", () => {
  const privateSubjects = new Set(
    migrated.content.filter((e) => e.minimumAccess === "owner").map((e) => e.subjectId));
  const a = page(world());

  for (const d of a.dependencies) {
    assert.ok(!privateSubjects.has(d), `dependency set leaked ${d}`);
  }
  for (const s of privateSubjects) {
    assert.ok(!new RegExp(`(^|[^a-z0-9-])${s}([^a-z0-9-]|$)`).test(a.bytes),
      `artifact bytes leaked ${s}`);
  }
  assert.ok(a.dependencies.length > 0, "and the dependency set is not trivially empty");
});

test("an artifact is invalidated only by a subject it actually depends on", () => {
  const a = page(world());
  const dep = a.dependencies[0];

  assert.deepEqual(invalidatedBy([a], [dep]), [a]);
  assert.deepEqual(invalidatedBy([a], ["some-unrelated-subject"]), []);

  // The property that matters: a change to a subject this reader cannot see
  // cannot invalidate their artifact, because it cannot be in a dependency set
  // computed after access projection. Invalidation is not a side channel.
  const privateSubject = migrated.content.find((e) => e.minimumAccess === "owner")!.subjectId;
  assert.deepEqual(invalidatedBy([a], [privateSubject]), [],
    "a private change must not invalidate a public artifact");
});

test("two adapters of one surface are separate artifacts, not one", () => {
  const j = world();
  const snap = freeze(j, "w");
  const r = renderRoute(snap as never, READER_ROUTES.find((x) => x.path === "/writing")!, "public");
  const surface = (r as RenderedRoute).surface;

  const web = materialize(surface, expressReaderWeb(surface, hydrate(j)), "/writing");
  const voice = materialize(surface, expressLinear(surface), "/writing", "text/plain");

  assert.equal(web.fingerprint, voice.fingerprint, "same surface, so same invalidation key");
  assert.notEqual(web.digest, voice.digest, "different bytes, so different content names");
  assert.notEqual(artifactKey(web), artifactKey(voice), "and they are addressed separately");

  // Both invalidate together, which is right: the surface moved, so every
  // expression of it is stale.
  assert.equal(invalidatedBy([web, voice], [web.dependencies[0]]).length, 2);
});
