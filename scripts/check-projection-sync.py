#!/usr/bin/env python3
"""Gate: published-artifact projections must match their canonical sources.

Checks, per projections/manifest.json entry:
  1. The projection file exists.
  2. sha256(source) equals the manifest's recorded sourceSha256 (a source edit
     without a manifest update — i.e. without a republish — fails loudly).
  3. For the design spec: the envelope `source_hash` embedded in the HTML equals
     sha256(DESIGN.md) (the strictest rule: the published page may not claim a
     hash its source no longer has).

Exit 0 = in sync. Exit 1 = drift (the finding names the file and the fix).
--self-test proves the gate can fail (a gate that cannot fail is a finding).
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "projections" / "manifest.json"
ENVELOPE_RE = re.compile(r"sha256:([0-9a-f]{64})")


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def check() -> list[str]:
    findings: list[str] = []
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    for entry in manifest["projections"]:
        proj = ROOT / entry["file"]
        source = ROOT / entry["source"]
        if not proj.exists():
            findings.append(f"{entry['file']}: projection file missing")
            continue
        if not source.exists():
            findings.append(f"{entry['source']}: canonical source missing")
            continue
        actual = sha256_file(source)
        if actual != entry["sourceSha256"]:
            findings.append(
                f"{entry['source']}: sha256 {actual[:12]}… != manifest {entry['sourceSha256'][:12]}… "
                f"— source changed without republish; re-render {entry['file']}, republish to "
                f"{entry['artifactUrl']}, update manifest"
            )
        if entry["source"] == "DESIGN.md":
            m = ENVELOPE_RE.search(proj.read_text(encoding="utf-8"))
            if not m:
                findings.append(f"{entry['file']}: no envelope source_hash found in HTML")
            elif m.group(1) != actual:
                findings.append(
                    f"{entry['file']}: embedded envelope hash {m.group(1)[:12]}… != sha256(DESIGN.md) "
                    f"{actual[:12]}… — republish required"
                )
    return findings


def self_test() -> int:
    # The gate must fail on a fabricated mismatch: run check() against a manifest
    # whose first sourceSha256 is corrupted, via monkeypatched read.
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    manifest["projections"][0]["sourceSha256"] = "0" * 64
    tampered = json.dumps(manifest)
    original = MANIFEST.read_text(encoding="utf-8")
    try:
        MANIFEST.write_text(tampered, encoding="utf-8")
        findings = check()
    finally:
        MANIFEST.write_text(original, encoding="utf-8")
    if not findings:
        print("SELF-TEST FAILED: gate did not fail on a corrupted manifest", file=sys.stderr)
        return 1
    print(f"self-test ok: gate produced {len(findings)} finding(s) on corrupted input")
    return 0


def main() -> int:
    if "--self-test" in sys.argv:
        return self_test()
    findings = check()
    for f in findings:
        print(f"DRIFT: {f}", file=sys.stderr)
    if findings:
        return 1
    print(f"projection sync ok ({len(json.loads(MANIFEST.read_text())['projections'])} projections)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
