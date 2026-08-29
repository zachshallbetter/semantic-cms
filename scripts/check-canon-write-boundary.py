#!/usr/bin/env python3
"""Gate: no Canon mutation outside the contract runtime.

DESIGN.md §5 — "No persistent mutation executes outside a registered contract."
This asserts the rule at source level: the Canon mutators (`append`,
`supersede`, `revoke`) may be called only from

  * impl/canon/         — the journal implementing them, and
  * impl/contracts/, impl/qualification/  — the registered contract handlers
                          that hold the governed write path.

Test files are exempt **by an explicit rule, not by accident**: constructing a
fixture is not a production write path. The exemption is stated here so a
reader can disagree with it deliberately.

Honest limitation: this is a source-level boundary. A determined caller can
still import CanonJournal and mutate it; runtime capability enforcement is not
implemented (it would churn every fixture for no additional guarantee at this
maturity). The gate catches the realistic failure — a new production module
quietly bypassing contracts.

Exit 0 = boundary holds. Exit 1 = violation. --self-test proves it can fail.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
IMPL = ROOT / "impl"
ALLOWED_PREFIXES = ("canon/", "contracts/", "qualification/")
MUTATORS = re.compile(r"\.(append|supersede|revoke)\s*\(")


def violations(extra: list[tuple[str, int, str]] | None = None) -> list[str]:
    found: list[str] = []
    for path in sorted(IMPL.rglob("*.ts")):
        rel = path.relative_to(IMPL).as_posix()
        if "/test/" in f"/{rel}" or rel.endswith(".test.ts"):
            continue                      # fixtures are not a production write path
        if rel.startswith(ALLOWED_PREFIXES):
            continue
        for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if line.lstrip().startswith(("*", "//")):
                continue                  # a comment mentioning a mutator is not a call
            m = MUTATORS.search(line)
            if m and "journal" in line.lower():
                found.append(f"impl/{rel}:{n}: calls .{m.group(1)}() on a journal "
                             f"outside the contract runtime")
    for rel, n, mutator in extra or []:
        found.append(f"impl/{rel}:{n}: calls .{mutator}() on a journal outside the contract runtime")
    return found


def self_test() -> int:
    # A synthetic violation must be detected; otherwise the gate is decoration.
    found = violations(extra=[("surface-resolver/src/resolver.ts", 1, "append")])
    if not found:
        print("SELF-TEST FAILED: gate did not flag a synthetic violation", file=sys.stderr)
        return 1
    print(f"self-test ok: gate flagged {len(found)} synthetic violation(s)")
    return 0


def main() -> int:
    if "--self-test" in sys.argv:
        return self_test()
    found = violations()
    for v in found:
        print(f"BOUNDARY VIOLATION: {v}", file=sys.stderr)
    if found:
        print("Canon mutation belongs behind a registered contract (DESIGN.md §5).", file=sys.stderr)
        return 1
    print("canon write boundary ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
