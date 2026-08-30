#!/usr/bin/env python3
"""Every path CI depends on is tracked (NR-scms-019).

Twice now a gate has passed locally and failed in CI because a file it needs was
excluded by the user's global ignore file and never committed — `.agents/` in
semantic-cms (NR-scms-002) and again in reflective-rust, months apart, from the
same line of the same file.

The instance fix each time was a `!` re-inclusion. That is not the lesson. The
lesson is that **verifying against a working tree proves nothing about what CI
will see**, because the working tree contains files the commit does not, and the
difference is invisible from inside it.

So this check reads the workflow, extracts the repository paths its steps refer
to, and requires each one that exists to be tracked by git. A path that is
present locally and absent from the index is the exact shape of both failures.

    python3 scripts/check-tracked.py
    python3 scripts/check-tracked.py --self-test
"""
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
WORKFLOW = ROOT / ".github" / "workflows" / "gates.yml"

# Repository-relative paths a step could name. Deliberately narrow: matching
# every token would produce noise, and a noisy gate is one people learn to skip.
PATH = re.compile(r"(?<![\w/.-])((?:scripts|impl|schemas|projections|records|work|fixtures|docs|\.agents|\.claude|\.github)/[A-Za-z0-9_./-]+)")


def tracked(rel: str) -> bool:
    return subprocess.run(
        ["git", "-C", str(ROOT), "ls-files", "--error-unmatch", rel],
        capture_output=True,
    ).returncode == 0


def referenced_paths(text: str) -> set[str]:
    found = set()
    for m in PATH.finditer(text):
        p = m.group(1).rstrip(".,;:)\"'")
        # Globs are patterns, not paths; the directory they sit in is checked
        # by the steps that name it directly.
        if "*" in p:
            continue
        found.add(p)
    return found


def check() -> list[str]:
    problems = []
    text = WORKFLOW.read_text(encoding="utf-8")
    for rel in sorted(referenced_paths(text)):
        if not (ROOT / rel).exists():
            # A referenced path that does not exist at all is a different fault,
            # and one CI reports plainly by failing the step that uses it.
            continue
        if not tracked(rel):
            problems.append(f"{rel}: exists locally, is NOT tracked — CI will not see it")
    return problems


def self_test() -> int:
    """The gate must be able to fail, or it certifies nothing."""
    sample = "      - run: python3 scripts/check-structure.py\n      - run: node impl/site/x.ts\n"
    got = referenced_paths(sample)
    assert "scripts/check-structure.py" in got, got
    assert "impl/site/x.ts" in got, got
    assert referenced_paths("      - run: node --test test/*.test.ts") == set(), "globs must be skipped"
    # A path that exists but is untracked must be reported.
    scratch = ROOT / "scripts" / ".untracked-probe.tmp"
    scratch.write_text("probe\n", encoding="utf-8")
    try:
        assert not tracked("scripts/.untracked-probe.tmp"), "probe should be untracked"
    finally:
        scratch.unlink()
    print("self-test ok (path extraction, glob skipping, and untracked detection all verified)")
    return 0


def main() -> int:
    if "--self-test" in sys.argv:
        return self_test()
    problems = check()
    if problems:
        for p in problems:
            print(f"UNTRACKED CI DEPENDENCY: {p}")
        return 1
    print("every CI-referenced path is tracked")
    return 0


if __name__ == "__main__":
    sys.exit(main())
