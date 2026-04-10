#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_ACTIVATE="$ROOT_DIR/backend/.venv/bin/activate"
LOGS_SCRIPT="$ROOT_DIR/start-dev.sh"

if [[ ! -f "$VENV_ACTIVATE" ]]; then
  echo "Error: Python virtual environment not found at $VENV_ACTIVATE"
  exit 1
fi

SERVICES=(
  "Backend API|source '$VENV_ACTIVATE' && cd '$ROOT_DIR/backend' && uvicorn app.main:app --reload --port 8000"
  "Recruiter Portal|cd '$ROOT_DIR/Frontend/recruiter-portal' && npm run dev"
  "Candidate Portal|cd '$ROOT_DIR/Frontend/candidate-portal' && npm run dev"
  "AI Service|source '$VENV_ACTIVATE' && cd '$ROOT_DIR/ai-service' && uvicorn main:app --reload --port 8001"
  "Celery Worker|source '$VENV_ACTIVATE' && cd '$ROOT_DIR/backend' && celery -A worker.celery_app worker --loglevel=info"
)

run_cmd_in_shell() {
  local name="$1"
  local command="$2"
  echo "$command; code=\$?; echo; echo \"[$name] exited with code \$code. Press Enter to close...\"; read -r"
}

probe_terminal() {
  local cmd="$1"
  case "$cmd" in
    gnome-terminal)
      gnome-terminal --version >/dev/null 2>&1
      ;;
    xfce4-terminal)
      xfce4-terminal --version >/dev/null 2>&1
      ;;
    konsole)
      konsole --version >/dev/null 2>&1
      ;;
    x-terminal-emulator)
      x-terminal-emulator -e bash -lc "exit 0" >/dev/null 2>&1
      ;;
    *)
      return 1
      ;;
  esac
}

if command -v gnome-terminal >/dev/null 2>&1; then
  if probe_terminal gnome-terminal; then
    args=()
    for service in "${SERVICES[@]}"; do
      IFS='|' read -r name cmd <<<"$service"
      args+=(--tab --title="$name" -- bash -lc "$(run_cmd_in_shell "$name" "$cmd")")
    done
    if gnome-terminal "${args[@]}"; then
      exit 0
    fi
    echo "gnome-terminal exists but failed to open tabs. Trying next terminal option..."
  else
    echo "gnome-terminal is installed but not runnable on this system. Trying next terminal option..."
  fi
fi

if command -v xfce4-terminal >/dev/null 2>&1; then
  if probe_terminal xfce4-terminal; then
    args=(--window)
    for service in "${SERVICES[@]}"; do
      IFS='|' read -r name cmd <<<"$service"
      args+=(--tab --title="$name" --command="bash -lc \"$(run_cmd_in_shell "$name" "$cmd")\"")
    done
    if xfce4-terminal "${args[@]}"; then
      exit 0
    fi
    echo "xfce4-terminal exists but failed to open tabs. Trying next terminal option..."
  else
    echo "xfce4-terminal is installed but not runnable. Trying next terminal option..."
  fi
fi

if command -v konsole >/dev/null 2>&1; then
  if probe_terminal konsole; then
    started_any=0
    for service in "${SERVICES[@]}"; do
      IFS='|' read -r name cmd <<<"$service"
      if konsole --new-tab -p tabtitle="$name" -e bash -lc "$(run_cmd_in_shell "$name" "$cmd")" >/dev/null 2>&1; then
        started_any=1
      fi
    done
    if [[ "$started_any" -eq 1 ]]; then
      exit 0
    fi
    echo "konsole exists but failed to open tabs. Trying next terminal option..."
  else
    echo "konsole is installed but not runnable. Trying next terminal option..."
  fi
fi

if command -v x-terminal-emulator >/dev/null 2>&1; then
  if probe_terminal x-terminal-emulator; then
    started_any=0
    for service in "${SERVICES[@]}"; do
      IFS='|' read -r name cmd <<<"$service"
      if x-terminal-emulator -e bash -lc "$(run_cmd_in_shell "$name" "$cmd")" >/dev/null 2>&1; then
        started_any=1
      fi
    done
    if [[ "$started_any" -eq 1 ]]; then
      exit 0
    fi
    echo "x-terminal-emulator exists but failed to launch windows."
  else
    echo "x-terminal-emulator is installed but not runnable."
  fi
fi

echo "No working GUI terminal emulator found."
echo "Tip: if x-terminal-emulator points to a broken terminal, run:"
echo "  sudo update-alternatives --config x-terminal-emulator"

if [[ -x "$LOGS_SCRIPT" ]]; then
  echo "Falling back to logs mode (start-dev.sh)..."
  exec "$LOGS_SCRIPT"
fi

echo "Also make sure start-dev.sh is executable."
exit 1