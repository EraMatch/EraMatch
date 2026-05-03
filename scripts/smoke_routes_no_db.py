"""No-DB route smoke checker.

Validates key FastAPI routes are registered without requiring a real DB connection.
"""

# pyright: reportMissingImports=false

from __future__ import annotations

import os
import sys


ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
BACKEND_DIR = os.path.join(ROOT_DIR, "backend")
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)


# Ensure SQLAlchemy can parse URL at import time without requiring a live DB.
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://eramatch:eramatch@localhost:5432/eramatch",
)


def main() -> int:
    try:
        from app.main import app
    except Exception as exc:  # pragma: no cover - smoke script guard
        print(f"SMOKE_IMPORT_FAILED: {exc}")
        return 2

    route_paths = {route.path for route in app.routes}
    required = {
        "/health",
        "/metrics",
        "/api/v1/recruiter/groups/{group_id}/integrity/metrics",
        "/api/v1/recruiter/groups/{group_id}/alerts/poll",
        "/api/v1/recruiter/groups/{group_id}/alerts/stream",
        "/api/v1/interview/integrity-event",
        "/api/v1/assessment/integrity-event",
    }

    missing = sorted(required - route_paths)
    if missing:
        print("SMOKE_ROUTE_MISSING")
        for path in missing:
            print(path)
        return 1

    print("SMOKE_ROUTE_OK")
    for path in sorted(required):
        print(path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
