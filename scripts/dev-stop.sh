#!/usr/bin/env bash
set -euo pipefail

# Stop the X121 development environment.
# Usage: ./scripts/dev-stop.sh [--keep-db] [--keep-comfyui]

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PID_DIR="$ROOT_DIR/.dev-pids"
LOG_DIR="$ROOT_DIR/.dev-logs"

# --- Parse flags ---------------------------------------------------------------

STOP_DB=true
STOP_COMFYUI=true

for arg in "$@"; do
  case "$arg" in
    --keep-db)      STOP_DB=false ;;
    --keep-comfyui) STOP_COMFYUI=false ;;
    -h|--help)
      echo "Usage: $0 [--keep-db] [--keep-comfyui]"
      exit 0
      ;;
    *) echo "Unknown flag: $arg"; exit 1 ;;
  esac
done

# --- Helpers -------------------------------------------------------------------

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

status()  { echo -e "${CYAN}[*]${NC} $1"; }
success() { echo -e "${GREEN}[+]${NC} $1"; }
warn()    { echo -e "${YELLOW}[!]${NC} $1"; }

stop_process() {
  local name=$1
  local pidfile="$PID_DIR/$name.pid"

  if [[ ! -f "$pidfile" ]]; then
    warn "$name: no pid file found (not running?)"
    return 0
  fi

  local pid
  pid=$(<"$pidfile")

  if kill -0 "$pid" 2>/dev/null; then
    status "Stopping $name (pid $pid)..."
    kill "$pid" 2>/dev/null || true

    # Wait up to 5s for graceful shutdown
    local elapsed=0
    while kill -0 "$pid" 2>/dev/null; do
      sleep 1
      elapsed=$((elapsed + 1))
      if [[ $elapsed -ge 5 ]]; then
        warn "$name did not stop gracefully, sending SIGKILL..."
        kill -9 "$pid" 2>/dev/null || true
        break
      fi
    done

    success "$name stopped"
  else
    warn "$name: process $pid not found (already stopped)"
  fi

  rm -f "$pidfile"
}

# --- Banner --------------------------------------------------------------------

echo ""
echo -e "${BOLD}  Stopping X121 Dev Environment${NC}"
echo -e "  ===================================="
echo ""

# --- Stop in reverse order (frontend -> backend -> comfyui -> db) --------------

stop_process "frontend"
stop_process "backend"

if [[ "$STOP_COMFYUI" == true ]]; then
  stop_process "comfyui"
else
  warn "Keeping ComfyUI running (--keep-comfyui)"
fi

if [[ "$STOP_DB" == true ]]; then
  status "Stopping Postgres container..."
  docker compose -f "$ROOT_DIR/docker/docker-compose.yml" stop postgres 2>/dev/null && \
    success "Postgres stopped (data preserved in Docker volume)" || \
    warn "Postgres container not found"
  rm -f "$PID_DIR/postgres.pid"
else
  warn "Keeping Postgres running (--keep-db)"
fi

# --- Cleanup -------------------------------------------------------------------

# Remove pid dir if empty
rmdir "$PID_DIR" 2>/dev/null || true

echo ""
echo -e "  ${GREEN}All services stopped.${NC}"
echo -e "  Logs preserved in: ${CYAN}$LOG_DIR/${NC}"
echo ""
