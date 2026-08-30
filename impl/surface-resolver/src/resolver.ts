/**
 * Pure SSS surface resolver — the SCMS-008 narrow path.
 *
 * Implements the twelve-step lifecycle (SSS-SPECIFICATION §25) for the `focus`
 * and `collection` profiles. Read-only with respect to the snapshot; no ambient
 * time, randomness, network, or mutable module state (SSS IMPLEMENTATION_BOUNDARY §4).
 * Access projection precedes candidate discovery (SSS-INV-003); the fingerprint
 * covers only accessible dependencies plus the request, context, and resolver
 * version, so state outside the observable set cannot move it (SSS §21).
 *
 * Narrowings (non-normative, documented; the reference shapes stay authoritative):
 * - the focus anchor participates regardless of include.kinds (kinds scope
 *   traversal candidates), but remains subject to where-predicates and
 *   entitlement withholding;
 * - eligibility precedence is require → kinds → where → entitlement, first non-eligible
 *   outcome wins;
 * - `subject-inaccessible` is disclosed only at owner access and above; below
 *   that it maps to `subject-not-found` (SSS §10's declared less-revealing
 *   external representation; DESIGN.md §10's 404-not-403 rule).
 */
import type {
  AccessLevel, EligibilityOutcome, FrozenSnapshot, RelationRecord,
  ResolutionBasis, ResolutionTrace, ResolvedOperation, ResolvedSurface,
  SubjectRecord, SurfaceFailure, SurfaceGroup, SurfaceMembership,
  SurfaceRequest, TraceExclusion, TraceTraversal,
} from "./types.ts";
import { ACCESS_RANK, SURFACE_PURPOSES } from "./types.ts";
import { surfaceFingerprint } from "./fingerprint.ts";

export const RESOLVER_ID = "@scms/surface-resolver";
export const RESOLVER_VERSION = "0.1.0";

const GROUP_PRIORITY: Record<string, number> = { primary: 1, supporting: 2, context: 3 };
const OPERATION_EXPOSURES = new Set(["required", "available", "withheld", "unavailable", "unknown"]);

interface Candidate {
  subject: SubjectRecord;
  depth: number;
  via?: { from: string; type: string };
}

