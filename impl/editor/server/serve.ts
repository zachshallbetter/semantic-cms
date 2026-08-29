/**
 * The editor, running (SCMS-043, epic E12).
 *
 * The published preview was a static render — useful for judging the design,
 * useless for the thing the owner actually asked for. P7 is to be settled by
 * *real edits*, and a page that cannot save produces none. This serves the same
 * view-model over a live Canon journal and lands every edit through
 * `content.revise@1`, so using the editor is indistinguishable from any other
 * governed write.
 *
 * Three deliberate choices:
 *
 * 1. **Content is read from the owner's checkout at runtime, never vendored.**
 *    The repository holds a manifest of frontmatter and body digests; the prose
 *    lives where the owner keeps it. `--content` points at it.
 *
 * 2. **Persistence is a local append-only journal file, and is not the
 *    durability decision.** SH-1 leaves the persistence engine open, and this
 *    does not close it — it is development-grade custody so a night's editing
 *    is not lost to a restart. It writes outside the repository by default.
 *
 * 3. **Every edit records a P7 observation.** The instrument built in SCMS-042
 *    only pays off if it is wired to the thing producing the workload.
 */
import { createServer } from "node:http";
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CanonJournal } from "../../canon/src/journal.ts";
import { narrowPathRegistry, CONTENT_REVISE, reviseHandler, CONTENT_CREATE, createHandler, ContractRegistry } from "../../contracts/src/runtime.ts";
import { CONTENT_PROMOTE, promoteHandler } from "../../qualification/src/promote.ts";
import { CONTENT_UNPUBLISH, unpublishHandler } from "../../qualification/src/unpublish.ts";
import { RECORD_EVIDENCE, recordEvidenceHandler, ATTEST, attestHandler, attestationFor } from "../../qualification/src/canon-evidence.ts";
import { PROFILES } from "../../qualification/src/eqp.ts";
import { evaluateProfile, unevaluatedObligations } from "../../qualification/src/evaluators.ts";
import { migrateAll } from "../../migrate/src/zach-core.ts";
import type { SourceEntry } from "../../migrate/src/zach-core.ts";
import { governedImport } from "../../migrate/src/governed.ts";
import { ARTICLE_TYPE, checkArticle } from "../../schema/src/schema.ts";
import type { ArticleInstance } from "../../schema/src/schema.ts";
import { editorView, editorIndex } from "../src/viewmodel.ts";
import { landEdit, summarizeP7 } from "../src/session.ts";
import type { P7Observation } from "../src/session.ts";
import { deriveOffer } from "../../authoring/src/editor.ts";
import { freshnessFrom, NEVER_CONNECTED } from "../../transport/src/freshness.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const CONTENT_DIR = arg("content", join(process.env.HOME ?? "", "Projects/zach-core/content"));
const DATA_DIR = arg("data", join(process.env.HOME ?? "", ".scms-data"));
const PORT = Number(arg("port", "8788"));

const OWNER = { id: "project.owner", role: "owner" };
const authority = "owner" as const;
const now = () => new Date().toISOString();

// ── Load bodies from the owner's checkout ──────────────────────────────────
function bodiesBySlug(): Map<string, string> {
  const out = new Map<string, string>();
  if (!existsSync(CONTENT_DIR)) return out;
  for (const kind of readdirSync(CONTENT_DIR)) {
    const dir = join(CONTENT_DIR, kind);
    let files: string[] = [];
    try { files = readdirSync(dir).filter((f) => f.endsWith(".md")); } catch { continue; }
    for (const f of files) {
      const raw = readFileSync(join(dir, f), "utf8");
      const m = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(raw);
      out.set(f.replace(/\.md$/, ""), m ? raw.slice(m[0].length) : raw);
    }
  }
  return out;
}

// ── Canon ──────────────────────────────────────────────────────────────────
const manifest = JSON.parse(readFileSync(
  join(HERE, "../../../fixtures/zach-core-manifest.json"), "utf8")) as { entries: SourceEntry[] };
const bodies = bodiesBySlug();
const migrated = migrateAll(manifest.entries.map((e) => ({
  ...e, body: bodies.get(String(e.frontmatter.slug ?? "")) ?? undefined,
})));

