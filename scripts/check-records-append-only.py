#!/usr/bin/env python3
"""Gate: records/*.jsonl are append-only.

For every tracked records/*.jsonl, the committed content at the base revision
must be a byte-prefix of the current content. Rewriting, reordering, or
deleting a record fails the gate; only appending new lines passes. New files
pass trivially.

Base revision: --base <rev> (CI passes the pre-push/merge-base SHA); defaults
to HEAD (checks the working tree against the last commit).

Exit 0 = append-only holds. Exit 1 = violation.
--self-test proves the gate can fail.
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RECORDS = ROOT / "records"


def git_show(base: str, relpath: str) -> bytes | None:
    result = subprocess.run(
        ["git", "show", f"{base}:{relpath}"],
        cwd=ROOT, capture_output=True,
    )
    return result.stdout if result.returncode == 0 else None  # None = new at base


def check(base: str) -> list[str]:
    findings: list[str] = []
    for path in sorted(RECORDS.glob("*.jsonl")):
        rel = path.relative_to(ROOT).as_posix()
        old = git_show(base, rel)
        if old is None:
            continue  # file did not exist at base; any content is an append
        new = path.read_bytes()
        if not new.startswith(old):
            findings.append(
                f"{rel}: history at {base} is not a prefix of the current content — "
                "records may only be appended; corrections are new superseding records"
            )
    return findings


def self_test() -> int:
    target = RECORDS / "evidence.jsonl"
    original = target.read_bytes()
    if not original:
        print("SELF-TEST SKIPPED: evidence.jsonl empty", file=sys.stderr)
        return 1
    try:
        target.write_bytes(b"{\"tampered\": true}\n" + original[80:])
        findings = check("HEAD")
    finally:
        target.write_bytes(original)
    if not findings:
        print("SELF-TEST FAILED: gate did not fail on a rewritten record file", file=sys.stderr)
        return 1
    print(f"self-test ok: gate produced {len(findings)} finding(s) on tampered input")
    return 0


def main() -> int:
    args = sys.argv[1:]
    if "--self-test" in args:
        return self_test()
    base = "HEAD"
    if "--base" in args:
        base = args[args.index("--base") + 1]
    findings = check(base)
    for f in findings:
        print(f"VIOLATION: {f}", file=sys.stderr)
    if findings:
        return 1
    print(f"append-only ok against {base}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
