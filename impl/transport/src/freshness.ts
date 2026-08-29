/**
 * Freshness derived from the transport, not asserted by the caller (SCMS-035,
 * epic E6 · R2 meets R3).
 *
 * DESIGN.md §8.3 states the rule: the provenance chip **never claims `live`
 * without a successful check to point at**. Until now `Freshness.lastCheckedMs`
 * was simply supplied by whoever built the view, which made the rule a
 * convention rather than a property — and the editor server duly violated it,
 * passing `Date.now()` on every render so the chip read `live · checked 0s ago`
 * whether or not anything had ever been checked. A rule whose enforcement is
 * "remember to pass the right number" is not enforced.
 *
 * So freshness is derived here, from what the transport actually did:
 *
 * - **No delivery ever received → `lastCheckedMs` is `null`.** The chip then
 *   falls back to `snapshot · <label>`, which is the truth. There is no input to
 *   this function that produces a `live` claim without a delivery behind it.
 * - **A `lagged` delivery** (§8.1: staleness as a protocol message) surfaces as
 *   `revisionsSinceBaseline`, so the chip reads `+N revisions since snapshot`
 *   rather than claiming currency it does not have.
 * - **A dropped connection does not backdate.** The last real check stays what
 *   it was; the age simply grows, which is what a person needs to see.
 */
import type { Freshness } from "../../observation/src/consistency.ts";
import type { DeliveryPhase } from "./wire.ts";

export interface ReceivedDelivery {
  phase: DeliveryPhase;
  cursor: number;
  /** When this delivery was actually received. Explicit clock, never ambient. */
  atMs: number;
  /** Present on a lagged delivery: how many relevant events remain unseen. */
  behind?: number;
}

export interface TransportState {
  /** The last delivery this client actually received. `null` means none ever. */
  lastDelivery: ReceivedDelivery | null;
  /** Whether the channel is up right now. */
  connected: boolean;
}

export interface FreshnessInput {
  nowMs: number;
  snapshotLabel: string;
  hasLocalEdits?: boolean;
}

export function freshnessFrom(state: TransportState, input: FreshnessInput): Freshness {
  const d = state.lastDelivery;

  // A backfill or live delivery is a check that happened. A lagged one is also a
  // check — it is how the client learned it is behind — but it must not read as
  // currency, so it reports its own shortfall instead.
  const lastCheckedMs = d === null ? null : d.atMs;
  const behind = d?.phase === "lagged" ? (d.behind ?? 0) : 0;

  return {
    nowMs: input.nowMs,
    lastCheckedMs,
    snapshotLabel: input.snapshotLabel,
    ...(behind > 0 ? { revisionsSinceBaseline: behind } : {}),
    ...(input.hasLocalEdits === undefined ? {} : { hasLocalEdits: input.hasLocalEdits }),
  };
}

/**
 * A client that has never connected. Named rather than inlined, because the
 * honest default for "we do not know" is the one most likely to be reached for
 * by accident, and it should be the safe one.
 */
export const NEVER_CONNECTED: TransportState = { lastDelivery: null, connected: false };
