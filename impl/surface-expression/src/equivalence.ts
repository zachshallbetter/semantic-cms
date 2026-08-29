/**
 * S3 cross-expression equivalence checker (SCMS-009).
 *
 * Asserts the six properties SSS docs/CONFORMANCE.md requires to survive across
 * materially different expressions — member identity, semantic grouping,
 * required priority, required operation exposure, access constraints,
 * explanation identity — and separately asserts that morphology DIFFERS, so a
 * pass cannot be obtained by making two expressions the same shape.
 *
 * "Pixel or morphology equality is not required" (SSS S3). This checker is a
 * conformance instrument: it never mutates a surface or an artifact.
 */
import type { ResolvedSurface } from "../../surface-resolver/src/types.ts";
import type { ExpressionArtifact } from "./expressions.ts";

export interface EquivalenceFinding {
  property:
    | "member-identity" | "semantic-grouping" | "required-priority"
    | "operation-exposure" | "access-constraint" | "explanation-identity"
    | "surface-fidelity" | "materially-different";
  detail: string;
}

export interface EquivalenceResult {
  equivalent: boolean;
  materiallyDifferent: boolean;
  findings: EquivalenceFinding[];
  /** What each expression chose, for the record. */
  morphologies: Record<string, Record<string, string>>;
}

/**
 * @param surface the single resolved surface both expressions consumed
 * @param a first expression artifact
 * @param b second expression artifact
 * @param forbiddenTokens identities that must not appear in either output
 *        (access-constraint check: state above the surface's access level)
 */
export function checkEquivalence(
  surface: ResolvedSurface,
  a: ExpressionArtifact,
  b: ExpressionArtifact,
  forbiddenTokens: string[] = [],
): EquivalenceResult {
  const findings: EquivalenceFinding[] = [];
  const surfaceMembers = surface.groups.flatMap((g) => g.members.map((m) => m.subject));

  // 1. Member identity — same set, both directions, and faithful to the surface.
  const setA = [...a.presentedOrder].sort();
  const setB = [...b.presentedOrder].sort();
  const setS = [...surfaceMembers].sort();
  if (JSON.stringify(setA) !== JSON.stringify(setB)) {
    findings.push({ property: "member-identity", detail: `A=${setA.join(",")} B=${setB.join(",")}` });
  }
  if (JSON.stringify(setA) !== JSON.stringify(setS)) {
    findings.push({
      property: "surface-fidelity",
      detail: `expression introduced or dropped members vs the surface: A=${setA.join(",")} surface=${setS.join(",")}`,
    });
  }

  // 2. Semantic grouping — same group → same member set (order within group is
  //    an ordering property, checked next).
  const groupsA = Object.keys(a.presentedGroups).sort();
  const groupsB = Object.keys(b.presentedGroups).sort();
  if (JSON.stringify(groupsA) !== JSON.stringify(groupsB)) {
    findings.push({ property: "semantic-grouping", detail: `groups A=${groupsA.join(",")} B=${groupsB.join(",")}` });
  } else {
    for (const g of groupsA) {
      const ma = [...a.presentedGroups[g]].sort();
      const mb = [...b.presentedGroups[g]].sort();
      if (JSON.stringify(ma) !== JSON.stringify(mb)) {
        findings.push({ property: "semantic-grouping", detail: `group ${g}: A=${ma.join(",")} B=${mb.join(",")}` });
      }
    }
  }

  // 3. Required priority — relative order of members must match the surface's
  //    priority ordering in both expressions (priority is semantic; its visual
  //    realization is free).
  const priorityOf = new Map<string, number>();
  for (const g of surface.groups) for (const m of g.members) priorityOf.set(m.subject, m.priority);
  for (const [label, art] of [["A", a], ["B", b]] as const) {
    const seq = art.presentedOrder.map((s) => priorityOf.get(s) ?? Number.MAX_SAFE_INTEGER);
    for (let i = 1; i < seq.length; i++) {
      if (seq[i] < seq[i - 1]) {
        findings.push({
          property: "required-priority",
          detail: `${label} presents priority ${seq[i]} after ${seq[i - 1]} (${art.presentedOrder[i]})`,
        });
        break;
      }
    }
  }

  // 4. Operation exposure — identity AND exposure state preserved in both; an
  //    expression may restyle signaling but may not silently remove exposure.
  const opsOf = (art: ExpressionArtifact) =>
    [...art.exposedOperations].sort((x, y) => x.id.localeCompare(y.id)).map((o) => `${o.id}:${o.exposure}`);
  const opsS = [...surface.operations].sort((x, y) => x.id.localeCompare(y.id)).map((o) => `${o.id}:${o.exposure}`);
  if (JSON.stringify(opsOf(a)) !== JSON.stringify(opsOf(b))) {
    findings.push({ property: "operation-exposure", detail: `A=${opsOf(a).join(",")} B=${opsOf(b).join(",")}` });
  }
  if (JSON.stringify(opsOf(a)) !== JSON.stringify(opsS)) {
    findings.push({ property: "operation-exposure", detail: `expression diverges from surface: ${opsOf(a).join(",")} vs ${opsS.join(",")}` });
  }

  // 5. Access constraints — nothing above the surface's access level may appear
  //    in any emitted representation.
  for (const token of forbiddenTokens) {
    for (const [label, art] of [["A", a], ["B", b]] as const) {
      if (art.output.includes(token) || art.presentedOrder.includes(token)) {
        findings.push({ property: "access-constraint", detail: `${label} leaked '${token}'` });
      }
    }
  }

  // 6. Explanation identity — both must reference the same resolution.
  if (a.explanationRef !== b.explanationRef || a.explanationRef !== surface.resolutionId) {
    findings.push({
      property: "explanation-identity",
      detail: `A=${a.explanationRef} B=${b.explanationRef} surface=${surface.resolutionId}`,
    });
  }

  // Materially different: the two expressions must not be the same shape.
  // Different modality AND at least one group realized with a different form.
  const formsDiffer = Object.keys(a.morphology).some((g) => a.morphology[g] !== b.morphology[g]);
  const materiallyDifferent = a.modality !== b.modality && formsDiffer && a.output !== b.output;
  if (!materiallyDifferent) {
    findings.push({
      property: "materially-different",
      detail: "expressions are not materially different; S3 is unproven by identical shapes",
    });
  }

  return {
    equivalent: findings.filter((f) => f.property !== "materially-different").length === 0,
    materiallyDifferent,
    findings,
    morphologies: { [a.expression]: a.morphology, [b.expression]: b.morphology },
  };
}
