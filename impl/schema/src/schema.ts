/**
 * Article and Home as Schema records (SCMS-016, §14 step 1).
 *
 * SES owns the semantic model: Slot is a named typed content participation
 * point inside a Block; Socket is a region with an admission policy (which
 * blocks, what cardinality, what importance); Composition is a semantic
 * arrangement of Sockets. Those meanings are imported from the pin as declared
 * bindings and are not redefined here — this module only *declares two
 * instances* of that vocabulary and checks content against them.
 *
 * Nothing here decides expression: no morphology, theme, recipe, or visual
 * form appears in a schema record or in any finding. A Socket says what may
 * participate; SES says how it may look.
 */
import type { Envelope, RecordState } from "../../canon/src/envelope.ts";

export interface SlotDeclaration {
  /** SES Slot name — the field. */
  name: string;
  required: boolean;
  /** Content kinds this slot admits. A slot is typed participation, not a bag. */
  admits: string[];
  /** Repeatable slots may carry many values. */
  many?: boolean;
}

export interface SocketDeclaration {
  /** SES Socket name — a region with an admission policy. */
  name: string;
  /** Block identities this socket admits. */
  admitsBlocks: string[];
  minCardinality: number;
  maxCardinality: number;
  /** Semantic importance — never a graphical instruction. */
  importance: "required" | "primary" | "supporting" | "peripheral";
}

export interface ContentTypeSchema {
  /** Discriminator INSIDE the Schema body — distinct from the envelope body kind. */
  schemaKind: "content-type";
  id: string;
  slots: SlotDeclaration[];
}

export interface CompositionSchema {
  /** Discriminator INSIDE the Schema body — distinct from the envelope body kind. */
  schemaKind: "composition";
  id: string;
  sockets: SocketDeclaration[];
}

export type SchemaBody = (ContentTypeSchema | CompositionSchema) & { kind: "Schema" };
// Note: the envelope body kind is "Schema"; schemaKind discriminates within it.
// Spreading in the other order would let the inner discriminator overwrite the
// body kind — a collision this naming makes structurally impossible.

const STATE: RecordState = {
  semanticMaturity: "complete", evidenceState: "unqualified",
  publicationState: "unpublished", deliveryState: "unpropagated",
};

function schemaEnvelope(subjectId: string, body: ContentTypeSchema | CompositionSchema): Envelope {
  return {
    schemaVersion: "scms-0.1",
    subjectId,
    compatibility: { protocol: "scms-0.1", subjectSchema: `${body.schemaKind}@1` },
    provenance: { kind: "declared", authority: "project.owner", source: "impl/schema" },
    minimumAccess: "public",
    body: { kind: "Schema", ...body } as Envelope["body"],
    state: STATE,
  };
}

/** §14 step 1: the one content type — Article, with its four slots. */
export const ARTICLE_TYPE: ContentTypeSchema = {
  schemaKind: "content-type",
  id: "article",
  slots: [
    { name: "title", required: true, admits: ["text"] },
    { name: "media", required: false, admits: ["image", "video"], many: true },
    { name: "body", required: true, admits: ["prose"] },
    { name: "meta", required: false, admits: ["text"], many: true },
  ],
};

/** §14 step 1: the one composition — Home, with its two sockets. */
export const HOME_COMPOSITION: CompositionSchema = {
  schemaKind: "composition",
  id: "home",
  sockets: [
    { name: "hero", admitsBlocks: ["article-card"], minCardinality: 1, maxCardinality: 1, importance: "required" },
    { name: "rail", admitsBlocks: ["article-card", "note-card"], minCardinality: 0, maxCardinality: 6, importance: "supporting" },
  ],
};

export const ARTICLE_SCHEMA_RECORD = schemaEnvelope("schema:content-type/article", ARTICLE_TYPE);
export const HOME_SCHEMA_RECORD = schemaEnvelope("schema:composition/home", HOME_COMPOSITION);

export type ConformanceCode =
  | "required-slot-missing" | "undeclared-slot" | "slot-kind-not-admitted"
  | "slot-cardinality" | "socket-block-not-admitted" | "socket-cardinality"
  | "unknown-socket";

export interface ConformanceFinding {
  code: ConformanceCode;
  /** The slot or socket at fault — never a visual concern. */
  at: string;
  detail: string;
}

export interface ArticleInstance {
  contentKind: "article";
  slots: Record<string, Array<{ kind: string; value: unknown }>>;
}

export function checkArticle(instance: ArticleInstance, type: ContentTypeSchema): ConformanceFinding[] {
  const findings: ConformanceFinding[] = [];
  const declared = new Map(type.slots.map((s) => [s.name, s]));

  for (const slot of type.slots) {
    const values = instance.slots[slot.name];
    if (slot.required && (!values || values.length === 0)) {
      findings.push({ code: "required-slot-missing", at: slot.name, detail: `slot '${slot.name}' is required` });
      continue;
    }
    if (!values) continue;
    if (!slot.many && values.length > 1) {
      findings.push({ code: "slot-cardinality", at: slot.name, detail: `slot '${slot.name}' admits one value, got ${values.length}` });
    }
    for (const v of values) {
      if (!slot.admits.includes(v.kind)) {
        findings.push({
          code: "slot-kind-not-admitted", at: slot.name,
          detail: `slot '${slot.name}' admits ${slot.admits.join("|")}, got '${v.kind}'`,
        });
      }
    }
  }
  // A content type is closed: an undeclared slot is a finding, not extra data.
  for (const name of Object.keys(instance.slots)) {
    if (!declared.has(name)) {
      findings.push({ code: "undeclared-slot", at: name, detail: `slot '${name}' is not declared by type '${type.id}'` });
    }
  }
  return findings;
}

export interface CompositionInstance {
  compositionId: string;
  sockets: Record<string, Array<{ block: string }>>;
}

export function checkComposition(instance: CompositionInstance, comp: CompositionSchema): ConformanceFinding[] {
  const findings: ConformanceFinding[] = [];
  const declared = new Map(comp.sockets.map((s) => [s.name, s]));

  for (const socket of comp.sockets) {
    const occupants = instance.sockets[socket.name] ?? [];
    if (occupants.length < socket.minCardinality || occupants.length > socket.maxCardinality) {
      findings.push({
        code: "socket-cardinality", at: socket.name,
        detail: `socket '${socket.name}' admits ${socket.minCardinality}..${socket.maxCardinality}, got ${occupants.length}`,
      });
    }
    for (const occ of occupants) {
      if (!socket.admitsBlocks.includes(occ.block)) {
        findings.push({
          code: "socket-block-not-admitted", at: socket.name,
          detail: `socket '${socket.name}' admits ${socket.admitsBlocks.join("|")}, got '${occ.block}'`,
        });
      }
    }
  }
  for (const name of Object.keys(instance.sockets)) {
    if (!declared.has(name)) {
      findings.push({ code: "unknown-socket", at: name, detail: `socket '${name}' is not declared by composition '${comp.id}'` });
    }
  }
  return findings;
}
