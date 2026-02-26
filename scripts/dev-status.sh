#!/usr/bin/env bash
set -euo pipefail

# Show status of all X121 dev services.
# Usage: ./scripts/dev-status.sh

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PID_DIR="$ROOT_DIR/.dev-pids"
LOG_DIR="$ROOT_DIR/.dev-logs"

# --- Helpers -------------------------------------------------------------------

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

check_port() {
  local port=$1
  ss -tlnp 2>/dev/null | grep -q ":${port} " || \
  netstat -tlnp 2>/dev/null | grep -q ":${port} "
}

check_service() {
  local name=$1
  local port=$2
  local label=$3
  local pidfile="$PID_DIR/$name.pid"
  local svc_status="${RED}stopped${NC}"
  local pid_info="-"
  local port_info="${RED}closed${NC}"

  # Check pid file
  if [[ -f "$pidfile" ]]; then
    local pid
    pid=$(<"$pidfile")
    if kill -0 "$pid" 2>/dev/null; then
      pid_info="$pid"
    else
      pid_info="${DIM}stale ($pid)${NC}"
    fi
  fi

  # Check port
  if check_port "$port"; then
    port_info="${GREEN}:${port}${NC}"
    svc_status="${GREEN}running${NC}"
  fi

  printf "  %-12s %-20b %-14s %-10b\n" "$label" "$svc_status" "$pid_info" "$port_info"
}

check_docker_service() {
  local container=$1
  local port=$2
  local label=$3
  local svc_status="${RED}stopped${NC}"
  local pid_info="-"
  local port_info="${RED}closed${NC}"

  if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${container}$"; then
    pid_info="container"
    svc_status="${GREEN}running${NC}"
    port_info="${GREEN}:${port}${NC}"
  fi

  printf "  %-12s %-20b %-14s %-10b\n" "$label" "$svc_status" "$pid_info" "$port_info"
}

# --- Output --------------------------------------------------------------------

echo ""
echo -e "${BOLD}  X121 Dev Environment Status${NC}"
echo -e "  ================================="
echo ""
printf "  ${DIM}%-12s %-12s %-14s %-10s${NC}\n" "SERVICE" "STATUS" "PID" "PORT"
printf "  ${DIM}%-12s %-12s %-14s %-10s${NC}\n" "-------" "------" "---" "----"

check_docker_service "x121-db" 5434 "Postgres"
check_service "comfyui"  8188 "ComfyUI"
check_service "backend"  3000 "Backend"
check_service "frontend" 5173 "Frontend"

echo ""

# Log file info
if [[ -d "$LOG_DIR" ]]; then
  has_logs=false
  for f in "$LOG_DIR"/*.log; do
    [[ -f "$f" ]] || continue
    if [[ "$has_logs" == false ]]; then
      echo -e "  ${DIM}Logs:${NC}"
      has_logs=true
    fi
    log_size=$(du -h "$f" 2>/dev/null | cut -f1)
    log_name=$(basename "$f")
    echo -e "    $log_name  ${DIM}($log_size)${NC}"
  done
  [[ "$has_logs" == true ]] && echo ""
fi
