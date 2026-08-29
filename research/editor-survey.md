# Editor survey — what already exists, and what to do with it

**Directive (2026-08-29):** *"Checkout the text editors in these. I've built quite a few over the
years."* · *"My personal site has live editing, editors, ai gen, etc."* · *"We can do it better, but
use the resources we have."*

Assessed under the dependency doctrine (DESIGN.md §12.1): capabilities are consumed as **pinned
dependencies**, and anything needed, broken, or missing is fixed **upstream** and re-pinned — never
forked or vendor-patched here. Verdict vocabulary follows the SCMS-004 ledger:
**pin-now · repair-first · reference-only · not-a-candidate**.

*Status: complete — five surveys.*

**The headline: the owner's own site already solves two problems this project has been solving, and
has one problem this project has already solved.** `zach-core` records AI provenance
(`data.generated.validation = "model-inferred; unvalidated"` — the exact string SCMS-028's migration
carries) and has a genuinely good draft-buffer design. It also has **no optimistic concurrency at
all**: `PUT /admin/entries` is last-writer-wins with no version check, and two editors racing simply
overwrite each other. Its safety net is that every write snapshots a full revision first, so a
clobber is *recoverable* rather than *prevented*.

---

## text-diff-tool — **repair-first**

MIT. Two commits, no iteration history.

**What is genuinely valuable:** `generateMergedText(changes, decisions: Map<number, 'accept' |
'reject' | 'keep'>)` (`src/core.ts:413`). That accept/reject/keep vocabulary is *exactly* the
per-hunk decision map DESIGN.md §8.5 requires under P22 — which the owner accepted on 2026-08-28.
The shape already exists; it does not have to be invented.

**Why it cannot be pinned as-is — two defects, both upstream fixes:**

1. **The decision map is keyed by array index** into a re-derivable change list. P22 requires a
   decision map that is *replayable and diffable*; an index shifts the moment the diff is
   recomputed, so what it records is not durable. Needs stable hunk identity.
2. **`keep` is a lie for `modified` hunks.** `core.ts:438` falls through to `change.modified`, with
   a comment saying so. "Keep both" silently means "accept theirs" — the failure class this project
   has recorded three times: a declaration with no consumer, here as a decision with no effect.

**Also:** no three-way merge exists (`base`/`ours`/`theirs` appears nowhere), and `core.ts`
top-level-imports `chalk` for terminal colouring only, which would drag a runtime dependency into a
zero-dependency consumer. All three are small, well-scoped upstream changes.

**Not adopted from it:** the docs (`IMPLEMENTED.md`, `MODERNIZATION.md`, `CHANGELOG.md`) are
forward-looking status boards, not engineering history — `IMPLEMENTED.md:61` asserts "Production
Ready: ✅ Yes" while `IMPLEMENTED.md:53` lists a test suite under *future* enhancements. There is no
retrospective signal to learn from, and the decision-map function is undocumented dead code that no
endpoint, CLI flag, or UI control reaches.

---

## wysiwig-editor — **reference-only**

Single "Initialize" commit. A scaffold, not a battle-tested editor. Contains three disconnected
attempts: a live TipTap editor, a second unused TipTap instance, and an `src/api/` REST spec that
**does not compile** (55 type errors, e.g. invalid syntax at `EditorAPISpec.ts:52`) and is imported
by nothing.

**Why it is not a reuse candidate for our purposes:** TipTap/ProseMirror maintains a real node tree
internally, but this integration throws it away — `WysiwygEditor.tsx:26` serializes to an HTML
string on every update, and the abandoned API layer types section content as `string // Sanitized
HTML`. At the app boundary this is HTML-in/HTML-out, so the structured document we would need is
not exposed. Editing commands are `editor.chain().focus().toggleBold().run()` fired from inline
click handlers, so there is no externally-gatable named-operation layer. The live app edits one
blob; the only slot-structured thing in the repo is a metadata form that is not wired to the
editor. Accessibility is `aria-label` on toolbar buttons — no linearization, nothing a voice
rendering could be built from.

