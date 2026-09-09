/**
 * The governed import (SCMS-041, epic E8+E12).
 *
 * The owner directed migration *through the editor*. Doing that surfaced the
 * fact that it was not possible: `content.revise` needs an existing revision and
 * there was no create contract, so every import this project had ever run used
 * a direct `journal.append` from a test file — the one place the write-boundary
 * gate exempts. Creation was not a governed operation at all (SCMS-041 added
 * `content.create@1`).
 *
 * This module is the real path: envelopes produced by the mapping are offered to
 * the contract registry one at a time, with a proven authority, and whatever the
 * registry says is what happens.
 *
 * **The consequence worth reading before running it.** `content.create@1` fixes
 * the state of a new record: draft, unqualified, unpublished. So an entry that
 * was `published` on the old site does **not** arrive published here. That is
 * not a limitation of the importer — it is the system's central claim applied to
 * its own migration. Publishing is qualification plus promotion, and a record
 * cannot inherit either by being copied. Re-publishing the previously-live
 * entries is a deliberate act, and the report says how many that is.
 */
import type { Envelope } from "../../canon/src/envelope.ts";
import { canonicalJson } from "../../canon/src/envelope.ts";
import type { CanonJournal } from "../../canon/src/journal.ts";
import type { ContractRegistry, ExecutionContext } from "../../contracts/src/runtime.ts";
import type { LiveCanonRevisionPlan } from "./live-reconcile.ts";

export interface ImportOutcome {
  subjectId: string;
  outcome: string;
  detail?: string;
}

export interface ImportReport {
  landed: ImportOutcome[];
  refused: ImportOutcome[];
  /** Entries the SOURCE considered published which did not arrive published. */
  publicationNotCarried: string[];
  eventsEmitted: number;
}

export interface GovernedImportInput {
  /**
   * Optional conformance hook, threaded to the contract runtime.
   *
   * SCMS-022 made declared types load-bearing in the governed write path *when
   * a validator is supplied*, and the import supplied none — so 215 records
   * were created without their declared type ever being consulted, and the
   * mismatch only surfaced later at qualification (NR-scms-016). Passing it
   * here means creation refuses non-conformant content, which is where a type
   * is supposed to bite.
   */
  validateBody?: (body: Record<string, unknown>) => Array<{ code: string; at: string; detail: string }>;
  journal: CanonJournal;
  registry: ContractRegistry;
  envelopes: Envelope[];
  /** Proven authority for the import run. Import is owner work. */
  context: Omit<ExecutionContext, "instanceId">;
  actor: { id: string; role: string };
}

export function governedImport(input: GovernedImportInput): ImportReport {
  const landed: ImportOutcome[] = [];
  const refused: ImportOutcome[] = [];
  const publicationNotCarried: string[] = [];
  const before = input.journal.events().length;

  input.envelopes.forEach((env, i) => {
    const body = env.body as unknown as { contentKind?: string; kind?: string };
    const result = input.registry.execute(input.journal, {
      contract: "icp:interaction/content.create@1.0.0",
      requestId: `import-${i}`,
      actor: input.actor,
      input: {
        subjectId: env.subjectId,
        contentKind: body.contentKind ?? body.kind ?? "unknown",
        body: env.body as unknown as Record<string, unknown>,
        minimumAccess: env.minimumAccess,
        source: env.provenance.source ?? "import",
      } as unknown as Record<string, unknown>,
    }, {
      ...input.context, instanceId: `import-${i}`,
      ...(input.validateBody ? { validateBody: input.validateBody } : {}),
    });

    const row: ImportOutcome = {
      subjectId: env.subjectId, outcome: result.outcome,
      ...(result.detail === undefined ? {} : { detail: result.detail }),
    };
    if (result.outcome === "completed") {
      landed.push(row);
      if (env.state.publicationState === "promoted") publicationNotCarried.push(env.subjectId);
    } else {
      refused.push(row);
    }
  });

  return {
    landed, refused, publicationNotCarried,
    eventsEmitted: input.journal.events().length - before,
  };
}

export interface HistoryMigrationReceipt {
  sourceEntryId: string;
  sourceRevisionId: string | null;
  sourceKind: LiveCanonRevisionPlan["sourceKind"];
  sourceStateHash: string;
  targetRevision: string;
  priorTargetRevision: string | null;
}

export interface GovernedHistoryImportReport {
  receipts: HistoryMigrationReceipt[];
  refused: ImportOutcome[];
  eventsEmitted: number;
}

/** Execute a planned live history through the governed create/revise path. */
export function governedHistoryImport(input: {
  journal: CanonJournal;
  registry: ContractRegistry;
  plan: LiveCanonRevisionPlan[];
  context: Omit<ExecutionContext, "instanceId">;
  actor: { id: string; role: string };
}): GovernedHistoryImportReport {
  const receipts: HistoryMigrationReceipt[] = [];
  const refused: ImportOutcome[] = [];
  const before = input.journal.events().length;
  let activeEntryId: string | null = null;
  let targetRevision: string | null = null;

  input.plan.forEach((item, index) => {
    const first = activeEntryId !== item.sourceEntryId;
    const result = input.registry.execute(input.journal, {
      contract: first ? "icp:interaction/content.create@1.0.0" : "icp:interaction/content.revise@1.0.0",
      requestId: `live-history-${index}`,
      actor: input.actor,
      input: first ? {
        subjectId: item.envelope.subjectId,
        contentKind: (item.envelope.body as { contentKind?: string }).contentKind ?? "unknown",
        body: item.envelope.body as Record<string, unknown>,
        minimumAccess: item.envelope.minimumAccess,
        source: item.envelope.provenance.source,
      } : {
        subjectId: item.envelope.subjectId,
        expectedRevision: targetRevision,
        changes: item.envelope.body as Record<string, unknown>,
      },
    }, { ...input.context, instanceId: `live-history-${index}` });
    if (result.outcome !== "completed" || !result.receipt) {
      refused.push({ subjectId: item.envelope.subjectId, outcome: result.outcome, ...(result.detail ? { detail: result.detail } : {}) });
      return;
    }
    const receipt = result.receipt as unknown as { after?: string; afterVersion?: string };
    const landedRevision = receipt.afterVersion ?? receipt.after;
    if (!landedRevision) throw new Error(`governed history receipt omitted target revision for ${item.sourceEntryId}`);
    const landed = input.journal.get(landedRevision);
    if (!landed || canonicalJson(landed.envelope.body) !== canonicalJson(item.envelope.body)) {
      throw new Error(`governed history body mismatch for ${item.sourceEntryId} (${item.sourceKind}:${index})`);
    }
    receipts.push({
      sourceEntryId: item.sourceEntryId,
      sourceRevisionId: item.sourceRevisionId,
      sourceKind: item.sourceKind,
      sourceStateHash: item.sourceStateHash,
      targetRevision: landedRevision,
      priorTargetRevision: first ? null : targetRevision,
    });
    activeEntryId = item.sourceEntryId;
    targetRevision = landedRevision;
  });
  return { receipts, refused, eventsEmitted: input.journal.events().length - before };
}
