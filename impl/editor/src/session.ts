/**
 * An editing session (SCMS-042, epic E12 · the instrument P7 needs).
 *
 * The owner's instruction was to settle P7 — divergence-first branching versus
 * convergent merge for prose — *by migrating content through the editor*. That
 * is the right way to settle it, and it means this module's job is to make real
 * editing possible and observable, **not** to simulate editing and call the
 * result evidence. Synthetic edits would answer the question with data I made
 * up, which is the failure this project exists to avoid.
 *
 * So: a session lands edits through `content.revise@1` like any other write, and
 * records what actually happened in a form P7 can be decided from. The decision
 * stays open until real edits accumulate. §8.5's deferral asked for exactly this
 * — *"a real editing workload rather than a fixture"*.
 *
 * What is recorded per edit, and why each bears on P7:
 *
 * - `lane` — which invariance class the touched fields fall in. P7 only governs
 *   the `free` lane; edits to bounded or required fields are already settled.
 * - `overlapped` — whether another session had landed a change to the *same*
 *   slot since this session's baseline. Convergent merge is only ever tested by
 *   overlap; non-overlapping edits merge correctly under any model, so counting
 *   them would inflate the case for convergence.
 * - `outcome` — what the contract did. A conflict that was surfaced is a data
 *   point *for* divergence; a silent convergence that produced text neither
 *   author wrote is the case *against* it.
 */
import type { CanonJournal } from "../../canon/src/journal.ts";
import type { ContractRegistry, ExecutionContext } from "../../contracts/src/runtime.ts";

/** DESIGN.md §8.5 — invariance decides the concurrency discipline. */
export type Lane = "free" | "bounded" | "required";

const REQUIRED_FIELDS = new Set(["subjectId", "compatibility", "minimumAccess", "state", "provenance"]);
const BOUNDED_FIELDS = new Set(["slots", "tags", "attrs"]);
/** Prose bodies are the only genuinely free field in the narrow path. */
const FREE_SLOTS = new Set(["body", "summary"]);

export function laneFor(changedPaths: string[]): Lane {
  if (changedPaths.some((p) => REQUIRED_FIELDS.has(p.split("/")[0]))) return "required";
  const slotNames = changedPaths
    .filter((p) => p.startsWith("slots/"))
    .map((p) => p.split("/")[1]);
  if (slotNames.length > 0 && slotNames.every((n) => FREE_SLOTS.has(n))) return "free";
  if (changedPaths.some((p) => BOUNDED_FIELDS.has(p.split("/")[0]))) return "bounded";
  return "bounded";
}

export interface P7Observation {
  subjectId: string;
  session: string;
  lane: Lane;
  changedPaths: string[];
  /** Another session landed a change to one of these same paths since baseline. */
  overlapped: boolean;
  outcome: string;
  /** Present on conflict: what the session held versus what Canon holds. */
  expected?: string;
  actual?: string;
  occurredAt: string;
}

export interface EditResult {
  outcome: string;
  observation: P7Observation;
  /** The revision this session should now hold, when the edit landed. */
  revision?: string;
}

export interface EditSessionInput {
  /**
   * Declared-type enforcement for the resulting body (NR-scms-020).
   *
   * Both editor call sites already passed this — as a sibling of `context`,
   * where `landEdit` never looked, so it was silently discarded and every edit
   * made through the editor landed unchecked. An edit deleting a required slot
   * returned `completed` and left a schema-invalid record.
   *
   * Threading it here rather than fixing the call sites is deliberate: a caller
   * that has to put a value in exactly the right place is a caller that will
   * eventually put it in the wrong one, and nothing type-checks these objects at
   * runtime. Now the sink accepts it and forwards it, so both shapes work and
   * neither is silently dropped.
   */
  validateBody?: (body: Record<string, unknown>) => Array<{ code: string; at: string; detail: string }>;
  journal: CanonJournal;
  registry: ContractRegistry;
  subjectId: string;
  session: string;
  /** The revision this session last read — its baseline. */
  baselineRevision: string;
  /** Slot-level changes, as the editor produces them. */
  changes: Record<string, unknown>;
  context: Omit<ExecutionContext, "instanceId">;
  actor: { id: string; role: string };
}