export function resolveSurface(
  snapshot: FrozenSnapshot,
  request: SurfaceRequest,
): ResolvedSurface | SurfaceFailure {
  // IDENTIFY — validate purpose, profile, lens (failure is closed).
  if (!SURFACE_PURPOSES.includes(request.purpose)) {
    return { failure: "invalid-purpose", message: `unknown purpose: ${String(request.purpose)}` };
  }
  const radius = request.lens?.traversal?.radius ?? 1;
  if (!Number.isInteger(radius) || radius < 0) {
    return { failure: "invalid-lens", message: "traversal.radius must be a non-negative integer" };
  }
  if (request.profile === "focus" && !request.subject) {
    return { failure: "invalid-lens", message: "focus profile requires a subject" };
  }
  for (const op of request.operations ?? []) {
    if (!OPERATION_EXPOSURES.has(op.exposure)) {
      return { failure: "invalid-lens", message: `unknown operation exposure: ${op.exposure}` };
    }
  }

  // FREEZE — the caller supplies the frozen snapshot (commit-cycle discipline).

  // PROJECT ACCESS — before any candidacy; drop dangling relations with their
  // hidden endpoints so nothing downstream can observe them (SSS-INV-003, §8).
  const rank = ACCESS_RANK[request.access];
  const subjects = new Map<string, SubjectRecord>();
  for (const s of snapshot.subjects) {
    if (ACCESS_RANK[s.access] <= rank) subjects.set(s.id, s);
  }
  const relations: RelationRecord[] = snapshot.relations.filter(
    (r) => ACCESS_RANK[r.access] <= rank && subjects.has(r.from) && subjects.has(r.to),
  );

  // Anchor resolution with the declared disclosure mapping.
  let anchor: SubjectRecord | undefined;
  if (request.profile === "focus") {
    const raw = snapshot.subjects.find((s) => s.id === request.subject);
    if (!raw) return { failure: "subject-not-found", message: "no such subject" };
    if (!subjects.has(raw.id)) {
      return rank >= ACCESS_RANK.owner
        ? { failure: "subject-inaccessible", message: "subject exists but is not accessible at this access level" }
        : { failure: "subject-not-found", message: "no such subject" };
    }
    anchor = subjects.get(raw.id);

    // A state predicate can disqualify the anchor itself, and a focus surface
    // whose subject is disqualified is not an empty page — it is no page. Before
    // SCMS-050 this returned a surface with no members, so a detail route for an
    // unpublished record rendered blank instead of 404ing.
    //
    // The disclosure mapping is the same one used above: below owner access the
    // reason is not revealed, because "this exists but is not published" tells
    // an unauthorized reader that it exists.
    const required = request.lens?.require?.publicationState;
    if (required && anchor && !required.includes(anchor.publicationState ?? "")) {
      return rank >= ACCESS_RANK.owner
        ? { failure: "subject-inaccessible",
            message: `subject exists but its publication state is '${anchor.publicationState}'` }
        : { failure: "subject-not-found", message: "no such subject" };
    }
  }

  // BIND CONTEXT — only the declared temporal coordinate enters resolution.
  const contextAt = request.context?.temporal?.at ?? null;


  // APPLY LENS — deterministic candidate discovery.
  const traversals: TraceTraversal[] = [];
  const candidates: Candidate[] = [];
  if (request.profile === "focus" && anchor) {
    const allowedTypes = request.lens?.traversal?.relationTypes;
    const direction = request.lens?.traversal?.direction ?? "both";
    const seen = new Set<string>([anchor.id]);
    candidates.push({ subject: anchor, depth: 0 });
    let frontier = [anchor.id];
    for (let depth = 1; depth <= radius && frontier.length > 0; depth++) {
      const next: string[] = [];
      for (const fromId of frontier) {
        const edges = relations
          .filter((r) => {
            if (allowedTypes && !allowedTypes.includes(r.type)) return false;
            if (direction === "outgoing") return r.from === fromId;
            if (direction === "incoming") return r.to === fromId;
            return r.from === fromId || r.to === fromId;
          })
          .map((r) => ({ r, other: r.from === fromId ? r.to : r.from }))
          .sort((a, b) => a.r.type.localeCompare(b.r.type) || a.other.localeCompare(b.other));
        for (const { r, other } of edges) {
          traversals.push({ from: fromId, to: other, type: r.type, depth });
          if (!seen.has(other)) {
            seen.add(other);
            candidates.push({ subject: subjects.get(other)!, depth, via: { from: fromId, type: r.type } });
            next.push(other);
          }
        }
      }
      frontier = next;
    }
  } else {
    for (const s of [...subjects.values()].sort((a, b) => a.id.localeCompare(b.id))) {
      candidates.push({ subject: s, depth: 0 });
    }
  }

  // EVALUATE ELIGIBILITY — outcomes stay non-interchangeable (SSS §10, INV-013).
  const evaluated = candidates.map((c) => ({ c, ...evaluateEligibility(c, request, rank, contextAt) }));

  // RESOLVE MEMBERSHIP + GROUP.
  const members: SurfaceMembership[] = [];
  const excluded: TraceExclusion[] = [];
  for (const { c, outcome, reason, basis } of evaluated) {
    if (outcome === "eligible") {
      const role =
        request.profile === "collection" ? "primary"
        : c.depth === 0 ? "primary"
        : c.depth === 1 ? "supporting"
        : "context";
      const group = request.profile === "collection" ? "collection" : role;
      members.push({ subject: c.subject.id, group, priority: GROUP_PRIORITY[role], basis });
    } else {
      excluded.push({ subject: c.subject.id, eligibility: outcome, reason });
    }
  }

  // ORDER + PRIORITIZE — deterministic comparators, stable id tiebreak.
  const orderBy = request.lens?.orderBy;
  const orderRule = orderBy ? `attrs.${orderBy.attr} ${orderBy.dir}, tiebreak id asc` : "id asc";
  const groupIds = [...new Set(members.map((m) => m.group))].sort(
    (a, b) => (GROUP_PRIORITY[groupRole(a)] ?? 9) - (GROUP_PRIORITY[groupRole(b)] ?? 9),
  );
  const groups: SurfaceGroup[] = groupIds.map((gid) => ({
    id: gid,
    role: groupRole(gid),
    members: members
      .filter((m) => m.group === gid)
      .sort((a, b) => compareMembers(a, b, subjects, orderBy)),
  }));

  // RESOLVE OPERATIONS — exposure only; execution crosses ICP (SSS-INV-010).
  const operations: ResolvedOperation[] = (request.operations ?? [])
    .map((op) => ({
      id: op.id,
      exposure:
        op.minAccess !== undefined && rank < ACCESS_RANK[op.minAccess]
          ? ("withheld" as const)
          : op.exposure,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  // TRACE — mechanics, not post-hoc justification (SSS-INV-016).
  const trace: ResolutionTrace = {
    inputs: {
      snapshotId: snapshot.snapshotId,
      access: request.access,
      purpose: request.purpose,
      profile: request.profile,
      resolverVersion: RESOLVER_VERSION,
    },
    candidates: evaluated.map(({ c, outcome }) => ({ subject: c.subject.id, eligibility: outcome })),
    included: members.map((m) => ({ subject: m.subject, basis: m.basis })),
    excluded,
    traversals,
    grouping: groups.map((g) => ({
      group: g.id, role: g.role, memberCount: g.members.length,
      rule: request.profile === "collection" ? "collection-scope" : "traversal-depth",
    })),
    ordering: groups.map((g) => ({ group: g.id, rule: orderRule })),
    transformations: [],
  };

  // FINGERPRINT — accessible dependencies + request + context + resolver version.
  // Every subject that appears anywhere in the output (members, exclusions,
  // trace) is a dependency; hidden state never became a candidate and cannot
  // move this hash (SSS §21; the S2 non-leak property).
  // Dependency identity is the SUBJECT's revision when the caller supplies one.
  // Falling back to the snapshot id is declared, not silent: a snapshot without
  // per-subject revisions cannot produce content-tracking fingerprints, so the
  // fingerprint is necessarily coarser (it then moves per wave). Callers that
  // need §21's stability supply revisions. (SCMS-015 / NR-scms-003.)
  const dependencies = evaluated
    .map(({ c }) => ({ subject: c.subject.id, revision: c.subject.revision ?? snapshot.snapshotId }))
    .sort((a, b) => a.subject.localeCompare(b.subject));
  const fingerprint = surfaceFingerprint({
    dependencies,
    purpose: request.purpose,
    profile: request.profile,
    subject: request.subject ?? null,
    lens: request.lens ?? null,
    contextAt,
    access: request.access,
    resolver: RESOLVER_ID,
    resolverVersion: RESOLVER_VERSION,
  });

  // EMIT.
  return {
    protocol: "sss",
    protocolVersion: "0.1.0",
    resolutionId: "res_" + fingerprint.slice(0, 16),
    purpose: request.purpose,
    subject: request.subject,
    sourceSnapshot: snapshot.snapshotId,
    accessProjection: request.access,
    groups,
    operations,
    consistency: "current",
    provenance: { kind: "derived", resolver: RESOLVER_ID, resolverVersion: RESOLVER_VERSION },
    explanation: trace,
    dependencies,
    fingerprint,
  };
}

function groupRole(groupId: string): SurfaceGroup["role"] {
  if (groupId === "collection") return "primary";
  return (groupId as SurfaceGroup["role"]);
}

function evaluateEligibility(
  c: Candidate,
  request: SurfaceRequest,
  rank: number,
  contextAt: string | null,
): { outcome: EligibilityOutcome; reason: string; basis: ResolutionBasis[] } {
  const isAnchor = request.profile === "focus" && c.depth === 0;

  // State predicates run FIRST and apply to the anchor too. A focus route may
  // waive the kind filter for its own subject — that is what makes /work/<slug>
  // resolve the thing you asked for — but it may not waive publication, or an
  // unpublished draft would be readable by direct link (NR-scms-015).
  const requiredPublication = request.lens?.require?.publicationState;
  if (requiredPublication) {
    const actual = c.subject.publicationState;
    if (actual === undefined) {
      // Absent stays distinguishable from ineligible (SSS-INV-013), and still
      // fails closed, because only `eligible` is ever included.
      return { outcome: "unknown", reason: "publication state absent", basis: [] };
    }
    if (!requiredPublication.includes(actual)) {
      return {
        outcome: "ineligible",
        reason: `publication state '${actual}' not in [${requiredPublication.join(", ")}]`,
        basis: [],
      };
    }
  }

  const kinds = request.lens?.include?.kinds;
  if (!isAnchor && kinds && !kinds.includes(c.subject.kind)) {
    return { outcome: "ineligible", reason: `kind '${c.subject.kind}' not in lens.include.kinds`, basis: [] };
  }
  for (const w of request.lens?.where ?? []) {
    const value = c.subject.attrs?.[w.attr];
    if (value === undefined) {
      // Absent evidence is unknown, never ineligible (mandatory negative test 3).
      return { outcome: "unknown", reason: `attr '${w.attr}' absent`, basis: [] };
    }
    if (value !== w.equals) {
      return { outcome: "ineligible", reason: `attr '${w.attr}' != ${JSON.stringify(w.equals)}`, basis: [] };
    }
  }
  if (c.subject.entitled === true && rank < ACCESS_RANK.owner) {
    // Withheld is not absent: the subject is visible, participation is gated.
    return { outcome: "withheld", reason: "entitlement-gated participation", basis: [] };
  }

  /**
   * Embargo (SCMS-073). A promoted record may still declare an instant before
   * which it is not readable. Two properties, both deliberate:
   *
   * 1. **Nothing reads a wall clock.** A record becomes readable because a later
   *    resolution is *asked at a later coordinate*, not because something woke
   *    up. That is the same explicit-clock discipline the rest of the resolver
   *    keeps, and it is what lets an embargo be replayed.
   * 2. **An absent coordinate fails closed.** A caller who declares no `at` sees
   *    embargoed content as ineligible rather than the resolver assuming "now".
   *    Absent is not now, and guessing in the other direction publishes early —
   *    which is the unrecoverable direction (NR-scms-004's rule, applied to
   *    time).
   *
   * `ineligible` rather than `withheld`, because before its instant the record
   * is not a gated participant — it is simply not yet part of the readable
   * world, exactly like an unpromoted draft. The owner is unaffected: an embargo
   * hides a record from readers, never from its author.
   */
  const embargoUntil = c.subject.attrs?.embargoUntil;
  if (typeof embargoUntil === "string" && rank < ACCESS_RANK.owner) {
    if (contextAt === null || contextAt < embargoUntil) {
      return {
        outcome: "ineligible",
        reason: contextAt === null
          ? "embargoed, and no temporal coordinate was declared"
          : `embargoed until ${embargoUntil}`,
        basis: [],
      };
    }
  }
  const basis: ResolutionBasis[] = isAnchor
    ? [{ rule: "subject-anchor" }]
    : c.via
      ? [{ rule: "traversal", detail: `via ${c.via.type} from ${c.via.from} depth ${c.depth}` }]
      : [{ rule: "collection-scope", detail: `kind '${c.subject.kind}'` }];
  return { outcome: "eligible", reason: "", basis };
}

function compareMembers(
  a: SurfaceMembership,
  b: SurfaceMembership,
  subjects: Map<string, SubjectRecord>,
  orderBy?: { attr: string; dir: "asc" | "desc" },
): number {
  if (orderBy) {
    const av = subjects.get(a.subject)?.attrs?.[orderBy.attr];
    const bv = subjects.get(b.subject)?.attrs?.[orderBy.attr];
    const missingA = av === undefined || av === null;
    const missingB = bv === undefined || bv === null;
    if (missingA !== missingB) return missingA ? 1 : -1; // missing sorts last, visibly
    if (!missingA && !missingB && av !== bv) {
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
      return orderBy.dir === "desc" ? -cmp : cmp;
    }
  }
  return a.subject.localeCompare(b.subject);
}
