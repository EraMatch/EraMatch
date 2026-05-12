#!/usr/bin/env bash
# =============================================================================
#  EraMatch — Full Stack Launcher
#  Usage:  ./start.sh          (start all services)
#          ./start.sh stop      (kill all service processes)
#          ./start.sh logs      (tail all log files)
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"

# Add common tool paths for GitHub Runner / non-interactive shells
export PATH="$HOME/.local/bin:$PATH"
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"
LOG_DIR="$ROOT/.logs"
mkdir -p "$LOG_DIR"

BACKEND_DIR="$ROOT/backend"
AI_DIR="$ROOT/ai-service"
RECRUITER_DIR="$ROOT/Frontend/recruiter-portal"
CANDIDATE_DIR="$ROOT/Frontend/candidate-portal"

# ── Colors ──────────────────────────────────────────────────────────────────
C_RESET="\033[0m"
C_BOLD="\033[1m"
C_BLUE="\033[34m"
C_CYAN="\033[36m"
C_GREEN="\033[32m"
C_YELLOW="\033[33m"
C_MAGENTA="\033[35m"
C_RED="\033[31m"

log() { echo -e "${C_BOLD}${1}${C_RESET} ${2}"; }

# ── Helpers ──────────────────────────────────────────────────────────────────
kill_port() {
    local port=$1
    local pids
    pids=$(lsof -ti ":$port" 2>/dev/null || true)
    if [ -n "$pids" ]; then
        echo "$pids" | xargs kill -9 2>/dev/null || true
        log "${C_YELLOW}[PORT]" "Cleared port $port (pid: $pids)"
    fi
}

# Load a .env file into the current shell
load_env() {
    local env_file="$1"
    if [ -f "$env_file" ]; then
        set -a
        # shellcheck disable=SC1090
        source "$env_file"
        set +a
    fi
}

# ── STOP ────────────────────────────────────────────────────────────────────
if [ "${1:-}" = "stop" ]; then
    log "${C_RED}[STOP]" "Stopping all EraMatch services (keeping tunnels alive)..."
    kill_port 8000
    kill_port 8001
    kill_port 5173
    kill_port 5174
    kill_port 5175
    pkill -f "livekit_worker/agent_server.py" 2>/dev/null || true
    pkill -f "celery -A worker.celery_app" 2>/dev/null || true
    log "${C_GREEN}[OK]" "Services stopped. Tunnels are still running."
    exit 0
fi

# Hard stop (kills tunnels too)
if [ "${1:-}" = "kill" ]; then
    log "${C_RED}[KILL]" "Killing everything including tunnels..."
    ./start.sh stop
    pkill -f "cloudflared" 2>/dev/null || true
    rm -f "$ROOT/.tunnels.env"
    log "${C_GREEN}[OK]" "All processes and tunnels cleared."
    exit 0
fi

# ── TUNNEL CONFIG ───────────────────────────────────────────────────────────
USE_TUNNEL=false
if [[ "${1:-}" == "--tunnel" ]] || [[ "${1:-}" == "--local-device" ]]; then
    USE_TUNNEL=true
    shift
fi

# ── LOGS ────────────────────────────────────────────────────────────────────
if [ "${1:-}" = "logs" ]; then
    tail -f \
        "$LOG_DIR/backend.log" \
        "$LOG_DIR/ai-service.log" \
        "$LOG_DIR/livekit-worker.log" \
        "$LOG_DIR/recruiter.log" \
        "$LOG_DIR/candidate.log" 2>/dev/null
    exit 0
fi

# ── PRE-FLIGHT ───────────────────────────────────────────────────────────────
log "${C_BOLD}${C_BLUE}" "═══════════════════════════════════════"
log "${C_BOLD}${C_BLUE}" "  EraMatch — Starting All Services"
log "${C_BOLD}${C_BLUE}" "═══════════════════════════════════════"
echo ""

log "${C_YELLOW}[CLEAN]" "Clearing service ports..."
for port in 8000 8001 5173 5174 5175; do kill_port "$port"; done
pkill -f "livekit_worker/agent_server.py" 2>/dev/null || true
pkill -f "celery -A worker.celery_app" 2>/dev/null || true
sleep 1

