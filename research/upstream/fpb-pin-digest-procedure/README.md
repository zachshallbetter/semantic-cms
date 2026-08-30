# Archived copy — UD-14 upstream submission

This is a copy, kept here because the delivered original lives at

    /Users/zachshallbetter/Projects/_formal-project-bootstrap/proposals/pin-digest-procedure

which is not under version control and would disappear without trace.

**The copy is not the submission.** It is the record of what was submitted, on
2026-08-30, for maintainer review. FPB v0.5.1 was deliberately left unmodified:
it is the tree the `fpb` pin covers, so editing it would mutate the pinned
source, and `GOVERNANCE.md` reserves release authority to maintainers.

`scripts/verify-pins.py` here is the **generalised** version proposed upstream —
it takes a manifest path and carries no project-specific detail. This project's
own copy at `scripts/verify-pins.py` is a separate local tool with the same
procedure and semantic-cms-specific commentary. They are deliberately not
synced: a local verification script is this project's tooling, not a consumed
formal resource. If FPB releases the capability, this project should drop its
copy and consume the pin — and that re-pin is a compatibility event.
