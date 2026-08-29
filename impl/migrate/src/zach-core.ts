/**
 * zach-core → Canon migration mapping (SCMS-028, epic E8).
 *
 * The first real workload: the zachshallbetter.com archive. This module maps
 * one source entry to Canon records **without collapsing distinctions the
 * source keeps, and without laundering distinctions the source collapses**.
 *
 * Three mapping decisions carry the design's weight:
 *
 * 1. `status` in the source carries TWO vocabularies — publication states
 *    (draft/published/archived/inbox) and project-lifecycle labels (dev, oss,
 *    npm, live, demo-pending). That is the single-status collapse DESIGN.md
 *    §3.5 prohibits. The migration does not launder it: recognised publication
 *    states map to the publication axis, and a lifecycle label is preserved
 *    verbatim as its own attribute **with a finding**, so the ambiguity becomes
 *    visible rather than inherited.
 *
 * 2. `visibility: unlisted` is neither public nor private. Mapping it to either
 *    would destroy a real distinction, so it lands as public access with
 *    `attrs.listed = false`: reachable by link, excluded from every index. The
 *    flag is written in positive form on every record, so discovery — which
 *    includes on `listed === true` — excludes on absence rather than admitting.
 *
 * 3. The Semantic Article Field (`data.field`) is model-generated and the source
 *    itself flags it `model-inferred; unvalidated`. It therefore may NOT land as
 *    part of the authored record: it becomes a SEPARATE envelope with `derived`
 *    provenance referencing the article. Machine output does not become authored
 *    content by being adjacent to it (DESIGN.md §3.2, no-promotion rule).
 */
import type { Envelope, RecordState, AccessLevel } from "../../canon/src/envelope.ts";

export interface SourceEntry {
  file: string;
  frontmatter: Record<string, unknown>;
  bodySha256: string;
  bodyLength: number;
  /** Present only when importing live content; the manifest omits it. */
  body?: string;
}

export type FindingCode =
  | "status-vocabulary-mixed" | "unmapped-status" | "unlisted-preserved"
  | "generated-field-separated" | "relation-target-unresolved" | "missing-required";

export interface MigrationFinding {
  code: FindingCode;
  entry: string;
  detail: string;
}

export interface MigrationResult {
  content: Envelope[];
  /** Model-generated material, kept separate from authored content. */
  derived: Envelope[];
  relations: Envelope[];
  findings: MigrationFinding[];
}

/** Publication states the source shares with our publication axis. */
const PUBLICATION_STATES = new Set(["draft", "published", "archived", "inbox"]);

/** Everything else found in `status` is a lifecycle label, not a publication state. */
const LIFECYCLE_LABELS = new Set(["dev", "oss", "npm", "live", "demo-pending"]);

function mapAccess(visibility: unknown): { access: AccessLevel; unlisted: boolean } {
  if (visibility === "private") return { access: "owner", unlisted: false };
  if (visibility === "unlisted") return { access: "public", unlisted: true };
  return { access: "public", unlisted: false };
}

function mapState(status: unknown, entry: string, findings: MigrationFinding[]): RecordState {
  const s = String(status ?? "");
  if (LIFECYCLE_LABELS.has(s)) {
    findings.push({
      code: "status-vocabulary-mixed", entry,
      detail: `source 'status' holds the lifecycle label '${s}', not a publication state; ` +
        `preserved as attrs.lifecycleLabel and NOT mapped to the publication axis`,
    });
    // A lifecycle label says nothing about publication, so the publication axis
    // stays at its honest default rather than being guessed from it.
    return {
      semanticMaturity: "complete", evidenceState: "unqualified",
      publicationState: "unpublished", deliveryState: "unpropagated",
    };
  }
  if (!PUBLICATION_STATES.has(s)) {
    findings.push({ code: "unmapped-status", entry, detail: `unrecognised status '${s}'; treated as draft` });
  }
  const published = s === "published";
  return {
    semanticMaturity: published ? "complete" : "draft",
    evidenceState: "unqualified",              // nothing is qualified by migrating
    publicationState: published ? "promoted" : "unpublished",
    deliveryState: "unpropagated",
  };
}

