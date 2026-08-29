# SCMS-030 — The site as a reader expression of Canon

**Intent ref:** PROJECT_INTENT.md · **Epic:** E8 · **Effect class:** E1
**Assigned by:** owner directive — *"We should be migrating both projects to a singular new one."*
**State:** Ready → Claimed → Done (closing state at bottom)

## The gap

SCMS-028 landed the corpus. Nothing read it back out. The consolidation the owner directed —
one project, CMS as substrate and site as reader expression — means the site stops being a
system that *fetches* content and becomes a set of declared surfaces over it. Until a real
reader route resolves from Canon, "substrate" is a word.

SPEC_HEALTH names the missing half exactly: *"a round-trip back out to a reader."*

## Ready predicate

- **Scope:** declare zachshallbetter.com's real reader routes (`/writing`, `/work`, their detail
  pages) as SurfaceRequests, resolve them over the migrated corpus, and derive feed and sitemap
  from the resolved surface.
- **Exclusions:** no deploy, no live-state change, no owner-gated routes (E12), no visual design.
  No Astro integration in this slice — the route *declarations* are the contract; wiring them into
  the site's renderer is the consolidation step that follows.
- **Dependencies (satisfied):** SCMS-028 and the resolver/expression stack, CI-verified.
- **Acceptance:**
  1. The real index routes resolve over the real corpus and are non-empty.
  2. No public route exposes any of the 142 private entries.
  3. A private detail route is **refused with a closed failure class**, not rendered empty.
  4. The owner's view differs from the public view by exactly the private set.
  5. The feed is derived from the page's surface and hydration is called for exactly the
     surface's members — it can look up, never look around.
  6. Unlisted content is reachable by link and absent from index, feed, and sitemap.
  7. Both expressions of a route present no private subject, with a control proving the scan works.

## The rule this slice establishes

**A feed is an expression of the same ResolvedSurface as its page — never a second query.**

Feeds leak drafts in practice not because anyone intends it but because the feed is a separate
code path that reimplements "which entries count" and drifts. `deriveFeed` takes no snapshot and
no access level, so it makes no access decision and has no route to a subject the page would not
show. Display material arrives through an injected `Hydrator` called only for members the surface
admitted; a vector asserts that call set equals the member set exactly. The parameter list is the
guarantee.

## What the corpus caught (again)

1. **A declared attribute with no consumer.** SCMS-028 preserved `unlisted` "so discovery lenses
   can exclude it" — and no lens did. The first reader vector put both unlisted entries straight
   into the public index. Recorded as **NR-scms-004**: this is the fourth instance of the failure
   class this project exists to catch, committed by this project. Fixed by making the flag
   *positive and always present* (`listed: boolean`, discovery includes on `true`), so absence
   excludes rather than admits. The negation form would have leaked on any record that missed it.
2. **A naive check that reported a leak that was not one.** One private entry has the slug `ma`,
   which occurs inside ordinary markup, so a substring scan flagged it. The scan was made
   token-wise rather than relaxed — a real check weakened to stop a false alarm is worse than no
   check, because it still reads as protection.

## Closing state

**Done — the round-trip closes: real content in, real reader routes out, with the feed unable
to disagree with the page.**