# ── LOAD ENV VARS ────────────────────────────────────────────────────────────
# Load tunnel env first if it exists (allows overriding from manually started tunnels)
if [ -f "$ROOT/.tunnels.env" ]; then
    # shellcheck disable=SC1090
    source "$ROOT/.tunnels.env"
fi

# Load both env files so all subprocesses inherit them
load_env "$ROOT/../.env"          # project root .env (if exists)
load_env "$AI_DIR/.env"           # ai-service .env (has LIVEKIT_URL etc.)
load_env "$BACKEND_DIR/.env"      # backend .env (has DATABASE_URL etc.)

# Verify critical env vars
if [ -z "${LIVEKIT_URL:-}" ]; then
    log "${C_RED}[ERROR]" "LIVEKIT_URL not set — check $AI_DIR/.env"
    exit 1
fi
if [ -z "${DATABASE_URL:-}" ]; then
    log "${C_RED}[ERROR]" "DATABASE_URL not set — check $BACKEND_DIR/.env"
    exit 1
fi

log "${C_GREEN}[OK]" "Env loaded: LIVEKIT_URL=${LIVEKIT_URL:0:30}..."
log "${C_GREEN}[OK]" "Env loaded: DATABASE_URL=${DATABASE_URL:0:30}..."

# ── UV SYNC ──────────────────────────────────────────────────────────────────
log "${C_CYAN}[SYNC]" "Synchronizing virtual environments with uv..."
(cd "$BACKEND_DIR" && uv sync)
(cd "$AI_DIR" && uv sync)
log "${C_GREEN}[OK]" "Environments synchronized."

# ── TUNNEL STARTUP ──────────────────────────────────────────────────────────
if [ "$USE_TUNNEL" = true ]; then
    log "${C_MAGENTA}[TUNNEL]" "Managing tunnels (--local-device mode)..."
    
    # Helper to start tunnel and wait for URL
    start_tunnel() {
        local name="${1}"
        local port="${2}"
        local name_upper=$(echo "$name" | tr '[:lower:]' '[:upper:]')
        local env_var_name="${name_upper}_URL"
        
        # Check if a cloudflared process for this port is ALREADY running
        if pgrep -f "cloudflared tunnel --url http://localhost:$port" > /dev/null; then
            if [ -n "${!env_var_name:-}" ]; then
                log "${C_GREEN}[ACTIVE]" "Reusing $name tunnel: ${!env_var_name}"
                return 0
            fi
        fi

        local logfile="$LOG_DIR/tunnel-$name.log"
        rm -f "$logfile"
        
        # Kill any orphaned tunnel on this specific port before starting
        pkill -f "cloudflared tunnel --url http://localhost:$port" 2>/dev/null || true
        
        nohup cloudflared tunnel --url "http://localhost:$port" > "$logfile" 2>&1 &
        
        # Wait for URL to appear in logs
        local url=""
        echo -n "   Waiting for $name tunnel... "
        for i in {1..15}; do
            url=$(grep -o 'https://[-0-9a-z.]*\.trycloudflare\.com' "$logfile" | head -1 || true)
            if [ -n "$url" ]; then break; fi
            sleep 1
        done
        if [ -z "$url" ]; then echo -e "${C_RED}Failed!${C_RESET}"; return 1; fi
        echo -e "${C_CYAN}$url${C_RESET}"
        
        eval "${env_var_name}='$url'"
        # Persist to file for this session
        echo "export ${env_var_name}='$url'" >> "$ROOT/.tunnels.env"
    }

    start_tunnel "backend" 8000
    start_tunnel "recruiter" 5173
    start_tunnel "candidate" 5174

fi
echo ""

# ── INJECT TUNNEL URLS ───────────────────────────────────────────────────────
# Even if we didn't start tunnels just now, if they were loaded from .tunnels.env,
# we must inject them into the environment for the services.
if [ -n "${BACKEND_URL:-}" ]; then
    export VITE_API_URL="${BACKEND_URL}/api/v1"
    log "${C_GREEN}[ENV]" "VITE_API_URL set to $VITE_API_URL"
