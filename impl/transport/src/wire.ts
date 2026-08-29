/**
 * The wire (SCMS-033/034, epic E5 · DESIGN.md §8.1–8.3, P10).
 *
 * SCMS-032 made the system unable to change without saying so. This carries what
 * it said to subscribers: backfill burst then live, reconnect by
 * `last_event_id` with no event loss, and an explicit `lagged` disclosure for a
 * subscriber that falls behind.
 *
 * It transports **invalidation keys, not state** (§8.3). A client re-fetches
 * through access projection; the wire never carries content, so a delivery
 * cannot leak what a resolution would have withheld.
 *
 * Two properties are load-bearing, and both are easy to lose:
 *
 * 1. **A lens narrows; it can never widen power** (§8.2). A subscription's lens
 *    is an allow-list applied *after* the subscriber's accessible dependency
 *    set, so adding a lens can only ever remove keys. There is no lens that
 *    grants reach.
 *
 * 2. **Lag is measured in what this subscriber may see, not in what happened.**
 *    This is the subtle one. Reporting "you are 400 events behind" when 399 of
 *    them were invisible to this subscriber turns the lag disclosure into a side
 *    channel for global write volume — precisely the inference SCMS-026 closed
 *    by sending silence instead of empty notifications. So relevance is computed
 *    first and the burst limit applies to the relevant stream.
 *
 * Silence still carries no information: a subscriber with nothing to hear gets
 * no message, and its cursor simply does not advance. Re-requesting from an old
 * cursor is cheap and correct — the alternative, advancing the cursor with an
 * empty message, would announce that a wave occurred.
 */
import type { CanonJournal, OutboxEvent } from "../../canon/src/journal.ts";
import { fanOut } from "../../notify/src/fanout.ts";
import type { Subscription } from "../../notify/src/fanout.ts";

/** §8.2 — an allow-list scope, applied after access. Absent means "no further narrowing". */
export interface SubscriptionLens {
  /** Only these subjects, if given. */
  subjects?: string[];
  /** Only these change actions, if given. */
  actions?: Array<OutboxEvent["action"]>;
}

export interface Connection {
  subscription: Subscription;
  lens?: SubscriptionLens;
  /** The last event this client acknowledged. `null` means it has seen nothing. */
  lastEventId: number | null;
}

export type DeliveryPhase = "backfill" | "live" | "lagged";

export interface Delivery {
  subscriptionId: string;
  phase: DeliveryPhase;
  /** Invalidation keys — subject ids to re-fetch. Never content. */
  keys: string[];
  /** The event id the client should hold after applying this delivery. */
  cursor: number;
  /** Only on `lagged`: how many further relevant events remain, and the way out. */
  lag?: { behind: number; recovery: "catch-up-then-live" };
}

export interface DeliverOptions {
  /** Maximum relevant events in one delivery. Beyond this the client is told it is lagged. */
  maxBurst?: number;
}

/**
 * Compute one delivery for one connection, or `null` when there is nothing this
 * subscriber may hear.
 */
export function deliver(
  journal: CanonJournal, connection: Connection, options: DeliverOptions = {},
): Delivery | null {
  const maxBurst = options.maxBurst ?? Number.POSITIVE_INFINITY;
  const pending = journal.eventsSince(connection.lastEventId);

  // Relevance BEFORE burst limiting, so lag is measured in this subscriber's
  // own stream rather than in global activity.
  const relevant = pending.filter((e) => relevantTo(e, connection));
  if (relevant.length === 0) return null;

  const lagged = relevant.length > maxBurst;
  const window = lagged ? relevant.slice(0, maxBurst) : relevant;

  // Who-is-told is still SCMS-026's question, asked of the subjects in the
  // window. Reusing it keeps one implementation of the non-leak rule.
  const changed = window.map((e) => e.subjectId);
  const invalidations = fanOut([connection.subscription], changed);
  const keys = invalidations[0]?.keys ?? [];

  const cursor = window[window.length - 1].eventId;
  const phase: DeliveryPhase = lagged
    ? "lagged"
    : connection.lastEventId === null ? "backfill" : "live";

  return {
    subscriptionId: connection.subscription.id,
    phase, keys, cursor,
    ...(lagged
      ? { lag: { behind: relevant.length - window.length, recovery: "catch-up-then-live" as const } }
      : {}),
  };
}

function relevantTo(event: OutboxEvent, connection: Connection): boolean {
  // The subscriber's accessible dependency set already encodes access (SSS §21),
  // so membership in it is the access check.
  if (!connection.subscription.dependencies.includes(event.subjectId)) return false;
  const lens = connection.lens;
  if (!lens) return true;
  if (lens.subjects && !lens.subjects.includes(event.subjectId)) return false;
  if (lens.actions && !lens.actions.includes(event.action)) return false;
  return true;
}

/**
 * Drive a connection to caught-up, returning every delivery in order.
 *
 * This is the `catch-up-then-live` recovery a `lagged` delivery names, made
 * executable rather than described. The loop terminates because each delivery
 * advances the cursor past at least one relevant event.
 */
export function catchUp(
  journal: CanonJournal, connection: Connection, options: DeliverOptions = {},
): { deliveries: Delivery[]; connection: Connection } {
  const deliveries: Delivery[] = [];
  let cursorState = connection;
  for (;;) {
    const d = deliver(journal, cursorState, options);
    if (!d) break;
    deliveries.push(d);
    cursorState = { ...cursorState, lastEventId: d.cursor };
    if (d.phase !== "lagged") break;
  }
  return { deliveries, connection: cursorState };
}