function envelope(
  subjectId: string, access: AccessLevel, body: Record<string, unknown>,
  state: RecordState, kind: "declared" | "derived", source: string,
): Envelope {
  return {
    schemaVersion: "scms-0.1",
    subjectId,
    compatibility: { protocol: "scms-0.1", subjectSchema: `${body.contentKind ?? body.kind}@1` },
    provenance: { kind, authority: "project.owner", source },
    minimumAccess: access,
    body: body as Envelope["body"],
    state,
  };
}

export function migrateEntry(entry: SourceEntry): MigrationResult {
  const findings: MigrationFinding[] = [];
  const fm = entry.frontmatter;
  const slug = String(fm.slug ?? "");
  const type = String(fm.type ?? "");
  const result: MigrationResult = { content: [], derived: [], relations: [], findings };

  if (!slug || !type) {
    findings.push({ code: "missing-required", entry: entry.file, detail: "slug and type are required" });
    return result;
  }

  const { access, unlisted } = mapAccess(fm.visibility);
  if (unlisted) {
    findings.push({
      code: "unlisted-preserved", entry: entry.file,
      detail: "visibility 'unlisted' is neither public nor private; landed as public access with attrs.listed=false, " +
        "which the reader's discovery lens consumes (SCMS-030) — reachable by link, absent from every index",
    });
  }
  const state = mapState(fm.status, entry.file, findings);

  // Everything from frontmatter except what became structure, plus the source's
  // own lifecycle label where one was found.
  const structural = new Set(["slug", "type", "title", "summary", "visibility", "status", "relations", "field", "tags"]);
  const attrs: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fm)) if (!structural.has(k)) attrs[k] = v;
  if (LIFECYCLE_LABELS.has(String(fm.status ?? ""))) attrs.lifecycleLabel = fm.status;
  // Positive form, and present on EVERY record: discovery includes on
  // `listed === true`, so a missing or malformed value excludes rather than
  // admits. An `unlisted` flag would have been the same fact stated in the
  // direction where absence leaks.
  attrs.listed = !unlisted;

  result.content.push(envelope(slug, access, {
    kind: "Content", contentKind: type,
    slots: {
      title: [{ kind: "text", value: fm.title }],
      ...(fm.summary ? { summary: [{ kind: "text", value: fm.summary }] } : {}),
      body: [{ kind: "prose", value: entry.body ?? null, sha256: entry.bodySha256, length: entry.bodyLength }],
    },
    tags: Array.isArray(fm.tags) ? fm.tags : [],
    attrs,
  }, state, "declared", `zach-core:${entry.file}`));

  // The Semantic Article Field: model-generated, source-flagged unvalidated.
  if (fm.field) {
    findings.push({
      code: "generated-field-separated", entry: entry.file,
      detail: "data.field is model-generated (source flags it 'model-inferred; unvalidated'); landed as a " +
        "SEPARATE derived-provenance envelope referencing the article, never merged into authored content",
    });
    result.derived.push(envelope(`${slug}#field`, access, {
      kind: "Observation", observationKind: "semantic-article-field",
      about: slug, field: fm.field,
    }, { ...state, evidenceState: "unqualified" }, "derived", `zach-core:${entry.file}#field`));
  }

  // Relations become their own records; an edge is not an attribute.
  const relations = Array.isArray(fm.relations) ? fm.relations as Array<Record<string, unknown>> : [];
  for (const rel of relations) {
    const to = String(rel.id ?? "");
    if (!to) {
      findings.push({ code: "relation-target-unresolved", entry: entry.file, detail: "relation without an id" });
      continue;
    }
    result.relations.push(envelope(`${slug}->${to}`, access, {
      kind: "Relation", from: slug, to, relationType: String(rel.kind ?? "relates_to"),
    }, state, "declared", `zach-core:${entry.file}#relations`));
  }

  return result;
}

export function migrateAll(entries: SourceEntry[]): MigrationResult {
  const all: MigrationResult = { content: [], derived: [], relations: [], findings: [] };
  for (const e of entries) {
    const r = migrateEntry(e);
    all.content.push(...r.content);
    all.derived.push(...r.derived);
    all.relations.push(...r.relations);
    all.findings.push(...r.findings);
  }
  return all;
}

/** Relations whose target is not among the imported subjects. */
export function unresolvedRelations(result: MigrationResult): string[] {
  const subjects = new Set(result.content.map((e) => e.subjectId));
  return result.relations
    .map((r) => (r.body as unknown as { to: string }).to)
    .filter((to) => !subjects.has(to))
    .sort();
}