fi
if [ -n "${RECRUITER_URL:-}" ] && [ -n "${CANDIDATE_URL:-}" ]; then
    # Ensure local dev ports are always allowed as fallback
    export BACKEND_CORS_ORIGINS="[\"$RECRUITER_URL\", \"$CANDIDATE_URL\", \"http://localhost:5173\", \"http://localhost:5174\"]"
    log "${C_GREEN}[ENV]" "BACKEND_CORS_ORIGINS set with tunnel URLs"
fi
echo ""

# ── HELPER: stream logs with colored prefix ──────────────────────────────────
# Usage: stream_log <prefix> <color> <log_file>
stream_log() {
    local prefix="$1" color="$2" logfile="$3"
    tail -f "$logfile" 2>/dev/null | while IFS= read -r line; do
        echo -e "${color}[${prefix}]${C_RESET} ${line}"
    done &
}

# ── 1. BACKEND (port 8000) ────────────────────────────────────────────────────
log "${C_BLUE}[START]" "Starting Backend API on :8000..."
(
    cd "$BACKEND_DIR"
    exec uv run uvicorn app.main:app --reload --port 8000 --log-level info
) > "$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
stream_log "backend  " "$C_BLUE" "$LOG_DIR/backend.log"
echo "   PID: $BACKEND_PID → $LOG_DIR/backend.log"

# ── 2. AI SERVICE (port 8001) ─────────────────────────────────────────────────
log "${C_CYAN}[START]" "Starting AI Service on :8001..."
(
    cd "$AI_DIR"
    exec uv run uvicorn main:app --reload --port 8001 --log-level info
) > "$LOG_DIR/ai-service.log" 2>&1 &
AI_PID=$!
stream_log "ai-svc   " "$C_CYAN" "$LOG_DIR/ai-service.log"
echo "   PID: $AI_PID → $LOG_DIR/ai-service.log"

# ── 3. LIVEKIT WORKER ─────────────────────────────────────────────────────────
log "${C_MAGENTA}[START]" "Starting LiveKit Agent Worker..."
(
    cd "$AI_DIR"
    # Explicitly pass env vars
    export KMP_DUPLICATE_LIB_OK=TRUE
    export LIVEKIT_URL LIVEKIT_API_KEY LIVEKIT_API_SECRET
    export GOOGLE_APPLICATION_CREDENTIALS
    export INTERVIEWER_PRIMARY_MODEL INTERVIEWER_SECONDARY_MODEL COVERAGE_CHECK_MODEL
    export OLLAMA_BASE_URL OLLAMA_API_KEY OLLAMA_HOST
    export DEEPGRAM_INFERENCE_VOICE TTS_PRIMARY_VOICE TTS_PRIMARY_PROVIDER
    export STT_PRIMARY_PROVIDER STT_PRIMARY_MODEL
    export DATABASE_URL BACKEND_URL GOOGLE_API_KEY ELEVEN_API_KEY
    exec uv run python livekit_worker/agent_server.py dev
) > "$LOG_DIR/livekit-worker.log" 2>&1 &
WORKER_PID=$!
stream_log "lk-worker" "$C_MAGENTA" "$LOG_DIR/livekit-worker.log"
echo "   PID: $WORKER_PID → $LOG_DIR/livekit-worker.log"

# ── 4. RECRUITER PORTAL (port 5173) ───────────────────────────────────────────
log "${C_GREEN}[START]" "Starting Recruiter Portal on :5173..."
(
    cd "$RECRUITER_DIR"
    exec npm run dev -- --port 5173
) > "$LOG_DIR/recruiter.log" 2>&1 &
RECRUITER_PID=$!
stream_log "recruiter" "$C_GREEN" "$LOG_DIR/recruiter.log"
echo "   PID: $RECRUITER_PID → $LOG_DIR/recruiter.log"

