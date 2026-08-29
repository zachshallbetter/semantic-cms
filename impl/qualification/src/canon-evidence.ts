/**
 * Evidence and attestations as Canon records (SCMS-036, epic E3).
 *
 * Closes the last reachable form of one defect this project has now recorded
 * three times: **the party being gated supplied the value that decided the
 * gate.** It appeared as `promotionAuthority` (NR-scms-005), as the consequence
 * profile (NR-scms-006), and here as the attestation itself — `promoteHandler`
 * trusted `input.attestation.disposition === "QUALIFIED"` because a caller
 * passed it.
 *
 * Moving attestations into Canon alone would only relocate the hole, because
 * `qualify()` takes its evidence as an argument too: a caller who cannot forge
 * a disposition can forge the evidence it is computed from. So both halves move:
 *
 * - Evidence is landed by `qualification.record-evidence@1` and read from Canon.
 * - `qualification.attest@1` reads evidence **from Canon, never from input**,
 *   computes the disposition, and lands the attestation.
 * - `content.promote@1` reads the attestation **from Canon, never from input**.
 *
 * Every gate input now arrives through a contract that required authority to
 * execute. What remains open is a genuinely different question — whether an
 * owner may produce evidence for their own work, and what independence a
 * profile should demand — which is policy, registered as SH-13, and not for an
 * implementer to settle. This closes the forgery; it does not pretend to close
 * self-attestation.
 */
import type { Envelope } from "../../canon/src/envelope.ts";
import type { CanonJournal } from "../../canon/src/journal.ts";
import type {
  ContractDefinition, ExecutionContext, ExecutionRequest, ExecutionResult,
} from "../../contracts/src/runtime.ts";
import type { InstanceState } from "../../contracts/src/icp.ts";
import type { EvidenceRecord } from "./eqp.ts";
import { PROFILES } from "./eqp.ts";
import type { ConsequenceProfile } from "./eqp.ts";
import { qualify } from "./qualify.ts";
import type { Attestation } from "./qualify.ts";

export const evidenceSubject = (candidateRevision: string, obligation: string, id: string): string =>
  `evidence:${candidateRevision}:${obligation}:${id}`;
export const attestationSubject = (candidateRevision: string): string =>
  `attestation:${candidateRevision}`;

/** Recording evidence is E1: it makes no external commitment on its own. */
export const RECORD_EVIDENCE: ContractDefinition = {
  id: "icp:interaction/qualification.record-evidence",
  version: "1.0.0",
  minAuthority: "owner",
  effectClass: "E1",
  reversibility: "reversible",
  resourceType: "evidence",
};

export interface RecordEvidenceInput {
  evidence: EvidenceRecord;
  /** When the check ran. */
  observedAt: string;
  /**
   * When this evidence stops counting.
   *
   * Required, and not a formality. Evidence is genuinely *observed* — it reports
   * what a check found — and rr-rsp's freshness rule says observed records carry
   * time bounds or they are not observed. Recording evidence without an expiry
   * would mean classifying it as something it is not in order to avoid saying
   * how long it is good for, which is the sort of convenience that turns EQP's
   * STALE validity into a label nobody can compute.
   */
  expiresAt: string;
}

export const recordEvidenceHandler = (
  journal: CanonJournal, req: ExecutionRequest, def: ContractDefinition, ctx: ExecutionContext,
): ExecutionResult => {
  const states: InstanceState[] = ["declared", "ready", "started", "validating"];
  const input = req.input as unknown as RecordEvidenceInput;
  const e = input?.evidence;
  const missing: string[] = (["id", "obligation", "result", "validity", "candidateRevision", "actor"] as const)
    .filter((k) => e?.[k] === undefined || e[k] === null);
  for (const k of ["observedAt", "expiresAt"] as const) {
    if (!input?.[k]) missing.push(k);
  }
  if (missing.length > 0) {
    return {
      instanceId: ctx.instanceId, outcome: "invalid_input", states: [...states, "failed"],
      verification: "none",
      recovery: missing.map((field) => ({ action: "focus_field" as const, data: { field } })),
      detail: `missing: ${missing.join(", ")}`,
    };
  }

  const envelope: Envelope = {
    schemaVersion: "scms-0.1",
    subjectId: evidenceSubject(e.candidateRevision, e.obligation, e.id),
    compatibility: { protocol: "scms-0.1", subjectSchema: "evidence@1" },
    // Evidence is observed: it reports what a check found, and its independence
    // is recorded rather than assumed (EQP).
    provenance: {
      kind: "observed", authority: e.actor, source: `evaluator:${e.actor}`,
      observedAt: input.observedAt, expiresAt: input.expiresAt,
    },
    minimumAccess: "owner",
    // Body kinds are a closed canonical vocabulary (Schema, Content, Relation,
    // Observation, Topology). Evidence is an Observation with its own kind tag,
    // the same pattern the derived semantic field uses — extending the
    // vocabulary would be a DESIGN.md change, not an implementer's call.
    body: { kind: "Observation", observationKind: "evidence", ...e } as Envelope["body"],
    state: {
      semanticMaturity: "complete", evidenceState: "unqualified",
      publicationState: "unpublished", deliveryState: "unpropagated",
    },
  };
  states.push("processing");
  landOrSupersede(journal, envelope, req.actor.id);
  return {
    instanceId: ctx.instanceId, outcome: "completed", states: [...states, "completed"],
    verification: "none", recovery: [],
  };
};

