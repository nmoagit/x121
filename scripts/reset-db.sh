#!/usr/bin/env bash
set -euo pipefail

# Reset development and test databases.
# Usage: ./scripts/reset-db.sh [dev|test|all]

TARGET="${1:-all}"

DEV_URL="postgres://x121:x121@localhost:5434/x121"
TEST_URL="postgres://x121:x121@localhost:5433/x121_test"

reset_db() {
  local url="$1"
  local label="$2"
  echo "Resetting $label database..."
  sqlx database drop -y --database-url "$url" 2>/dev/null || true
  sqlx database create --database-url "$url"
  sqlx migrate run --database-url "$url" --source apps/db/migrations/
  echo "$label database ready."
}

case "$TARGET" in
  dev)  reset_db "$DEV_URL" "dev" ;;
  test) reset_db "$TEST_URL" "test" ;;
  all)
    reset_db "$DEV_URL" "dev"
    reset_db "$TEST_URL" "test"
    ;;
  *)
    echo "Usage: $0 [dev|test|all]"
    exit 1
    ;;
esac