**Worth keeping as reference:** the custom-node pattern in `src/extensions/structured-data-node.ts:5`
(`Node.create` + `addCommands`) shows how to declare a named, externally-invokable TipTap command —
a template if ProseMirror ends up being the *visual* editing engine. And `editor.types.ts:22`'s
`EditorSection[]` with a `SectionType` is a reasonable sketch of a slot-aware document, though it
does not compile and nothing uses it.

**The real dependency question it raises:** if we want a serious visual editing engine, the
candidate is **ProseMirror/TipTap itself**, not this wrapper. That is a genuine architectural
decision — semantic-cms is currently zero-runtime-dependency Node strip-only TypeScript, and an
editing engine would be its first real runtime dependency. It is defensible (an *expression* may
carry dependencies the core does not) but it is an owner decision, not an implementer's. Recorded
rather than assumed.

---

## zach-core — **the real system of record** · adopt-from, do not replace wholesale

`src/database/archive.schema.sql`, `api/v1/admin/*`. This is where the owner's writes actually go.

### What is better than what SCMS built, and should be adopted

**`working_copy` — the draft buffer.** (`archive.schema.sql:138`, `api/v1/admin/draft.ts`.) Autosave
branches on whether the entry is *currently reader-reachable*. If it is live, the write buffers into
a `working_copy` jsonb column and the published columns are untouched — **readers see nothing until
an explicit Save**. If it is not live, the write goes straight through. Autosave never appends a
revision and never purges cache; committing does both and clears the buffer.

That is a distinction Semantic CMS does not have and should: it separates *durability* from
*publication* at the storage layer, which is the same separation §6 makes at the qualification
layer. Our `content.revise@1` currently conflates them — every keystroke that lands is a revision.

**AI provenance exists, at `entry.data.generated`** (`api/v1/_enrich.ts:141`):
`{at, model, sources: {field: 'llm'|'fallback'}, fields: [...], validation: 'model-inferred; unvalidated'}`.
Enrichment is **gap-fill only** — it never overwrites a value the author set. This is the origin of
the flag SCMS-028 preserved, and it is better than nothing by a wide margin.

**Its limits, stated fairly:** provenance is per-write rather than per-field-per-call, it lives
inside a jsonb blob rather than as a record with its own identity, and **nothing reconciles it when
a human edits a field that `generated.fields` still lists as model-sourced**. So a hand-rewritten
summary can go on claiming to be model output, or vice versa. Semantic CMS's separate
`derived`-provenance envelope (SCMS-028) is the stronger model; this is the weaker one that is
actually in production.

### What SCMS has that zach-core does not

- **Optimistic concurrency.** There is none here: no version column check, no `If-Match`, no
  `WHERE updated_at = $expected` (`entries.ts:179`). Last-writer-wins. `content.revise@1` refuses a
  stale `expectedRevision` and writes nothing — that is a genuine improvement, and it is the thing
  P7 is about.
- **Append-only enforced.** `entry_revision` is append-only *in code* only — no trigger, no
  `REVOKE UPDATE, DELETE`. And `ON DELETE CASCADE` from `entry` means revisions vanish if the parent
  row is ever hard-deleted. Nothing hard-deletes today, so this is latent rather than active.
- **Governed creation.** Everything crosses `requireOwner`, but there is no contract vocabulary,
  no typed outcome, no receipt.

### For the migration (SCMS-029)

`entry_revision` stores **full snapshots, not diffs**, taken *before* each mutating write, with a
free-text `reason` (`create`/`update`/`delete`/`pre-enrich`/`pre-restore`). So the owner's real
history **is** preservable — but there is **no actor recorded on a revision row**, so *who* made each
historical edit is not recoverable from it. That is worth knowing before promising provenance
fidelity on migration.