const journal = new CanonJournal();
/**
 * Everything this system has actually implemented. The editor derives what it
 * offers from this registry (SCMS-031), so registering less would understate
 * the system rather than protect it — and an editor that hides a capability it
 * has is as dishonest as one that offers a capability it lacks.
 */
const registry = new ContractRegistry();
registry.register(CONTENT_CREATE, createHandler);
registry.register(CONTENT_REVISE, reviseHandler);
registry.register(CONTENT_PROMOTE, promoteHandler as never);
registry.register(CONTENT_UNPUBLISH, unpublishHandler as never);
registry.register(RECORD_EVIDENCE, recordEvidenceHandler as never);
registry.register(ATTEST, attestHandler as never);
const offer = deriveOffer(registry);

mkdirSync(DATA_DIR, { recursive: true });
const EDITS_LOG = join(DATA_DIR, "edits.jsonl");
/**
 * Every governed action, in order, so a second process can rebuild the same
 * Canon by replaying it through the same contracts.
 *
 * The editor and the site are separate processes with separate journals, so a
 * promotion made here was invisible there — the E8 arc stopped one step short
 * of a reader seeing the result. This is development-grade custody and is
 * explicitly NOT the durability decision (SH-1): it replays through the
 * contract path rather than restoring state, so a replayed action is subject to
 * exactly the gates the original crossed.
 */
const ACTIONS_LOG = join(DATA_DIR, "actions.jsonl");
const P7_LOG = join(DATA_DIR, "p7-observations.jsonl");

const imported = governedImport({
  journal, registry, envelopes: migrated.content,
  context: { occurredAt: now(), authority },
  validateBody: (body) => {
    const kind = (body as { contentKind?: string }).contentKind;
    return kind === "article" || kind === "note"
      ? checkArticle(body as unknown as ArticleInstance, ARTICLE_TYPE)
      : [];
  }, actor: OWNER,
});

/** Replay any edits from previous sessions, through the same contract path. */
let replayed = 0;
if (existsSync(EDITS_LOG)) {
  for (const line of readFileSync(EDITS_LOG, "utf8").split("\n").filter(Boolean)) {
    const e = JSON.parse(line) as { subjectId: string; changes: Record<string, unknown> };
    const current = journal.current().find((x) => x.envelope.subjectId === e.subjectId);
    if (!current) continue;
    const r = landEdit({
      journal, registry, subjectId: e.subjectId, session: "replay",
      baselineRevision: current.envelope.revision!, changes: e.changes,
      context: { occurredAt: now(), authority },
  validateBody: (body) => {
    const kind = (body as { contentKind?: string }).contentKind;
    return kind === "article" || kind === "note"
      ? checkArticle(body as unknown as ArticleInstance, ARTICLE_TYPE)
      : [];
  }, actor: OWNER,
    });
    if (r.outcome === "completed") replayed++;
  }
}

const observations: P7Observation[] = existsSync(P7_LOG)
  ? readFileSync(P7_LOG, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as P7Observation)
  : [];

