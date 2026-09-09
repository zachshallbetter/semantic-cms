/**
 * Read-only zach-core live-state reconciliation (SCMS-029).
 *
 * Content is consumed only long enough to compute domain-separated digests.
 * Reports contain hashed identities and aggregate state, never source prose,
 * reader data, credentials, or raw private identifiers.
 */
import { createHash } from "node:crypto";
import { canonicalJson } from "../../canon/src/envelope.ts";
import { revisionHash, type Envelope } from "../../canon/src/envelope.ts";
import { migrateLiveEntry, type SourceEntry } from "./zach-core.ts";

const IDENTITY_DOMAIN = "scms:zach-core-identity:v1\0";
const STATE_DOMAIN = "scms:zach-core-state:v1\0";
const WORKING_COPY_DOMAIN = "scms:zach-core-working-copy:v1\0";
const REPORT_DOMAIN = "scms:zach-core-reconciliation:v1\0";

const VISIBILITIES = ["public", "unlisted", "private"] as const;
const STATUSES = ["draft", "published", "archived", "inbox"] as const;
const FIXTURE_STATUSES = ["draft", "published", "archived", "inbox", "dev", "oss", "npm", "live", "demo-pending"] as const;
const BODY_FORMATS = ["markdown", "blocks"] as const;

type Visibility = (typeof VISIBILITIES)[number];
type Status = (typeof STATUSES)[number];
type BodyFormat = (typeof BODY_FORMATS)[number];

export interface LiveEntryRow {
  id: unknown;
  type: unknown;
  slug: unknown;
  title: unknown;
  summary: unknown;
  body: unknown;
  data: unknown;
  tags: unknown;
  occurred_at: unknown;
  started_at: unknown;
  ended_at: unknown;
  visibility: unknown;
  status: unknown;
  provenance: unknown;
  created_at: unknown;
  updated_at: unknown;
  deleted_at: unknown;
  working_copy: unknown;
}

export interface LiveRevisionRow {
  id: unknown;
  entry_id: unknown;
  snapshot: unknown;
  reason: unknown;
  created_at: unknown;
}

export interface ArchiveCounts {
  entries: number;
  activeEntries: number;
  deletedEntries: number;
  revisions: number;
  relations: number;
  media: number;
  collections: number;
  collectionItems: number;
  readers: number;
  readerNotes: number;
  revisionOrphans: number;
  relationFromOrphans: number;
  relationToOrphans: number;
  mediaOrphans: number;
}

export interface LiveArchiveRead {
  entries: LiveEntryRow[];
  revisions: LiveRevisionRow[];
  counts: ArchiveCounts;
}

