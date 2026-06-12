#!/usr/bin/env bash
# EraMatch Master Portal — Unix startup script
# Usage: chmod +x run.sh && ./run.sh
# Starts backend (port 8002) and frontend (port 5175) in background

set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"

echo -e "\033[36mStarting EraMatch Master Portal...\033[0m"

# ── Backend ──────────────────────────────────────────────────────────────────
if [ ! -d "$BACKEND/.venv" ]; then
    echo -e "\033[33m[Backend] Creating virtual environment...\033[0m"
    cd "$BACKEND"
    python3 -m venv .venv
    .venv/bin/pip install -r requirements.txt
fi

echo -e "\033[32m[Backend] Starting FastAPI on http://localhost:8002 ...\033[0m"
cd "$BACKEND"
.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8002 --reload &
BACKEND_PID=$!

# ── Frontend ──────────────────────────────────────────────────────────────────
if [ ! -d "$FRONTEND/node_modules" ]; then
    echo -e "\033[33m[Frontend] Installing npm packages...\033[0m"
    cd "$FRONTEND"
    npm install
fi

echo -e "\033[32m[Frontend] Starting Vite on http://localhost:5175 ...\033[0m"
cd "$FRONTEND"
npm run dev &
FRONTEND_PID=$!

echo ""
echo -e "\033[36mMaster Portal is starting up:\033[0m"
echo "  Frontend : http://localhost:5175"
echo "  Backend  : http://localhost:8002"
echo "  API Docs : http://localhost:8002/docs"
echo ""
echo -e "\033[33mDefault credentials: admin / 1234\033[0m"
echo ""
echo "Press Ctrl+C to stop both services."

# Wait and handle Ctrl+C
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo 'Stopped.'; exit 0" INT TERM
wait
