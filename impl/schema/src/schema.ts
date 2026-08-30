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

/**
 * A declared attribute (SCMS-076).
 *
 * Attrs are **open** where slots are closed, and the asymmetry is deliberate.
 * Slots are the authored structure the type owns, so an undeclared slot is a
 * finding. Attrs are metadata carried from wherever the content came from, and
 * the owner's corpus demonstrably carries one-off attrs on single entries — one
 * note has `awards`, another has `stats`. Closing the set would make the type
 * reject real content rather than describe it, which is NR-scms-016's lesson
 * pointed the other way.
 *
 * So a type may require an attr, and may say what it admits, and may not forbid
 * the ones it did not think of.
 */
export interface AttrDeclaration {
  name: string;
  required: boolean;
  /** Admitted JSON shapes. `null` is listed explicitly where the corpus uses it. */
  admits: Array<"string" | "number" | "boolean" | "list" | "object" | "null">;
}

export interface ContentTypeSchema {
  /** Discriminator INSIDE the Schema body — distinct from the envelope body kind. */
  schemaKind: "content-type";
  id: string;
  slots: SlotDeclaration[];
  attrs?: AttrDeclaration[];
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
/**
 * `listed` is required on every kind because it is load-bearing: the reader's
 * discovery lens includes on `listed === true`, so an absent value must fail
 * rather than default (NR-scms-004). Declared once and shared, so a new type
 * cannot quietly omit it — which is what happened to ARTICLE_TYPE until a
 * vector asked every type the same question.
 */
const LISTED: AttrDeclaration = { name: "listed", required: true, admits: ["boolean"] };

export const ARTICLE_TYPE: ContentTypeSchema = {
  schemaKind: "content-type",
  id: "article",
  slots: [
    { name: "title", required: true, admits: ["text"] },
    // The owner's corpus carries an authored summary on most entries, and the
    // type did not declare it — so every migrated article failed schema-valid
    // with `undeclared-slot at summary`. A declared type is meant to describe
    // the content that exists, not a subset someone remembered (NR-scms-016).
    { name: "summary", required: false, admits: ["text"] },
    { name: "media", required: false, admits: ["image", "video"], many: true },
    { name: "body", required: true, admits: ["prose"] },
    { name: "meta", required: false, admits: ["text"], many: true },
  ],
  attrs: [
    LISTED,
    { name: "occurredAt", required: false, admits: ["string", "null"] },
    { name: "pinned", required: false, admits: ["boolean"] },
    { name: "featured", required: false, admits: ["boolean"] },
    { name: "readTime", required: false, admits: ["number"] },
    { name: "source", required: false, admits: ["string"] },
  ],
};

/** §14 step 1: the one composition — Home, with its two sockets. */
export const NOTE_TYPE: ContentTypeSchema = {
  schemaKind: "content-type",
  id: "note",
  slots: ARTICLE_TYPE.slots,
  attrs: [LISTED],
};

/**
 * Required attrs are the ones that are **definitional for the kind**, not merely
 * the ones the import happens to always carry. `featured` and `force` are
 * present on all nine projects and are presentational, so requiring them would
 * encode the Medium import's shape as the type's law and make a
 * hand-created project invalid.
 */
export const PROJECT_TYPE: ContentTypeSchema = {
  schemaKind: "content-type",
  id: "project",
  slots: ARTICLE_TYPE.slots,
  attrs: [
    LISTED,
    { name: "category", required: true, admits: ["string"] },
    { name: "featured", required: false, admits: ["boolean"] },
    { name: "force", required: false, admits: ["string"] },
    { name: "occurredAt", required: false, admits: ["string", "null"] },
    { name: "chips", required: false, admits: ["list"] },
    { name: "links", required: false, admits: ["object", "null"] },
  ],
};

export const ROLE_TYPE: ContentTypeSchema = {
  schemaKind: "content-type",
  id: "role",
  slots: ARTICLE_TYPE.slots,
  attrs: [
    LISTED,
    // A role without an employer, a period, or skills is not an
    // under-described role; it is a different thing.
    { name: "company", required: true, admits: ["string"] },
    { name: "period", required: true, admits: ["string"] },
    { name: "skills", required: true, admits: ["list"] },
  ],
};

/**
 * One place that decides which type applies. Four call sites used to each carry
 * `contentKind === "article" || contentKind === "note" ? check : NOT_APPLICABLE`,
 * which is four chances to disagree — the shape behind NR-scms-004, -006 and
 * -018.
 */
export const CONTENT_TYPES: Record<string, ContentTypeSchema> = Object.assign(Object.create(null), {
  article: ARTICLE_TYPE, note: NOTE_TYPE, project: PROJECT_TYPE, role: ROLE_TYPE,
});

export function typeFor(contentKind: string): ContentTypeSchema | undefined {
  return Object.prototype.hasOwnProperty.call(CONTENT_TYPES, contentKind)
    ? CONTENT_TYPES[contentKind]
    : undefined;
}

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

export interface ContentInstance {
  contentKind: string;
  slots: Record<string, Array<{ kind: string; value: unknown }>>;
  attrs?: Record<string, unknown>;
}

/** Retained name for the article-shaped instance; the checker is general. */
export type ArticleInstance = ContentInstance;

function shapeOf(v: unknown): AttrDeclaration["admits"][number] {
  if (v === null) return "null";
  if (Array.isArray(v)) return "list";
  const t = typeof v;
  return t === "string" || t === "number" || t === "boolean" ? t : "object";
}

export function checkContent(instance: ContentInstance, type: ContentTypeSchema): ConformanceFinding[] {
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
  // A content type is closed on SLOTS: an undeclared slot is a finding, not
  // extra data.
  for (const name of Object.keys(instance.slots)) {
    if (!declared.has(name)) {
      findings.push({ code: "undeclared-slot", at: name, detail: `slot '${name}' is not declared by type '${type.id}'` });
    }
  }

  // ...and OPEN on attrs: a required one must be present and of an admitted
  // shape, and an undeclared one is simply carried.
  const attrs = instance.attrs ?? {};
  for (const decl of type.attrs ?? []) {
    const present = Object.prototype.hasOwnProperty.call(attrs, decl.name);
    if (!present) {
      if (decl.required) {
        findings.push({
          code: "required-slot-missing", at: `attrs/${decl.name}`,
          detail: `attr '${decl.name}' is required by type '${type.id}'`,
        });
      }
      continue;
    }
    const shape = shapeOf(attrs[decl.name]);
    if (!decl.admits.includes(shape)) {
      findings.push({
        code: "slot-kind-not-admitted", at: `attrs/${decl.name}`,
        detail: `attr '${decl.name}' admits ${decl.admits.join("|")}, got '${shape}'`,
      });
    }
  }
  return findings;
}

/** Back-compatible alias. Prefer `checkContent`. */
export const checkArticle = checkContent;

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
