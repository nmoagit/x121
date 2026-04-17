#!/usr/bin/env bash
#
# Regenerate TypeScript types from annotated Rust wire structs (ADR-003).
#
# Writes to apps/frontend/src/generated/. Commit the generated files
# alongside the Rust annotations. See design/CONVENTIONS.md §5
# "Type generation" for the policy.
#
# Usage:
#   ./scripts/generate-types.sh
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXPORT_DIR="$REPO_ROOT/apps/frontend/src/generated"

mkdir -p "$EXPORT_DIR"

echo "Regenerating TypeScript types into $EXPORT_DIR"
cd "$REPO_ROOT/apps/backend"
TS_RS_EXPORT_DIR="$EXPORT_DIR" cargo test -p x121-db -p x121-api --lib -- export_bindings

echo
echo "Generated files:"
ls -1 "$EXPORT_DIR"
