#!/usr/bin/env python3
"""Work-graph integrity (SCMS-067).

`work/GRAPH.md` is the register of record for work-item identity, and it had
gone quietly wrong in three ways at once: five items referenced an epic E13 that
was never defined, an item stayed Ready after another item delivered it, and
three items discussed in conversation were never registered at all.

None of those are visible by reading the file top to bottom, which is why they
survived. Three checks:

  1. **Every epic a work item cites is defined.** A dangling epic reference is
     the declaration-without-a-consumer failure aimed at the register itself.
  2. **Work-item ids are unique.** `next-id.py --check` covers the jsonl
     registers; this covers the table, where the SCMS-044 collision happened.
  3. **Every Done item cites an evidence record that exists.** A Done row whose
     evidence id is absent is a claim with nothing behind it — the exact shape
     of the claim/evidence drift this project keeps recording.
  4. **No evidence record is unreachable from the graph.** Three addenda —
     `-004a`, `-037a`, `-040a` — existed with nothing citing them, so their
     content was write-only: `-037a` records a write-boundary violation CI
     caught, and no register pointed at it (SCMS-071).

     The `-a` suffix is deprecated. A follow-up finding gets its own sequential
     id and its own row; fewer kinds of identifier is worth more than the
     convenience that produced a second grammar.

  5. **Every Done item has a work file or a stated exemption.** The Ready
     predicate — scope, exclusions, acceptance, stop conditions — held for the
     first forty items and thinned as the pace rose (SCMS-070).

     The exemption exists so the fix is not worse than the gap. A predicate is
     valuable *because it was written before the work*, when it could still
     constrain what got built; composed afterwards from what happened, it
     produces a document that looks like governance and functions as decoration.
     So the thirteen items that lack one carry a marker saying so truthfully,
     rather than a predicate invented in hindsight.

    python3 scripts/check-work-graph.py
    python3 scripts/check-work-graph.py --self-test
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
GRAPH = ROOT / "work" / "GRAPH.md"
EVIDENCE = ROOT / "records" / "evidence.jsonl"

ITEM = re.compile(r"^\|\s*(SCMS-\d+)\s*\|([^|]*)\|\s*(E\d+(?:\+E\d+)?)\s*\|([^|]*)\|([^|]*)\|", re.M)
EPIC = re.compile(r"^\|\s*(E\d+)\s*\|", re.M)


def unreachable_evidence(graph_text: str, evidence_ids: set[str]) -> list[str]:
    """Evidence records the graph never cites."""
    cited = set(re.findall(r"(scms-evidence-[0-9a-z]+)", graph_text))
    return sorted(evidence_ids - cited)


def unreachable_records() -> list[str]:
    """Records in ANY register that nothing anywhere cites.

    Rule 5 originally covered only `evidence.jsonl`, so an orphan in another
    register went unnoticed.

    Scope is deliberately narrow: it covers registers whose records *support a
    claim* — evidence and negative results — and not the journals.
    `alignment.jsonl` is a chronological log of owner directives and is not meant
    to be cited from anywhere; `upstream-debts` and `blockers` are tracked as
    GitHub issues, which the graph header names as the board of record, so
    demanding a local citation too would double-count. A first draft of this
    rule covered all five and reported eleven "orphans" that were nothing of the
    kind — the cry-wolf failure mode these gates are supposed to avoid.
    """
    corpus = []
    for p in ROOT.rglob("*"):
        if p.is_file() and p.suffix in (".md", ".jsonl") and ".agents" not in str(p):
            corpus.append(p.read_text(encoding="utf-8", errors="ignore"))
    text = "\n".join(corpus)
    problems = []
    for reg in ("negative-results",):
        path = ROOT / "records" / f"{reg}.jsonl"
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            rid = json.loads(line).get("id")
            # One occurrence is its own defining line.
            if rid and len(re.findall(re.escape(rid), text)) <= 1:
                problems.append(f"{rid}: defined in {reg}.jsonl and cited nowhere")
    return problems


def check(graph_text: str, evidence_ids: set[str]) -> list[str]:
    problems: list[str] = []
    epics = set(EPIC.findall(graph_text))
    seen: set[str] = set()

    for item_id, _title, epic_field, state, evidence_field in ITEM.findall(graph_text):
        if item_id in seen:
            problems.append(f"{item_id}: duplicate work-item id")
        seen.add(item_id)

        # An item may sit in more than one epic ("E8+E12").
        for epic in epic_field.split("+"):
            if epic not in epics:
                problems.append(f"{item_id}: cites epic {epic}, which no row defines")

        if state.strip().lower().startswith("done"):
            has_file = (ROOT / "work" / f"{item_id}.md").exists()
            exempt = "no predicate:" in state
            if not has_file and not exempt:
                problems.append(
                    f"{item_id}: Done with no work file and no stated exemption")
            cited = re.findall(r"(scms-evidence-\d+)", evidence_field)
            if not cited:
                # A Done item may legitimately point at a work file instead.
                if "work/" not in evidence_field:
                    problems.append(f"{item_id}: Done, and cites no evidence record")
            for ev in cited:
                if ev not in evidence_ids:
                    problems.append(f"{item_id}: cites {ev}, which is not in records/evidence.jsonl")
    for orphan in unreachable_evidence(graph_text, evidence_ids):
        problems.append(f"{orphan}: exists in records/evidence.jsonl and no graph row cites it")
    return problems


def evidence_ids() -> set[str]:
    ids = set()
    for line in EVIDENCE.read_text(encoding="utf-8").splitlines():
        if line.strip():
            ids.add(json.loads(line)["id"])
    return ids


def self_test() -> int:
    """The gate must be able to fail, or it certifies nothing."""
    good = ("| E1 | An epic | ref | state |\n"
            "| SCMS-001 | A thing | E1 | Done | records/evidence.jsonl · scms-evidence-001 |\n")
    assert check(good, {"scms-evidence-001"}) == [], check(good, {"scms-evidence-001"})

    dangling_epic = "| SCMS-002 | A thing | E9 | Ready | — |\n"
    assert any("cites epic E9" in p for p in check(dangling_epic, set())), "dangling epic not caught"

    dupe = ("| E1 | An epic | ref | state |\n"
            "| SCMS-001 | One | E1 | Ready | — |\n"
            "| SCMS-001 | Two | E1 | Ready | — |\n")
    assert any("duplicate" in p for p in check(dupe, set())), "duplicate id not caught"

    dangling_ev = ("| E1 | An epic | ref | state |\n"
                   "| SCMS-003 | A thing | E1 | Done | records/evidence.jsonl · scms-evidence-999 |\n")
    assert any("scms-evidence-999" in p for p in check(dangling_ev, set())), "dangling evidence not caught"

    # Rule 4: a Done item with neither a work file nor an exemption. SCMS-999 has
    # no work/SCMS-999.md, so this exercises the real filesystem check.
    no_pred = ("| E1 | An epic | ref | state |\n"
               "| SCMS-999 | A thing | E1 | Done — landed | records/evidence.jsonl · scms-evidence-001 |\n")
    got = check(no_pred, {"scms-evidence-001"})
    assert any("no work file and no stated exemption" in p for p in got), got

    exempted = ("| E1 | An epic | ref | state |\n"
                "| SCMS-999 | A thing | E1 | Done — landed · *no predicate: discipline lapsed* "
                "| records/evidence.jsonl · scms-evidence-001 |\n")
    assert check(exempted, {"scms-evidence-001"}) == [], check(exempted, {"scms-evidence-001"})

    orphan = ("| E1 | An epic | ref | state |\n"
              "| SCMS-001 | A thing | E1 | Done | records/evidence.jsonl · scms-evidence-001 |\n")
    got = check(orphan, {"scms-evidence-001", "scms-evidence-001a"})
    assert any("scms-evidence-001a" in p and "no graph row cites it" in p for p in got), got

    print("self-test ok (dangling epics, duplicate ids, dangling evidence, "
          "missing predicates and unreachable records all detected)")
    return 0


def main() -> int:
    if "--self-test" in sys.argv:
        return self_test()
    problems = check(GRAPH.read_text(encoding="utf-8"), evidence_ids()) + unreachable_records()
    if problems:
        for p in problems:
            print(f"WORK GRAPH: {p}")
        return 1
    items = len(ITEM.findall(GRAPH.read_text(encoding="utf-8")))
    print(f"work graph ok ({items} items, {len(set(EPIC.findall(GRAPH.read_text(encoding='utf-8'))))} epics)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
