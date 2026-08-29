/**
 * freeze(): Canon → FrozenSnapshot (SCMS-011).
 *
 * The commit-cycle freeze phase, projecting current journal state into the
 * shape the SCMS-008 resolver already consumes — unmodified. This is the seam
 * where Canon hands off to the derive phase: nothing here decides
 * participation (that is SSS) and nothing here renders (that is SES).
 *
 * Superseded and revoked records are excluded from the current snapshot; they
 * remain in the journal as history. Entitlement is carried as a declaration,
 * not enforced here — the resolver applies it as a participation gate.
 */
import type { CanonJournal, JournalEntry } from "./journal.ts";
import type { AccessLevel } from "./envelope.ts";

export interface FrozenSnapshot {
  snapshotId: string;
  subjects: Array<{
    id: string; kind: string; access: AccessLevel; entitled?: boolean;
    attrs?: Record<string, string | number | boolean | null>;
  }>;
  relations: Array<{ from: string; to: string; type: string; access: AccessLevel }>;
}

interface ContentBody {
  kind: "Content"; contentKind: string; entitled?: boolean;
  attrs?: Record<string, string | number | boolean | null>;
}
interface RelationBody { kind: "Relation"; from: string; to: string; relationType: string }

/**
 * @param journal the Canon journal
 * @param snapshotId caller-supplied identity — the freeze phase is explicit,
 *        never an ambient "now" (resolver purity depends on this)
 */
export function freeze(journal: CanonJournal, snapshotId: string): FrozenSnapshot {
  const current = journal.current();
  const subjects: FrozenSnapshot["subjects"] = [];
  const relations: FrozenSnapshot["relations"] = [];

  for (const entry of current) {
    const body = entry.envelope.body as unknown;
    if ((body as ContentBody).kind === "Content") {
      const b = body as ContentBody;
      subjects.push({
        id: entry.envelope.subjectId,
        kind: b.contentKind,
        access: entry.envelope.minimumAccess,
        ...(b.entitled === undefined ? {} : { entitled: b.entitled }),
        ...(b.attrs === undefined ? {} : { attrs: b.attrs }),
      });
    } else if ((body as RelationBody).kind === "Relation") {
      const b = body as RelationBody;
      relations.push({
        from: b.from, to: b.to, type: b.relationType, access: entry.envelope.minimumAccess,
      });
    }
    // Schema, Observation, and Topology bodies are canonical but do not
    // participate in this snapshot shape; they are consumed by other planes.
  }

  subjects.sort((a, b) => a.id.localeCompare(b.id));
  relations.sort((a, b) =>
    a.from.localeCompare(b.from) || a.type.localeCompare(b.type) || a.to.localeCompare(b.to));
  return { snapshotId, subjects, relations };
}

/** Entries excluded from the current snapshot, with why — history stays legible. */
export function excludedFromSnapshot(journal: CanonJournal): Array<{ entry: JournalEntry; reason: string }> {
  return journal.all()
    .filter((e) => e.supersededBy !== null || e.revoked)
    .map((e) => ({ entry: e, reason: e.revoked ? "revoked" : `superseded by ${e.supersededBy}` }));
}
