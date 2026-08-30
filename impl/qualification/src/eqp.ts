/**
 * EQP vocabularies and consequence profiles (SCMS-013).
 *
 * The enums are the pinned protocol's own, transcribed from
 * evidence-qualification-protocol/schemas/*.schema.json and re-verified against
 * source this cycle. EQP owns qualification semantics; nothing here redefines
 * them. Consequence profiles are scms-local qualification profiles declared per
 * EQP profile semantics (bindings: "Qualification / Promotion").
 */

export const EVIDENCE_RESULTS = [
  "PASS", "FAIL", "PARTIAL", "INCONCLUSIVE", "BLOCKED", "NOT_RUN", "NOT_APPLICABLE",
] as const;
export type EvidenceResult = (typeof EVIDENCE_RESULTS)[number];

export const EVIDENCE_VALIDITY = [
  "VALID", "INVALID", "STALE", "SUPERSEDED", "OUT_OF_SCOPE", "UNVERIFIABLE",
] as const;
export type EvidenceValidity = (typeof EVIDENCE_VALIDITY)[number];

export const DISPOSITIONS = ["QUALIFIED", "NOT_QUALIFIED", "BLOCKED", "SUPERSEDED"] as const;
export type Disposition = (typeof DISPOSITIONS)[number];

/** EQP qualification radius — a verification-scope claim, not a risk score. */
export const RADII = ["R1", "R2", "R3", "R4"] as const;
export type Radius = (typeof RADII)[number];

export interface EvidenceRecord {
  id: string;
  obligation: string;
  result: EvidenceResult;
  validity: EvidenceValidity;
  /** Which candidate revision this evidence was collected against. */
  candidateRevision: string;
  actor: string;
  /** EQP: evaluator independence is a separate property; recorded, never assumed. */
  independentEvaluator: boolean;
}

export interface Obligation {
  id: string;
  /** The claim this obligation supports. */
  claim: string;
  /** Change radius at which prior evidence for this obligation is invalidated. */
  reRunAtRadius: Radius;
  /** Must be satisfied for QUALIFIED. Distinct from alwaysReRun. */
  mustSatisfy: boolean;
  /**
   * MandatoryProfileEvidence: re-collected on every qualification regardless of
   * what changed. Kept distinct from mustSatisfy — conflating them would make
   * the radius term of the RequiredEvidence equation inert.
   */
  alwaysReRun: boolean;
}

/**
 * DESIGN.md §6.1 — every content class declares its gate roster AND its end.
 * `declaredEnd` is the stopping condition: an obligation not named here is not
 * required, and that absence is a statement rather than silence.
 */
export interface ConsequenceProfile {
  id: "note" | "article" | "commitment";
  obligations: Obligation[];
  declaredEnd: string;
  /** Verification the promotion of this class demands (derived from consequence). */
  promotionVerification: "none" | "acknowledge" | "confirm" | "reauthenticate" | "prove";
}

export const NOTE_PROFILE: ConsequenceProfile = {
  id: "note",
  obligations: [
    { id: "ob/schema-valid", claim: "claim/structurally-sound", reRunAtRadius: "R1", mustSatisfy: true, alwaysReRun: true },
    { id: "ob/access-declared", claim: "claim/access-safe", reRunAtRadius: "R2", mustSatisfy: true, alwaysReRun: false },
  ],
  declaredEnd:
    "No further gates. A note does not require link checks, editorial review, or accessibility " +
    "audit beyond defaults; requiring them would be gate creep, not diligence.",
  promotionVerification: "reauthenticate",
};

export const ARTICLE_PROFILE: ConsequenceProfile = {
  id: "article",
  obligations: [
    ...NOTE_PROFILE.obligations,
    { id: "ob/links-resolve", claim: "claim/references-sound", reRunAtRadius: "R2", mustSatisfy: true, alwaysReRun: false },
    { id: "ob/media-alt-text", claim: "claim/accessible-media", reRunAtRadius: "R1", mustSatisfy: true, alwaysReRun: false },
  ],
  declaredEnd: "No further gates. Legal review and human comprehension evidence are not required.",
  promotionVerification: "reauthenticate",
};

export const COMMITMENT_PROFILE: ConsequenceProfile = {
  id: "commitment",
  obligations: [
    ...ARTICLE_PROFILE.obligations,
    { id: "ob/entitlement-declared", claim: "claim/entitlement-sound", reRunAtRadius: "R3", mustSatisfy: true, alwaysReRun: false },
    { id: "ob/recipient-contract", claim: "claim/recipient-named", reRunAtRadius: "R3", mustSatisfy: true, alwaysReRun: false },
    { id: "ob/second-attestation", claim: "claim/independently-reviewed", reRunAtRadius: "R1", mustSatisfy: true, alwaysReRun: true },
  ],
  declaredEnd: "The gate roster is exhaustive for this class; additions require an owner decision.",
  promotionVerification: "prove",
};

/**
 * Canonical lookup tables have a **null prototype** (NR-scms-021).
 *
 * A plain object literal inherits `constructor`, `toString`, `__proto__` and the
 * rest, so `TABLE[userSuppliedString]` can return a truthy built-in and sail
 * past a `if (!row)` guard. NR-scms-006 fixed exactly that for one table by
 * adding an `Object.hasOwn` check — and the table below was written in the same
 * commit with a bare bracket lookup, so the defect survived in a second place
 * and promoted content with the verification gate skipped.
 *
 * Guarding each lookup puts the burden on every future caller. Removing the
 * prototype makes the defect **unrepresentable**: an inherited key is simply not
 * there, so every bracket access is safe without anyone remembering.
 */
export const PROFILES: Record<ConsequenceProfile["id"], ConsequenceProfile> = Object.assign(Object.create(null), {
  note: NOTE_PROFILE, article: ARTICLE_PROFILE, commitment: COMMITMENT_PROFILE,
});
