/**
 * Outbox integrity (SCMS-032, epic E5 · DESIGN.md §8.1, P10).
 *
 * P10 states the property as a slogan — *"nothing happens without an
 * emission"* — and a slogan is only worth as much as the check behind it. These
 * are the checks.
 *
 * The emission itself lives inside `CanonJournal`, not here, and deliberately:
 * an outbox written by callers is an outbox some caller eventually forgets to
 * write. What this module does is *verify* the property the journal's structure
 * is supposed to guarantee, so that if someone later adds a write path that
 * escapes it, a gate fails rather than a subscriber quietly missing an event.
 */
import type { CanonJournal, OutboxEvent, Receipt } from "../../canon/src/journal.ts";

export interface IntegrityFinding {
  code:
    | "receipt-without-event"      // something happened and nobody was told
    | "event-without-receipt"      // a subscriber would see a change Canon cannot explain
    | "event-id-not-monotonic"     // a cursor query would return events out of order
    | "event-receipt-mismatch"     // the two chains disagree about what happened
    | "duplicate-emission";        // one change told twice — at-least-once becomes at-least-twice
  detail: string;
  at: number;
}

/**
 * Every receipt has exactly one event, in the same order, and event ids strictly
 * increase.
 *
 * This used to require ids to be *gapless* from zero, on the reasoning that a
 * gap would let a client replay past a change it never saw. That reasoning was
 * wrong, and the requirement was an in-memory artifact mistaken for an
 * invariant: `eventsSince` is a `>` query, so an id that never existed skips
 * nothing. Postgres proved the point — a rolled-back transaction consumes a
 * sequence value, so the store DESIGN.md §13 prescribes produces `1,2,3,5`
 * legitimately, and this check would have rejected it (SCMS-057).
 *
 * What actually detects loss is **receipt/event parity**, checked below: a
 * receipt with no event is a change nobody was told about, and that holds
 * whether or not ids are contiguous. Gaplessness was only ever a proxy for it,
 * and a proxy that fails on the real store is worse than the thing it proxied.
 */
export function verifyEmissionIntegrity(journal: CanonJournal): IntegrityFinding[] {
  const findings: IntegrityFinding[] = [];
  const receipts = journal.receipts();
  const events = journal.events();

  for (let i = 1; i < events.length; i++) {
    if (events[i].eventId <= events[i - 1].eventId) {
      findings.push({ code: "event-id-not-monotonic", at: i,
        detail: `id ${events[i].eventId} does not exceed its predecessor ${events[i - 1].eventId}` });
    }
  }

  if (receipts.length !== events.length) {
    const code = receipts.length > events.length ? "receipt-without-event" : "event-without-receipt";
    findings.push({ code, at: Math.min(receipts.length, events.length),
      detail: `${receipts.length} receipts, ${events.length} events` });
  }

  const seen = new Set<number>();
  for (let i = 0; i < Math.min(receipts.length, events.length); i++) {
    const r: Receipt = receipts[i];
    const e: OutboxEvent = events[i];
    if (seen.has(e.receiptSeq)) {
      findings.push({ code: "duplicate-emission", at: i,
        detail: `receipt ${e.receiptSeq} emitted more than once` });
    }
    seen.add(e.receiptSeq);
    if (e.receiptSeq !== r.seq || e.revision !== r.revision
        || e.subjectId !== r.subjectId || e.action !== r.action
        || e.priorRevision !== r.priorRevision) {
      findings.push({ code: "event-receipt-mismatch", at: i,
        detail: `event ${e.eventId} and receipt ${r.seq} describe different changes` });
    }
  }
  return findings;
}

/**
 * Replay from a cursor loses nothing: the events a client receives, plus the
 * ones it had already seen, reconstruct the whole stream exactly.
 *
 * §8.1 names *no event loss* as an acceptance criterion, so it is checked here
 * rather than assumed from the range query being obviously correct.
 */
export function verifyReplayCompleteness(
  journal: CanonJournal, lastEventId: number | null,
): { complete: boolean; missing: number[] } {
  const delivered = journal.eventsSince(lastEventId).map((e) => e.eventId);
  const alreadySeen = lastEventId === null
    ? []
    : journal.events().filter((e) => e.eventId <= lastEventId).map((e) => e.eventId);
  const reconstructed = new Set([...alreadySeen, ...delivered]);
  const missing = journal.events().map((e) => e.eventId).filter((id) => !reconstructed.has(id));
  return { complete: missing.length === 0, missing };
}