/**
 * Land one edit and observe it.
 *
 * Overlap is computed against Canon *before* the write is attempted, because
 * afterwards the answer is unrecoverable: a conflict tells you the revision
 * moved but not whether it moved on the fields you touched, and that difference
 * is the whole of what P7 turns on.
 */
export function landEdit(input: EditSessionInput): EditResult {
  const changedPaths = pathsOf(input.changes);
  const lane = laneFor(changedPaths);

  const current = input.journal.current().find((e) => e.envelope.subjectId === input.subjectId);
  const baseline = input.journal.get(input.baselineRevision);
  const overlapped = current !== undefined && baseline !== undefined
    && current.envelope.revision !== input.baselineRevision
    && touchesSame(baseline.envelope.body as Record<string, unknown>,
                   current.envelope.body as Record<string, unknown>, changedPaths);

  const result = input.registry.execute(input.journal, {
    contract: "icp:interaction/content.revise@1.0.0",
    requestId: `edit-${input.session}`,
    actor: input.actor,
    input: { subjectId: input.subjectId, expectedRevision: input.baselineRevision, changes: input.changes },
  } as never, {
    ...input.context,
    instanceId: `edit-${input.session}`,
    // An explicit validator on the input wins; one already inside the context
    // still works, so neither placement is dropped.
    ...(input.validateBody ? { validateBody: input.validateBody } : {}),
  } as never);

  const landedRevision = result.outcome === "completed"
    ? input.journal.current().find((e) => e.envelope.subjectId === input.subjectId)?.envelope.revision
    : undefined;

  return {
    outcome: result.outcome,
    ...(landedRevision === undefined ? {} : { revision: landedRevision }),
    observation: {
      subjectId: input.subjectId, session: input.session, lane, changedPaths, overlapped,
      outcome: result.outcome,
      ...(result.outcome === "conflict"
        ? { expected: input.baselineRevision, actual: current?.envelope.revision ?? "none" }
        : {}),
      occurredAt: input.context.occurredAt,
    },
  };
}

function pathsOf(changes: Record<string, unknown>, prefix = ""): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(changes)) {
    const path = prefix ? `${prefix}/${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) out.push(...pathsOf(v as Record<string, unknown>, path));
    else out.push(path);
  }
  return out;
}

function touchesSame(
  baseline: Record<string, unknown>, current: Record<string, unknown>, paths: string[],
): boolean {
  return paths.some((p) => JSON.stringify(at(baseline, p)) !== JSON.stringify(at(current, p)));
}

function at(obj: unknown, path: string): unknown {
  return path.split("/").reduce<unknown>(
    (acc, k) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[k] : undefined), obj);
}

/**
 * What the accumulated observations say about P7 — and, deliberately, how much
 * they are worth. A recommendation from three edits is not a recommendation.
 */
export interface P7Summary {
  totalEdits: number;
  freeLaneEdits: number;
  overlappingFreeLaneEdits: number;
  conflictsSurfaced: number;
  /** Honest reading of whether this is enough to decide on. */
  sufficient: boolean;
  reading: string;
}

/** The floor below which no recommendation is offered. Stated, not implied. */
export const P7_EVIDENCE_FLOOR = 30;

export function summarizeP7(observations: P7Observation[]): P7Summary {
  const free = observations.filter((o) => o.lane === "free");
  const overlapping = free.filter((o) => o.overlapped);
  const conflicts = observations.filter((o) => o.outcome === "conflict");
  const sufficient = overlapping.length >= P7_EVIDENCE_FLOOR;

  return {
    totalEdits: observations.length,
    freeLaneEdits: free.length,
    overlappingFreeLaneEdits: overlapping.length,
    conflictsSurfaced: conflicts.length,
    sufficient,
    reading: sufficient
      ? `${overlapping.length} overlapping free-lane edits observed — enough to characterise how often real prose editing actually collides.`
      : `${overlapping.length} overlapping free-lane edits observed, floor is ${P7_EVIDENCE_FLOOR}. `
        + "P7 remains undecided: non-overlapping edits merge correctly under any model, so they say nothing "
        + "about convergence, and deciding from them would be deciding from a fixture by another name.",
  };
}
