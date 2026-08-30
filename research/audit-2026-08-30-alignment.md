# Alignment audit — tickets, epics, code, documentation, version control

**Date:** 2026-08-30 · **Scope:** all five surfaces, and specifically whether they *agree with each
other*.

**Depth, stated honestly.** The first pass of this audit was a mechanical scan with two deep probes,
and calling it comprehensive was an overstatement — the owner said so and was right. What follows
marks each area with the depth it actually received. Section 5 was then re-run properly, and the
deeper pass found something materially worse than the first. **§6 lists what remains unaudited.**

---

## The finding that organises the others

**What is gated is aligned. What is not gated has drifted.**

The internal registers — work graph, claim register, evidence, negative results — agree with each
other almost perfectly, because over the last day each disagreement became a CI gate. Five rules on
the graph, four on the claim register, plus tracked-paths and declaration-parity.

Every surface *without* a gate has drifted: the README, the GitHub issues, the epic states, and the
formal resource manifest. This is not a coincidence and it is not a compliment to the gates. It says
the project's attention has followed its instrumentation, and the un-instrumented surfaces are
exactly the ones a newcomer meets first.

---

## 1. Tickets — **aligned**

77 items: 63 Done, 4 Ready, 4 Blocked, 6 partial or registered-not-scheduled.

No dangling references anywhere: every `SCMS-`, `SH-`, `NR-scms-`, `scms-evidence-` and
`scms-blocker-` identifier referenced in any document resolves. Every Done item cites an evidence
record that exists, or carries a truthful exemption marker. No evidence record is unreachable.

This is the healthiest surface, and it is the one with five self-tested gates on it.

## 2. Epics — **drifted**

**Four epics claim to be in progress while every item under them is Done:**

| Epic | Items | State it claims |
|---|---|---|
| E3 Qualification | 4/4 Done | "In progress — note profile end-to-end" |
| E6 Observation | 3/3 Done | "In progress — semantic core landed" |
| E7 Narrow path | 1/1 Done | "In progress — 8 of 9 steps closed" |
| E12 Authoring surface | 7/7 Done | "Ready — stack decision pending survey" |

**E1 holds 30 of 77 items** — nearly 40% — while E4 (Projection) holds one, despite the resolver,
the projection cache, fingerprint invalidation and materialization all being projection work. Items
have been landing in E1 by default rather than by fit, which makes epic-level reporting meaningless:
"E1 in progress" conveys nothing when E1 is a third of the project.

E9/E10/E11 are empty, which is correct — they are future migrations with no work yet.

## 3. Code — **aligned, with a small tail**

20 packages, every one vectored. **293 vectors.** 6,942 source lines against 5,878 test lines, a
ratio of 0.85 — high, and consistent with a project whose defects are mostly found by its own tests.

**Ten exported values have no consumer outside their defining file:**

```
PROVENANCE_KINDS  BODY_KINDS        (canon/envelope)
mergeChanges                        (contracts/runtime)
evidenceSubject   attestationSubject (qualification/canon-evidence)
EVIDENCE_RESULTS  EVIDENCE_VALIDITY  DISPOSITIONS  (qualification/eqp)
NOTE_TYPE                           (schema)
RESOLVER_ID                         (surface-resolver)
```

Most are closed vocabularies that exist to *be* the enumeration — `EVIDENCE_RESULTS` is the list the
type derives from, and exporting it is defensible. But by this project's own doctrine an export with
no consumer is a declaration with no consumer, and the honest options are to consume them, to stop
exporting them, or to say in one line why they are exported anyway. Currently none of the three.

## 4. Documentation — **one serious drift**

