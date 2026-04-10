#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOGS_SCRIPT="$ROOT_DIR/start-dev.sh"
TERMINALS_SCRIPT="$ROOT_DIR/start-dev-terminals.sh"

if [[ ! -x "$LOGS_SCRIPT" ]]; then
  echo "Missing or not executable: $LOGS_SCRIPT"
  echo "Run: chmod +x start-dev.sh"
  exit 1
fi

if [[ ! -x "$TERMINALS_SCRIPT" ]]; then
  echo "Missing or not executable: $TERMINALS_SCRIPT"
  echo "Run: chmod +x start-dev-terminals.sh"
  exit 1
fi

echo "Choose startup mode:"
echo "1) logs mode (start-dev.sh)"
echo "2) multi-terminal mode (start-dev-terminals.sh)"
read -r -p "Enter choice [1/2]: " choice

case "$choice" in
  1)
    exec "$LOGS_SCRIPT"
    ;;
  2)
    exec "$TERMINALS_SCRIPT"
    ;;
  *)
    echo "Invalid choice: $choice"
    echo "Please run again and choose 1 or 2."
    exit 1
    ;;
esac