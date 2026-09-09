#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import pg from "pg";
import { createHash } from "node:crypto";
import { canonicalJson } from "../impl/canon/src/envelope.ts";
import { planLiveCanonRevisions, readLiveArchive, reconcileLiveArchive } from "../impl/migrate/src/live-reconcile.ts";
import type { SourceEntry } from "../impl/migrate/src/zach-core.ts";

function arg(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value || value.startsWith("--")) throw new Error(`missing ${name}`);
  return value;
}

const connectionString =
  process.env.ZACH_CORE_DATABASE_URL ||
  process.env.STORAGE_DATABASE_URL ||
  process.env.STORAGE_POSTGRES_URL ||
  process.env.STORAGE_DATABASE_URL_UNPOOLED ||
  process.env.STORAGE_POSTGRES_URL_NON_POOLING;

if (!connectionString) throw new Error("zach-core database URL is unavailable");

const fixturePath = arg("--fixture");
const sourceRevision = arg("--source-revision");
const observedAt = arg("--observed-at");
const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as { entries?: SourceEntry[] };
if (!Array.isArray(fixture.entries)) throw new Error("fixture.entries must be an array");

const client = new pg.Client({ connectionString });
try {
  await client.connect();
  const live = await readLiveArchive(client);
  if (process.argv.includes("--plan-summary")) {
    const plan = planLiveCanonRevisions(live);
    const planDigest = "sha256:" + createHash("sha256").update(canonicalJson(plan), "utf8").digest("hex");
    process.stdout.write(JSON.stringify({
      sourceEntries: live.entries.length,
      sourceRevisionRows: live.revisions.length,
      targetRevisionPlanRows: plan.length,
      historicalRows: plan.filter((item) => item.sourceKind === "historical").length,
      currentRows: plan.filter((item) => item.sourceKind === "current").length,
      planDigest,
    }, null, 2) + "\n");
    process.exitCode = 0;
  } else {
  const report = reconcileLiveArchive({
    fixtureEntries: fixture.entries,
    live,
    sourceRevision,
    observedAt,
  });
  const output = process.argv.includes("--full") ? report : {
    observedAt: report.observedAt,
    payloadDigest: report.payloadDigest,
    sourceRevision: report.payload.sourceRevision,
    fixture: report.payload.fixture,
    live: report.payload.live,
    dispositions: report.payload.dispositions,
    differenceDimensions: report.payload.differenceDimensions,
    history: report.payload.history,
  };
  process.stdout.write(JSON.stringify(output, null, 2) + "\n");
  }
} catch (error) {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : "validation";
  process.stderr.write(`reconciliation failed (${code})\n`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
