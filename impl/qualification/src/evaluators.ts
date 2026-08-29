/**
 * Evaluators that actually run (SCMS-054).
 *
 * The editor's qualify route recorded `result: "PASS"` for every obligation in
 * the profile — including `ob/links-resolve` and `ob/media-alt-text`, for which
 * no check existed and none ran. That is not self-attestation, which SH-13
 * already describes and which the route disclosed; it is **fabricated
 * evidence**, and it is worse, because a reader of the record cannot tell that
 * the check never happened.
 *
 * The vocabulary already had the honest answer: `NOT_RUN`. And `qualify()`
 * already treats it correctly — a NOT_RUN obligation is a *coverage gap*, which
 * yields `BLOCKED`, never `QUALIFIED` (EQP: an unrun check is not a passed
 * one). The machinery was right and the caller was lying to it.
 *
 * So each obligation here either has a real evaluator or is explicitly NOT_RUN.
 * The consequence is honest and inconvenient: an article, whose profile includes
 * link and media obligations, cannot currently be promoted at all, because two
 * of its four checks do not exist. A note, whose profile requires only the two
 * that do exist, can. That is the system telling the truth about what it can
 * currently verify.
 */
import type { EvidenceRecord, EvidenceResult, ConsequenceProfile } from "./eqp.ts";
import type { Envelope } from "../../canon/src/envelope.ts";
import { ARTICLE_TYPE, checkArticle } from "../../schema/src/schema.ts";
import type { ArticleInstance } from "../../schema/src/schema.ts";

export interface EvaluationInput {
  envelope: Envelope;
  candidateRevision: string;
  actor: string;
  /** Whether this evaluator is independent of the author. Recorded, never assumed. */
  independentEvaluator: boolean;
}

type Evaluator = (input: EvaluationInput) => { result: EvidenceResult; detail?: string };

/**
 * `ob/schema-valid` — real. Runs the declared content type's checker.
 */
const schemaValid: Evaluator = ({ envelope }) => {
  const body = envelope.body as unknown as { contentKind?: string; slots?: unknown };
  if (body.contentKind !== "article" && body.contentKind !== "note") {
    // No declared type for this kind. Not applicable is distinct from passing.
    return { result: "NOT_APPLICABLE", detail: `no declared type for kind '${body.contentKind}'` };
  }
  const findings = checkArticle(body as unknown as ArticleInstance, ARTICLE_TYPE);
  return findings.length === 0
    ? { result: "PASS" }
    : { result: "FAIL", detail: findings.map((f) => `${f.code} at ${f.at}`).join("; ") };
};

/**
 * `ob/access-declared` — real. The envelope must carry an explicit access level;
 * absence is a FAIL rather than a default, because a record whose reach is
 * undeclared has not been decided about.
 */
const accessDeclared: Evaluator = ({ envelope }) => {
  const valid = ["public", "member", "owner", "admin"];
  return valid.includes(envelope.minimumAccess)
    ? { result: "PASS" }
    : { result: "FAIL", detail: `minimumAccess '${envelope.minimumAccess}' is not a declared level` };
};

/**
 * Obligations with no evaluator. Named individually rather than defaulted, so
 * adding an obligation to a profile without an evaluator produces a NOT_RUN
 * that blocks promotion, instead of silently passing.
 */
const NOT_YET_BUILT: Record<string, string> = {
  "ob/links-resolve": "no link checker exists; a link resolution pass has not been built",
  "ob/media-alt-text": "no media inspector exists; alt-text coverage has not been checked",
  "ob/entitlement-declared": "entitlement classes are not implemented (P2, deferred)",
  "ob/recipient-contract": "no recipient contract checker exists",
  "ob/second-attestation": "independent second attestation is not implemented (SH-13)",
};

const EVALUATORS: Record<string, Evaluator> = {
  "ob/schema-valid": schemaValid,
  "ob/access-declared": accessDeclared,
};

export interface EvaluationOutcome {
  evidence: EvidenceRecord;
  detail?: string;
}

/**
 * Evaluate every obligation a profile declares. An obligation with no evaluator
 * yields NOT_RUN — never PASS — which `qualify()` treats as a coverage gap.
 */
export function evaluateProfile(
  profile: ConsequenceProfile, input: EvaluationInput,
): EvaluationOutcome[] {
  return profile.obligations.map((ob, i) => {
    const evaluator = EVALUATORS[ob.id];
    const outcome = evaluator
      ? evaluator(input)
      : { result: "NOT_RUN" as EvidenceResult,
          detail: NOT_YET_BUILT[ob.id] ?? "no evaluator is registered for this obligation" };

    return {
      evidence: {
        id: `ev_${input.candidateRevision.slice(7, 19)}_${i}`,
        obligation: ob.id,
        result: outcome.result,
        validity: "VALID",
        candidateRevision: input.candidateRevision,
        actor: input.actor,
        independentEvaluator: input.independentEvaluator,
      },
      ...(outcome.detail ? { detail: outcome.detail } : {}),
    };
  });
}

/** Obligations in this profile that currently have no evaluator. */
export function unevaluatedObligations(profile: ConsequenceProfile): string[] {
  return profile.obligations.filter((o) => !EVALUATORS[o.id]).map((o) => o.id);
}
