/**
 * The bounded merge lane (SCMS-021).
 *
 * DESIGN.md §8.5: concurrency discipline is derived from SES typed invariance.
 * A `bounded` field may be merged — but the merged result must then satisfy the
 * declared structural invariants, and a violation surfaces as `conflicted`
 * rather than a silently chosen winner. That refusal is the whole point: the
 * design's rule is that silent merge is a *granted* behaviour, granted only
 * where meaning is not at stake.
 *
 * Deliberately absent: the `free` lane (convergent/CRDT merge) and merge
 * justification as a decision map — P7/P22 are pending on PR #28 and would
 * reshape both (scms-blocker-001). The `required` lane lives in the contract
 * runtime, where it belongs.
 *
 * This module is pure: it never writes to Canon. Landing a merged composition
 * still crosses `content.revise@1`.
 */
import { checkComposition } from "../../schema/src/schema.ts";
import type { CompositionSchema, CompositionInstance, ConformanceFinding } from "../../schema/src/schema.ts";

export interface SocketOccupant { block: string; ref: string }

export interface CompositionState {
  compositionId: string;
  /** socket name → occupants, in declared order. */
  sockets: Record<string, SocketOccupant[]>;
}

export type MergeOutcome =
  | { outcome: "merged"; result: CompositionState; contributions: MergeContribution[] }
  | { outcome: "conflicted"; reason: "invariant-violated"; findings: ConformanceFinding[]; candidate: CompositionState; contributions: MergeContribution[] }
  | { outcome: "conflicted"; reason: "contended-slot"; contentions: SlotContention[]; contributions: MergeContribution[] };

export interface MergeContribution { actor: "a" | "b"; socket: string; added: string[]; removed: string[] }

/**
 * Contention is a *replacement* disagreement, not a positional one: both sides
 * removed the same occupant and put different things in its socket. Two actors
 * appending different items are NOT contending — that is the disjoint case the
 * bounded lane exists to merge.
 */
export interface SlotContention {
  socket: string;
  /** The occupant both sides removed. */
  base: SocketOccupant;
  /** What each side put in its place; neither is chosen. */
  a: SocketOccupant | null;
  b: SocketOccupant | null;
}

const key = (o: SocketOccupant) => `${o.block}:${o.ref}`;

function diff(base: SocketOccupant[], side: SocketOccupant[]) {
  const baseKeys = new Set(base.map(key));
  const sideKeys = new Set(side.map(key));
  return {
    added: side.filter((o) => !baseKeys.has(key(o))),
    removed: base.filter((o) => !sideKeys.has(key(o))),
  };
}

/**
 * Three-way structural merge of socket occupancy, then validation.
 *
 * @returns `merged` only when the union both avoids contention AND satisfies
 *          the declared composition schema. Otherwise `conflicted`, carrying
 *          what a reviewer needs — never a resolution.
 */
export function mergeBounded(
  base: CompositionState,
  a: CompositionState,
  b: CompositionState,
  schema: CompositionSchema,
): MergeOutcome {
  const sockets = [...new Set([
    ...Object.keys(base.sockets), ...Object.keys(a.sockets), ...Object.keys(b.sockets),
  ])].sort();

  const contributions: MergeContribution[] = [];
  const contentions: SlotContention[] = [];
  const merged: Record<string, SocketOccupant[]> = {};

  for (const socket of sockets) {
    const baseOcc = base.sockets[socket] ?? [];
    const aOcc = a.sockets[socket] ?? [];
    const bOcc = b.sockets[socket] ?? [];
    const da = diff(baseOcc, aOcc);
    const db = diff(baseOcc, bOcc);

    contributions.push({ actor: "a", socket, added: da.added.map(key), removed: da.removed.map(key) });
    contributions.push({ actor: "b", socket, added: db.added.map(key), removed: db.removed.map(key) });

    // Contention: both sides removed the SAME occupant and replaced it with
    // different content. The merge does not choose — it reports, preserving
    // both contributions for deliberate resolution.
    const bRemovedKeys = new Set(db.removed.map(key));
    const bothRemoved = da.removed.filter((o) => bRemovedKeys.has(key(o)));
    const aAddedKeys = da.added.map(key).sort().join(",");
    const bAddedKeys = db.added.map(key).sort().join(",");
    if (bothRemoved.length > 0 && (da.added.length > 0 || db.added.length > 0) && aAddedKeys !== bAddedKeys) {
      for (const removed of bothRemoved) {
        contentions.push({ socket, base: removed, a: da.added[0] ?? null, b: db.added[0] ?? null });
      }
    }

    // Union merge: base minus both removals, plus both additions, order-stable.
    const removedKeys = new Set([...da.removed, ...db.removed].map(key));
    const kept = baseOcc.filter((o) => !removedKeys.has(key(o)));
    const additions: SocketOccupant[] = [];
    for (const add of [...da.added, ...db.added]) {
      if (!kept.some((o) => key(o) === key(add)) && !additions.some((o) => key(o) === key(add))) {
        additions.push(add);
      }
    }
    merged[socket] = [...kept, ...additions];
  }

  if (contentions.length > 0) {
    return { outcome: "conflicted", reason: "contended-slot", contentions, contributions };
  }

  const candidate: CompositionState = { compositionId: base.compositionId, sockets: merged };

  // Validate the MERGED result against the declared invariants. A bounded
  // field may move within declared bounds — never past them.
  const instance: CompositionInstance = {
    compositionId: candidate.compositionId,
    sockets: Object.fromEntries(
      Object.entries(candidate.sockets).map(([s, occ]) => [s, occ.map((o) => ({ block: o.block }))]),
    ),
  };
  const findings = checkComposition(instance, schema);
  if (findings.length > 0) {
    // No merged value is produced. Refusing to pick a winner is the behaviour
    // the design requires; the caller reviews with both contributions in hand.
    return { outcome: "conflicted", reason: "invariant-violated", findings, candidate, contributions };
  }
  return { outcome: "merged", result: candidate, contributions };
}
