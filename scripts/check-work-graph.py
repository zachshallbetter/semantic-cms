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
            cited = re.findall(r"(scms-evidence-\d+)", evidence_field)
            if not cited:
                # A Done item may legitimately point at a work file instead.
                if "work/" not in evidence_field:
                    problems.append(f"{item_id}: Done, and cites no evidence record")
            for ev in cited:
                if ev not in evidence_ids:
                    problems.append(f"{item_id}: cites {ev}, which is not in records/evidence.jsonl")
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

    print("self-test ok (dangling epics, duplicate ids and dangling evidence all detected)")
    return 0


def main() -> int:
    if "--self-test" in sys.argv:
        return self_test()
    problems = check(GRAPH.read_text(encoding="utf-8"), evidence_ids())
    if problems:
        for p in problems:
            print(f"WORK GRAPH: {p}")
        return 1
    items = len(ITEM.findall(GRAPH.read_text(encoding="utf-8")))
    print(f"work graph ok ({items} items, {len(set(EPIC.findall(GRAPH.read_text(encoding='utf-8'))))} epics)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
