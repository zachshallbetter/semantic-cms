# SCMS-037 — The site renders from Canon

**Intent ref:** PROJECT_INTENT.md · **Epic:** E8 · **Effect class:** E1
**Assigned by:** owner directive — *"We should be migrating both projects to a singular new one."*
**State:** Ready → Claimed → Done (closing state at bottom)

## The gap

SCMS-028 landed the corpus; SCMS-030 declared the reader routes and proved they resolve. Nothing
rendered a page a browser could load, so the consolidation's reader half existed as route
declarations and vectors rather than as a site.

## The decision that carries the weight

**The site's renderer is a third expression adapter, not a bespoke page builder.**

The tempting build is a template that reads Canon and writes HTML. That is exactly what SH-16 was:
the editor hand-writing its own page, collapsing `CANON ≠ SURFACE ≠ EXPRESSION ≠ REPRESENTATION`
at the one place a person actually looks. Repeating it for the site would have a wider blast radius
and would be harder to unpick later.

So `expressReaderWeb` returns an `ExpressionArtifact`, the same type `structural-web` and
`linear-voice` return. The consequence is not stylistic: **the S3 equivalence checker can hold the
site's renderer to the same contract as the other two.** A vector compares the site's rendering of a
real surface against the *voice* expression of that same surface and requires identical members,
identical order, and identical operation exposure, while requiring morphology to differ. The site
cannot quietly drop a subject, reorder for aesthetics, or hide a withheld operation, because a
conformance instrument that already existed now covers it.

Content arrives through an injected `Hydrator` called only for surface members — look up, never
look around, the same discipline `deriveFeed` holds. Feeds and sitemap take a rendered route and a
hydrator, and take **no snapshot and no access level**, so they make no access decision and have no
route to a subject the page would not show.

## What this found

**NR-scms-011 — the equivalence checker had a false positive that would have been "fixed" by
weakening it.** Its access-constraint check used `output.includes(token)`, and the corpus contains
the two-character slug `ma`, which occurs inside class names, attributes and ordinary words in any
HTML. The checker reported both expressions leaking simultaneously — the tell that the instrument,
not the expressions, was wrong. This is the *second* time this substring bug has appeared: I fixed
it in my own reader vectors during SCMS-030 and did not look for it in the shared instrument.
Now token-wise, with a vector proving a coincidental substring is not reported **and** a control
proving a genuine leak still fires.

## Acceptance — all met

1. The real corpus renders as pages a browser loads: index, detail, RSS, sitemap.
2. The renderer passes S3 equivalence against the voice expression of the same surface.
3. Hydration is member-driven, asserted by recording every subject the hydrator was asked for.
4. No private entry appears in any page, feed, or sitemap; controls prove each scan can fail.
5. A private detail URL 404s — the page has no path to it, so that is the truth, not a policy.
6. The owner's view differs from the public view by exactly the private set.
7. Each page states the snapshot and surface fingerprint it was derived from.

## Corpus observations, left alone

For `cursed-crypt` the body text is the summary repeated — that duplication is in the source file,
not the renderer, and deduping it silently would be an edit to the owner's content. Same posture as
the stray `---` the Medium imports carry. Both are visible in the editor, which is where they can
be decided about.

## What this does NOT establish

Nothing is deployed. There is no authentication in the site server and none is implied — every
request resolves at `public`, so "who is asking" never arises; the owner's view lives in the editor,
a separate process with its own gate. No caching, no cache invalidation, no measured render budget.
The deploy decision remains the owner's.

## Closing state

**Done — the site is an expression of Canon, and a conformance instrument says so.**
