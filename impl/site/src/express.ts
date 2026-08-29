/**
 * Expression C — reader-web (SCMS-037, epic E8).
 *
 * The site as an expression of Canon, not a client that queries it. This is the
 * consolidation the owner directed — one project, CMS as substrate and site as
 * reader expression — made real for the pages a visitor actually loads.
 *
 * It is deliberately a **third expression adapter** alongside `structural-web`
 * and `linear-voice`, not a bespoke renderer. SH-16 was the editor hand-writing
 * its own page and thereby collapsing
 * `CANON != SURFACE != EXPRESSION != REPRESENTATION`; building the site the same
 * way would repeat that with a wider blast radius. Being an adapter means the
 * S3 equivalence checker can hold this renderer to the same contract as the
 * other two: same members, same order, same operation exposure, while morphology
 * stays free.
 *
 * Content arrives through an injected `Hydrator` called only for subjects the
 * surface already admitted — look up, never look around. That is the same
 * discipline `deriveFeed` holds, and it is what makes the non-leak property
 * structural rather than careful.
 */
import type { ResolvedSurface } from "../../surface-resolver/src/types.ts";
import type { ExpressionArtifact } from "../../surface-expression/src/expressions.ts";

export interface Article {
  title?: string;
  summary?: string;
  body?: string | null;
  kind?: string;
}

/** Supplies display material for ONE subject. Injected, so hydration cannot browse. */
export type Hydrator = (subject: string) => Article | undefined;

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Morphology for this adapter. Free by SSS-INV-008/009 — the surface says a
 * group is `primary`, and it is this adapter's business alone whether that
 * becomes a full article or a card.
 */
const FORM: Record<string, string> = {
  primary: "article-body",
  supporting: "related-cards",
  context: "context-notes",
  collection: "index-list",
};

export function expressReaderWeb(surface: ResolvedSurface, hydrate: Hydrator): ExpressionArtifact {
  const morphology: Record<string, string> = {};
  const presentedGroups: Record<string, string[]> = {};
  const presentedOrder: string[] = [];
  const parts: string[] = [];

  for (const group of surface.groups) {
    const form = FORM[group.id] ?? "stack";
    morphology[group.id] = form;
    presentedGroups[group.id] = group.members.map((m) => m.subject);

    parts.push(`<section class="g g--${esc(form)}" data-group="${esc(group.id)}" data-role="${esc(group.role)}">`);
    for (const m of group.members) {
      presentedOrder.push(m.subject);
      const a = hydrate(m.subject);
      const href = `/${a?.kind === "project" || a?.kind === "role" ? "work" : "writing"}/${esc(m.subject)}`;

      if (form === "article-body") {
        parts.push(`  <article data-subject="${esc(m.subject)}">`);
        parts.push(`    <h1>${esc(a?.title ?? m.subject)}</h1>`);
        if (a?.summary) parts.push(`    <p class="dek">${esc(a.summary)}</p>`);
        if (a?.body) parts.push(`    <div class="prose">${esc(a.body)}</div>`);
        parts.push(`  </article>`);
      } else {
        parts.push(`  <a class="card" href="${href}" data-subject="${esc(m.subject)}">`);
        parts.push(`    <h2>${esc(a?.title ?? m.subject)}</h2>`);
        if (a?.summary) parts.push(`    <p>${esc(a.summary)}</p>`);
        parts.push(`  </a>`);
      }
    }
    parts.push(`</section>`);
  }

  // A withheld operation is rendered disabled, never dropped — the same SES rule
  // the other two adapters follow. A reader surface usually exposes none, and
  // the empty nav is still emitted so the contract is visible rather than
  // conditional.
  const exposedOperations = surface.operations.map((op) => ({ id: op.id, exposure: op.exposure }));
  parts.push(`<nav data-operations>`);
  for (const op of surface.operations) {
    const disabled = op.exposure === "withheld" || op.exposure === "unavailable";
    parts.push(
      `  <button data-operation="${esc(op.id)}" data-exposure="${esc(op.exposure)}"` +
      `${disabled ? ' disabled aria-disabled="true"' : ""}>${esc(op.id)}</button>`);
  }
  parts.push(`</nav>`);

  return {
    expression: "reader-web",
    modality: "visual-2d",
    morphology,
    output: parts.join("\n"),
    exposedOperations,
    presentedOrder,
    presentedGroups,
    explanationRef: surface.resolutionId,
  };
}
