/**
 * Subscription fan-out (SCMS-026).
 *
 * DESIGN.md §8.3: the notify phase pushes invalidation keys; clients re-fetch
 * through access projection. This module answers only *who is told*.
 *
 * The security property is subtler than the cache's. A cache decides about its
 * own entry; fan-out decides across subscribers, so the question becomes: can a
 * subscriber infer, from the mere fact of being notified, that something they
 * cannot see has changed? The answer must be no — which is why a subscription
 * whose dependency set is untouched receives **silence**, not an empty
 * notification. An empty message is itself a signal that a wave occurred.
 *
 * Deliberately absent: the wire, durability, ordering, replay, and `lagged`
 * backpressure — P10 is pending on PR #28. Nothing here transports anything.
 */

export interface Subscription {
  id: string;
  /** The subscriber's access level — the lens's ceiling (§8.2: a lens narrows). */
  access: "public" | "member" | "owner" | "admin";
  /**
   * The accessible dependency set of the subscriber's last resolution, as the
   * resolver emitted it (SSS §21). Computed post-access-projection, which is
   * what makes the non-leak hold without a second access check here.
   */
  dependencies: string[];
}

export interface Invalidation {
  subscriptionId: string;
  /** The changed subjects this subscriber may know about — never more. */
  keys: string[];
}

/**
 * @returns one entry per subscription that must be told, in stable order.
 *          Subscriptions with nothing to hear are absent from the result —
 *          silence carries no information.
 */
export function fanOut(subscriptions: Subscription[], changedSubjectIds: string[]): Invalidation[] {
  const changed = new Set(changedSubjectIds);
  const out: Invalidation[] = [];
  for (const sub of subscriptions) {
    // The only question asked, per subscription: which of the changed subjects
    // are in THIS subscriber's own accessible dependency set? No access
    // comparison happens here — the set already encodes it.
    const keys = sub.dependencies.filter((d) => changed.has(d)).sort();
    if (keys.length > 0) out.push({ subscriptionId: sub.id, keys });
  }
  return out.sort((a, b) => a.subscriptionId.localeCompare(b.subscriptionId));
}
