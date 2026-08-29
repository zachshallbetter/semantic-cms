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
 */
import type { CanonJournal } from "../../canon/src/journal.ts";
import type { Envelope, AccessLevel } from "../../canon/src/envelope.ts";
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

const ACCESS_RANK: Record<AccessLevel, number> = { public: 0, member: 1, owner: 2, admin: 3 };

export function editorView(input: EditorInput): EditorView | { notFound: true } {
  const entry = input.journal.current().find((e) => e.envelope.subjectId === input.subject);
  // Access is checked here, not merely accepted. An earlier draft of this
  // function took `access` and never consumed it, so a public actor could open
  // a private entry in the editor — the declaration-without-a-consumer failure
  // (NR-scms-004), this time as an access leak. Caught by its own vector.
  //
  // The refusal is `notFound` rather than `forbidden`: distinguishing the two
  // tells an unauthorized caller that the subject exists (§5 disclosure rule).
  if (!entry) return { notFound: true };
  if (ACCESS_RANK[entry.envelope.minimumAccess] > ACCESS_RANK[input.access]) {
    return { notFound: true };
  }
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

  const operations: OperationView[] = input.offer.operations.map((op) => {
    const weight = weigh(op.effectClass);
    let enabled = true;
    let reason: string | undefined;

    if (weight === "consequential" && !canAct) {
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
): IndexRow[] {
  const rank = { public: 0, member: 1, owner: 2, admin: 3 };
  const bySubject = new Map<string, number>();
  for (const f of findings) {
    const slug = f.entry.replace(/^.*\//, "").replace(/\.md$/, "");
    bySubject.set(slug, (bySubject.get(slug) ?? 0) + 1);
  }
  return journal.current()
    .filter((e) => rank[e.envelope.minimumAccess] <= rank[access])
    .map((e) => {
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
