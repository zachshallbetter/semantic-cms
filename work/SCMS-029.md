# SCMS-029 — Reconcile the corpus against live Postgres

**Intent ref:** PROJECT_INTENT.md · **Epic:** E8 · **Effect class:** E0+E1
**Parent:** Independent Practice System UP-01
**Assigned by:** owner — continue the Independent Practice System through its
required upstream work, 2026-09-08
**State:** Ready → Claimed → In progress

## Intent

Replace the seed-time assumption in SCMS-028 with measured knowledge of
zach-core's live authority before any migration or cutover. Preserve every
source distinction, revision, deletion, and unresolved difference.

## Objective

Implement and run a deterministic, read-only reconciliation between the
committed zach-core corpus fixture and the live Postgres archive. Produce a
redacted report, revision-mapping contract, tests, and evidence sufficient to
plan migration without copying owner prose or credentials into this repository.

## Scope

- current and soft-deleted `entry` rows;
- `entry_revision` snapshots and their source order;
- `working_copy` presence and custody state;
- entry relations, media, collections, and reader-record counts and integrity;
- stable source identity and canonical content digests;
- live-only, fixture-only, changed, unchanged, deleted, ambiguous, and
  history-only dispositions;
- a pure reconciliation module, synthetic negative vectors, and a read-only
  operator command.

## Exclusions

- No database write, schema change, restore, seed, deploy, DNS, or cutover.
- No connection string, provider secret, body text, title, summary, reader key,
  reader answer, email address, or raw private identifier in output or evidence.
- No production Canon landing or cutover; the synthetic vertical test may land
  one mapped record to prove the governed boundary without declaring migration.
- No working-copy model decision if live state contains a working copy; that
  becomes a separate authority decision.
- No change to zach-core or its dirty working tree.

## Dependencies

- SCMS-028, SCMS-057, SCMS-065, and the pinned Canon serializer.
- zach-core revision `2e05cda67ae158371cb426089c2523e206a54990` plus its
  observed dirty state.
- Owner-authorized read-only use of the existing zach-core runtime database
  credential for this reconciliation only.
- Independent Practice System D013 and `work/IPS-004.md` UP-01.

## Acceptance

1. The operator opens an explicit read-only transaction and uses parameterized,
   fixed queries only.
2. Every source row class in scope is counted; orphan and duplicate identity
   checks are reported.
3. Every active and deleted entry has a deterministic redacted identity and
   current content digest; no content-bearing field reaches the report.
   The source UUID remains identity across slug changes; slug is versioned
   content and alias input, never substituted for identity.
4. Revision snapshots are ordered by `(created_at, id)`, canonicalized with the
   shared serializer, deduplicated only by exact canonical digest, and compared
   with current state.
5. The result distinguishes fixture-only, live-only, current-equivalent,
   current-divergent, deleted, and ambiguous entries.
6. Reordered object keys produce identical digests; changed arrays or values do
   not. Unknown visibility, status, body format, or missing identity fails hard.
7. A second run against unchanged live state produces the same report payload
   digest. Observation time is metadata outside that digest.
8. Tests prove that redaction excludes declared sensitive fields and that a
   failure rolls the transaction back without partial output.
9. Evidence records the source revisions, commands, aggregate results, negative
   paths, limitations, and exact report digest.

## Required evidence

- `node --test impl/migrate/test/live-reconcile.test.ts`
- the live migration vertical test must prove source UUID identity survives a
  slug change through governed import and freeze;
- the history-plan test must prove adjacent duplicate collapse, revisit
  preservation, and Canon supersession lineage;
- the governed history import test must produce source-to-target revision
  receipts and verify each landed body against its mapped source state;
- full repository gates from `scripts/run-ci-steps.sh`
- one authorized live read producing a redacted report only
- repeated-run digest comparison
- credential and sensitive-field output scan
- updated work graph, claim register, and retained negative results where found

## Evaluator

Repository-native tests for deterministic behavior; parent migration-equivalence
review for fitness. Owner promotion remains separate.

## Permissions and effect

Write only this repository's migration implementation, tests, redacted evidence,
work graph, and generated context. Read zach-core source and its existing runtime
database credential. Query the live database inside a read-only transaction.
Update GitHub issue 36 as the board projection. Do not mutate any external data.

## Budget

One bounded full-table read of the named archive tables per evidence run, with
no row bodies retained after hashing and no large or sensitive output.

## Stop conditions

- The database refuses read-only transaction semantics.
- A source discriminator is unknown or an identity is missing or duplicated.
- Reconciliation would require guessing authority, publication state, revision
  order, or working-copy disposition.
- A query or report path can expose content or credentials.
- Live schema differs materially from the inspected zach-core schema.
- Any database or provider mutation becomes necessary.

## Target

`impl/migrate/src/live-reconcile.ts`,
`impl/migrate/test/live-reconcile.test.ts`,
`scripts/reconcile-zach-core-live.ts`, `work/GRAPH.md`, `SPEC_HEALTH.md`,
`records/*`, generated context, and GitHub issue 36.
