/**
 * The editor's view-model (SCMS-040, epic E12 · closes SH-8's remaining half).
 *
 * The owner named the gap: *"We don't have a UI for the cms yet."* SCMS-031
 * built what the editor may OFFER; this builds what a person actually SEES, as
 * data, so the honesty properties can be tested rather than drawn.
 *
 * Four things this editor does that a generic CMS editor does not, each of them
 * a rendering of a rule the system already holds:
 *
 * 1. **Publish is visibly not Save.** `content.revise` is E1 and reversible;
 *    `content.promote` is E3 and compensatable. The view carries that weight so
 *    the interface cannot present them as the same gesture (DESIGN.md §6).
 * 2. **A withheld operation is shown with its reason.** Hiding an unavailable
 *    action teaches a person the system is arbitrary. Naming the reason —
 *    unqualified, under-verified, conflicted — turns a blocked button into an
 *    instruction (ICP recovery vocabulary).
 * 3. **The chip never claims live without a check.** Reused verbatim from
 *    SCMS-017 rather than reimplemented, because a second implementation of an
 *    honesty rule is a second chance to get it wrong.
 * 4. **Migration findings surface where they can be resolved.** SCMS-028
 *    refused to guess on 22 entries whose source `status` mixed two
 *    vocabularies. Those findings appear on the entry itself: the ambiguity the
 *    importer declined to launder is handed to the person who can actually
 *    settle it.
 *
 * SCMS-044 (closing SH-16) routed this through the surface pipeline. It used to
 * read Canon directly and carry its own access comparison, which meant the one
 * place a person meets this system was the one place that collapsed
 * `CANON != SURFACE != EXPRESSION != REPRESENTATION` into a hand-written page —
 * and, worse, held a *second* implementation of the access rule. Two
 * implementations of an access rule is a second chance to get it wrong, which
 * is precisely how NR-scms-004 and NR-scms-006 happened.
 *
 * Now the editor resolves a `ResolvedSurface` with `purpose: "edit"` and reads
 * membership from it. Access is decided once, by the resolver that is vectored
 * for it. What remains here is what the resolver has no business knowing: the
 * *domain* preconditions on an operation — already published, no attestation,
 * conflicted — which are not access questions. Exposure comes from the surface;
 * eligibility comes from state. SSS-INV-010 draws exactly that line.
 */
import type { CanonJournal } from "../../canon/src/journal.ts";
import type { Envelope, AccessLevel } from "../../canon/src/envelope.ts";
import { freeze } from "../../canon/src/freeze.ts";
import { resolveSurface } from "../../surface-resolver/src/resolver.ts";
import { isFailure } from "../../surface-resolver/src/types.ts";
import type { ResolvedSurface } from "../../surface-resolver/src/types.ts";
import { editorRequest } from "../../authoring/src/editor.ts";
import { consistencyState, permits, chip } from "../../observation/src/consistency.ts";
import type { ClientBaseline, Freshness, ConsistencyState } from "../../observation/src/consistency.ts";
import type { AuthoringOffer } from "../../authoring/src/editor.ts";
import type { MigrationFinding } from "../../migrate/src/zach-core.ts";

export type OperationWeight = "routine" | "consequential";

export interface OperationView {
  intent: string;
  label: string;
  /** From the contract's declared effect class — the editor never re-classifies. */
  effectClass: string;
  weight: OperationWeight;
  enabled: boolean;
  /** Why it is unavailable. Always present when disabled; never a bare greyed-out control. */
  reason?: string;
  /** For a compensatable operation, the way back — shown before the door, not after. */
  compensation?: string;
}

export interface SlotView { name: string; kind: string; value: string | null; editable: boolean }

export interface EditorView {
  subject: string;
  title: string;
  contentKind: string;
  slots: SlotView[];
  /** The four independent axes, never collapsed to one status (§3.5). */
  state: { semanticMaturity: string; evidenceState: string; publicationState: string; deliveryState: string };
  access: AccessLevel;
  listed: boolean;
  consistency: ConsistencyState;
  consistencyReason: string;
  chip: string;
  canDraft: boolean;
  canActConsequentially: boolean;
  operations: OperationView[];
  /** Offered nowhere, and why — carried so the UI can explain rather than omit. */
  unavailable: Array<{ intent: string; reason: string }>;
  /** Unresolved questions the migration deliberately left for a person. */
  findings: Array<{ code: string; detail: string }>;
}

