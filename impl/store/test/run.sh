#!/usr/bin/env bash
# SCMS-057 conformance: apply the schema to a scratch database and prove the
# grants refuse. Every guarantee in 001-canon.sql is a grant or a constraint,
# so the only honest test is to attempt the forbidden thing and require failure.
set -euo pipefail
DB="${SCMS_TEST_DB:-scms_store_conformance}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

dropdb --if-exists "$DB" >/dev/null 2>&1 || true
createdb "$DB"
trap 'dropdb --if-exists "$DB" >/dev/null 2>&1 || true' EXIT

for f in "$HERE"/../sql/*.sql; do psql -q -d "$DB" -f "$f" >/dev/null; done
out="$(psql -q -d "$DB" -f "$HERE/grants.sql" 2>&1 | grep -E 'PASS|FAIL' || true)"
echo "$out"

if echo "$out" | grep -q FAIL; then
  echo "store conformance FAILED"
  exit 1
fi
count="$(echo "$out" | grep -c PASS)"
echo "store conformance ok ($count checks)"
