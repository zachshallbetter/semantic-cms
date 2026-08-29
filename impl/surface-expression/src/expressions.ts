/**
 * Two materially different expression adapters over one ResolvedSurface
 * (SCMS-009, S3 conformance instruments — not production expression systems).
 *
 * Both are scms-local HOST ADAPTERS, which SSS IMPLEMENTATION_BOUNDARY §7 keeps
 * separate from the protocol package. Expression *semantics* are imported from
 * the SES pin as declared bindings (typed invariance; the six operation
 * distinctions; accessibility obligations persist even where a host cannot
 * realize them — OUTPUT-005). Neither adapter implements an SES resolver,
 * cascade, theme, recipe, or token system, and neither reads canonical state:
 * a ResolvedSurface is their only input.
 *
 * Invariance profile both adapters declare (SES 5.2):
 *   semantic       required
 *   behavioral     required
 *   actionIdentity required
 *   structural     bounded
 *   morphological  free
 *   visual         free
 */
import type { ResolvedSurface } from "../../surface-resolver/src/types.ts";

export interface ExpressionInvariance {
  semantic: "required"; behavioral: "required"; actionIdentity: "required";
  structural: "bounded"; morphological: "free"; visual: "free";
}

export const DECLARED_INVARIANCE: ExpressionInvariance = {
  semantic: "required", behavioral: "required", actionIdentity: "required",
  structural: "bounded", morphological: "free", visual: "free",
};

/** What an expression realizes, in a form the checker can compare. */
export interface ExpressionArtifact {
  /** Adapter identity — materially different implementations. */
  expression: string;
  modality: "visual-2d" | "linear-audio";
  /** Container form chosen by THIS adapter for each group (morphology is free). */
  morphology: Record<string, string>;
  /** Emitted representation. */
  output: string;
  /** Operation identities the representation actually exposes, with exposure state. */
  exposedOperations: Array<{ id: string; exposure: string }>;
  /** Member identities in the order the representation presents them. */
  presentedOrder: string[];
  /** Group → member identities, as the representation organizes them. */
  presentedGroups: Record<string, string[]>;
  /** Explanation identity carried through (SSS §20 trace is not re-derived here). */
  explanationRef: string;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Expression A — structural / web. 2D document structure: nested landmark
 * regions, a heading per group, a list per group. Native semantics carry
 * meaning; SES data attributes are inspection hooks only, never the semantics.
 * Morphology choice: primary → "hero", supporting → "rail", context → "matrix".
 */
export function expressStructural(surface: ResolvedSurface): ExpressionArtifact {
  const morphology: Record<string, string> = {};
  const presentedGroups: Record<string, string[]> = {};
  const presentedOrder: string[] = [];
  const FORM: Record<string, string> = { primary: "hero", supporting: "rail", context: "matrix", collection: "grid" };

  const parts: string[] = [];
  parts.push(`<section data-surface="${escapeHtml(surface.resolutionId)}" data-purpose="${escapeHtml(surface.purpose)}">`);
  for (const group of surface.groups) {
    const form = FORM[group.id] ?? "stack";
    morphology[group.id] = form;
    presentedGroups[group.id] = group.members.map((m) => m.subject);
    parts.push(`  <section data-group="${escapeHtml(group.id)}" data-role="${escapeHtml(group.role)}" data-form="${form}">`);
    parts.push(`    <h2>${escapeHtml(group.role)}</h2>`);
    parts.push(`    <ul>`);
    for (const m of group.members) {
      presentedOrder.push(m.subject);
      parts.push(`      <li data-subject="${escapeHtml(m.subject)}" data-priority="${m.priority}">${escapeHtml(m.subject)}</li>`);
    }
    parts.push(`    </ul>`);
    parts.push(`  </section>`);
  }
  // Operation exposure: a withheld operation is rendered as a disabled control,
  // NOT dropped — SES forbids silently removing required exposure.
  const exposedOperations = surface.operations.map((op) => ({ id: op.id, exposure: op.exposure }));
  parts.push(`  <nav data-operations>`);
  for (const op of surface.operations) {
    const disabled = op.exposure === "withheld" || op.exposure === "unavailable";
    parts.push(
      `    <button data-operation="${escapeHtml(op.id)}" data-exposure="${escapeHtml(op.exposure)}"` +
      `${disabled ? " disabled aria-disabled=\"true\"" : ""}>${escapeHtml(op.id)}</button>`,
    );
  }
  parts.push(`  </nav>`);
  parts.push(`</section>`);

  return {
    expression: "structural-web",
    modality: "visual-2d",
    morphology,
    output: parts.join("\n"),
    exposedOperations,
    presentedOrder,
    presentedGroups,
    explanationRef: surface.resolutionId,
  };
}

/**
 * Expression B — linear / voice. One temporal dimension: no nesting, no
 * simultaneity, no container forms in the visual sense. Grouping survives as
 * spoken sectioning; priority survives as utterance order; operations are
 * announced with their exposure state (a withheld operation is stated as
 * unavailable rather than omitted — same SES rule, different modality).
 * Morphology choice: every group → "utterance-run" (there is no other shape).
 */
export function expressLinear(surface: ResolvedSurface): ExpressionArtifact {
  const morphology: Record<string, string> = {};
  const presentedGroups: Record<string, string[]> = {};
  const presentedOrder: string[] = [];
  const lines: string[] = [];

  lines.push(`Surface ${surface.resolutionId}, purpose ${surface.purpose}.`);
  for (const group of surface.groups) {
    morphology[group.id] = "utterance-run";
    presentedGroups[group.id] = group.members.map((m) => m.subject);
    lines.push(`${group.role}:`);
    for (const m of group.members) {
      presentedOrder.push(m.subject);
      lines.push(`  ${m.subject}, priority ${m.priority}.`);
    }
  }
  const exposedOperations = surface.operations.map((op) => ({ id: op.id, exposure: op.exposure }));
  for (const op of surface.operations) {
    lines.push(
      op.exposure === "available" || op.exposure === "required"
        ? `You can say: ${op.id}.`
        : `${op.id} is ${op.exposure} here.`,
    );
  }

  return {
    expression: "linear-voice",
    modality: "linear-audio",
    morphology,
    output: lines.join("\n"),
    exposedOperations,
    presentedOrder,
    presentedGroups,
    explanationRef: surface.resolutionId,
  };
}