# ── 5. CANDIDATE PORTAL (port 5174) ───────────────────────────────────────────
log "${C_YELLOW}[START]" "Starting Candidate Portal on :5174..."
(
    cd "$CANDIDATE_DIR"
    exec npm run dev -- --port 5174
) > "$LOG_DIR/candidate.log" 2>&1 &
CANDIDATE_PID=$!
stream_log "candidate" "$C_YELLOW" "$LOG_DIR/candidate.log"
echo "   PID: $CANDIDATE_PID → $LOG_DIR/candidate.log"

# ── 6. CELERY WORKERS ─────────────────────────────────────────────────────────
log "${C_MAGENTA}[START]" "Starting Celery Workers..."

CELERY_WORKER_POOL_ARGS=()
case "$(uname -s 2>/dev/null || echo "")" in
    MINGW*|MSYS*|CYGWIN*|Windows_NT)
        CELERY_WORKER_POOL_ARGS+=(--pool=solo)
        ;;
esac
(
    cd "$BACKEND_DIR"
    CELERY_BROKER_URL="redis://localhost:6379/0" \
    CELERY_RESULT_BACKEND="redis://localhost:6379/0" \
    exec uv run celery -A worker.celery_app worker --loglevel=info "${CELERY_WORKER_POOL_ARGS[@]}"
) > "$LOG_DIR/celery-backend.log" 2>&1 &
CELERY_BACKEND_PID=$!
stream_log "celery-be" "$C_MAGENTA" "$LOG_DIR/celery-backend.log"

(
    cd "$AI_DIR"
    CELERY_BROKER_URL="redis://localhost:6379/1" \
    CELERY_RESULT_BACKEND="redis://localhost:6379/1" \
    exec uv run celery -A worker.celery_app worker --loglevel=info "${CELERY_WORKER_POOL_ARGS[@]}"
) > "$LOG_DIR/celery-ai.log" 2>&1 &
CELERY_AI_PID=$!
stream_log "celery-ai" "$C_CYAN" "$LOG_DIR/celery-ai.log"

# ── SUMMARY ──────────────────────────────────────────────────────────────────
echo ""
log "${C_BOLD}${C_GREEN}" "═══════════════════════════════════════"
log "${C_BOLD}${C_GREEN}" "  All services started!"
log "${C_BOLD}${C_GREEN}" "═══════════════════════════════════════"
echo ""
echo -e "  ${C_BLUE}Backend API    ${C_RESET}→  http://localhost:8000"
echo -e "  ${C_CYAN}AI Service     ${C_RESET}→  http://localhost:8001"
echo -e "  ${C_MAGENTA}LiveKit Worker ${C_RESET}→  (waiting for room dispatch)"
echo -e "  ${C_GREEN}Recruiter      ${C_RESET}→  http://localhost:5173
  ${C_YELLOW}Candidate      ${C_RESET}→  http://localhost:5174
  ${C_MAGENTA}Celery Backend ${C_RESET}→  (running)
  ${C_CYAN}Celery AI      ${C_RESET}→  (running)
"
echo ""
echo -e "  ${C_BOLD}Credentials (all portals):${C_RESET}"
echo -e "  ${C_BLUE}HR:${C_RESET}        hr@eramatch.com       / admin12345"
echo -e "  ${C_YELLOW}Candidates:${C_RESET} sara.alharthi@example.com / admin12345"
echo -e "             omar.khaled@example.com   / admin12345"
echo -e "             lina.farouk@example.com   / admin12345"
echo ""
echo -e "  ${C_BOLD}Commands:${C_RESET}"
echo -e "  ./start.sh stop   → kill all services"
echo -e "  ./start.sh logs   → re-attach to combined log stream"
echo -e "  Ctrl+C            → stop log streaming (services keep running)"
echo ""
echo -e "  ${C_BOLD}Logs are streaming below ↓${C_RESET}"
echo ""

# ── Keep streaming until Ctrl+C ───────────────────────────────────────────────
trap 'echo -e "\n${C_YELLOW}Log streaming stopped. Services still running. Use ./start.sh stop to kill all.${C_RESET}"; exit 0' INT
wait
