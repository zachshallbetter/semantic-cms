/**
 * Consistency states, disclosure, and expiring presence (SCMS-017).
 *
 * The state vocabulary is HCML's (pinned); the expiry rule is rr-rsp's (an
 * expired observation may be retained for replay but may never drive a current
 * decision). The load-bearing asymmetry — conflict freezes *consequential*
 * action while drafting continues — is DESIGN.md §8.6: a CMS that blocks
 * typing on conflict is unusable; one that publishes through conflict is lying.
 *
 * Every clock is an explicit input. There is no ambient time here, so a state
 * is a pure function of what the caller actually knows.
 *
 * Deliberately absent (pending on PR #28): P11's presence×transport axes,
 * hysteresis, two-clock skew tracking, absent_reason codes; P10's transport.
 * This module determines and discloses state — it does not move it.
 */
import type { CanonJournal } from "../../canon/src/journal.ts";

export const CONSISTENCY_STATES = [
  "current", "stale-but-safe", "conflicted", "superseded", "revoked", "unknown",
] as const;
export type ConsistencyState = (typeof CONSISTENCY_STATES)[number];

export interface ClientBaseline {
  subjectId: string;
  /** The revision this client last read. */
  atRevision: string;
  /** True when the client holds unsent local edits to this subject. */
  hasLocalEdits: boolean;
  /**
   * How many Canon entries the client had observed at baseline. Staleness is a
   * property of the client's view of the WORLD, not only of its own document:
   * a client whose subject is untouched can still be behind.
   */
  observedCanonEntries: number;
  /** False when the client cannot establish what it knows (channel lost, cold start). */
  baselineEstablished: boolean;
}

export interface StateAssessment {
  state: ConsistencyState;
  reason: string;
  /** For superseded: where to act instead. */
  successor?: string;
}

export function consistencyState(baseline: ClientBaseline, canon: CanonJournal): StateAssessment {
  if (!baseline.baselineEstablished) {
    return { state: "unknown", reason: "client cannot establish what it last saw" };
  }
  const held = canon.get(baseline.atRevision);
  if (!held) {
    return { state: "unknown", reason: `held revision ${baseline.atRevision} is not in Canon` };
  }
  if (held.revoked) {
    return { state: "revoked", reason: "the held revision has been revoked; stop and compensate in-flight work" };
  }
  if (held.supersededBy !== null) {
    // A remote change landed on this subject. Whether that is a conflict or a
    // safe advance depends on whether this client also changed it.
    return baseline.hasLocalEdits
      ? {
          state: "conflicted",
          reason: "the held revision was superseded remotely while local edits are unsent",
          successor: held.supersededBy,
        }
      : {
          state: "superseded",
          reason: "the held revision is historical-only; act on the successor",
          successor: held.supersededBy,
        };
  }
  // The held revision is untouched. Canon may still have advanced elsewhere —
  // that is safe staleness, disclosed rather than hidden.
  const advanced = canon.all().length - baseline.observedCanonEntries;
  if (advanced > 0) {
    return {
      state: "stale-but-safe",
      reason: `canon advanced by ${advanced} entr${advanced === 1 ? "y" : "ies"} elsewhere; no overlap with the held revision`,
    };
  }
  return { state: "current", reason: "held revision is the current revision and canon has not advanced" };
}

export type Action = "draft" | "consequential";

/**
 * DESIGN.md §8.6. The asymmetry is the point: drafting continues in every state
 * where the client still holds a coherent document, while consequential action
 * (publish, entitle) requires a state that can justify it.
 */
export function permits(state: ConsistencyState, action: Action): boolean {
  if (action === "draft") {
    // Drafting is refused only where there is nothing coherent to draft against.
    return state !== "revoked" && state !== "superseded";
  }
  return state === "current" || state === "stale-but-safe";
}

export interface Freshness {
  /** Caller-supplied clock. No ambient time. */
  nowMs: number;
  /** When the caller last successfully checked, or null if it never has. */
  lastCheckedMs: number | null;
  /** Baseline snapshot label shown when there is no live check. */
  snapshotLabel: string;
  /** Revisions known to have landed since the baseline, if counted. */
  revisionsSinceBaseline?: number;
  /** True when the client holds unsent local edits. */
  hasLocalEdits?: boolean;
}

/**
 * The provenance chip (§8.3). A page that can prove it is not lying is a
 * feature, not a caveat — so the chip never claims "live" without a successful
 * check to point at.
 */
export function chip(state: ConsistencyState, f: Freshness): string {
  if (state === "conflicted") return "conflicted — review";
  if (state === "revoked") return "revoked — no longer available";
  if (state === "superseded") return "superseded — open the current version";
  if (state === "unknown") return `unknown — ${f.snapshotLabel} (last known)`;
  if (f.hasLocalEdits) return "local · unsent";
  if (f.lastCheckedMs === null) return `snapshot · ${f.snapshotLabel}`;
  if (state === "stale-but-safe" && f.revisionsSinceBaseline) {
    return `+${f.revisionsSinceBaseline} revisions since snapshot`;
  }
  const ageS = Math.max(0, Math.floor((f.nowMs - f.lastCheckedMs) / 1000));
  return `live · checked ${ageS}s ago`;
}

/** rr-rsp: presence is an observation, and observations expire. */
export interface PresenceRecord {
  actorId: string;
  subjectId: string;
  /** 'writing' for batch-writing agents, 'editing' for humans — actor kinds differ. */
  mode: "editing" | "writing" | "idle";
  observedAtMs: number;
  expiresAtMs: number;
  /** A soft lock claim, honoured only while the record is unexpired. */
  claimsLock?: boolean;
}

export function activePresence(records: PresenceRecord[], nowMs: number): PresenceRecord[] {
  // An expired observation may be retained for replay but may not drive a
  // current decision — so it simply is not present.
  return records
    .filter((r) => r.expiresAtMs > nowMs)
    .sort((a, b) => a.actorId.localeCompare(b.actorId));
}

/**
 * Soft locks self-release: a lock exists only while its presence record is
 * unexpired, so an abandoned session cannot hold content hostage.
 */
export function heldLocks(records: PresenceRecord[], nowMs: number): Array<{ subjectId: string; holder: string }> {
  return activePresence(records, nowMs)
    .filter((r) => r.claimsLock === true)
    .map((r) => ({ subjectId: r.subjectId, holder: r.actorId }));
}
