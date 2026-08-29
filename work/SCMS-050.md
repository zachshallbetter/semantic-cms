# SCMS-050 — The read path consults the publication axis

**Intent ref:** PROJECT_INTENT.md · **Epic:** E8 · **Effect class:** E1
**Assigned by:** coordinator goal, on noticing the site server never mentioned publication.
**State:** Ready → Claimed → Done (closing state at bottom)

## The defect

`publicationState` appeared **nowhere** in the read path — not in the reader routes, not in the
resolver, not even in the frozen snapshot, which did not carry the field at all.

Reproduced before fixing:

```
snapshot carries publicationState? false
/writing shows: [ 'actually-published', 'never-published-draft', 'was-unpublished-again' ]
```

A never-published draft and a record that had been taken down both appeared on the public site,
beside the genuinely published one.

## Why this is the largest instance of the failure class

The whole qualification-and-promotion apparatus — EQP profiles, evidence records, attestations,
`content.promote@1` at effect class E3, its `reauthenticate` verification, the compensation
`content.unpublish@1` — **had no consumer in the read path.** The system's central claim, that
*publishing is qualification plus promotion and never a boolean*, had no effect on what a reader
sees.

The sharpest part: `content.unpublish@1` exists because SCMS-020 found that *"promote declared a
compensation interaction that did not exist."* The compensation then existed and **removed nothing
from any surface**. The same failure, one level up, and I did not look for it there.

## The fix

- `freeze()` carries `publicationState` into snapshot subjects.
- `SurfaceLens` gains `require: { publicationState }` — a **state** predicate, distinct from `where`,
  which reads authored attributes. State axes are not caller-set, so they belong in their own clause.
- The resolver evaluates it **first**, before kinds, and **applies it to the focus anchor**. A focus
  route may waive the kind filter for its own subject — that is what makes a detail page resolve
  what you asked for — but it may not waive publication, or an unpublished draft stays readable by
  direct link.
- A disqualified anchor is a **failure, not an empty surface**. Previously a detail route for an
  unpublished record returned a surface with no members, so the page rendered blank instead of
  404ing. The disclosure mapping is the existing one: below owner access the reason is withheld,
  because *"this exists but is not published"* tells an unauthorized reader that it exists.
- Absent publication state resolves to `unknown`, not `ineligible` — SSS-INV-013 keeps them
  distinguishable — and still fails closed, because only `eligible` is ever included.

Publication gates **reachability**; listedness gates **discovery**. Different axes, which is what
§3.5 exists to protect.

## Two vectors changed their meaning, correctly

`the owner sees more than the public reader` asserted that an owner sees drafts on a reader route.
That premise *was* the defect: the reader routes are the **site**, and the site is the site
regardless of who is looking. Unpublished work belongs to the editor, a different surface with a
different lens. Rewritten to assert what should hold — public ⊆ owner, every difference is private,
and nothing unpublished reaches either view.

## The honest consequence

**The site now renders empty.** `content.create@1` refuses to create already-published content, so
the migrated corpus arrives unpublished, and 61 records that were published in the source are not
published here. That is true rather than broken, and the site says so: the empty state explains that
publication is qualification plus promotion, that nothing has crossed that gate, and that promoting
those records is reconciliation work (SCMS-029) rather than something the importer may do alone.

A blank page would have been the same fact told badly. §8.3's rule — failure degrades to truth, not
to a spinner — applies to emptiness too.

## Closing state

**Done — promotion now decides what readers see, and unpublishing takes things down.**
