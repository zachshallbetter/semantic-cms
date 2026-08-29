/**
 * content.unpublish@1 (SCMS-020) — the compensation promote declares.
 *
 * ICP separates reversibility from recovery: an effect labelled `compensatable`
 * must have a compensation that can actually execute. Promotion declared this
 * interaction on every receipt before it existed; this makes the declaration
 * real.
 *
 * Compensation is forward motion, not erasure: unpublishing appends a new
 * revision moving `publicationState` back to `unpublished`. Canon retains the
 * promoted revision as history, so the record can explain what it did and when.
 *
 * Consequence class E2 (reversible/compensable operational mutation) →
 * verification `confirm`, deliberately weaker than promote's E3/reauthenticate:
 * undoing exposure is less consequential than creating it.
 */
import type { CanonJournal } from "../../canon/src/journal.ts";
import type { Envelope } from "../../canon/src/envelope.ts";
import type {
  ContractDefinition, ExecutionContext, ExecutionRequest, ExecutionResult,
} from "../../contracts/src/runtime.ts";
import { receiptDigest } from "../../contracts/src/runtime.ts";
import type { ChangeReceipt, InstanceState } from "../../contracts/src/icp.ts";
import { VERIFICATION_FOR_EFFECT } from "../../contracts/src/icp.ts";
import { CONTENT_PROMOTE } from "./promote.ts";

export const CONTENT_UNPUBLISH: ContractDefinition = {
  id: "icp:interaction/content.unpublish",
  version: "1.0.0",
  effectClass: "E2",
  reversibility: "reversible",
  resourceType: "content",
  /** Symmetry: unpublishing is itself compensated by promoting again. */
  compensationInteraction: CONTENT_PROMOTE.id,
};

export interface UnpublishInput {
  subjectId: string;
  /** The promoted revision being compensated. */
  promotedRevision: string;
  verificationPerformed?: "none" | "acknowledge" | "confirm" | "reauthenticate" | "prove";
  authority?: string;
  reason?: string;
}

const RANK = { none: 0, acknowledge: 1, confirm: 2, reauthenticate: 3, prove: 4 };

export function unpublishHandler(
  journal: CanonJournal, req: ExecutionRequest, def: ContractDefinition, ctx: ExecutionContext,
): ExecutionResult {
  const states: InstanceState[] = ["declared", "ready", "started", "validating"];
  const required = VERIFICATION_FOR_EFFECT[def.effectClass];   // E2 → confirm
  const input = req.input as unknown as UnpublishInput;

  const target = input?.promotedRevision ? journal.get(input.promotedRevision) : undefined;
  if (!target) {
    return {
      instanceId: ctx.instanceId, outcome: "not_found", states: [...states, "failed"], verification: required,
      recovery: [{ action: "refresh_record", data: { subjectId: input?.subjectId ?? "unknown" } }],
      detail: `unknown revision ${input?.promotedRevision ?? "(none)"}`,
    };
  }

  // Refusing a no-op is information: silently "succeeding" would let a caller
  // believe it compensated something it did not.
  if (target.envelope.state.publicationState !== "promoted") {
    return {
      instanceId: ctx.instanceId, outcome: "blocked", states: [...states, "blocked"], verification: required,
      recovery: [{ action: "open_record", data: {
        subjectId: input.subjectId, publicationState: target.envelope.state.publicationState,
      } }],
      detail: `only a promoted revision can be unpublished; this one is '${target.envelope.state.publicationState}'`,
    };
  }
  if (target.supersededBy !== null) {
    return {
      instanceId: ctx.instanceId, outcome: "conflict", states: [...states, "conflicted"], verification: required,
      recovery: [{ action: "refresh_record", data: { successor: target.supersededBy } }],
      detail: "the promoted revision has been superseded; compensate the current one",
    };
  }

  const performed = input.verificationPerformed ?? "none";
  if (RANK[performed] < RANK[required]) {
    return {
      instanceId: ctx.instanceId, outcome: "verification_required",
      states: [...states, "verification_required"], verification: required,
      recovery: [{ action: "reauthenticate", data: { required, performed } }],
      detail: `unpublishing requires ${required} verification`,
    };
  }
  if (!input.authority) {
    return {
      instanceId: ctx.instanceId, outcome: "blocked", states: [...states, "blocked"], verification: required,
      recovery: [{ action: "request_access", data: { need: "named authority" } }],
      detail: "compensation must be attributable to a named authority",
    };
  }

  states.push("compensating");
  const before = target.envelope.state;
  const next: Envelope = {
    ...target.envelope,
    state: { ...before, publicationState: "unpublished" },
    revision: undefined,
  };
  const landed = journal.supersede(input.promotedRevision, next, input.authority);

  const base: Omit<ChangeReceipt, "integrity"> = {
    id: `rcpt_${ctx.instanceId}`, interaction: def.id, contractVersion: def.version,
    instanceId: ctx.instanceId, requestId: req.requestId, actor: req.actor,
    resource: { type: def.resourceType, id: input.subjectId },
    beforeVersion: input.promotedRevision, afterVersion: landed.envelope.revision!,
    changes: [{ path: "/state/publicationState", before: "promoted", after: "unpublished" }],
    occurredAt: ctx.occurredAt, reversibility: def.reversibility,
    compensationInteraction: def.compensationInteraction,
  };
  return {
    instanceId: ctx.instanceId, outcome: "compensated", states: [...states, "completed"],
    verification: required,
    receipt: { ...base, integrity: { algorithm: "sha-256", digest: receiptDigest(base) } },
    recovery: [],
  };
}