> **README.md:** *"Status: design canonized; no implementation yet. `Documented ≠ Implemented ≠
> Tested ≠ Empirically Validated` — this project is at Documented."*

That is false, and it is the first thing anyone reads. There are 20 packages, 293 passing vectors,
a running editor, a running site, a Postgres store with enforcing grants, and a real corpus flowing
through all of it. The README has not been touched in 28 hours, during which most of the system was
built.

The irony is sharp: the sentence quotes the claim ladder this project uses to prevent overstatement,
and gets its own rung wrong — in the *understating* direction, which is rarer and no more accurate.

`DESIGN.md`, `SPEC_HEALTH.md` and `AGENTS.md` are current. DESIGN.md required no correction in the
previous audit either; the implementation has been catching up to it rather than diverging from it.

## 5. Version control and the pin manifest — **the worst finding in the audit**

*Depth: deep, on the second pass. The first pass checked one pin of ten and generalised from it.*

### 7 of 10 pinned formal resources cannot be verified by anyone but this machine

| Resource | Pin kind | State |
|---|---|---|
| `fundamental` | `git:` | **clean** — revision exists, inventory present, tree committed |
| `ses` | `sha256:` | git-backed, clean, has a remote |
| `rr-rsp` | `git:` | git-backed and clean **now**; pin is 2 commits stale and its inventory was absent at the pinned revision |
| `sps` `icp` `eqp` `hcml` `fpb` `sss` | `sha256:` | **unversioned directories** — no git, no remote |
| `iepe` | digest | **source missing on this machine entirely** |

Six of these pins are content digests over directories that are **not under version control and have
no remote**. One names a source that is not present at all. The consequence is not that the
directories are unreal — the owner has them — but that the pin's central promise is hollow:

- the pinned state **cannot be obtained** by anyone else;
- the digest **cannot be recomputed**, because the manifest documents no digest method;
- drift **cannot be explained**, only detected as a mismatch with no history behind it.

The doctrine in §12.1 — consume capabilities as pinned dependencies, repair upstream, re-pin —
rests on this chain. For seven of ten resources the chain terminates in a local folder.

**`sss` is one of them.** The Semantic Surface System is the protocol this project cites most often
— SSS-INV-008 and -009 govern the morphology boundary, §31 orders the resolution lifecycle, and
those citations appear throughout the code as the justification for its structure. Its pin is a
digest over an unversioned directory.

### The `rr-rsp` pin was pointing at content that did not exist

** The manifest pins reflective-rust at `git:3a1c3c727e02` and
declares an inventory of three paths. Two of them — `crates/reflective-rust-protocol/src/lib.rs` and
`CONFORMANCE.md` — **did not exist at that revision.** They were untracked working-tree files, so
the pin claimed authority over content no one but this machine could see, and its digest could not
have been checked by anyone else.

This is NR-scms-019's class — untracked files making local state diverge from what others can
observe — reaching the *authority chain* rather than a test gate. It is now fixable: both files were
committed last night, and the pin can move to `844fa66`, where its inventory actually exists. Open
as **UD-8** / issue #23.

**Other version-control drift:**

- **Issues remain open for completed work.** #34 (SCMS-008), #32 (SCMS-007), #30 (SCMS-006), #27
  (SCMS-005) are all Done in the graph. `work/GRAPH.md` declares GitHub the board of record, and the
  board disagrees with the register it is supposed to be.
- **No tags.** Zero, across the whole history — no marked point for "the narrow path closed" or "the
  corpus landed", so there is no way to name a state except by commit hash.
- **PR #28 has been open since the start**, carrying DESIGN v2 with 25 undispositioned proposals.
- 9 of the last 60 commit subjects exceed 72 characters. Cosmetic.

---

## What alignment actually looks like here

| Surface | Verdict | Gated? |
|---|---|---|
| Tickets | Aligned | ✅ five rules |
| Claim register | Aligned | ✅ four rules |
| Code | Aligned, small tail | ✅ parity + boundary |
| Epics | **Drifted** | ❌ |
| README | **Drifted, materially** | ❌ |
| GitHub issues | **Drifted** | ❌ |
| Formal pins (7 of 10) | **Unverifiable by anyone else** | ❌ |

The correlation is exact. Every gated surface holds; every ungated one has moved.

## Recommendations, in order of value

1. **Address the pin chain.** Seven of ten formal resources are unobtainable and uncheckable
   outside this machine, including `sss`, which the codebase cites as its structural authority.
   Minimum: `git init` + a remote for the six unversioned protocol directories, locate or drop
   `iepe`, and document the digest method so a digest means something. This outranks everything
   else because the doctrine depends on it.
2. **Fix the README.** It is one paragraph and it is actively misleading about the project's rung.
3. **Re-pin `rr-rsp` to `844fa66`** and close UD-8. The pin now points at content that exists.
4. **Reconcile the epic states**, and consider whether E1 should be split — a 30-item epic is a
   label, not a grouping.
5. **Close the issues whose work is Done**, or stop calling GitHub the board of record.
6. **Tag something.** `v0.1.0-narrow-path` or similar, so states have names.
7. **Decide about the ten unconsumed exports** — consume, unexport, or justify.

Items 2, 4, 5 and 7 are mine. Items 1, 3 and 6 touch pinned formal resources or naming and are the
owner's.

---

## 6. What this audit did NOT cover

Stated so the report is not mistaken for more than it is:

- **45 work files unread.** No acceptance criterion has been checked against what was actually built.
- **21 negative results unverified.** Each records a correction; none was re-tested to confirm the
  correction still holds.
- **DESIGN.md never read against the code.** 383 lines, 15 sections; the previous audit asserted it
  needed no correction, and this one did not re-examine that.
- **No code review.** Coverage, duplication, error handling and correctness were not examined — only
  export/consumer relationships by grep.
- **PR #28 unreviewed.** 25 undispositioned proposals against canonical doctrine.
- **The six unversioned protocol directories were not read**, only checked for versioning.

Each is a day's work in its own right. The pin finding above is the one that should be closed first,
because everything else in the project cites those resources as authority.
