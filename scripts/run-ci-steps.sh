#!/usr/bin/env bash
# Run the gates CI actually runs — derived from the workflow, not guessed.
#
# NR-scms-026: a session verified with `for s in scripts/check-*.py`, reported
# "all 7 gates pass", and CI failed on `gen-context.py --check` — a step the
# glob never matched. The lesson of NR-scms-024 (a sweep keyed on the shape it
# expects cannot see an unexpected shape) applied to the verification of the
# fix for NR-scms-024. So this reads the step list from .github/workflows/,
# and gains a step the moment CI does.
#
# This is a convenience for local iteration, NOT a gate: it cannot reproduce a
# clean checkout, and `gh run list` remains the only thing that settles whether
# gates pass. See trap 2 in the handoff.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# No mapfile: macOS ships bash 3.2, and this must run where the agent runs.
STEPS=()
while IFS= read -r line; do STEPS+=("$line"); done < <(python3 - <<'PY'
import re, pathlib, glob
for wf in sorted(glob.glob(".github/workflows/*.yml")):
    blocks = re.split(r"\n(?=      - name: )", pathlib.Path(wf).read_text())
    for b in blocks:
        if "run:" not in b:
            continue
        wd = re.search(r"working-directory:\s*(\S+)", b)
        m = re.search(r"run: \|\n((?:\s+.*\n)+?)(?=\s+(?:working-directory|- name)|\Z)", b)
        cmd = (" && ".join(l.strip() for l in m.group(1).strip().split("\n") if l.strip())
               if m else (re.search(r"run: (.+)", b).group(1).strip()))
        print(f"{wd.group(1) if wd else '.'}\t{cmd}")
PY
)

(( ${#STEPS[@]} )) || { echo "no steps parsed — the workflow shape changed; fix this script"; exit 2; }

# NR-scms-027, and trap 1 in the handoff. CI checks out committed state, and
# gen-context.py digests `git ls-files` — so a new file that is not yet staged
# is invisible here and present there. This runner reads the working tree; say
# so out loud rather than letting a green line imply more than it checked.
dirty="$(git status --porcelain)"
if [ -n "$dirty" ]; then
  echo "WARNING: working tree differs from the index/HEAD. CI sees committed state only,"
  echo "         and gen-context.py digests \`git ls-files\` — an unstaged new file will pass"
  echo "         here and fail there. Stage, then re-run, before believing this result:"
  echo "$dirty" | sed 's/^/           /'
  echo
fi

fail=0 skipped=0
for step in "${STEPS[@]}"; do
  wd="${step%%$'\t'*}"; cmd="${step#*$'\t'}"
  # Steps carrying GitHub expressions cannot run outside Actions. Name them —
  # a silently skipped step is how "everything passed" stops being true.
  if [[ "$cmd" == *'${{'* ]]; then
    echo "SKIP (github expression): ${cmd:0:70}..."; skipped=$((skipped+1)); continue
  fi
  if ! out=$( (cd "$ROOT/$wd" && eval "$cmd") 2>&1 ); then
    echo "FAIL [$wd] $cmd"; echo "$out" | tail -5; fail=$((fail+1))
  fi
done

echo "=== ${#STEPS[@]} steps: $((${#STEPS[@]} - fail - skipped)) passed, $fail failed, $skipped skipped ==="
(( skipped )) && echo "NOTE: skipped steps are unverified locally — CI is the arbiter."
exit $(( fail > 0 ))