const LABELS: Record<string, string> = {
  revise: "Save revision", promote: "Publish", unpublish: "Unpublish",
};

const REASON_FOR_WITHHOLDING: Record<string, string> = {
  unimplemented: "no contract implements this yet",
  "missing-compensation": "its compensation is not implemented — the way back must exist first",
};

/** E3 and above is consequential; anything else is routine. */
function weigh(effectClass: string): OperationWeight {
  return effectClass === "E3" || effectClass === "E4" ? "consequential" : "routine";
}

export interface EditorInput {
  journal: CanonJournal;
  /** Explicit freeze identity — the resolver's purity depends on no ambient "now". */
  snapshotId?: string;
  subject: string;
  access: AccessLevel;
  offer: AuthoringOffer;
  baseline: ClientBaseline;
  freshness: Freshness;
  /** Findings the migration raised for this subject, if any. */
  findings?: MigrationFinding[];
  /** Whether a QUALIFIED attestation currently covers the entry's revision. */
  qualified?: boolean;
}

export function editorView(input: EditorInput): EditorView | { notFound: true } {
  // RESOLVE. The editor is a surface, not a page that queries Canon (§11).
  // Access is decided here and only here — this function no longer carries an
  // access comparison of its own, because the resolver already has one that is
  // vectored against the real corpus.
  //
  // Refusal collapses to `notFound` for both "absent" and "inaccessible":
  // distinguishing them tells an unauthorized caller that the subject exists
  // (§5 disclosure rule), which is also why the resolver's own failure classes
  // are not passed through to the caller here.
  const snapshot = freeze(input.journal, input.snapshotId ?? "editor");
  const surface = resolveSurface(
    snapshot as never, editorRequest(input.subject, input.access, input.offer));
  if (isFailure(surface)) return { notFound: true };
  const resolved = surface as ResolvedSurface;

  // HYDRATE — for surface members only. The editor may look up, never look
  // around; the same discipline `deriveFeed` holds in impl/reader.
  const members = new Set(resolved.groups.flatMap((g) => g.members.map((m) => m.subject)));
  if (!members.has(input.subject)) return { notFound: true };
  const entry = input.journal.current().find((e) => e.envelope.subjectId === input.subject);
  if (!entry) return { notFound: true };
  const env = entry.envelope as Envelope;
  const body = env.body as unknown as {
    contentKind: string;
    slots: Record<string, Array<{ kind: string; value?: unknown }>>;
    attrs?: Record<string, unknown>;
  };

  const assessment = consistencyState(input.baseline, input.journal);
  const canDraft = permits(assessment.state, "draft");
  const canAct = permits(assessment.state, "consequential");

  const slots: SlotView[] = Object.entries(body.slots ?? {}).map(([name, parts]) => ({
    name,
    kind: parts[0]?.kind ?? "text",
    value: typeof parts[0]?.value === "string" ? (parts[0].value as string) : null,
    // Drafting continues wherever the document is coherent — the §8.6 asymmetry
    // is what keeps a conflicted entry typeable while its publish stays frozen.
    editable: canDraft,
  }));

  // Exposure is the SURFACE's answer; eligibility is the STATE's. SSS-INV-010:
  // exposure does not imply permission, so a surface saying `available` is not
  // the same as this view saying `enabled`.
  const exposureOf = new Map(resolved.operations.map((o) => [o.id, o.exposure]));

  const operations: OperationView[] = input.offer.operations.map((op) => {
    const weight = weigh(op.effectClass);
    let enabled = true;
    let reason: string | undefined;

    const exposure = exposureOf.get(op.contract);
    if (exposure !== "available") {
      enabled = false;
      reason = `withheld at ${input.access} access`;
    } else if (weight === "consequential" && !canAct) {
      enabled = false;
      reason = `consistency is '${assessment.state}' — ${assessment.reason}`;
    } else if (!canDraft) {
      enabled = false;
      reason = `consistency is '${assessment.state}' — ${assessment.reason}`;
    } else if (op.intent === "promote") {
      if (env.state.publicationState === "promoted") {
        enabled = false; reason = "already published";
      } else if (input.qualified !== true) {
        enabled = false; reason = "no qualified attestation covers this revision";
      }
    } else if (op.intent === "unpublish" && env.state.publicationState !== "promoted") {
      enabled = false; reason = "not currently published";
    }

    return {
      intent: op.intent, label: LABELS[op.intent] ?? op.intent,
      effectClass: op.effectClass, weight, enabled,
      ...(reason === undefined ? {} : { reason }),
      ...(op.compensation === undefined ? {} : { compensation: op.compensation }),
    };
  });

  return {
    subject: env.subjectId,
    title: typeof body.slots?.title?.[0]?.value === "string" ? body.slots.title[0].value as string : env.subjectId,
    contentKind: body.contentKind,
    slots,
    state: env.state as EditorView["state"],
    access: env.minimumAccess,
    listed: body.attrs?.listed === true,
    consistency: assessment.state,
    consistencyReason: assessment.reason,
    chip: chip(assessment.state, input.freshness),
    canDraft,
    canActConsequentially: canAct,
    operations,
    unavailable: input.offer.withheld.map((w) => ({
      intent: w.intent, reason: REASON_FOR_WITHHOLDING[w.reason] ?? w.reason,
    })),
    findings: (input.findings ?? []).map((f) => ({ code: f.code, detail: f.detail })),
  };
}

