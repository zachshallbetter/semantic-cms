/**
 * The Postgres store adapter (SCMS-065).
 *
 * SCMS-057 landed a schema in which append-only is enforced by grant, and
 * nothing read or wrote it. A schema with no reader is a declaration with no
 * consumer — the failure this project exists to catch — so this closes it.
 *
 * **What this deliberately does not do: replace `CanonJournal`.** The in-memory
 * journal is the semantics, vectored by 20-odd packages. This adapter's job is
 * to make those semantics *durable*, and the way it earns trust is by being
 * checked against the journal rather than trusted on its own: `readAll()`
 * reconstructs entries the resolver can freeze, and a conformance vector
 * asserts that a corpus written through here and read back is
 * indistinguishable from the same corpus held in memory.
 *
 * This project's first runtime dependency is `pg`, pinned exactly. Zero
 * dependencies was never doctrine — it appears in no canonical document — and
 * §12.1 says to consume capabilities as pinned dependencies rather than
 * reinvent them, which implementing the Postgres wire protocol would be.
 */
import type { Envelope } from "../../canon/src/envelope.ts";
import type { OutboxEvent, Receipt } from "../../canon/src/journal.ts";

/** The narrow slice of `pg` this uses, so a caller may inject a fake. */
export interface Queryable {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export interface StoredEntry {
  envelope: Envelope;
  receiptSeq: number;
  supersededBy: string | null;
  revoked: boolean;
}

const REVISION = "sha256:";

/**
 * Write one landed record and its receipt **in one transaction**, so the outbox
 * trigger fires inside the same commit (§8.1: "a domain write and its event row
 * commit in one transaction").
 *
 * The caller supplies the receipt because the hash chain is Canon's, not the
 * store's — computing it here would put the chain in two places, and the
 * chain's whole value is that there is one.
 */
export async function landRecord(
  db: Queryable, envelope: Envelope, receipt: Receipt,
): Promise<void> {
  if (!envelope.revision?.startsWith(REVISION)) {
    throw new Error("envelope must carry a content-addressed revision before landing");
  }
  await db.query("BEGIN");
  try {
    await db.query(
      `INSERT INTO canon_record (
         revision, subject_id, schema_version, compatibility, provenance,
         minimum_access, body, semantic_maturity, evidence_state,
         publication_state, delivery_state, supersedes, actor, landed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (revision) DO NOTHING`,
      [envelope.revision, envelope.subjectId, envelope.schemaVersion,
       JSON.stringify(envelope.compatibility), JSON.stringify(envelope.provenance),
       envelope.minimumAccess, JSON.stringify(envelope.body),
       envelope.state.semanticMaturity, envelope.state.evidenceState,
       envelope.state.publicationState, envelope.state.deliveryState,
       envelope.supersedes ?? null, receipt.actor, new Date().toISOString()]);

    // The receipt insert is what fires `canon_emit`, so emission is inside this
    // transaction by construction rather than by remembering to do it.
    await db.query(
      `INSERT INTO canon_receipt (action, subject_id, revision, prior_revision, actor, prev_hash, hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (hash) DO NOTHING`,
      [receipt.action, receipt.subjectId, receipt.revision,
       receipt.priorRevision, receipt.actor, receipt.prevReceiptHash, receipt.receiptHash]);
    await db.query("COMMIT");
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  }
}

/** Append a revoke receipt. No row is rewritten — revocation is derived (SCMS-056). */
export async function landRevocation(db: Queryable, receipt: Receipt): Promise<void> {
  await db.query(
    `INSERT INTO canon_receipt (action, subject_id, revision, prior_revision, actor, prev_hash, hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (hash) DO NOTHING`,
    [receipt.action, receipt.subjectId, receipt.revision,
     receipt.priorRevision, receipt.actor, receipt.prevReceiptHash, receipt.receiptHash]);
}

function toEnvelope(r: Record<string, unknown>): Envelope {
  const json = (v: unknown) => (typeof v === "string" ? JSON.parse(v) : v);
  return {
    schemaVersion: r.schema_version as string,
    subjectId: r.subject_id as string,
    revision: r.revision as string,
    compatibility: json(r.compatibility),
    provenance: json(r.provenance),
    minimumAccess: r.minimum_access as Envelope["minimumAccess"],
    body: json(r.body),
    state: {
      semanticMaturity: r.semantic_maturity as string,
      evidenceState: r.evidence_state as string,
      publicationState: r.publication_state as string,
      deliveryState: r.delivery_state as string,
    },
    ...(r.supersedes ? { supersedes: r.supersedes as string } : {}),
  } as Envelope;
}

/**
 * Every record, with supersession and revocation **derived by the views** — the
 * same derivation SCMS-056 made in memory, expressed where the rows live.
 */
export async function readAll(db: Queryable): Promise<StoredEntry[]> {
  const { rows } = await db.query(
    `SELECT r.*, s.revision AS superseded_by,
            (v.revision IS NOT NULL) AS revoked,
            rc.seq AS receipt_seq
       FROM canon_record r
       LEFT JOIN canon_record s ON s.supersedes = r.revision
       LEFT JOIN canon_revoked v ON v.revision = r.revision
       LEFT JOIN LATERAL (
         SELECT seq FROM canon_receipt c WHERE c.revision = r.revision ORDER BY seq LIMIT 1
       ) rc ON true
      ORDER BY rc.seq`);
  return rows.map((r) => ({
    envelope: toEnvelope(r),
    receiptSeq: Number(r.receipt_seq ?? 0),
    supersededBy: (r.superseded_by as string | null) ?? null,
    revoked: r.revoked === true,
  }));
}

/** Events after a cursor — the reconnect path, reading the store's own stream. */
export async function eventsSince(db: Queryable, lastEventId: number | null): Promise<OutboxEvent[]> {
  const { rows } = await db.query(
    `SELECT event_id, receipt_seq, action, subject_id, revision, prior_revision, actor, minimum_access
       FROM canon_outbox WHERE event_id > $1 ORDER BY event_id`,
    [lastEventId ?? 0]);
  return rows.map((r) => ({
    eventId: Number(r.event_id),
    receiptSeq: Number(r.receipt_seq),
    action: r.action as OutboxEvent["action"],
    subjectId: r.subject_id as string,
    revision: r.revision as string,
    priorRevision: (r.prior_revision as string | null) ?? null,
    actor: r.actor as string,
    minimumAccess: r.minimum_access as OutboxEvent["minimumAccess"],
  }));
}