Status/visibility are `text` columns with CHECK constraints, not enums; `type` has no constraint at
all. Default is the restrictive pair (`private`/`draft`). Soft delete via `deleted_at` is orthogonal
and re-checked in every query rather than enforced.

---

## zachshallbetter (the site client) — **reference-only, and self-declared disposable**

`README.md:3` calls it *"Version 6: the disposable client."* Take that at face value: the durable
value is `zach-core`, not this app.

**The editor is real** — Milkdown Crepe (ProseMirror) for the body, `contenteditable` for the title,
hand-built form controls for metadata (`src/scripts/article-editor.ts`, `inline-editor.ts`). Content
stays **markdown end to end**, with a `tidyMarkdown()` pass to survive round-tripping.

**"Live" means cache-tag invalidation, not collaboration.** No websockets, no SSE, no presence, no
multi-editor conflict handling. An edit purges Vercel cache tags so the rendered page refreshes in
seconds. They abandoned rebuild-on-edit (~90s) in July 2026 and deleted the machinery
(`docs/editing-and-live-render.md:75`).

**The gap that matters most:** generated values are written into the *same fields* an author types
into, and the only trace is a 1.2s CSS flash (`article-editor.ts:163`). Once saved, on the client,
a human-written summary and a model-written one are indistinguishable. `zach-core` records the
coarse `data.generated` blob server-side, so the fact is not entirely lost — but the client, which
is where a person decides whether to trust a sentence, shows nothing.

**Worth borrowing:** the optimistic in-DOM preview (`live-preview.ts` — "the page you're looking at
IS the preview"), the recovery prompt comparing a local autosave against `updatedAt`
(`article-editor.ts:505`), and the failure posture — a failed save keeps the editor open with edits
intact and never rolls back the optimistic DOM.

---

## stone-oven — **reference-only** (network boundary), **not** a source of declarative UI

A documentation authoring tool with AI grounding/citation checking. Real TipTap/ProseMirror editor
with custom marks for source associations and audit findings.

**The thing I went looking for is not here.** There is no declarative UI-from-structure system.
`ProjectView.tsx` is a 1316-line monolith branching on `useState<'notebook'|'studio'>`;
`docs/architecture/ui-lenses.md` describes a `UIContextState` descriptor that **was never built** —
it is aspirational prose over hardcoded conditional JSX. The project's own `docs/code_review.md:20`
calls the file *"an absolute monolith… without abstracting the UI constraints"* and lists it as debt.

No typed write-outcome contract either: `storageService.ts:250` is last-write-wins SQL with no
version check. The one thing named "conflict" is unrelated — a heuristic that finds contradictory
factual *claims across documents*.

**Worth borrowing:** `docs/COORDINATOR_CONTRACT.md` — a typed envelope with server-side signing and
route-mode fallback, a clean network boundary pattern. And `docs/architecture-gaps.md` is a
genuinely useful pre-mortem on Git-branch promotion, naming the *"violent `<<<<<<< HEAD` merge
conflict wall"* as the thing that would break the editing experience. **That is a direct argument
bearing on P7** — written by the owner, about their own workload, before building it.

---

## What this changes

1. **P7 has prior art from the owner.** `architecture-gaps.md` argues against exposing raw merge
   conflicts in an authoring UI. That is evidence for the decision, though not the *workload*
   evidence §8.5 asks for — it is a designer's prediction, and the deferral asked for observation.
2. **Adopt `working_copy`.** Separating durable autosave from publication is right, and Semantic CMS
   currently makes every landed keystroke a revision.
3. **The provenance gap is the clearest place this project is genuinely better** — and it is worth
   saying that the owner's system already tries, and that the try is coarse rather than absent.
4. **ProseMirror is the common engine** across three of these. If the editor needs a real visual
   editing surface, that is the dependency candidate — and it would be Semantic CMS's first runtime
   dependency, which is an owner decision (see the wysiwig-editor entry).
