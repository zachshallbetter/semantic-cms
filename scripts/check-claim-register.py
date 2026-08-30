#!/usr/bin/env python3
"""The claim register must agree with the work graph (SCMS-069).

`SPEC_HEALTH.md`'s claim register and `work/GRAPH.md` describe overlapping
reality, and nothing related them. The 2026-08-29 audit found two consequences
of that: a claim row read "blocked on P7/P22" for a day after P22 was accepted
and after the graph row for the same work had been corrected, and three landed
capabilities had evidence records but no claim at all.

`check-work-graph.py` validates the graph internally and says nothing about
whether the register agrees with it.

The rule is deliberately narrow, because "does this prose match reality" is not
mechanically decidable and a gate pretending to decide it would be worse than
none. Three checks only:

  1. Every `SCMS-NNN` the register cites exists in the graph.
  2. A claim at an **Implemented** or **Tested** rung cites at least one `Done`
     item. A claim resting entirely on Ready or Blocked work is a claim about
     intentions.
  3. A claim citing a **Blocked** item is itself hedged — partial, blocked, not
     established, or explicitly noting what is outstanding.
  4. A claim that names a proposal as *blocking* it does not name one that has
     already been dispositioned as accepted in `DESIGN.md`.

Rule 4 exists because the first three did not catch the finding this gate was
built for. The stale row read "blocked on P7/P22", cited SCMS-021 (which is
Done), and hedged nothing — so rules 1–3 all passed it. The staleness lived in
prose about *proposals*, not in a citation to a blocked work item. A gate that
passes the case it was written for certifies nothing, so the rule that actually
catches it was added rather than the claim being softened.

    python3 scripts/check-claim-register.py
    python3 scripts/check-claim-register.py --self-test
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SPEC = ROOT / "SPEC_HEALTH.md"
GRAPH = ROOT / "work" / "GRAPH.md"
DESIGN = ROOT / "DESIGN.md"

STRONG = ("implemented", "tested", "s3 conformance", "verified")
HEDGE = ("partial", "blocked", "not established", "narrow", "outstanding",
         "corrected", "overstated", "where declared", "no real connection",
         "semantic core", "only", "pending", "awaiting")


def graph_states(graph_text: str) -> dict[str, str]:
    states = {}
    for m in re.finditer(r"^\|\s*(SCMS-\d+)\s*\|[^|]*\|[^|]*\|([^|]*)\|", graph_text, re.M):
        states[m.group(1)] = m.group(2).strip().lower()
    return states


def claim_rows(spec_text: str) -> list[tuple[str, str, str]]:
    """(claim, rung, evidence) for each register row."""
    start = spec_text.find("## Claim register")
    if start < 0:
        return []
    rows = []
    for line in spec_text[start:].splitlines():
        if not line.startswith("|"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 3 or cells[0].startswith("---") or cells[0] == "Claim":
            continue
        rows.append((cells[0], cells[1], cells[2]))
    return rows


def dispositions(design_text: str) -> dict[str, str]:
    """Proposal dispositions as DESIGN.md records them: `[P10 — accepted …]`."""
    return {m.group(1): m.group(2) for m in re.finditer(r"\[(P\d+) — (\w+)", design_text)}


def check(spec_text: str, states: dict[str, str], dispos: dict[str, str] | None = None) -> list[str]:
    dispos = dispos or {}
    problems = []
    for claim, rung, evidence in claim_rows(spec_text):
        cited = re.findall(r"(SCMS-\d+)", evidence + " " + rung + " " + claim)
        label = claim[:58]

        for item in cited:
            if item not in states:
                problems.append(label + ": cites " + item + ", which the graph does not define")

        if not cited:
            continue

        rung_l = rung.lower()
        row_l = (rung + " " + evidence).lower()

        if any(w in rung_l for w in STRONG):
            if not any(states.get(i, "").startswith("done") for i in cited):
                detail = ", ".join(i + "=" + states.get(i, "missing")[:18] for i in cited)
                problems.append(
                    label + ": rung claims " + rung.strip("* ") + " but no cited item is Done (" + detail + ")")

        blocked = [i for i in cited if states.get(i, "").startswith("**blocked")
                   or states.get(i, "").startswith("blocked")]
        if blocked and not any(h in row_l for h in HEDGE):
            problems.append(
                label + ": cites blocked work (" + ", ".join(blocked) + ") without hedging the claim")
    return problems + _stale_proposals(spec_text, dispos)


def _stale_proposals(spec_text: str, dispos: dict[str, str]) -> list[str]:
    """A proposal named as blocking must not already be accepted."""
    problems = []
    for claim, rung, evidence in claim_rows(spec_text):
        row = rung + " " + evidence
        # Only where the row says a proposal is what's holding it up — and then
        # EVERY proposal named in that clause, not just the first. "blocked on
        # P7/P22" names two, and it was the second that had been accepted.
        # The clause ends at the first `(`, `;` or em dash, because what follows
        # is explanation rather than claim. Without that bound this fired on the
        # very row the audit had already CORRECTED — "blocked on P7 only (P22 was
        # accepted…)" — reading the parenthetical that records the fix as though
        # it were the defect. My own Ready predicate names that stop condition: a
        # gate that cries wolf on honest rows is one people learn to ignore.
        seen = set()
        for m in re.finditer(r"(?:blocked on|pending|awaiting|depends on)([^.|;(\u2014]*)", row, re.I):
            for pid in re.findall(r"\b(P\d+)", m.group(1)):
                if dispos.get(pid) == "accepted" and pid not in seen:
                    seen.add(pid)
                    problems.append(
                        claim[:58] + ": names " + pid + " as blocking, but DESIGN.md records it as accepted")
    return problems


def self_test() -> int:
    """The gate must be able to fail, or it certifies nothing."""
    hdr = "## Claim register\n\n| Claim | Rung | Evidence | Strengthen |\n|---|---|---|---|\n"

    ok = hdr + "| A thing | **Implemented + Tested** | SCMS-001: it works | more |\n"
    assert check(ok, {"SCMS-001": "done — landed"}) == [], check(ok, {"SCMS-001": "done — landed"})

    dangling = hdr + "| A thing | **Tested** | SCMS-999: it works | more |\n"
    assert any("does not define" in p for p in check(dangling, {})), "dangling citation not caught"

    intentions = hdr + "| A thing | **Implemented + Tested** | SCMS-002: soon | more |\n"
    got = check(intentions, {"SCMS-002": "ready — not started"})
    assert any("no cited item is Done" in p for p in got), got

    unhedged = hdr + "| A thing | **Implemented + Tested** | SCMS-003 does it | more |\n"
    got = check(unhedged, {"SCMS-003": "**blocked** — waiting"})
    assert any("without hedging" in p for p in got), got

    hedged = hdr + "| A thing | **Partially established** | SCMS-003 does it; blocked on P7 | more |\n"
    assert check(hedged, {"SCMS-003": "**blocked** — waiting"}) == []

    # Rule 4, against the exact row the audit found: cites a Done item, hedges
    # nothing, and names an already-accepted proposal as blocking it.
    stale = hdr + ("| R1 live co-authoring | **Implemented + Tested** | "
                   "`bounded` lane proven (SCMS-021); free lane blocked on P7/P22 | the free lane |\n")
    got = check(stale, {"SCMS-021": "done — landed"}, {"P22": "accepted", "P7": "deferred"})
    assert any("names P22 as blocking" in p for p in got), got

    # And the corrected row passes: P7 really is still deferred.
    fixed = hdr + ("| R1 live co-authoring | **Partially established** | "
                   "`bounded` lane proven (SCMS-021); blocked on P7 only | P7's disposition |\n")
    assert check(fixed, {"SCMS-021": "done — landed"}, {"P22": "accepted", "P7": "deferred"}) == []

    print("self-test ok (dangling citations, intention-claims and unhedged blocked work all detected)")
    return 0


def main() -> int:
    if "--self-test" in sys.argv:
        return self_test()
    problems = check(
        SPEC.read_text(encoding="utf-8"),
        graph_states(GRAPH.read_text(encoding="utf-8")),
        dispositions(DESIGN.read_text(encoding="utf-8")))
    if problems:
        for p in problems:
            print(f"CLAIM REGISTER: {p}")
        return 1
    print(f"claim register agrees with the work graph ({len(claim_rows(SPEC.read_text(encoding='utf-8')))} claims)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
