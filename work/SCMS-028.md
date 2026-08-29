# SCMS-028 — Map the zach-core corpus into Canon (first real workload)

**Intent ref:** PROJECT_INTENT.md · **Epic:** E8 · **Effect class:** E1
**Assigned by:** owner directive — *"We're going to migrate my site to it. That's the first test."*
**State:** Ready → Claimed → Done (closing state at bottom)

## The gap

Every claim this system makes rests on content it invented for its own tests. SH-9 has stood
open since the register began: no pipeline exists from a real corpus into Canon. rcp-001 is now
**active** — the zachshallbetter.com archive is the first real workload. Until real content
lands, "the design is buildable" is a statement about fixtures.

The owner has since widened the target: zach-core and zachshallbetter consolidate into a single
project, CMS as substrate and site as reader expression. This item is the substrate half's
first step — the mapping — not the consolidation.

## Ready predicate

- **Scope:** a mapping from the zach-core corpus to Canon records, and vectors that run it
  against the **real** 215-entry corpus rather than a fixture written to pass.
- **Exclusions:** no live-state change of any kind — no Vercel deploy, no writes to the Neon
  database, no DNS. No UI (E12). No consolidation of the two repositories (later in E8). The
  repository does **not** vendor owner content: the corpus enters as a manifest of frontmatter
  plus body digests, never body prose.
- **Dependencies (satisfied):** SCMS-011…027, CI-verified. Manifest extracted with zach-core's
  own gray-matter, so parsing is the source's, not a reimplementation.
- **Acceptance:**
  1. All 215 entries import, one content record each, identity preserved.
  2. Every produced envelope validates as Canon.
  3. Body fidelity is checkable by digest without the prose entering this repository.
  4. The source's **mixed status vocabulary** — publication states and project-lifecycle labels
     sharing one field, the collapse §3.5 prohibits — is *surfaced as a finding*, not inherited:
     the 22 lifecycle-labelled entries keep their label and gain no inferred publication state.
  5. `unlisted` survives as itself, mapped to neither public nor private.
  6. The 142 private entries land at `owner` access and unpublished.
  7. Model-generated material (the Semantic Article Field, source-flagged
     *"model-inferred; unvalidated"*) lands as a **separate derived envelope**, never merged
     into the authored record.
  8. Declared relations become records with every target resolving.
  9. The migrated corpus lands in Canon, freezes, and resolves as a surface.
  10. Over real content, a public reader's surface contains no private entry.
- **Evidence requirements:** `node --test impl/migrate` in scms-evidence-028. Rung: **Implemented
  + Tested against a real corpus.** This does *not* establish empirical usefulness — no human has
  used the result, and nothing is deployed.
- **Target:** `impl/migrate/*`, `fixtures/zach-core-manifest.json`, `records/*`, `SPEC_HEALTH.md`,
  `work/GRAPH.md`, `.github/workflows/gates.yml`.
- **Stop conditions:** any need to write to live state, deploy, or use credentials → protected
  action, stop and record. Any mapping that would require destroying a source distinction →
  record a finding rather than choosing for the owner.

## What the real corpus taught

Three things a fixture would not have:

1. **The source collapses two vocabularies into `status`.** This is the exact failure mode
   DESIGN.md §3.5 was written against, found in the owner's own live data. The migration refuses
   to launder it: it maps what is a publication state, preserves what is not, and files 22
   findings so the ambiguity is the owner's to resolve, not the importer's to guess.
2. **`unlisted` has no home in a two-valued access model.** Rather than round it to public or
   private — both wrong, one dangerous — it lands as public access plus an explicit attribute
   discovery lenses exclude on.
3. **A counting error the corpus caught.** The first draft of the vectors asserted 13 relations,
   from "13 files declare relations". Three of those declare the key *empty*: there are 10 edges.
   The vector now asserts all three numbers so the distinction cannot silently re-collapse. The
   importer was correct; the expectation was not — recorded because a passing suite adjusted to
   match a wrong belief is how a fixture becomes a lie.

## Known limitation (recorded, not hidden)

The markdown corpus is the **seed-time** state. zach-core's system of record is Neon Postgres;
content created or edited through the owner-gated API since seeding lives only there, along with
`entry_revision` history and working-copy buffers. Reconciling against live Postgres requires
owner-authorized credentials and is a follow-up (SCMS-029), not part of this slice. Nothing here
claims the corpus is current — only that what it contains maps faithfully.

## Closing state

**Done — real content maps into Canon, and the mapping reports what it could not honestly decide.**
