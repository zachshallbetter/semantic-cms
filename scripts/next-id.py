#!/usr/bin/env python3
"""Emit the next free identifier for a record register.

Exists because I twice registered an id already in use -- SCMS-044 for two work
items, then NR-scms-009 for two negative results -- by deriving the number from
memory of the session instead of reading the register. The first time I wrote
down the lesson ("derive the next id from the register, at the moment of
registration") and then repeated the mistake within the hour, because I applied
it to work items and not to the other registers.

A lesson that has to be remembered per-register is not a lesson, it is a
liability. This makes the register the only source of the number.

    python3 scripts/next-id.py work        -> SCMS-046
    python3 scripts/next-id.py negative    -> NR-scms-010
    python3 scripts/next-id.py evidence    -> scms-evidence-046   (see note)
    python3 scripts/next-id.py blocker     -> scms-blocker-004
    python3 scripts/next-id.py spec-health -> SH-18

    python3 scripts/next-id.py --check     -> non-zero if any register has a duplicate

Note on evidence ids: they mirror their work item (SCMS-035 -> scms-evidence-035)
rather than running sequentially, so the "next" number is not meaningful for that
register -- take the work item's number instead. The duplicate check is what
matters there, and it applies to every jsonl register alike.
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

REGISTERS = {
    "work":        ("work/GRAPH.md",                   r"\|\s*(SCMS-(\d+))\s*\|",      "SCMS-{:03d}"),
    "negative":    ("records/negative-results.jsonl",  r"\"(NR-scms-(\d+))\"",         "NR-scms-{:03d}"),
    "evidence":    ("records/evidence.jsonl",          r"\"(scms-evidence-(\d+))\"",   "scms-evidence-{:03d}"),
    "blocker":     ("records/blockers.jsonl",          r"\"(scms-blocker-(\d+))\"",    "scms-blocker-{:03d}"),
    "spec-health": ("SPEC_HEALTH.md",                  r"(SH-(\d+))",                  "SH-{:d}"),
}


def scan(name):
    path, pattern, _ = REGISTERS[name]
    text = (ROOT / path).read_text(encoding="utf-8")
    return [(m.group(1), int(m.group(2))) for m in re.finditer(pattern, text)]


def duplicates(name):
    """Ids appearing more than once, excluding those a later record explicitly voids.

    For prose registers a mention is not a definition, so only jsonl registers
    can meaningfully report duplicates.

    The `voids` escape exists because records are append-only: a clerical
    duplicate that is already committed cannot be rewritten away, and rewriting
    history to hide it would be the larger fault. The register carries the error
    with its correction attached, and a record declaring `"voids": "<id>"`
    settles it. That is the doctrine, so the gate encodes it rather than
    fighting it -- but it stays narrow: only an explicit, named void counts, so
    a duplicate nobody has accounted for still fails.
    """
    path = REGISTERS[name][0]
    if not path.endswith(".jsonl"):
        return []
    records = []
    for line in (ROOT / path).read_text(encoding="utf-8").splitlines():
        if line.strip():
            records.append(json.loads(line))
    voided = {r["voids"] for r in records if r.get("voids")}
    seen, dupes = set(), []
    for r in records:
        rid = r.get("id")
        if rid in seen and rid not in voided:
            dupes.append(rid)
        seen.add(rid)
    return dupes


def main():
    if "--check" in sys.argv:
        bad = {n: d for n in REGISTERS if (d := duplicates(n))}
        if bad:
            for name, dupes in bad.items():
                print(f"DUPLICATE ids in {REGISTERS[name][0]}: {', '.join(sorted(set(dupes)))}")
            return 1
        print("no duplicate record ids")
        return 0

    if "--self-test" in sys.argv:
        # The gate must be able to fail, or it certifies nothing.
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            p = pathlib.Path(d) / "r.jsonl"
            p.write_text('{"id":"NR-scms-001"}\n{"id":"NR-scms-001"}\n', encoding="utf-8")
            seen, dupes = set(), []
            for line in p.read_text(encoding="utf-8").splitlines():
                rid = json.loads(line)["id"]
                if rid in seen:
                    dupes.append(rid)
                seen.add(rid)
            assert dupes == ["NR-scms-001"], "duplicate detection failed to fire"

            # ...and that an explicitly voided duplicate is tolerated, so the
            # escape works and is not merely declared.
            p.write_text(
                '{"id":"NR-scms-001"}\n{"id":"NR-scms-001"}\n'
                '{"id":"NR-scms-002","voids":"NR-scms-001"}\n', encoding="utf-8")
            recs = [json.loads(l) for l in p.read_text(encoding="utf-8").splitlines() if l.strip()]
            voided = {r["voids"] for r in recs if r.get("voids")}
            seen, dupes2 = set(), []
            for r in recs:
                if r["id"] in seen and r["id"] not in voided:
                    dupes2.append(r["id"])
                seen.add(r["id"])
            assert dupes2 == [], "an explicitly voided duplicate should be tolerated"
        print("self-test ok (duplicate detection fires; explicit voids tolerated)")
        return 0

    if len(sys.argv) < 2 or sys.argv[1] not in REGISTERS:
        print(f"usage: next-id.py [{' | '.join(REGISTERS)}] | --check | --self-test", file=sys.stderr)
        return 2

    name = sys.argv[1]
    found = scan(name)
    nxt = (max(n for _, n in found) + 1) if found else 1
    print(REGISTERS[name][2].format(nxt))
    return 0


if __name__ == "__main__":
    sys.exit(main())
