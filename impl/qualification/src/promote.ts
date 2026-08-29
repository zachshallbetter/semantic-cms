/**
 * content.promote@1 (SCMS-013) — promotion as a separate authority.
 *
 * EQP §16: QUALIFIED does not mean deploy, publish, release, or adopt. Those
 * are external authority. This contract is the boundary: it refuses a
 * non-qualified candidate, refuses without the verification its consequence
 * class demands, and — when it does act — moves only the publicationState axis.
 *
 * It performs no external publication. Actual delivery is a protected action
 * requiring owner promotion authority (bindings: authority_bindings.promotion)
 * and is deliberately outside this narrow slice.
 */
import type { CanonJournal } from "../../canon/src/journal.ts";
import type { Envelope } from "../../canon/src/envelope.ts";
import type { ContractDefinition, ExecutionContext, ExecutionRequest, ExecutionResult } from "../../contracts/src/runtime.ts";
import { receiptDigest } from "../../contracts/src/runtime.ts";
import type { ChangeReceipt, InstanceState } from "../../contracts/src/icp.ts";
import type { Attestation } from "./qualify.ts";
import type { ConsequenceProfile } from "./eqp.ts";
import { PROFILES } from "./eqp.ts";

export const CONTENT_PROMOTE: ContractDefinition = {
  id: "icp:interaction/content.promote",
  version: "1.0.0",
  minAuthority: "owner",
  effectClass: "E3",                 // consequential external commitment
  reversibility: "compensatable",
  resourceType: "content",
  compensationInteraction: "icp:interaction/content.unpublish",
};

export interface PromoteInput {
  subjectId: string;
  candidateRevision: string;
  attestation: Attestation;
  profile: ConsequenceProfile;
  /** Verification actually performed by the caller, if any. */
  verificationPerformed?: "none" | "acknowledge" | "confirm" | "reauthenticate" | "prove";
  /** The named authority acting. Promotion is never anonymous. */
  promotionAuthority?: string;
}

const VERIFICATION_RANK = { none: 0, acknowledge: 1, confirm: 2, reauthenticate: 3, prove: 4 };

export function promoteHandler(
  journal: CanonJournal, req: ExecutionRequest, def: ContractDefinition, ctx: ExecutionContext,
): ExecutionResult {
  const states: InstanceState[] = ["declared", "ready", "started", "validating"];
  const input = req.input as unknown as PromoteInput;

  // GATE 0 — resolve the consequence profile from the CANONICAL table by id.
  //
  // The profile decides how strong the verification must be, so reading it from
  // caller input let the caller decide how hard to gate themselves: a forged
  // `{...COMMITMENT_PROFILE, promotionVerification: "none"}` promoted a
  // `prove`-tier commitment with zero verification, using entirely legitimate
  // owner authority and no trickery (NR-scms-006). Only the id is taken from
  // input; every gating field comes from PROFILES.
  const profile = PROFILES[input?.profile?.id as ConsequenceProfile["id"]];
  if (!profile) {
    return {
      instanceId: ctx.instanceId, outcome: "invalid_input", states: [...states, "failed"],
      verification: "prove",   // refuse at the strongest level, never the weakest
      recovery: [{ action: "focus_field", data: { field: "profile.id", known: Object.keys(PROFILES).join(",") } }],
      detail: `unknown consequence profile '${String(input?.profile?.id)}'; profiles are canonical, not supplied`,
    };
  }
  const required = profile.promotionVerification;

  // GATE 1 — qualification. A candidate that is not QUALIFIED cannot promote,
  // and BLOCKED (coverage gap) is reported as needing evidence, not as a
  // finding against the candidate.
  const att = input?.attestation;
  if (!att || att.disposition !== "QUALIFIED") {
    const blocked = att?.disposition === "BLOCKED";
    return {
      instanceId: ctx.instanceId,
      outcome: blocked ? "needs_evidence" : "blocked",
      states: [...states, "blocked"],
      verification: required,
      recovery: [
        { action: "replace_evidence", data: {
          candidateRevision: input?.candidateRevision ?? "unknown",
          disposition: att?.disposition ?? "none",
          missing: (att?.outcomes ?? []).filter((o) => !o.satisfied).map((o) => o.obligation).join(",") || "unknown",
        } },
      ],
      detail: `promotion requires a QUALIFIED attestation; got ${att?.disposition ?? "none"}`,
    };
  }
  if (att.candidateRevision !== input.candidateRevision) {
    return {
      instanceId: ctx.instanceId, outcome: "conflict", states: [...states, "conflicted"], verification: required,
      recovery: [{ action: "refresh_record", data: { attestationFor: att.candidateRevision, requested: input.candidateRevision } }],
      detail: "attestation does not cover the requested revision",
    };
  }

  // GATE 2 — verification derived from consequence, never from preference.
  const performed = input.verificationPerformed ?? "none";
  if (VERIFICATION_RANK[performed] < VERIFICATION_RANK[required]) {
    return {
      instanceId: ctx.instanceId, outcome: "verification_required",
      states: [...states, "verification_required"], verification: required,
      recovery: [{ action: "reauthenticate", data: { required, performed } }],
      detail: `profile '${profile.id}' requires ${required} verification`,
    };
  }
  if (!input.promotionAuthority) {
    return {
      instanceId: ctx.instanceId, outcome: "blocked", states: [...states, "blocked"], verification: required,
      recovery: [{ action: "request_access", data: { need: "named promotion authority" } }],
      detail: "promotion authority must be named (EQP §16: promotion is external authority)",
    };
  }

  const current = journal.get(input.candidateRevision);
  if (!current) {
    return {
      instanceId: ctx.instanceId, outcome: "not_found", states: [...states, "failed"], verification: required,
      recovery: [{ action: "refresh_record", data: { subjectId: input.subjectId } }],
      detail: `unknown revision ${input.candidateRevision}`,
    };
  }

  // PROCESS — move ONLY the publication axis. Semantic maturity, evidence
  // state, and delivery state are other axes with other owners (§3.5).
  states.push("processing");
  const before = current.envelope.state;
  const next: Envelope = {
    ...current.envelope,
    state: { ...before, publicationState: "promoted" },
    revision: undefined,
  };
  const landed = journal.supersede(input.candidateRevision, next, input.promotionAuthority);

  const base: Omit<ChangeReceipt, "integrity"> = {
    id: `rcpt_${ctx.instanceId}`,
    interaction: def.id, contractVersion: def.version, instanceId: ctx.instanceId, requestId: req.requestId,
    actor: req.actor, resource: { type: def.resourceType, id: input.subjectId },
    beforeVersion: input.candidateRevision, afterVersion: landed.envelope.revision!,
    changes: [{ path: "/state/publicationState", before: before.publicationState, after: "promoted" }],
    occurredAt: ctx.occurredAt, reversibility: def.reversibility,
    compensationInteraction: def.compensationInteraction,
  };
  return {
    instanceId: ctx.instanceId, outcome: "completed", states: [...states, "completed"], verification: required,
    receipt: { ...base, integrity: { algorithm: "sha-256", digest: receiptDigest(base) } },
    recovery: [],
  };
}
