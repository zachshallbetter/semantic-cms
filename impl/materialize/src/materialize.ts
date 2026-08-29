/**
 * Materialize an expression as a static artifact (SCMS-062, epic E14).
 *
 * §8.3 resolves the apparent tension between static and realtime: readers hold
 * a **committed snapshot baseline** — SSR truth, no-JS truth, deterministic
 * builds — and the notify phase pushes *invalidation keys* over it. Static is
 * the baseline; realtime is what tells you the baseline moved.
 *
 * A static page is therefore a materialized expression, and the only sound name
 * for it is the surface's own **fingerprint**. That is not a convenience:
 *
 * - The fingerprint is computed over the **accessible** dependency set (SSS
 *   §26), so it is access-safe by construction. Two readers at different access
 *   levels resolve different surfaces and get different names, and a change one
 *   of them cannot observe cannot change the other's name.
 * - The name changes exactly when the content does, which is what makes
 *   `Cache-Control: immutable` honest rather than optimistic.
 * - It is the same rule `canon_blob` already follows: bytes named by their own
 *   hash (SCMS-060). A page is bytes; it belongs in the same store.
 *
 * This module is pure. It computes what to store and never writes — the store
 * adapter is SCMS-065, and materialization must not become a second write path
 * into Canon (§5).
 */
import { createHash } from "node:crypto";
import type { ResolvedSurface } from "../../surface-resolver/src/types.ts";
import type { ExpressionArtifact } from "../../surface-expression/src/expressions.ts";

/** Domain-separated, like every other digest in this system. */
const ARTIFACT_DOMAIN = "scms:artifact:v1 ";

export interface MaterializedArtifact {
  /** Content digest of the bytes — the `canon_blob` key. */
  digest: string;
  /** The route this artifact answers. */
  path: string;
  /**
   * The surface fingerprint this was rendered from — the *invalidation* key.
   *
   * Distinct from `digest` on purpose. Two surfaces with different dependency
   * sets can render byte-identical output (an empty index and a filtered one,
   * say), and they must still invalidate independently. Keying only by content
   * would silently merge them and one would go stale.
   */
  fingerprint: string;
  /** Which adapter produced it; a route may be materialized more than one way. */
  expression: string;
  mediaType: string;
  bytes: string;
  byteLength: number;
  /** Subjects whose change must invalidate this artifact (SSS §21). */
  dependencies: string[];
  /** The access level this artifact was resolved at. Never merge across these. */
  access: string;
}

export function digestOf(bytes: string): string {
  return "sha256:" + createHash("sha256").update(ARTIFACT_DOMAIN + bytes, "utf8").digest("hex");
}

export function materialize(
  surface: ResolvedSurface, artifact: ExpressionArtifact, path: string, mediaType = "text/html",
): MaterializedArtifact {
  const bytes = artifact.output;
  return {
    digest: digestOf(bytes),
    path,
    fingerprint: surface.fingerprint,
    expression: artifact.expression,
    mediaType,
    bytes,
    byteLength: Buffer.byteLength(bytes, "utf8"),
    dependencies: surface.dependencies.map((d) => d.subject),
    access: surface.accessProjection,
  };
}

/**
 * The cache key a served artifact is addressed by.
 *
 * Access is part of the key, and not because the fingerprint might collide —
 * it will not. It is here so that a cache which is *given* artifacts cannot
 * serve one across access levels by accident. Defence in depth on the one
 * property this system will not trade.
 */
export function artifactKey(a: Pick<MaterializedArtifact, "path" | "access" | "expression" | "fingerprint">): string {
  return `${a.access}:${a.expression}:${a.path}:${a.fingerprint}`;
}

/**
 * Artifacts invalidated by a wave of changed subjects.
 *
 * The same rule `ProjectionCache` holds (SCMS-014): an artifact is invalidated
 * exactly when a changed subject appears in **its own** accessible dependency
 * set. Because that set was computed after access projection, a change a reader
 * could not observe cannot appear in it, so it cannot invalidate their artifact
 * — which is what keeps invalidation from becoming a side channel.
 */
export function invalidatedBy(
  artifacts: readonly MaterializedArtifact[], changedSubjects: readonly string[],
): MaterializedArtifact[] {
  const changed = new Set(changedSubjects);
  return artifacts.filter((a) => a.dependencies.some((d) => changed.has(d)));
}
