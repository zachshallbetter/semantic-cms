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
  /** Subject ids currently in Canon, for resolving internal references. */
  subjectsInCanon?: Set<string>;
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
 * `ob/links-resolve` — real, for the references this system can actually resolve.
 *
 * The obligation's claim is `claim/references-sound`, and what that can mean
 * here needs saying plainly rather than being quietly widened or narrowed:
 *
 * - **Internal references** — links to other subjects — are resolvable against
 *   Canon, and an unresolved one is a genuine FAIL. This is the part the system
 *   owns and can be held to.
 * - **External URLs** cannot be verified without network access, which this
 *   system does not have. They are reported as **INCONCLUSIVE**, which
 *   `qualify()` treats as a coverage gap yielding BLOCKED — not PARTIAL, which
 *   would be a verdict against the content, and not PASS, which would be the
 *   fabrication NR-scms-016 was about.
 *
 * The consequence: an article containing external links cannot currently be
 * promoted. That is honest, and it is a decision for the owner rather than for
 * this evaluator — SH-22 records it. Narrowing the obligation to mean "internal
 * references resolve" would make articles publishable and would be me redefining
 * what publication guarantees in order to pass my own gate.
 */
const linksResolve = (subjectsInCanon: Set<string>): Evaluator => ({ envelope }) => {
  const body = envelope.body as unknown as {
    slots?: Record<string, Array<{ value?: unknown }>>;
  };
  const prose = Object.values(body.slots ?? {})
    .flat()
    .map((v) => (typeof v?.value === "string" ? v.value : ""))
    .join("\n");

  const markdownLinks = [...prose.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]);
  const bareUrls = [...prose.matchAll(/\bhttps?:\/\/[^\s)<>"']+/g)].map((m) => m[0]);
  const all = [...new Set([...markdownLinks, ...bareUrls])];

  const external = all.filter((l) => /^[a-z][a-z0-9+.-]*:/i.test(l));
  const internal = all.filter((l) => !external.includes(l));

  const unresolved = internal
    .map((l) => l.replace(/^\//, "").replace(/^(writing|work)\//, "").split("#")[0])
    .filter((slug) => slug.length > 0 && !subjectsInCanon.has(slug));

  if (unresolved.length > 0) {
    return { result: "FAIL", detail: `unresolved internal reference(s): ${unresolved.join(", ")}` };
  }
  if (external.length > 0) {
    return {
      result: "INCONCLUSIVE",
      detail: `${external.length} external URL(s) cannot be verified without network access; `
        + `${internal.length} internal reference(s) resolve`,
    };
  }
  return { result: "PASS", detail: `${internal.length} internal reference(s) resolve; no external URLs` };
};

/**
 * `ob/media-alt-text` — real, and fully decidable from the record. Every media
 * value must carry non-empty alt text. An article with no media satisfies this
 * vacuously, which is correct rather than a vacuous pass in P3's sense: the
 * obligation is about the media that exists.
 */
const mediaAltText: Evaluator = ({ envelope }) => {
  const body = envelope.body as unknown as {
    slots?: Record<string, Array<{ kind?: string; value?: unknown; alt?: unknown }>>;
  };
  const media = Object.values(body.slots ?? {}).flat()
    .filter((v) => v?.kind === "image" || v?.kind === "video");
  if (media.length === 0) return { result: "PASS", detail: "no media on this record" };

  const missing = media.filter((m) => typeof m.alt !== "string" || m.alt.trim() === "");
  return missing.length === 0
    ? { result: "PASS", detail: `${media.length} media item(s) carry alt text` }
    : { result: "FAIL", detail: `${missing.length} of ${media.length} media item(s) lack alt text` };
};

/**
 * Obligations with no evaluator. Named individually rather than defaulted, so
 * adding an obligation to a profile without an evaluator produces a NOT_RUN
 * that blocks promotion, instead of silently passing.
 */
const NOT_YET_BUILT: Record<string, string> = {
  "ob/entitlement-declared": "entitlement classes are not implemented (P2, deferred)",
  "ob/recipient-contract": "no recipient contract checker exists",
  "ob/second-attestation": "independent second attestation is not implemented (SH-13)",
};

function evaluatorsFor(subjectsInCanon: Set<string>): Record<string, Evaluator> {
  return {
    "ob/schema-valid": schemaValid,
    "ob/access-declared": accessDeclared,
    "ob/links-resolve": linksResolve(subjectsInCanon),
    "ob/media-alt-text": mediaAltText,
  };
}

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
  const evaluators = evaluatorsFor(input.subjectsInCanon ?? new Set());
  return profile.obligations.map((ob, i) => {
    const evaluator = evaluators[ob.id];
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
  const evaluators = evaluatorsFor(new Set());
  return profile.obligations.filter((o) => !evaluators[o.id]).map((o) => o.id);
}
