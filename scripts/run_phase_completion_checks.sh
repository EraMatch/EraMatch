#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON_BIN="$ROOT_DIR/backend/.venv/bin/python"

if [[ ! -x "$PYTHON_BIN" ]]; then
  echo "Missing backend virtualenv python at $PYTHON_BIN"
  exit 1
fi

echo "[1/4] Backend pytest collection check"
cd "$ROOT_DIR"
"$PYTHON_BIN" -m pytest --collect-only -q

echo "[2/4] Backend no-DB route smoke check"
"$PYTHON_BIN" scripts/smoke_routes_no_db.py

echo "[3/4] Candidate portal production build"
cd "$ROOT_DIR/Frontend/candidate-portal"
npm run build

echo "[4/4] Recruiter portal production build"
cd "$ROOT_DIR/Frontend/recruiter-portal"
npm run build

echo "All phase completion checks passed."
