#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# EraMatch dev-server launcher — macOS, Linux, Windows (via WSL/Git Bash)
#
# Usage:
#   bash start-dev.sh          — start all services (clears ports first)
#   bash start-dev.sh stop     — kill all services occupying dev ports
#   bash start-dev.sh status   — print what is running on each port
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$ROOT_DIR/.dev-logs"
VENV_ACTIVATE="$ROOT_DIR/backend/.venv/bin/activate"

# Ports used by every service
SERVICES=("backend-api" "ai-service" "recruiter-portal" "candidate-portal")

get_service_port() {
    case "$1" in
        "backend-api") echo 8000 ;;
        "ai-service") echo 8001 ;;
        "recruiter-portal") echo 5173 ;;
        "candidate-portal") echo 5174 ;;
        *) echo 0 ;;
    esac
}


# ── Helpers ───────────────────────────────────────────────────────────────────

pid_on_port() {
    # Returns the PID using a port, empty string if nothing
    if command -v lsof &>/dev/null; then
        lsof -ti tcp:"$1" 2>/dev/null | head -1 || true
    elif command -v ss &>/dev/null; then
        ss -tlnp "sport = :$1" 2>/dev/null | awk 'NR>1{match($0,/pid=([0-9]+)/,a); if(a[1]) print a[1]}' | head -1 || true
    fi
}

kill_port() {
    local port="$1"
    local pid
    pid=$(pid_on_port "$port")
    if [[ -n "$pid" ]]; then
        echo "  Port $port occupied by PID $pid — killing..."
        kill -TERM "$pid" 2>/dev/null || kill -9 "$pid" 2>/dev/null || true
        sleep 0.5
    fi
}

# ── Stop mode ─────────────────────────────────────────────────────────────────

if [[ "${1:-}" == "stop" ]]; then
    echo "Stopping all EraMatch dev services..."
    for svc in "${SERVICES[@]}"; do
        port=$(get_service_port "$svc")
        pid=$(pid_on_port "$port")
        if [[ -n "$pid" ]]; then
            echo "  Stopping $svc on :$port (PID $pid)"
            kill -TERM "$pid" 2>/dev/null || true
        fi
    done
    # Also kill stale celery workers
    pkill -f "celery.*worker" 2>/dev/null || true
    echo "Done."
    exit 0
fi

# ── Status mode ───────────────────────────────────────────────────────────────

if [[ "${1:-}" == "status" ]]; then
    echo "EraMatch dev service status:"
    for svc in "${SERVICES[@]}"; do
        port=$(get_service_port "$svc")
        pid=$(pid_on_port "$port")
        if [[ -n "$pid" ]]; then
            echo "  ✓ $svc  :$port  (PID $pid)"
        else
            echo "  ✗ $svc  :$port  (not running)"
        fi
    done
    exit 0
fi

# ── Pre-flight: clear occupied ports ─────────────────────────────────────────

echo "Checking ports..."
for svc in "${SERVICES[@]}"; do
    port=$(get_service_port "$svc")
    pid=$(pid_on_port "$port")
    if [[ -n "$pid" ]]; then
        echo "  Port $port ($svc) already in use by PID $pid — clearing..."
        kill -TERM "$pid" 2>/dev/null || kill -9 "$pid" 2>/dev/null || true
        sleep 0.5
        # Verify it's free now
        leftover=$(pid_on_port "$port")
        if [[ -n "$leftover" ]]; then
            echo "  WARNING: port $port still occupied by PID $leftover after kill attempt."
        fi
    fi
done

# Also clear stale Celery workers from previous runs
STALE_CELERY=$(pgrep -f "celery.*worker" 2>/dev/null || true)
if [[ -n "$STALE_CELERY" ]]; then
    echo "  Clearing stale Celery worker(s): PIDs $STALE_CELERY"
    pkill -f "celery.*worker" 2>/dev/null || true
    sleep 0.5
fi

echo "Ports clear. Starting services..."
echo

# ── OS detection ──────────────────────────────────────────────────────────────

OS_TYPE="$(uname -s 2>/dev/null || echo "Unknown")"

if [[ "$OS_TYPE" == "Darwin" ]]; then
    CELERY_POOL="--pool=threads"
    CELERY_PREFIX="OBJC_DISABLE_INITIALIZE_FORK_SAFETY=YES"
else
    CELERY_POOL="--pool=threads"
    CELERY_PREFIX=""
fi

CELERY_CONCURRENCY="--concurrency=6"

mkdir -p "$LOG_DIR"

if [[ ! -f "$VENV_ACTIVATE" ]]; then
    echo "Error: Python virtual environment not found at $VENV_ACTIVATE"
    echo "Create it first:  cd backend && python -m venv .venv && pip install -e ."
    exit 1
fi

PIDS=()
CLEANED_UP=0

start_service() {
    local name="$1"
    local command="$2"
    local log_file="$LOG_DIR/${name}.log"

    echo "Starting $name..."
    bash -lc "$command" >"$log_file" 2>&1 &
    local pid=$!
    PIDS+=("$pid")
    echo "  PID: $pid  |  Log: $log_file"
}

cleanup() {
    if [[ "$CLEANED_UP" -eq 1 ]]; then return; fi
    CLEANED_UP=1
    echo
    echo "Stopping all services..."
    for pid in "${PIDS[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null || true
        fi
    done
    pkill -f "celery.*worker" 2>/dev/null || true
    wait || true
    echo "All services stopped."
}

trap cleanup INT TERM EXIT

# ── Services ─────────────────────────────────────────────────────────────────
start_service "backend-api"      "source '$VENV_ACTIVATE' && cd '$ROOT_DIR/backend' && uvicorn app.main:app --reload --port 8000"
start_service "celery-worker"    "source '$VENV_ACTIVATE' && cd '$ROOT_DIR/backend' && $CELERY_PREFIX celery -A worker.celery_app worker --loglevel=info $CELERY_POOL $CELERY_CONCURRENCY -n backend@%h"
start_service "ai-service"       "cd '$ROOT_DIR/ai-service' && uv run uvicorn main:app --reload --port 8001"
start_service "ai-celery-worker" "cd '$ROOT_DIR/ai-service' && uv run celery -A worker.celery_app worker --loglevel=info --pool=solo -n ai@%h"
start_service "livekit-worker"   "cd '$ROOT_DIR/ai-service' && uv run python livekit_worker/agent_server.py dev"
start_service "recruiter-portal" "cd '$ROOT_DIR/Frontend/recruiter-portal' && npm run dev"
start_service "candidate-portal" "cd '$ROOT_DIR/Frontend/candidate-portal' && npm run dev"

echo
echo "All services started. Press Ctrl+C to stop all.  (or: bash start-dev.sh stop)"
echo "Logs: tail -f '$LOG_DIR/<service>.log'"
echo
echo "  backend-api      → http://localhost:8000"
echo "  recruiter-portal → http://localhost:5173"
echo "  candidate-portal → http://localhost:5174"
echo "  ai-service       → http://localhost:8001"

wait