const findingsFor = (slug: string) =>
  migrated.findings.filter((f) => f.entry.replace(/^.*\//, "").replace(/\.md$/, "") === slug);

/**
 * Freshness is derived from what the transport actually delivered (SCMS-035),
 * not asserted. This previously passed `lastCheckedMs: Date.now()` on every
 * render, so the chip read "live · checked 0s ago" whether or not anything had
 * been checked — the editor violating the one honesty rule it exists to display.
 *
 * This server holds no subscription yet, so the honest state is NEVER_CONNECTED
 * and the chip correctly reads `snapshot`. It will say `live` when there is a
 * delivery to point at, and not before.
 */
const freshness = () => freshnessFrom(NEVER_CONNECTED, {
  nowMs: Date.now(), snapshotLabel: "local",
});

function viewFor(subject: string) {
  const entry = journal.current().find((e) => e.envelope.subjectId === subject);
  if (!entry) return null;
  return editorView({
    journal, subject, access: "owner", offer,
    baseline: {
      subjectId: subject, atRevision: entry.envelope.revision!, hasLocalEdits: false,
      observedCanonEntries: journal.all().length, baselineEstablished: true,
    },
    freshness: freshness(), findings: findingsFor(subject),
    // Read from Canon, like the promotion gate does. Nothing is qualified until
    // evidence is recorded and an attestation lands (SCMS-036).
    qualified: attestationFor(journal, entry.envelope.revision!)?.disposition === "QUALIFIED",
  } as never);
}

// ── HTTP ───────────────────────────────────────────────────────────────────
const json = (res: import("node:http").ServerResponse, code: number, body: unknown) => {
  const payload = JSON.stringify(body);
  res.writeHead(code, { "content-type": "application/json; charset=utf-8" });
  res.end(payload);
};

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(readFileSync(join(HERE, "editor.html"), "utf8"));
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/index") {
    return json(res, 200, {
      rows: editorIndex(journal, "owner", migrated.findings),
      p7: summarizeP7(observations),
      imported: imported.landed.length, replayed,
      contentLoaded: bodies.size,
    });
  }
  if (req.method === "GET" && url.pathname.startsWith("/api/entry/")) {
    const v = viewFor(decodeURIComponent(url.pathname.slice("/api/entry/".length)));
    return v ? json(res, 200, v) : json(res, 404, { error: "not found" });
  }
  // Matched by shape rather than by prefix, so /qualify and /promote below are
  // not swallowed by this one. Relying on declaration order for routing is a
  // bug waiting for someone to reorder the file.
  if (req.method === "POST" && /^\/api\/entry\/[^/]+$/.test(url.pathname)) {
    const subject = decodeURIComponent(url.pathname.slice("/api/entry/".length));
    let raw = "";
    req.on("data", (c) => { raw += c; });
    req.on("end", () => {
      let changes: Record<string, unknown>;
      try { changes = JSON.parse(raw).changes as Record<string, unknown>; }
      catch { return json(res, 400, { error: "bad body" }); }

      const current = journal.current().find((e) => e.envelope.subjectId === subject);
      if (!current) return json(res, 404, { error: "not found" });

      const result = landEdit({
        journal, registry, subjectId: subject, session: "editor",
        baselineRevision: current.envelope.revision!, changes,
        context: { occurredAt: now(), authority },
  validateBody: (body) => {
    const kind = (body as { contentKind?: string }).contentKind;
    return kind === "article" || kind === "note"
      ? checkArticle(body as unknown as ArticleInstance, ARTICLE_TYPE)
      : [];
  }, actor: OWNER,
      });

      observations.push(result.observation);
      if (result.outcome === "completed") {
        appendFileSync(ACTIONS_LOG, JSON.stringify({ type: "revise", subject, changes }) + "\n");
      }
      appendFileSync(P7_LOG, JSON.stringify(result.observation) + "\n");
      if (result.outcome === "completed") {
        appendFileSync(EDITS_LOG, JSON.stringify({ subjectId: subject, changes }) + "\n");
      }
      return json(res, 200, {
        outcome: result.outcome,
        view: viewFor(subject),
        observation: result.observation,
        p7: summarizeP7(observations),
        events: journal.events().length,
      });
    });
    return;
  }
  // ── Qualify, then promote. Two acts, never one (§6). ────────────────────
  //
  // The site renders nothing until content is promoted, and nothing could be
  // promoted because there was no route to record evidence or attest. This
  // supplies one — and surfaces the hole it walks through rather than hiding it.
  //
  // SH-13: attestations are caller-supplied, so an owner attesting to their own
  // work is self-certification. That is the system's current, recorded state.
  // The response says so at the moment of use, because a weakness a person meets
  // in a register they never read is a weakness nobody meets.
  if (req.method === "POST" && /^\/api\/entry\/.+\/qualify$/.test(url.pathname)) {
    const subject = decodeURIComponent(url.pathname.slice("/api/entry/".length, -"/qualify".length));
    const entry = journal.current().find((e) => e.envelope.subjectId === subject);
    if (!entry) return json(res, 404, { error: "not found" });

    const body = entry.envelope.body as unknown as { contentKind?: string };
    const profileId = body.contentKind === "note" ? "note" as const : "article" as const;
    const profile = PROFILES[profileId];
    const revision = entry.envelope.revision!;
    const occurredAt = now();

    // Evidence comes from evaluators that actually ran. An obligation with no
    // evaluator records NOT_RUN, which qualify() treats as a coverage gap and
    // which therefore BLOCKS promotion. The first version of this route recorded
    // PASS for every obligation including checks that do not exist — fabricated
    // evidence, and worse than the self-attestation it disclosed (NR-scms-016).
    const outcomes = evaluateProfile(profile, {
      envelope: entry.envelope as never, candidateRevision: revision,
      actor: OWNER.id,
      // The owner is not independent of their own work; recording otherwise
      // would be the forgery SH-13 describes.
      independentEvaluator: false,
      subjectsInCanon: new Set(journal.current().map((e) => e.envelope.subjectId)),
    });

    let seq = 0;
    for (const o of outcomes) {
      registry.execute(journal, {
        contract: "icp:interaction/qualification.record-evidence@1.0.0",
        requestId: `ev-${subject}-${seq}`, actor: OWNER,
        input: {
          evidence: o.evidence,
          observedAt: occurredAt,
          expiresAt: new Date(Date.parse(occurredAt) + 90 * 86400_000).toISOString(),
        },
      } as never, { occurredAt, instanceId: `int_ev_${subject}_${seq++}`, authority });
    }

    const attested = registry.execute(journal, {
      contract: "icp:interaction/qualification.attest@1.0.0",
      requestId: `att-${subject}`, actor: OWNER,
      input: { candidateRevision: revision, profileId, qualificationAuthority: OWNER.id },
    } as never, { occurredAt, instanceId: `int_att_${subject}`, authority });

    if (attested.outcome === "completed") {
      appendFileSync(ACTIONS_LOG, JSON.stringify({ type: "qualify", subject }) + "\n");
    }
    return json(res, 200, {
      outcome: attested.outcome,
      attestation: attestationFor(journal, revision),
      view: viewFor(subject),
      evidence: outcomes.map((o) => ({
        obligation: o.evidence.obligation, result: o.evidence.result,
        ...(o.detail ? { detail: o.detail } : {}),
      })),
      unevaluated: unevaluatedObligations(profile),
      disclosure: "You attested to your own work: independentEvaluator is false on every "
        + "evidence record. Nothing currently requires an independent evaluator (SH-13), "
        + "so that alone does not block you. What may block you is coverage — an obligation "
        + "with no evaluator records NOT_RUN, which is a gap rather than a pass, and a gap "
        + "yields BLOCKED. An unrun check is not a passed one.",
    });
  }

  if (req.method === "POST" && /^\/api\/entry\/.+\/promote$/.test(url.pathname)) {
    const subject = decodeURIComponent(url.pathname.slice("/api/entry/".length, -"/promote".length));
    const entry = journal.current().find((e) => e.envelope.subjectId === subject);
    if (!entry) return json(res, 404, { error: "not found" });
    const body = entry.envelope.body as unknown as { contentKind?: string };
    const profileId = body.contentKind === "note" ? "note" as const : "article" as const;
    const occurredAt = now();

    const result = registry.execute(journal, {
      contract: "icp:interaction/content.promote@1.0.0",
      requestId: `promote-${subject}`, actor: OWNER,
      input: {
        subjectId: subject, candidateRevision: entry.envelope.revision!,
        profile: { id: profileId },
        verificationPerformed: PROFILES[profileId].promotionVerification,
        promotionAuthority: OWNER.id,
      },
    } as never, { occurredAt, instanceId: `int_promote_${subject}`, authority });

    if (result.outcome === "completed") {
      appendFileSync(ACTIONS_LOG, JSON.stringify({ type: "promote", subject }) + "\n");
    }
    return json(res, 200, {
      outcome: result.outcome, detail: result.detail, recovery: result.recovery,
      view: viewFor(subject), events: journal.events().length,
    });
  }

  if (req.method === "GET" && url.pathname === "/api/p7") {
    return json(res, 200, { summary: summarizeP7(observations), observations });
  }
  json(res, 404, { error: "no route" });
});

server.listen(PORT, () => {
  process.stdout.write(
    `Canon Editor on http://localhost:${PORT}\n`
    + `  imported ${imported.landed.length} entries through content.create@1\n`
    + `  bodies loaded from ${CONTENT_DIR}: ${bodies.size}\n`
    + `  replayed ${replayed} prior edits\n`
    + `  data in ${DATA_DIR}\n`);
});
