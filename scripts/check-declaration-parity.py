#!/usr/bin/env python3
"""Declaration-consumer parity (P27, recommended in SCMS-039).

    "A declaration format richer than the checker that consumes it silently
     becomes decoration."

This project has committed that failure four times, and every instance was found
by accident rather than by a gate:

  SCMS-020   `promote` declared a compensation interaction that did not exist
  SCMS-022   a declared content type nothing validated against
  NR-scms-004 an `unlisted` flag documented for lenses that no lens consumed
  SCMS-044   an `editorRequest` built for an editor that never called it

Doctrine is what we had while committing it four times, so this is a gate.

It checks one narrow, checkable thing: **every leaf field declared in a scms
schema is referenced somewhere in non-test source.** A field nobody reads is
either dead or a promise the code does not keep, and either way the author
should have to say so.

Deliberately narrow, because a broad version would be worse than none:

  - Leaf fields only. A container's name is often absent from source while its
    children are read individually, and flagging it would train people to
    ignore this gate.
  - Reference, not correct use. This cannot tell whether a field is consumed
    *properly*; it can only tell whether it is consumed at all. That is a real
    limit, stated rather than implied.
  - Tests do not count as consumers. A field exercised only by its own vectors
    is precisely the SCMS-022 failure.

An intentionally-unconsumed field is declared by adding its dotted path to
`inert` in schemas/declaration-parity.json, with a reason. Recording the
exception is the point: the gap becomes a decision instead of an oversight.

    python3 scripts/check-declaration-parity.py
    python3 scripts/check-declaration-parity.py --self-test
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SCHEMA_DIR = ROOT / "schemas" / "scms"
ALLOWLIST = ROOT / "schemas" / "declaration-parity.json"
SOURCE_GLOBS = ("impl/*/src/*.ts", "impl/*/server/*.ts", "scripts/*.py")


def leaf_fields(node, prefix=""):
    """Dotted paths of leaf properties. A leaf has no `properties` of its own."""
    found = []
    if not isinstance(node, dict):
        return found
    props = node.get("properties") or {}
    for name, sub in props.items():
        path = f"{prefix}{name}"
        child = sub.get("properties") or (sub.get("items") or {}).get("properties")
        if child:
            found += leaf_fields(sub, f"{path}.")
            if "items" in sub:
                found += leaf_fields(sub["items"], f"{path}.")
        else:
            found.append(path)
    for key in ("then", "else"):
        if key in node:
            found += leaf_fields(node[key], prefix)
    for key in ("allOf", "anyOf", "oneOf"):
        for sub in node.get(key, []):
            found += leaf_fields(sub, prefix)
    return found


def source_text():
    chunks = []
    for pattern in SOURCE_GLOBS:
        for path in ROOT.glob(pattern):
            if "/test/" in str(path):
                continue
            chunks.append(path.read_text(encoding="utf-8"))
    return "\n".join(chunks)


def referenced(field, text):
    """The last segment, as a whole word. Deliberately loose: this gate answers
    'is anything reading this' and not 'is it read correctly'."""
    leaf = field.split(".")[-1]
    return re.search(rf"\b{re.escape(leaf)}\b", text) is not None


def check():
    inert = {}
    if ALLOWLIST.exists():
        inert = json.loads(ALLOWLIST.read_text(encoding="utf-8")).get("inert", {})

    text = source_text()
    unconsumed = []
    for schema_path in sorted(SCHEMA_DIR.glob("*.schema.json")):
        schema = json.loads(schema_path.read_text(encoding="utf-8"))
        for field in leaf_fields(schema):
            if field in inert or referenced(field, text):
                continue
            unconsumed.append((schema_path.relative_to(ROOT), field))

    if unconsumed:
        for path, field in unconsumed:
            print(f"UNCONSUMED DECLARATION: {path}: '{field}' is declared and nothing reads it")
        print("Add a consumer, or declare it inert with a reason in "
              "schemas/declaration-parity.json (P27).")
        return 1

    print(f"declaration parity ok ({len(inert)} field(s) declared inert)")
    return 0


def self_test():
    """The gate must be able to fail, or it certifies nothing."""
    schema = {"properties": {"kept": {"type": "string"}, "orphan": {"type": "string"},
                             "nested": {"properties": {"deep": {"type": "string"}}}}}
    fields = leaf_fields(schema)
    assert set(fields) == {"kept", "orphan", "nested.deep"}, fields
    assert "nested" not in fields, "a container with children is not a leaf"

    text = "const kept = 1; const deep = 2;"
    missing = [f for f in fields if not referenced(f, text)]
    assert missing == ["orphan"], missing
    assert referenced("nested.deep", text), "a leaf is matched on its last segment"
    print("self-test ok (unconsumed declarations are detected; containers are not leaves)")
    return 0


if __name__ == "__main__":
    sys.exit(self_test() if "--self-test" in sys.argv else check())