export interface Queryable {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export type ReconciliationDisposition =
  | "current-equivalent"
  | "current-divergent"
  | "live-only"
  | "fixture-only"
  | "deleted";

export interface ReconciledEntry {
  identityHash: string;
  disposition: ReconciliationDisposition;
  fixtureStateHash: string | null;
  liveStateHash: string | null;
  sourceRevisionRows: number;
  distinctHistoricalStates: number;
  duplicateHistoricalStates: number;
  currentMatchesLatestHistoricalState: boolean | null;
  workingCopyHash: string | null;
}

export interface ReconciliationPayload {
  schemaVersion: "scms-zach-core-reconciliation-1";
  sourceRevision: string;
  fixture: { entryCount: number };
  live: ArchiveCounts;
  dispositions: Record<ReconciliationDisposition, number>;
  differenceDimensions: Record<"body" | "title" | "summary" | "tags" | "dates" | "visibility" | "status" | "attributes", number>;
  history: {
    entriesWithRevisionRows: number;
    sourceRevisionRows: number;
    distinctHistoricalStates: number;
    duplicateHistoricalStates: number;
    adjacentDuplicateHistoricalStates: number;
    revisitedHistoricalStates: number;
    currentMatchesLatestHistoricalState: number;
    currentDiffersFromLatestHistoricalState: number;
    entriesWithoutRevisionRows: number;
    workingCopies: number;
  };
  entries: ReconciledEntry[];
}

export interface ReconciliationReport {
  observedAt: string;
  payloadDigest: string;
  payload: ReconciliationPayload;
}

export interface LiveCanonRevisionPlan {
  sourceEntryId: string;
  sourceRevisionId: string | null;
  sourceKind: "historical" | "current";
  sourceStateHash: string;
  envelope: Envelope;
}

function hash(domain: string, value: string): string {
  return "sha256:" + createHash("sha256").update(domain + value, "utf8").digest("hex");
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function nullableText(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new Error(`${label} must be a string or null`);
  return value;
}

function instant(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null;
  const parsed = value instanceof Date ? value : new Date(text(value, label));
  if (Number.isNaN(parsed.valueOf())) throw new Error(`${label} must be a valid instant`);
  return parsed.toISOString();
}

function member<T extends readonly string[]>(value: unknown, allowed: T, label: string): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new Error(`unknown ${label}: ${String(value)}`);
  }
  return value as T[number];
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${label} must be an array of strings`);
  }
  return [...value];
}

function normalizedBody(value: unknown): { bodySha256: string; bodyLength: number } {
  if (value === null || value === undefined) {
    return { bodySha256: createHash("sha256").update("").digest("hex"), bodyLength: 0 };
  }
  const body = object(value, "body");
  const format = member(body.format, BODY_FORMATS, "body format") as BodyFormat;
  if (format === "markdown") {
    if (typeof body.text !== "string") throw new Error("markdown body.text must be a string");
    return {
      bodySha256: createHash("sha256").update(body.text, "utf8").digest("hex"),
      bodyLength: body.text.length,
    };
  }
  if (!Array.isArray(body.blocks)) throw new Error("blocks body.blocks must be an array");
  const encoded = canonicalJson(body.blocks);
  return {
    bodySha256: createHash("sha256").update(encoded, "utf8").digest("hex"),
    bodyLength: encoded.length,
  };
}

/** Reconstruct the source's migration shape without retaining body content. */
export function sourceEntryFromLive(row: LiveEntryRow): SourceEntry {
  const slug = text(row.slug, "entry.slug");
  const data = row.data === null || row.data === undefined ? {} : object(row.data, "entry.data");
  const visibility = member(row.visibility, VISIBILITIES, "visibility") as Visibility;
  const status = member(row.status, STATUSES, "status") as Status;
  const tags = stringArray(row.tags, "entry.tags");
  const { bodySha256, bodyLength } = normalizedBody(row.body);
  const frontmatter: Record<string, unknown> = {
    ...data,
    type: text(row.type, "entry.type"),
    slug,
    title: text(row.title, "entry.title"),
    summary: nullableText(row.summary, "entry.summary"),
    tags,
    occurredAt: instant(row.occurred_at, "entry.occurred_at"),
    startedAt: instant(row.started_at, "entry.started_at"),
    endedAt: instant(row.ended_at, "entry.ended_at"),
    visibility,
    status,
  };
  return { file: `live/${slug}`, frontmatter, bodySha256, bodyLength };
}

function normalizedFixture(entry: SourceEntry): SourceEntry {
  const raw = object(entry.frontmatter, "fixture.frontmatter");
  const nestedData = raw.data === undefined || raw.data === null ? {} : object(raw.data, "fixture.data");
  const structural = new Set([
    "type", "slug", "title", "summary", "tags", "occurredAt", "startedAt",
    "endedAt", "visibility", "status", "data", "media", "relations",
  ]);
  const extras: Record<string, unknown> = { ...nestedData };
  for (const [key, value] of Object.entries(raw)) if (!structural.has(key)) extras[key] = value;
  const fm: Record<string, unknown> = {
    ...extras,
    type: raw.type,
    slug: raw.slug,
    title: raw.title,
    summary: raw.summary ?? null,
    tags: raw.tags ?? [],
    occurredAt: raw.occurredAt ?? null,
    startedAt: raw.startedAt ?? null,
    endedAt: raw.endedAt ?? null,
    visibility: raw.visibility,
    status: raw.status,
  };
  const slug = text(fm.slug, "fixture.slug");
  member(fm.visibility, VISIBILITIES, "visibility");
  member(fm.status, FIXTURE_STATUSES, "fixture status");
  text(fm.type, "fixture.type");
  text(fm.title, "fixture.title");
  stringArray(fm.tags ?? [], "fixture.tags");
  if (!/^[0-9a-f]{64}$/.test(entry.bodySha256)) throw new Error(`invalid body digest for ${slug}`);
  if (!Number.isInteger(entry.bodyLength) || entry.bodyLength < 0) throw new Error(`invalid body length for ${slug}`);
  return { ...entry, frontmatter: fm };
}

function entryStateHash(entry: SourceEntry): string {
  return hash(STATE_DOMAIN, canonicalJson({
    frontmatter: entry.frontmatter,
    bodySha256: entry.bodySha256,
    bodyLength: entry.bodyLength,
  }));
}

/**
 * Build the deterministic source-history mapping consumed by Canon landing.
 * Adjacent identical snapshots are one source state; a later return to an
 * earlier state remains a new revision and therefore retains its history.
 */
export function planLiveCanonRevisions(live: LiveArchiveRead): LiveCanonRevisionPlan[] {
  if (live.counts.entries !== live.entries.length) throw new Error("entry count does not match rows read");
  if (live.counts.revisions !== live.revisions.length) throw new Error("revision count does not match rows read");
  const entries = new Map<string, { row: LiveEntryRow; source: SourceEntry }>();
  for (const row of live.entries) {
    const id = text(row.id, "entry.id");
    if (entries.has(id)) throw new Error(`duplicate live source id: ${id}`);
    entries.set(id, { row, source: sourceEntryFromLive(row) });
  }
  const revisions = new Map<string, LiveRevisionRow[]>();
  for (const row of live.revisions) {
    const entryId = text(row.entry_id, "revision.entry_id");
    if (!entries.has(entryId)) throw new Error("revision references an unknown entry");
    text(row.id, "revision.id");
    instant(row.created_at, "revision.created_at");
    const list = revisions.get(entryId) ?? [];
    list.push(row);
    revisions.set(entryId, list);
  }
  for (const list of revisions.values()) list.sort((a, b) => {
    const at = instant(a.created_at, "revision.created_at")!;
    const bt = instant(b.created_at, "revision.created_at")!;
    return at.localeCompare(bt) || text(a.id, "revision.id").localeCompare(text(b.id, "revision.id"));
  });

  const plan: LiveCanonRevisionPlan[] = [];
  for (const entryId of [...entries.keys()].sort()) {
    const current = entries.get(entryId)!;
    const rows = revisions.get(entryId) ?? [];
    const states: Array<{ sourceRevisionId: string | null; sourceKind: "historical" | "current"; source: SourceEntry; stateHash: string }> = [];
    for (const row of rows) {
      const source = sourceEntryFromLive(row.snapshot as unknown as LiveEntryRow);
      const stateHash = entryStateHash(source);
      if (states.at(-1)?.stateHash === stateHash) continue;
      states.push({ sourceRevisionId: text(row.id, "revision.id"), sourceKind: "historical", source, stateHash });
    }
    const currentHash = entryStateHash(current.source);
    if (states.length === 0 || states.at(-1)!.stateHash !== currentHash) {
      states.push({ sourceRevisionId: null, sourceKind: "current", source: current.source, stateHash: currentHash });
    }
    let priorRevision: string | undefined;
    for (const state of states) {
      const mapped = migrateLiveEntry(state.source, entryId).content[0];
      const envelope = priorRevision === undefined ? mapped : { ...mapped, supersedes: priorRevision };
      const revision = revisionHash(envelope);
      const landed = { ...envelope, revision };
      plan.push({
        sourceEntryId: entryId,
        sourceRevisionId: state.sourceRevisionId,
        sourceKind: state.sourceKind,
        sourceStateHash: state.stateHash,
        envelope: landed,
      });
      priorRevision = revision;
    }
  }
  return plan;
}

function entryDimensions(entry: SourceEntry): Record<string, unknown> {
  const fm = entry.frontmatter;
  const structural = new Set(["type", "slug", "title", "summary", "tags", "occurredAt", "startedAt", "endedAt", "visibility", "status"]);
  const attributes: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fm)) if (!structural.has(key)) attributes[key] = value;
  return {
    body: { sha256: entry.bodySha256, length: entry.bodyLength },
    title: fm.title,
    summary: fm.summary,
    tags: fm.tags,
    dates: { occurredAt: fm.occurredAt, startedAt: fm.startedAt, endedAt: fm.endedAt },
    visibility: fm.visibility,
    status: fm.status,
    attributes,
  };
}

function identityHash(sourceIdentity: string): string {
  return hash(IDENTITY_DOMAIN, sourceIdentity);
}

function workingCopyHash(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return hash(WORKING_COPY_DOMAIN, canonicalJson(object(value, "working_copy")));
}

function numberField(row: Record<string, unknown>, key: string): number {
  const value = Number(row[key]);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`invalid count: ${key}`);
  return value;
}

function mapCounts(row: Record<string, unknown>): ArchiveCounts {
  return {
    entries: numberField(row, "entries"),
    activeEntries: numberField(row, "active_entries"),
    deletedEntries: numberField(row, "deleted_entries"),
    revisions: numberField(row, "revisions"),
    relations: numberField(row, "relations"),
    media: numberField(row, "media"),
    collections: numberField(row, "collections"),
    collectionItems: numberField(row, "collection_items"),
    readers: numberField(row, "readers"),
    readerNotes: numberField(row, "reader_notes"),
    revisionOrphans: numberField(row, "revision_orphans"),
    relationFromOrphans: numberField(row, "relation_from_orphans"),
    relationToOrphans: numberField(row, "relation_to_orphans"),
    mediaOrphans: numberField(row, "media_orphans"),
  };
}

const ENTRY_QUERY = `SELECT id, type, slug, title, summary, body, data, tags,
  occurred_at, started_at, ended_at, visibility, status, provenance,
  created_at, updated_at, deleted_at, working_copy
  FROM entry ORDER BY id`;

const REVISION_QUERY = `SELECT id, entry_id, snapshot, reason, created_at
  FROM entry_revision ORDER BY entry_id, created_at, id`;

const COUNT_QUERY = `SELECT
  (SELECT count(*) FROM entry) AS entries,
  (SELECT count(*) FROM entry WHERE deleted_at IS NULL) AS active_entries,
  (SELECT count(*) FROM entry WHERE deleted_at IS NOT NULL) AS deleted_entries,
  (SELECT count(*) FROM entry_revision) AS revisions,
  (SELECT count(*) FROM entry_relation) AS relations,
  (SELECT count(*) FROM media) AS media,
  (SELECT count(*) FROM collection) AS collections,
  (SELECT count(*) FROM collection_item) AS collection_items,
  (SELECT count(*) FROM reader) AS readers,
  (SELECT count(*) FROM reader_note) AS reader_notes,
  (SELECT count(*) FROM entry_revision r LEFT JOIN entry e ON e.id=r.entry_id WHERE e.id IS NULL) AS revision_orphans,
  (SELECT count(*) FROM entry_relation r LEFT JOIN entry e ON e.id=r.from_id WHERE e.id IS NULL) AS relation_from_orphans,
  (SELECT count(*) FROM entry_relation r LEFT JOIN entry e ON e.id=r.to_id WHERE e.id IS NULL) AS relation_to_orphans,
  (SELECT count(*) FROM media m LEFT JOIN entry e ON e.id=m.entry_id WHERE m.entry_id IS NOT NULL AND e.id IS NULL) AS media_orphans`;

/** One all-or-nothing read. No result escapes before the read-only transaction commits. */
export async function readLiveArchive(db: Queryable): Promise<LiveArchiveRead> {
  await db.query("BEGIN TRANSACTION READ ONLY");
  try {
    const entries = await db.query(ENTRY_QUERY);
    const revisions = await db.query(REVISION_QUERY);
    const countRows = await db.query(COUNT_QUERY);
    if (countRows.rows.length !== 1) throw new Error("count query returned an unexpected row count");
    await db.query("COMMIT");
    return {
      entries: entries.rows as unknown as LiveEntryRow[],
      revisions: revisions.rows as unknown as LiveRevisionRow[],
      counts: mapCounts(countRows.rows[0]),
    };
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}

export function reconcileLiveArchive(args: {
  fixtureEntries: SourceEntry[];
  live: LiveArchiveRead;
  sourceRevision: string;
  observedAt: string;
}): ReconciliationReport {
  if (!/^[0-9a-f]{40}$/.test(args.sourceRevision)) throw new Error("sourceRevision must be a full Git SHA-1");
  if (!instant(args.observedAt, "observedAt")) throw new Error("observedAt is required");
  if (args.live.counts.entries !== args.live.entries.length) throw new Error("entry count does not match rows read");
  if (args.live.counts.revisions !== args.live.revisions.length) throw new Error("revision count does not match rows read");
  if (args.live.counts.activeEntries + args.live.counts.deletedEntries !== args.live.counts.entries) {
    throw new Error("active and deleted entry counts do not cover all entries");
  }

  const fixtures = new Map<string, SourceEntry>();
  for (const raw of args.fixtureEntries) {
    const entry = normalizedFixture(raw);
    const slug = String(entry.frontmatter.slug);
    if (fixtures.has(slug)) throw new Error(`duplicate fixture identity: ${slug}`);
    fixtures.set(slug, entry);
  }

  const liveById = new Map<string, { row: LiveEntryRow; entry: SourceEntry }>();
  const identityBySlug = new Map<string, string>();
  for (const row of args.live.entries) {
    const entry = sourceEntryFromLive(row);
    const slug = String(entry.frontmatter.slug);
    const id = text(row.id, "entry.id");
    if (identityBySlug.has(slug)) throw new Error(`duplicate live identity: ${slug}`);
    if (liveById.has(id)) throw new Error(`duplicate live source id: ${id}`);
    liveById.set(id, { row, entry });
    identityBySlug.set(slug, id);
  }

  const revisionsById = new Map<string, LiveRevisionRow[]>();
  for (const revision of args.live.revisions) {
    const entryId = text(revision.entry_id, "revision.entry_id");
    if (!liveById.has(entryId)) throw new Error("revision references an unknown entry");
    text(revision.id, "revision.id");
    instant(revision.created_at, "revision.created_at");
    const snapshot = object(revision.snapshot, "revision.snapshot") as unknown as LiveEntryRow;
    const historicalSlug = String(sourceEntryFromLive(snapshot).frontmatter.slug);
    const existingOwner = identityBySlug.get(historicalSlug);
    if (existingOwner && existingOwner !== entryId) throw new Error(`historical slug belongs to multiple source identities: ${historicalSlug}`);
    identityBySlug.set(historicalSlug, entryId);
    const list = revisionsById.get(entryId) ?? [];
    list.push(revision);
    revisionsById.set(entryId, list);
  }
  for (const list of revisionsById.values()) {
    list.sort((a, b) => {
      const at = instant(a.created_at, "revision.created_at")!;
      const bt = instant(b.created_at, "revision.created_at")!;
      return at.localeCompare(bt) || text(a.id, "revision.id").localeCompare(text(b.id, "revision.id"));
    });
  }

  const fixtureByLiveId = new Map<string, SourceEntry>();
  const unmatchedFixtures = new Map<string, SourceEntry>();
  for (const [slug, fixture] of fixtures) {
    const liveId = identityBySlug.get(slug);
    if (!liveId) unmatchedFixtures.set(slug, fixture);
    else if (fixtureByLiveId.has(liveId)) throw new Error(`multiple fixture records map to one live identity: ${liveId}`);
    else fixtureByLiveId.set(liveId, fixture);
  }
  const subjects = [
    ...[...liveById.keys()].sort().map((id) => ({ id, fixtureSlug: null as string | null })),
    ...[...unmatchedFixtures.keys()].sort().map((slug) => ({ id: null as string | null, fixtureSlug: slug })),
  ];
  const dispositions: Record<ReconciliationDisposition, number> = {
    "current-equivalent": 0,
    "current-divergent": 0,
    "live-only": 0,
    "fixture-only": 0,
    "deleted": 0,
  };
  const differenceDimensions = {
    body: 0, title: 0, summary: 0, tags: 0, dates: 0, visibility: 0, status: 0, attributes: 0,
  };
  let distinctHistoricalStates = 0;
  let duplicateHistoricalStates = 0;
  let adjacentDuplicateHistoricalStates = 0;
  let revisitedHistoricalStates = 0;
  let currentMatchesLatestHistoricalState = 0;
  let currentDiffersFromLatestHistoricalState = 0;
  let workingCopies = 0;
  const entries: ReconciledEntry[] = [];

  for (const subject of subjects) {
    const live = subject.id ? liveById.get(subject.id) : undefined;
    const fixture = subject.id ? fixtureByLiveId.get(subject.id) : unmatchedFixtures.get(subject.fixtureSlug!);
    const fixtureStateHash = fixture ? entryStateHash(fixture) : null;
    const liveStateHash = live ? entryStateHash(live.entry) : null;
    let disposition: ReconciliationDisposition;
    if (!live) disposition = "fixture-only";
    else if (live.row.deleted_at !== null && live.row.deleted_at !== undefined) disposition = "deleted";
    else if (!fixture) disposition = "live-only";
    else if (fixtureStateHash === liveStateHash) disposition = "current-equivalent";
    else disposition = "current-divergent";
    dispositions[disposition] += 1;
    if (fixture && live && disposition === "current-divergent") {
      const fixtureDimensions = entryDimensions(fixture);
      const liveDimensions = entryDimensions(live.entry);
      for (const key of Object.keys(differenceDimensions) as Array<keyof typeof differenceDimensions>) {
        if (canonicalJson(fixtureDimensions[key]) !== canonicalJson(liveDimensions[key])) differenceDimensions[key] += 1;
      }
    }

    const revisionRows = subject.id ? revisionsById.get(subject.id) ?? [] : [];
    const historicalHashes = revisionRows.map((revision) =>
      entryStateHash(sourceEntryFromLive(revision.snapshot as unknown as LiveEntryRow)));
    const uniqueHistoricalHashes = new Set(historicalHashes);
    distinctHistoricalStates += uniqueHistoricalHashes.size;
    duplicateHistoricalStates += historicalHashes.length - uniqueHistoricalHashes.size;
    const seenHistoricalHashes = new Set<string>();
    for (let index = 0; index < historicalHashes.length; index += 1) {
      const stateHash = historicalHashes[index];
      if (index > 0 && stateHash === historicalHashes[index - 1]) adjacentDuplicateHistoricalStates += 1;
      else if (seenHistoricalHashes.has(stateHash)) revisitedHistoricalStates += 1;
      seenHistoricalHashes.add(stateHash);
    }
    const latestHistoricalHash = historicalHashes.at(-1) ?? null;
    const matchesLatest = liveStateHash === null || latestHistoricalHash === null
      ? null
      : liveStateHash === latestHistoricalHash;
    if (matchesLatest === true) currentMatchesLatestHistoricalState += 1;
    if (matchesLatest === false) currentDiffersFromLatestHistoricalState += 1;
    const copyHash = live ? workingCopyHash(live.row.working_copy) : null;
    if (copyHash) workingCopies += 1;

    entries.push({
      identityHash: identityHash(subject.id ?? `fixture-slug:${subject.fixtureSlug}`),
      disposition,
      fixtureStateHash,
      liveStateHash,
      sourceRevisionRows: revisionRows.length,
      distinctHistoricalStates: uniqueHistoricalHashes.size,
      duplicateHistoricalStates: historicalHashes.length - uniqueHistoricalHashes.size,
      currentMatchesLatestHistoricalState: matchesLatest,
      workingCopyHash: copyHash,
    });
  }
  entries.sort((a, b) => a.identityHash.localeCompare(b.identityHash));

  const payload: ReconciliationPayload = {
    schemaVersion: "scms-zach-core-reconciliation-1",
    sourceRevision: args.sourceRevision,
    fixture: { entryCount: fixtures.size },
    live: args.live.counts,
    dispositions,
    differenceDimensions,
    history: {
      entriesWithRevisionRows: revisionsById.size,
      sourceRevisionRows: args.live.revisions.length,
      distinctHistoricalStates,
      duplicateHistoricalStates,
      adjacentDuplicateHistoricalStates,
      revisitedHistoricalStates,
      currentMatchesLatestHistoricalState,
      currentDiffersFromLatestHistoricalState,
      entriesWithoutRevisionRows: args.live.entries.length - revisionsById.size,
      workingCopies,
    },
    entries,
  };
  return {
    observedAt: instant(args.observedAt, "observedAt")!,
    payloadDigest: hash(REPORT_DOMAIN, canonicalJson(payload)),
    payload,
  };
}
