/**
 * Qualification (SCMS-013) — EQP's question, asked of one exact candidate.
 *
 * "Given this exact candidate, this exact claim, this exact context, and this
 * exact evidence, what is justified?" Qualification never publishes; promotion
 * is a separate authority (EQP §16, DESIGN.md §6).
 *
 * Canonical v1 governs: results stay distinct, missing evidence yields
 * INCONCLUSIVE (never PASS), and an exception may not rewrite an evidence
 * result. The P3 refinements (four-column verdicts, vacuous-pass gating,
 * per-obligation freshness) are pending on PR #28 and are NOT implemented.
 */
import { createHash } from "node:crypto";
import type {
  ConsequenceProfile, Disposition, EvidenceRecord, Obligation, Radius,
} from "./eqp.ts";
import { RADII } from "./eqp.ts";

export interface ObligationOutcome {
  obligation: string;
  /** The strongest thing the evidence supports — never stronger. */
  result: EvidenceRecord["result"] | "MISSING";
  validity?: EvidenceRecord["validity"];
  evidenceId?: string;
  satisfied: boolean;
  reason: string;
}

export interface Attestation {
  id: string;
  candidateRevision: string;
  profile: ConsequenceProfile["id"];
  disposition: Disposition;
  outcomes: ObligationOutcome[];
  /** EQP: limitations are mandatory — an attestation states what it does not cover. */
  limitations: string[];
  qualificationAuthority: string;
  /** Always null here: qualification does not carry promotion authority. */
  promotionAuthority: null;
  recordedAt: string;
  digest: string;
}

const ATTESTATION_DOMAIN = "scms:attestation:v1 ";

/** Only VALID PASS evidence satisfies an obligation. */
function evaluate(ob: Obligation, evidence: EvidenceRecord[], candidateRevision: string): ObligationOutcome {
  const forOb = evidence.filter((e) => e.obligation === ob.id && e.candidateRevision === candidateRevision);
  if (forOb.length === 0) {
    return {
      obligation: ob.id, result: "MISSING", satisfied: false,
      reason: "no evidence for this candidate revision — a coverage gap, not a finding about the candidate",
    };
  }
  // Strongest available, but validity gates it.
  const chosen = forOb.find((e) => e.result === "PASS" && e.validity === "VALID") ?? forOb[0];
  const satisfied = chosen.result === "PASS" && chosen.validity === "VALID";
  return {
    obligation: ob.id, result: chosen.result, validity: chosen.validity, evidenceId: chosen.id, satisfied,
    reason: satisfied
      ? "satisfied by VALID PASS evidence"
      : `not satisfied: result ${chosen.result}, validity ${chosen.validity}`,
  };
}

export function qualify(
  candidateRevision: string,
  profile: ConsequenceProfile,
  evidence: EvidenceRecord[],
  qualificationAuthority: string,
  recordedAt: string,
): Attestation {
  const outcomes = profile.obligations.map((ob) => evaluate(ob, evidence, candidateRevision));

  // Disposition, canonical v1:
  //  - any obligation with no evidence (or evidence that could not be evaluated)
  //    is a COVERAGE GAP → BLOCKED, never NOT_QUALIFIED and never QUALIFIED;
  //  - an evaluated failure is a finding about the candidate → NOT_QUALIFIED;
  //  - all satisfied → QUALIFIED.
  const gaps = outcomes.filter((o) =>
    o.result === "MISSING" || o.result === "INCONCLUSIVE" || o.result === "NOT_RUN" || o.result === "BLOCKED");
  const failures = outcomes.filter((o) => !o.satisfied && !gaps.includes(o));
  const disposition: Disposition =
    gaps.length > 0 ? "BLOCKED" : failures.length > 0 ? "NOT_QUALIFIED" : "QUALIFIED";

  const limitations = [
    `Qualifies only against profile '${profile.id}' obligations for revision ${candidateRevision}.`,
    "Says nothing about performance, security, accessibility beyond declared obligations, or empirical usefulness.",
    ...(evidence.some((e) => !e.independentEvaluator)
      ? ["Contains non-independent evaluator evidence; independence is recorded, not assumed."] : []),
  ];

  const base = {
    id: `att_${candidateRevision.slice(7, 19)}_${profile.id}`,
    candidateRevision, profile: profile.id, disposition, outcomes, limitations,
    qualificationAuthority, promotionAuthority: null as null, recordedAt,
  };
  const digest = createHash("sha256")
    .update(ATTESTATION_DOMAIN + JSON.stringify(base), "utf8").digest("hex");
  return { ...base, digest };
}

/**
 * EQP §14 — an exception may bound scope or accept a limitation. It may NOT
 * rewrite an evidence result to PASS or convert a coverage gap into coverage.
 */
export function applyException(): never {
  throw new Error("EQP §14: an exception must not rewrite an evidence state to PASS");
}

/**
 * Incremental re-qualification (DESIGN.md §6):
 *   RequiredEvidence(rev_n) = InvalidatedEvidence(rev_n-1 → rev_n)
 *                           + EvidenceForNewClaims(rev_n)
 *                           + MandatoryProfileEvidence
 * Radius scopes the first term: an obligation re-runs when the change radius
 * reaches or exceeds the obligation's declared re-run radius.
 */
export function requiredEvidence(
  profile: ConsequenceProfile, radius: Radius, newClaims: string[] = [],
): string[] {
  const rank = (r: Radius) => RADII.indexOf(r);
  const invalidated = profile.obligations
    .filter((ob) => rank(radius) >= rank(ob.reRunAtRadius))
    .map((ob) => ob.id);
  const forNewClaims = profile.obligations
    .filter((ob) => newClaims.includes(ob.claim)).map((ob) => ob.id);
  const mandatory = profile.obligations.filter((ob) => ob.alwaysReRun).map((ob) => ob.id);
  // The union is the equation. MandatoryProfileEvidence is the alwaysReRun set —
  // not every must-satisfy obligation, or the radius term would be inert.
  return [...new Set([...invalidated, ...forNewClaims, ...mandatory])].sort();
}
