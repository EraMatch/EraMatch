#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$ROOT_DIR/.dev-logs"
VENV_ACTIVATE="$ROOT_DIR/backend/.venv/bin/activate"

mkdir -p "$LOG_DIR"

if [[ ! -f "$VENV_ACTIVATE" ]]; then
  echo "Error: Python virtual environment not found at $VENV_ACTIVATE"
  echo "Create it first, then install backend/ai-service dependencies."
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

  echo "  PID: $pid"
  echo "  Log: $log_file"
}

cleanup() {
  if [[ "$CLEANED_UP" -eq 1 ]]; then
    return
  fi
  CLEANED_UP=1

  echo
  echo "Stopping all services..."
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done

  wait || true
  echo "All services stopped."
}

trap cleanup INT TERM EXIT

start_service "backend-api"      "source '$VENV_ACTIVATE' && cd '$ROOT_DIR/backend' && uvicorn app.main:app --reload --port 8000"
start_service "celery-worker"    "source '$VENV_ACTIVATE' && cd '$ROOT_DIR/backend' && celery -A worker.celery_app worker --loglevel=info"
start_service "ai-service"       "cd '$ROOT_DIR/ai-service' && uv run uvicorn main:app --reload --port 8001"
start_service "ai-celery-worker" "cd '$ROOT_DIR/ai-service' && uv run celery -A worker.celery_app worker --loglevel=info"
start_service "livekit-worker"   "cd '$ROOT_DIR/ai-service' && uv run python livekit_worker/agent_server.py dev"
start_service "recruiter-portal" "cd '$ROOT_DIR/Frontend/recruiter-portal' && npm run dev"
start_service "candidate-portal" "cd '$ROOT_DIR/Frontend/candidate-portal' && npm run dev"

echo
echo "All services started. Press Ctrl+C to stop all."
echo "Use: tail -f '$LOG_DIR/<service>.log' to watch logs."

wait