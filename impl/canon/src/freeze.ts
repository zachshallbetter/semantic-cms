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

/**
 * An observation carried alongside the snapshot (SCMS-046, closing SH-14).
 *
 * Observations are **signals about subjects, not participants in a surface**.
 * That is why `freeze()` never turns one into a subject: a model's claim about
 * an article, or a note that someone is editing it, must not become a member a
 * reader can land on. SSS §22 says the same thing from the other side — a
 * resolver may consume field signals, and does not own or promote them.
 *
 * They are projected here rather than dropped because the alternative was worse.
 * Before this, `freeze()` silently ignored Observation bodies, so SCMS-028's
 * derived Semantic Article Field landed in Canon and became invisible to
 * everything, including its owner — written and unreadable. The omission was
 * correct and its consequence was not, and neither was declared.
 *
 * `about` names the subject this observation concerns. Access is the
 * observation's own, not the subject's: a private note about a public article
 * stays private.
 */
export interface SnapshotObservation {
  id: string;
  kind: string;
  about: string;
  access: AccessLevel;
  body: Record<string, unknown>;
}

export interface FrozenSnapshot {
  snapshotId: string;
  subjects: Array<{
    id: string; kind: string; access: AccessLevel; entitled?: boolean;
    /**
     * The publication axis, carried so the read path can consult it.
     *
     * It was absent, and the consequence was that nothing downstream could:
     * reader routes showed never-published drafts and unpublished records to
     * the public, and `content.unpublish@1` — the compensation SCMS-020 built
     * — removed nothing from any surface (NR-scms-015).
     */
    publicationState: string;
    /** The subject's Canon revision — lets surface fingerprints track content. */
    revision?: string;
    attrs?: Record<string, string | number | boolean | null>;
  }>;
  relations: Array<{ from: string; to: string; type: string; access: AccessLevel }>;
  /**
   * Signals about subjects. Deliberately a separate collection from `subjects`:
   * nothing that reads members can accidentally read these, which is what keeps
   * "an observation is not a participant" structural rather than remembered.
   */
  observations: SnapshotObservation[];
}

interface ContentBody {
  kind: "Content"; contentKind: string; entitled?: boolean;
  attrs?: Record<string, string | number | boolean | null>;
}
interface RelationBody { kind: "Relation"; from: string; to: string; relationType: string }
interface ObservationBody { kind: "Observation"; observationKind?: string; about?: string }

/**
 * @param journal the Canon journal
 * @param snapshotId caller-supplied identity — the freeze phase is explicit,
 *        never an ambient "now" (resolver purity depends on this)
 */
export function freeze(journal: CanonJournal, snapshotId: string): FrozenSnapshot {
  const current = journal.current();
  const subjects: FrozenSnapshot["subjects"] = [];
  const relations: FrozenSnapshot["relations"] = [];
  const observations: SnapshotObservation[] = [];

  for (const entry of current) {
    const body = entry.envelope.body as unknown;
    if ((body as ContentBody).kind === "Content") {
      const b = body as ContentBody;
      subjects.push({
        id: entry.envelope.subjectId,
        kind: b.contentKind,
        access: entry.envelope.minimumAccess,
        publicationState: entry.envelope.state.publicationState,
        ...(entry.envelope.revision === undefined ? {} : { revision: entry.envelope.revision }),
        ...(b.entitled === undefined ? {} : { entitled: b.entitled }),
        ...(b.attrs === undefined ? {} : { attrs: b.attrs }),
      });
    } else if ((body as RelationBody).kind === "Relation") {
      const b = body as RelationBody;
      relations.push({
        from: b.from, to: b.to, type: b.relationType, access: entry.envelope.minimumAccess,
      });
    } else if ((body as ObservationBody).kind === "Observation") {
      const b = body as ObservationBody;
      // Projected as a signal, never as a subject. An observation with no
      // `about` describes nothing resolvable and is skipped rather than
      // guessed at.
      if (b.about) {
        observations.push({
          id: entry.envelope.subjectId,
          kind: b.observationKind ?? "observation",
          about: b.about,
          access: entry.envelope.minimumAccess,
          body: body as Record<string, unknown>,
        });
      }
    }
    // Schema and Topology bodies are canonical but do not participate in this
    // snapshot shape; they are consumed by other planes.
  }

  subjects.sort((a, b) => a.id.localeCompare(b.id));
  relations.sort((a, b) =>
    a.from.localeCompare(b.from) || a.type.localeCompare(b.type) || a.to.localeCompare(b.to));
  observations.sort((a, b) => a.about.localeCompare(b.about) || a.id.localeCompare(b.id));
  return { snapshotId, subjects, relations, observations };
}

/**
 * Observations about one subject, at one access level.
 *
 * This function is the consumer that makes projecting observations meaningful
 * rather than decorative — declaring a field nothing reads is the failure this
 * project has committed four times (P27, NR-scms-004), and adding
 * `observations` without a reader would have been the fifth.
 *
 * Access is checked against the OBSERVATION's own level, so a private note
 * about a public article is not readable by a public caller.
 */
export function observationsFor(
  snapshot: FrozenSnapshot, subject: string, access: AccessLevel,
): SnapshotObservation[] {
  const rank: Record<AccessLevel, number> = { public: 0, member: 1, owner: 2, admin: 3 };
  return snapshot.observations.filter(
    (o) => o.about === subject && rank[o.access] <= rank[access]);
}

/** Entries excluded from the current snapshot, with why — history stays legible. */
export function excludedFromSnapshot(journal: CanonJournal): Array<{ entry: JournalEntry; reason: string }> {
  return journal.all()
    .filter((e) => e.supersededBy !== null || e.revoked)
    .map((e) => ({ entry: e, reason: e.revoked ? "revoked" : `superseded by ${e.supersededBy}` }));
}
