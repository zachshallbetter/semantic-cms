# SCMS-076 — Declared content types for `project` and `role`

**Intent ref:** PROJECT_INTENT.md · **Epic:** E1 · **Effect class:** E1
**Assigned by:** SCMS-068's audit — the corrected claim row names this gap.

## The gap

The claim *"declared content types are enforced"* now carries the honest qualifier **"where
declared"** — and `ARTICLE_TYPE` is the only one. The corpus contains **9 projects and 8 roles**,
and `ob/schema-valid` returns `NOT_APPLICABLE` for both:

```ts
if (body.contentKind !== "article" && body.contentKind !== "note") {
  return { result: "NOT_APPLICABLE", detail: `no declared type for kind '${body.contentKind}'` };
}
```

`NOT_APPLICABLE` is honest — it says a check does not apply rather than pretending it passed — but it
means 17 real records have no structural conformance at all.

## Ready predicate

- **Scope:** `PROJECT_TYPE` and `ROLE_TYPE` derived from what the corpus actually carries, not from
  what seems reasonable. Roles have `company`, `period`, `skills`; projects have `link`, `status`,
  `chips`.
- **The rule SCMS-054 established:** a declared type describes the content that exists, not a subset
  someone remembered. `ARTICLE_TYPE` omitted `summary` and every migrated article failed
  `schema-valid` as a result.
- **Exclusions:** do not invent slots the corpus does not use, and do not make optional what the
  corpus always carries — a type that admits everything enforces nothing.
- **Acceptance:** every one of the 215 records passes `schema-valid` against its declared type, or
  fails for a reason that is *true of the content*; `NOT_APPLICABLE` no longer appears for any kind
  in the corpus; the import still lands all 215 with `validateBody` threaded.
- **Stop conditions:** if a real record cannot satisfy a reasonable type, that is a finding about the
  content, not a licence to weaken the type — record it and stop.
