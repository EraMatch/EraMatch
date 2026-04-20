#!/usr/bin/env bash
# =============================================================================
#  EraMatch — Full Stack Launcher
#  Usage:  ./start.sh          (start all services)
#          ./start.sh stop      (kill all service processes)
#          ./start.sh logs      (tail all log files)
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
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
        log "${C_YELLOW}⚡" "Cleared port $port (pid: $pids)"
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
    log "${C_RED}🛑" "Stopping all EraMatch services..."
    kill_port 8000
    kill_port 8001
    kill_port 5173
    kill_port 5174
    kill_port 5175
    pkill -f "livekit_worker/agent_server.py" 2>/dev/null || true
    log "${C_GREEN}✅" "All services stopped."
    exit 0
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

log "${C_YELLOW}🔪" "Clearing ports 8000 8001 5173 5174 5175..."
for port in 8000 8001 5173 5174 5175; do kill_port "$port"; done
pkill -f "livekit_worker/agent_server.py" 2>/dev/null || true
sleep 1

# ── LOAD ENV VARS ────────────────────────────────────────────────────────────
# Load both env files so all subprocesses inherit them
load_env "$ROOT/../.env"          # project root .env (if exists)
load_env "$AI_DIR/.env"           # ai-service .env (has LIVEKIT_URL etc.)
load_env "$BACKEND_DIR/.env"      # backend .env (has DATABASE_URL etc.)

# Verify critical env vars
if [ -z "${LIVEKIT_URL:-}" ]; then
    log "${C_RED}❌" "LIVEKIT_URL not set — check $AI_DIR/.env"
    exit 1
fi
if [ -z "${DATABASE_URL:-}" ]; then
    log "${C_RED}❌" "DATABASE_URL not set — check $BACKEND_DIR/.env"
    exit 1
fi

log "${C_GREEN}✅" "Env loaded: LIVEKIT_URL=${LIVEKIT_URL:0:30}..."
log "${C_GREEN}✅" "Env loaded: DATABASE_URL=${DATABASE_URL:0:30}..."
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
log "${C_BLUE}🚀" "Starting Backend API on :8000..."
(
    cd "$BACKEND_DIR"
    source .venv/bin/activate
    exec uvicorn app.main:app --reload --port 8000 --log-level info
) > "$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
stream_log "backend  " "$C_BLUE" "$LOG_DIR/backend.log"
echo "   PID: $BACKEND_PID → $LOG_DIR/backend.log"

# ── 2. AI SERVICE (port 8001) ─────────────────────────────────────────────────
log "${C_CYAN}🚀" "Starting AI Service on :8001..."
(
    cd "$AI_DIR"
    source .venv/bin/activate
    exec uvicorn main:app --reload --port 8001 --log-level info
) > "$LOG_DIR/ai-service.log" 2>&1 &
AI_PID=$!
stream_log "ai-svc   " "$C_CYAN" "$LOG_DIR/ai-service.log"
echo "   PID: $AI_PID → $LOG_DIR/ai-service.log"

# ── 3. LIVEKIT WORKER ─────────────────────────────────────────────────────────
log "${C_MAGENTA}🤖" "Starting LiveKit Agent Worker..."
(
    cd "$AI_DIR"
    source .venv/bin/activate
    # Explicitly pass env vars so the forked subprocess inherits them
    export LIVEKIT_URL LIVEKIT_API_KEY LIVEKIT_API_SECRET
    export GOOGLE_APPLICATION_CREDENTIALS
    export INTERVIEWER_PRIMARY_MODEL COVERAGE_CHECK_MODEL
    exec python livekit_worker/agent_server.py dev
) > "$LOG_DIR/livekit-worker.log" 2>&1 &
WORKER_PID=$!
stream_log "lk-worker" "$C_MAGENTA" "$LOG_DIR/livekit-worker.log"
echo "   PID: $WORKER_PID → $LOG_DIR/livekit-worker.log"

# ── 4. RECRUITER PORTAL (port 5173) ───────────────────────────────────────────
log "${C_GREEN}🌐" "Starting Recruiter Portal on :5173..."
(
    cd "$RECRUITER_DIR"
    exec npm run dev -- --port 5173
) > "$LOG_DIR/recruiter.log" 2>&1 &
RECRUITER_PID=$!
stream_log "recruiter" "$C_GREEN" "$LOG_DIR/recruiter.log"
echo "   PID: $RECRUITER_PID → $LOG_DIR/recruiter.log"

# ── 5. CANDIDATE PORTAL (port 5174) ───────────────────────────────────────────
log "${C_YELLOW}🌐" "Starting Candidate Portal on :5174..."
(
    cd "$CANDIDATE_DIR"
    exec npm run dev -- --port 5174
) > "$LOG_DIR/candidate.log" 2>&1 &
CANDIDATE_PID=$!
stream_log "candidate" "$C_YELLOW" "$LOG_DIR/candidate.log"
echo "   PID: $CANDIDATE_PID → $LOG_DIR/candidate.log"

# ── SUMMARY ──────────────────────────────────────────────────────────────────
echo ""
log "${C_BOLD}${C_GREEN}" "═══════════════════════════════════════"
log "${C_BOLD}${C_GREEN}" "  All services started!"
log "${C_BOLD}${C_GREEN}" "═══════════════════════════════════════"
echo ""
echo -e "  ${C_BLUE}Backend API    ${C_RESET}→  http://localhost:8000"
echo -e "  ${C_CYAN}AI Service     ${C_RESET}→  http://localhost:8001"
echo -e "  ${C_MAGENTA}LiveKit Worker ${C_RESET}→  (waiting for room dispatch)"
echo -e "  ${C_GREEN}Recruiter      ${C_RESET}→  http://localhost:5173"
echo -e "  ${C_YELLOW}Candidate      ${C_RESET}→  http://localhost:5174"
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
