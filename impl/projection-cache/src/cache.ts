/**
 * Fingerprint-scoped projection cache (SCMS-014).
 *
 * DESIGN.md §7: "fingerprint-scoped invalidation along observable edges only
 * (cache correctness and side-channel safety in one mechanism)."
 *
 * An entry is invalidated exactly when a changed subject appears in its own
 * accessible dependency set — the set the SSS resolver emits (SSS §21, pinned).
 * Because the resolver's dependency set is computed *after* access projection,
 * a change the viewer could not observe cannot appear in it, so it cannot
 * invalidate their entry. That is the whole mechanism: no separate access check
 * runs here, and none may — reading state above the entry's level to decide
 * invalidation would reintroduce the leak this exists to prevent.
 *
 * Deliberately absent (pending on PR #28): declared refresh policy
 * (eager / lazy-on-read / scheduled), the human-verification eagerness
 * override, and stale-while-revalidate. Freshness disclosure is Observation's.
 */
import type { FrozenSnapshot, ResolvedSurface, SurfaceRequest } from "../../surface-resolver/src/types.ts";
import { resolveSurface } from "../../surface-resolver/src/resolver.ts";
import { isFailure } from "../../surface-resolver/src/types.ts";

export interface CacheKey {
  /** Caller-supplied identity for the request shape (lens, profile, subject). */
  requestIdentity: string;
  access: SurfaceRequest["access"];
}

export interface CacheEntry {
  key: CacheKey;
  surface: ResolvedSurface;
  fingerprint: string;
  /** The accessible dependency set, from the resolver (SSS §21). */
  dependencies: string[];
  /** Which commit wave produced this entry. */
  computedAtWave: number;
  valid: boolean;
}

export type InvalidationDecision =
  | { key: CacheKey; decision: "invalidated"; becauseOf: string }
  | { key: CacheKey; decision: "retained"; becauseOf: null };

export interface WaveResult {
  wave: number;
  decisions: InvalidationDecision[];
}

const keyOf = (k: CacheKey) => `${k.requestIdentity}::${k.access}`;

export class ProjectionCache {
  #entries = new Map<string, CacheEntry>();
  #wave = 0;

  /** Resolve and cache, or return the cached surface if still valid. */
  get(snapshot: FrozenSnapshot, request: SurfaceRequest, requestIdentity: string): CacheEntry {
    const key: CacheKey = { requestIdentity, access: request.access };
    const existing = this.#entries.get(keyOf(key));
    if (existing?.valid) return existing;

    const result = resolveSurface(snapshot, request);
    if (isFailure(result)) throw new Error(`cannot cache a failed resolution: ${result.failure}`);
    const surface = result as ResolvedSurface;
    const entry: CacheEntry = {
      key, surface, fingerprint: surface.fingerprint,
      dependencies: surface.dependencies.map((d) => d.subject),
      computedAtWave: this.#wave, valid: true,
    };
    this.#entries.set(keyOf(key), entry);
    return entry;
  }

  /**
   * Apply a commit wave. `changedSubjectIds` is the set of subjects whose
   * canonical state changed — the caller derives it from Canon receipts, not
   * from anything access-scoped.
   */
  commitWave(changedSubjectIds: string[]): WaveResult {
    this.#wave += 1;
    const changed = new Set(changedSubjectIds);
    const decisions: InvalidationDecision[] = [];

    for (const entry of this.#entries.values()) {
      // The only question asked: does a changed subject appear in THIS entry's
      // accessible dependency set? No access check, no peek at other levels.
      const hit = entry.dependencies.find((d) => changed.has(d));
      if (hit !== undefined) {
        entry.valid = false;
        decisions.push({ key: entry.key, decision: "invalidated", becauseOf: hit });
      } else {
        decisions.push({ key: entry.key, decision: "retained", becauseOf: null });
      }
    }
    decisions.sort((a, b) => keyOf(a.key).localeCompare(keyOf(b.key)));
    return { wave: this.#wave, decisions };
  }

  peek(requestIdentity: string, access: SurfaceRequest["access"]): CacheEntry | undefined {
    return this.#entries.get(keyOf({ requestIdentity, access }));
  }

  get wave(): number { return this.#wave; }
  get size(): number { return this.#entries.size; }
}
