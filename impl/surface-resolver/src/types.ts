/**
 * Types for the SCMS-008 narrow path.
 *
 * NON-NORMATIVE: these are derivations of the reference shapes in
 * semantic-surface-model/docs/SSS-SPECIFICATION.md (pinned, see
 * FORMAL_RESOURCE_MANIFEST.json id "sss"). SSS owns schema authority for
 * surface semantics; normative JSON Schemas are owed upstream (UD-13).
 * Where the narrow path restricts a reference shape, the restriction is a
 * subset, never a reinterpretation.
 */

// rr-rsp total order, imported semantics (bindings: "Provenance class", "Envelope").
export type AccessLevel = "public" | "member" | "owner" | "admin";

export const ACCESS_RANK: Record<AccessLevel, number> = {
  public: 0,
  member: 1,
  owner: 2,
  admin: 3,
};

/** Canon-shaped input. The snapshot is frozen by the caller (commit-cycle "freeze"). */
export interface SubjectRecord {
  id: string;
  kind: string;
  access: AccessLevel;
  /**
   * The subject's own revision. When supplied, dependency identity tracks
   * content rather than snapshot identity, satisfying SSS §21 ("changes
   * outside the observable dependency set should not invalidate the
   * surface"). Optional for callers that have no revision concept.
   */
  revision?: string;
  /** Entitlement-gated participation flag (narrow stand-in for section classes). */
  entitled?: boolean;
  attrs?: Record<string, string | number | boolean | null>;
}

export interface RelationRecord {
  from: string;
  to: string;
  type: string;
  access: AccessLevel;
}

export interface FrozenSnapshot {
  snapshotId: string;
  subjects: SubjectRecord[];
  relations: RelationRecord[];
}

/** SSS §5 initial standard vocabulary. Specialization is out of the narrow path. */
export type SurfacePurpose =
  | "consume" | "understand" | "discover" | "compare" | "inspect" | "edit"
  | "resolve" | "decide" | "monitor" | "trace" | "replay" | "simulate" | "operate";

export const SURFACE_PURPOSES: readonly SurfacePurpose[] = [
  "consume", "understand", "discover", "compare", "inspect", "edit",
  "resolve", "decide", "monitor", "trace", "replay", "simulate", "operate",
];

/** SSS §7 SurfaceLens, narrowed: include.kinds, traversal, where-equals, orderBy, limit. */
export interface SurfaceLens {
  include?: { kinds?: string[] };
  traversal?: {
    radius?: number;
    direction?: "incoming" | "outgoing" | "both";
    relationTypes?: string[];
  };
  where?: Array<{ attr: string; equals: string | number | boolean }>;
  /**
   * Subject-state predicates evaluated at candidacy, alongside access and kind.
   *
   * Distinct from `where`, which reads authored attributes: these read the
   * record's own state axes, which no caller sets directly. Publication is the
   * first, because the read path had no way to consult it at all (NR-scms-015).
   */
  require?: { publicationState?: string[] };
  orderBy?: { attr: string; dir: "asc" | "desc" };
  // `limit` is deliberately absent from the narrow path: a declared field the
  // resolver would not consume is decoration (P27). It returns with real
  // eligible-but-capped trace semantics.
}

/** SSS §6 SurfaceContext, narrowed to the declared temporal coordinate. */
export interface SurfaceContext {
  temporal?: { at: string };
}

export type OperationExposure =
  | "required" | "available" | "withheld" | "unavailable" | "unknown";

/** Operation identity is an SES Operation id (bindings: "Operation" — exact). */
export interface OperationDeclaration {
  id: string;
  exposure: OperationExposure;
  minAccess?: AccessLevel;
}

export interface SurfaceRequest {
  profile: "focus" | "collection";
  purpose: SurfacePurpose;
  subject?: string;
  lens?: SurfaceLens;
  context?: SurfaceContext;
  access: AccessLevel;
  operations?: OperationDeclaration[];
}

/** SSS §10 — non-interchangeable outcomes. */
export type EligibilityOutcome =
  | "eligible" | "ineligible" | "unknown" | "withheld" | "unsupported";

export interface ResolutionBasis {
  rule: string;
  detail?: string;
}

export interface SurfaceMembership {
  subject: string;
  group: string;
  priority: number;
  basis: ResolutionBasis[];
}

export type GroupRole =
  | "primary" | "supporting" | "context" | "relationship" | "comparison"
  | "history" | "evidence" | "warning" | "attention" | "action"
  | "alternative" | "unknown";

export interface SurfaceGroup {
  id: string;
  role: GroupRole;
  members: SurfaceMembership[];
}

export interface ResolvedOperation {
  id: string;
  exposure: OperationExposure;
}

export interface TraceCandidate {
  subject: string;
  eligibility: EligibilityOutcome;
}

export interface TraceExclusion {
  subject: string;
  eligibility: Exclude<EligibilityOutcome, "eligible">;
  reason: string;
}

export interface TraceTraversal {
  from: string;
  to: string;
  type: string;
  depth: number;
}

export interface ResolutionTrace {
  inputs: {
    snapshotId: string;
    access: AccessLevel;
    purpose: SurfacePurpose;
    profile: string;
    resolverVersion: string;
  };
  candidates: TraceCandidate[];
  included: Array<{ subject: string; basis: ResolutionBasis[] }>;
  excluded: TraceExclusion[];
  traversals: TraceTraversal[];
  grouping: Array<{ group: string; role: GroupRole; memberCount: number; rule: string }>;
  ordering: Array<{ group: string; rule: string }>;
  transformations: never[];
}

export interface SurfaceDependency {
  subject: string;
  revision: string;
}

export interface ResolvedSurface {
  protocol: "sss";
  protocolVersion: "0.1.0";
  resolutionId: string;
  purpose: SurfacePurpose;
  subject?: string;
  sourceSnapshot: string;
  accessProjection: AccessLevel;
  groups: SurfaceGroup[];
  operations: ResolvedOperation[];
  consistency: "current";
  provenance: { kind: "derived"; resolver: string; resolverVersion: string };
  explanation: ResolutionTrace;
  dependencies: SurfaceDependency[];
  fingerprint: string;
}

/** SSS §27 subset. Failure is closed. */
export type SurfaceFailureClass =
  | "subject-not-found"
  | "subject-inaccessible"
  | "invalid-purpose"
  | "invalid-lens";

export interface SurfaceFailure {
  failure: SurfaceFailureClass;
  message: string;
}

export function isFailure(v: ResolvedSurface | SurfaceFailure): v is SurfaceFailure {
  return (v as SurfaceFailure).failure !== undefined;
}
