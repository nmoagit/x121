#!/usr/bin/env bash
set -euo pipefail

# Start the full X121 development environment.
# Usage: ./scripts/dev-start.sh [--no-frontend] [--no-backend] [--no-db] [--no-comfyui]

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PID_DIR="$ROOT_DIR/.dev-pids"
LOG_DIR="$ROOT_DIR/.dev-logs"

COMFYUI_DIR="/mnt/d/Projects/x121/ComfyUI"
COMFYUI_PYTHON="$COMFYUI_DIR/venv/Scripts/python.exe"

mkdir -p "$PID_DIR" "$LOG_DIR"

# --- Parse flags ---------------------------------------------------------------

START_DB=true
START_BACKEND=true
START_FRONTEND=true
START_COMFYUI=true

for arg in "$@"; do
  case "$arg" in
    --no-db)       START_DB=false ;;
    --no-backend)  START_BACKEND=false ;;
    --no-frontend) START_FRONTEND=false ;;
    --no-comfyui)  START_COMFYUI=false ;;
    -h|--help)
      echo "Usage: $0 [--no-db] [--no-backend] [--no-frontend] [--no-comfyui]"
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
NC='\033[0m' # No Color

status()  { echo -e "${CYAN}[*]${NC} $1"; }
success() { echo -e "${GREEN}[+]${NC} $1"; }
warn()    { echo -e "${YELLOW}[!]${NC} $1"; }
fail()    { echo -e "${RED}[-]${NC} $1"; }

is_running() {
  local pidfile="$PID_DIR/$1.pid"
  if [[ -f "$pidfile" ]]; then
    local pid
    pid=$(<"$pidfile")
    if kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
    rm -f "$pidfile"
  fi
  return 1
}

wait_for_port() {
  local port=$1 label=$2 timeout=${3:-30}
  local elapsed=0
  while ! ss -tlnp 2>/dev/null | grep -q ":${port} " && \
        ! netstat -tlnp 2>/dev/null | grep -q ":${port} "; do
    sleep 1
    elapsed=$((elapsed + 1))
    if [[ $elapsed -ge $timeout ]]; then
      fail "$label did not start within ${timeout}s"
      return 1
    fi
  done
  return 0
}

# --- Banner --------------------------------------------------------------------

echo ""
echo -e "${BOLD}  X121 Dev Environment${NC}"
echo -e "  ========================="
echo ""

# --- Postgres ------------------------------------------------------------------

if [[ "$START_DB" == true ]]; then
  if is_running "postgres"; then
    warn "Postgres already running (pid $(cat "$PID_DIR/postgres.pid"))"
  else
    status "Starting Postgres (pgvector/pg16) on port 5434..."
    docker compose -f "$ROOT_DIR/docker/docker-compose.yml" up -d postgres 2>"$LOG_DIR/postgres-start.log"

    # Wait for healthcheck
    elapsed=0
    while ! docker exec x121-db pg_isready -U x121 >/dev/null 2>&1; do
      sleep 1
      elapsed=$((elapsed + 1))
      if [[ $elapsed -ge 30 ]]; then
        fail "Postgres did not become ready within 30s"
        cat "$LOG_DIR/postgres-start.log"
        exit 1
      fi
    done

    # Store container ID as "pid" for tracking
    docker inspect -f '{{.State.Pid}}' x121-db > "$PID_DIR/postgres.pid" 2>/dev/null || echo "docker" > "$PID_DIR/postgres.pid"
    success "Postgres ready on localhost:5434"
  fi
fi

# --- ComfyUI (Windows process via WSL interop) ---------------------------------

if [[ "$START_COMFYUI" == true ]]; then
  if is_running "comfyui"; then
    warn "ComfyUI already running (pid $(cat "$PID_DIR/comfyui.pid"))"
  else
    if [[ ! -f "$COMFYUI_PYTHON" ]]; then
      warn "ComfyUI Python not found at $COMFYUI_PYTHON — skipping"
      warn "Set COMFYUI_DIR in this script or use --no-comfyui"
    else
      status "Starting ComfyUI (Windows/CUDA) on port 8188..."

      cd "$COMFYUI_DIR"
      "$COMFYUI_PYTHON" main.py --listen 0.0.0.0 >"$LOG_DIR/comfyui.log" 2>&1 &
      comfyui_pid=$!
      echo "$comfyui_pid" > "$PID_DIR/comfyui.pid"

      status "Waiting for ComfyUI to load models..."
      if wait_for_port 8188 "ComfyUI" 60; then
        success "ComfyUI ready on localhost:8188 (pid $comfyui_pid)"
      else
        fail "ComfyUI did not start within 60s — check $LOG_DIR/comfyui.log"
        warn "Continuing without ComfyUI (other services will still start)"
      fi
      cd "$ROOT_DIR"
    fi
  fi
fi

# --- Backend -------------------------------------------------------------------

if [[ "$START_BACKEND" == true ]]; then
  if is_running "backend"; then
    warn "Backend already running (pid $(cat "$PID_DIR/backend.pid"))"
  else
    status "Building and starting backend (Rust/Axum) on port 3000..."

    cd "$ROOT_DIR/apps/backend"
    cargo build --manifest-path "$ROOT_DIR/apps/backend/Cargo.toml" -p x121-api 2>"$LOG_DIR/backend-build.log"
    success "Backend compiled"

    # Start in background
    cargo run --manifest-path "$ROOT_DIR/apps/backend/Cargo.toml" -p x121-api \
      >"$LOG_DIR/backend.log" 2>&1 &
    backend_pid=$!
    echo "$backend_pid" > "$PID_DIR/backend.pid"

    status "Waiting for backend to accept connections..."
    if wait_for_port 3000 "Backend" 30; then
      success "Backend ready on localhost:3000 (pid $backend_pid)"
      success "Migrations applied automatically on startup"
    else
      fail "Backend failed to start — check $LOG_DIR/backend.log"
      exit 1
    fi
  fi
fi

# --- Frontend ------------------------------------------------------------------

if [[ "$START_FRONTEND" == true ]]; then
  if is_running "frontend"; then
    warn "Frontend already running (pid $(cat "$PID_DIR/frontend.pid"))"
  else
    status "Starting frontend (Vite) on port 5173..."

    cd "$ROOT_DIR/apps/frontend"
    pnpm dev >"$LOG_DIR/frontend.log" 2>&1 &
    frontend_pid=$!
    echo "$frontend_pid" > "$PID_DIR/frontend.pid"

    if wait_for_port 5173 "Frontend" 15; then
      success "Frontend ready on localhost:5173 (pid $frontend_pid)"
    else
      fail "Frontend failed to start — check $LOG_DIR/frontend.log"
      exit 1
    fi
  fi
fi

# --- Summary -------------------------------------------------------------------

echo ""
echo -e "${BOLD}  Services${NC}"
echo -e "  --------"
[[ "$START_DB"       == true ]] && echo -e "  ${GREEN}Postgres${NC}   http://localhost:5434"
[[ "$START_COMFYUI"  == true ]] && echo -e "  ${GREEN}ComfyUI${NC}    http://localhost:8188"
[[ "$START_BACKEND"  == true ]] && echo -e "  ${GREEN}Backend${NC}    http://localhost:3000"
[[ "$START_FRONTEND" == true ]] && echo -e "  ${GREEN}Frontend${NC}   http://localhost:5173"
echo ""
echo -e "  Logs:  ${CYAN}$LOG_DIR/${NC}"
echo -e "  Stop:  ${CYAN}./scripts/dev-stop.sh${NC}"
echo ""