export interface IndexRow {
  subject: string; title: string; kind: string;
  publicationState: string; access: AccessLevel; listed: boolean;
  /** Number of unresolved migration findings — the work queue, surfaced. */
  openFindings: number;
}

/** The corpus as an author sees it, filtered by what this actor may reach. */
export function editorIndex(
  journal: CanonJournal, access: AccessLevel, findings: MigrationFinding[] = [],
  snapshotId = "editor-index",
): IndexRow[] {
  const bySubject = new Map<string, number>();
  for (const f of findings) {
    const slug = f.entry.replace(/^.*\//, "").replace(/\.md$/, "");
    bySubject.set(slug, (bySubject.get(slug) ?? 0) + 1);
  }

  // A collection surface, not a filtered journal scan. This carried the last
  // hand-rolled access comparison in the editor; it now has none, so there is
  // exactly one implementation of the access rule in the read path.
  //
  // Note what this lens deliberately does NOT do: it omits the reader's
  // `listed === true` predicate. An author must see unlisted and unpublished
  // work — that is the whole job — while a reader's discovery surface must not.
  // Same resolver, different lens, and the difference is declared rather than
  // emergent.
  const snapshot = freeze(journal, snapshotId);
  const surface = resolveSurface(snapshot as never, {
    profile: "collection", purpose: "edit", access,
  });
  if (isFailure(surface)) return [];

  const byId = new Map(journal.current().map((e) => [e.envelope.subjectId, e]));
  return (surface as ResolvedSurface).groups
    .flatMap((g) => g.members.map((m) => m.subject))
    .map((subject) => {
      const e = byId.get(subject);
      if (!e) return null;
      const body = e.envelope.body as unknown as {
        contentKind: string; slots?: Record<string, Array<{ value?: unknown }>>;
        attrs?: Record<string, unknown>;
      };
      if (body.contentKind === undefined) return null;
      return {
        subject: e.envelope.subjectId,
        title: typeof body.slots?.title?.[0]?.value === "string"
          ? body.slots.title[0].value as string : e.envelope.subjectId,
        kind: body.contentKind,
        publicationState: e.envelope.state.publicationState,
        access: e.envelope.minimumAccess,
        listed: body.attrs?.listed === true,
        openFindings: bySubject.get(e.envelope.subjectId) ?? 0,
      };
    })
    .filter((r): r is IndexRow => r !== null)
    .sort((a, b) => a.title.localeCompare(b.title));
}
