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
    | "event-id-not-gapless"       // replay by cursor would silently skip
    | "event-receipt-mismatch"     // the two chains disagree about what happened
    | "duplicate-emission";        // one change told twice — at-least-once becomes at-least-twice
  detail: string;
  at: number;
}

/**
 * Every receipt has exactly one event, in the same order, and event ids are
 * gapless from zero. Gaplessness is not cosmetic: `eventsSince` is a range
 * query, so a gap is indistinguishable from a delivered event and a client
 * would replay past a change it never saw.
 */
export function verifyEmissionIntegrity(journal: CanonJournal): IntegrityFinding[] {
  const findings: IntegrityFinding[] = [];
  const receipts = journal.receipts();
  const events = journal.events();

  for (let i = 0; i < events.length; i++) {
    if (events[i].eventId !== i) {
      findings.push({ code: "event-id-not-gapless", at: i,
        detail: `event at index ${i} carries id ${events[i].eventId}` });
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
