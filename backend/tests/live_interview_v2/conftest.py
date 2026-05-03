"""
Test configuration for LiV2 integration tests.
Loads backend .env so DATABASE_URL is available for module imports.
"""

import os
from pathlib import Path

# Load backend .env before any app modules are imported
_backend_env = Path(__file__).resolve().parents[2] / ".env"
if _backend_env.exists():
    with open(_backend_env) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                key = key.strip()
                value = value.strip().strip("'").strip('"')
                if key and key not in os.environ:
                    os.environ[key] = value