/**
 * Land a record, superseding any current record with the same subject.
 *
 * Without this, re-attesting a revision appended a *second* record under the
 * same subjectId and both stayed current — so a lookup returned whichever came
 * first, which is the stale one. A re-evaluation that cannot be read is worse
 * than no re-evaluation, because the gate keeps answering with a verdict that
 * has been withdrawn. Superseding keeps both in history, as §3.4 requires,
 * while leaving exactly one current answer.
 */
function landOrSupersede(journal: CanonJournal, envelope: Envelope, actor: string): void {
  const existing = journal.current().find((e) => e.envelope.subjectId === envelope.subjectId);
  if (existing) journal.supersede(existing.envelope.revision!, envelope, actor);
  else journal.append(envelope, actor);
}

/** Read evidence for a candidate out of Canon. The only source the gate accepts. */
export function evidenceFor(journal: CanonJournal, candidateRevision: string): EvidenceRecord[] {
  return journal.current()
    .filter((entry) => {
      const b = entry.envelope.body as unknown as
        { observationKind?: string; candidateRevision?: string };
      return b.observationKind === "evidence" && b.candidateRevision === candidateRevision;
    })
    .map((entry) => {
      const { kind: _k, observationKind: _o, ...rest } =
        entry.envelope.body as unknown as Record<string, unknown>;
      return rest as unknown as EvidenceRecord;
    });
}

export const ATTEST: ContractDefinition = {
  id: "icp:interaction/qualification.attest",
  version: "1.0.0",
  minAuthority: "owner",
  effectClass: "E1",
  reversibility: "reversible",
  resourceType: "attestation",
};

export interface AttestInput {
  candidateRevision: string;
  /** Only the profile ID. The profile itself is canonical (NR-scms-006). */
  profileId: ConsequenceProfile["id"];
  qualificationAuthority: string;
}

export const attestHandler = (
  journal: CanonJournal, req: ExecutionRequest, def: ContractDefinition, ctx: ExecutionContext,
): ExecutionResult => {
  const states: InstanceState[] = ["declared", "ready", "started", "validating"];
  const input = req.input as unknown as AttestInput;
  const profile = PROFILES[input?.profileId];
  if (!profile) {
    return {
      instanceId: ctx.instanceId, outcome: "invalid_input", states: [...states, "failed"],
      verification: "prove",
      recovery: [{ action: "focus_field", data: { field: "profileId", known: Object.keys(PROFILES).join(",") } }],
      detail: `unknown consequence profile '${String(input?.profileId)}'`,
    };
  }
  if (!journal.get(input.candidateRevision)) {
    return {
      instanceId: ctx.instanceId, outcome: "not_found", states: [...states, "failed"],
      verification: "none",
      recovery: [{ action: "refresh_record", data: { candidateRevision: input.candidateRevision } }],
      detail: `unknown revision ${input.candidateRevision}`,
    };
  }

  // Evidence comes from Canon. A caller cannot hand in the evidence that
  // decides its own attestation.
  const evidence = evidenceFor(journal, input.candidateRevision);
  const attestation = qualify(
    input.candidateRevision, profile, evidence,
    input.qualificationAuthority ?? req.actor.id, ctx.occurredAt);

  states.push("processing");
  landOrSupersede(journal, {
    schemaVersion: "scms-0.1",
    subjectId: attestationSubject(input.candidateRevision),
    compatibility: { protocol: "scms-0.1", subjectSchema: "attestation@1" },
    provenance: { kind: "derived", authority: attestation.qualificationAuthority, source: "qualification.attest@1" },
    minimumAccess: "owner",
    body: { kind: "Observation", observationKind: "attestation", ...attestation } as Envelope["body"],
    state: {
      semanticMaturity: "complete", evidenceState: "unqualified",
      publicationState: "unpublished", deliveryState: "unpropagated",
    },
  } as Envelope, req.actor.id);

  return {
    instanceId: ctx.instanceId, outcome: "completed", states: [...states, "completed"],
    verification: "none", recovery: [],
    detail: `disposition ${attestation.disposition}`,
  };
};

/** The attestation covering a candidate, or undefined. Promotion's only source. */
export function attestationFor(journal: CanonJournal, candidateRevision: string): Attestation | undefined {
  const entry = journal.current().find(
    (e) => e.envelope.subjectId === attestationSubject(candidateRevision));
  if (!entry) return undefined;
  const { kind: _k, observationKind: _o, ...rest } =
    entry.envelope.body as unknown as Record<string, unknown>;
  return rest as unknown as Attestation;
}
