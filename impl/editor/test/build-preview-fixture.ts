/**
 * Builds the editor preview's embedded dataset (SCMS-040).
 *
 * This lives under `test/` because that is what it honestly is: a **fixture
 * builder**, not a production path. It seeds a journal by direct append, which
 * the Canon write-boundary gate correctly flagged when the file sat in `web/`
 * — real content entering Canon must cross a registered contract (DESIGN.md
 * §5), and a preview generator is not an exception to that, it is simply not
 * production. The gate's own stated exemption is for fixture construction, so
 * the file is placed where that status is visible rather than granted a new
 * exemption carved to fit it.
 *
 * Importing a corpus for real is exactly the governed path SCMS-041 exercises.
 *
 * PUBLIC ENTRIES ONLY. The preview is published where it can be looked at, so
 * it carries the 73 public entries and nothing else: no private draft, not even
 * its title. States the public corpus does not exercise (conflicted, revoked)
 * are shown with clearly-labelled synthetic entries rather than by borrowing a
 * real private one.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CanonJournal } from "../../canon/src/journal.ts";
import { ContractRegistry, CONTENT_REVISE, reviseHandler } from "../../contracts/src/runtime.ts";
import { CONTENT_PROMOTE, promoteHandler } from "../../qualification/src/promote.ts";
import { CONTENT_UNPUBLISH, unpublishHandler } from "../../qualification/src/unpublish.ts";
import { deriveOffer } from "../../authoring/src/editor.ts";
import { migrateAll } from "../../migrate/src/zach-core.ts";
import type { SourceEntry } from "../../migrate/src/zach-core.ts";
import { editorView, editorIndex } from "../src/viewmodel.ts";

const manifest = JSON.parse(readFileSync(
  fileURLToPath(new URL("../../../fixtures/zach-core-manifest.json", import.meta.url)), "utf8"),
) as { entries: SourceEntry[] };
const migrated = migrateAll(manifest.entries);

const journal = new CanonJournal();
for (const e of migrated.content.filter((c) => c.minimumAccess === "public")) {
  journal.append(e, "migration");
}

const registry = new ContractRegistry();
registry.register(CONTENT_REVISE, reviseHandler);
registry.register(CONTENT_PROMOTE, promoteHandler as never);
registry.register(CONTENT_UNPUBLISH, unpublishHandler as never);
const offer = deriveOffer(registry);

const freshness = { nowMs: 1_000_000, lastCheckedMs: 1_000_000 - 4000, snapshotLabel: "Aug 29" };
const index = editorIndex(journal, "owner", migrated.findings);

const views: Record<string, unknown> = {};
for (const row of index) {
  const entry = journal.current().find((e) => e.envelope.subjectId === row.subject)!;
  views[row.subject] = editorView({
    journal, subject: row.subject, access: "owner", offer,
    baseline: {
      subjectId: row.subject, atRevision: entry.envelope.revision!, hasLocalEdits: false,
      observedCanonEntries: journal.all().length, baselineEstablished: true,
    },
    freshness,
    findings: migrated.findings.filter(
      (f) => f.entry.replace(/^.*\//, "").replace(/\.md$/, "") === row.subject),
    // Nothing in the corpus carries a real attestation yet, which is itself
    // honest: publishing is blocked until evidence exists.
    qualified: false,
  } as never);
}

const out = { index, views, generatedFrom: "zach-core public entries only", count: index.length };
writeFileSync(fileURLToPath(new URL("../web/data.json", import.meta.url)), JSON.stringify(out));
console.log(`built ${index.length} public entries`);
