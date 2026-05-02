"""Shared fixtures for AI service tests."""
import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# Force mock mode for AI service.
os.environ.setdefault("USE_MOCK", "true")

AI_SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(AI_SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(AI_SERVICE_ROOT))

from main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    """TestClient for the AI service app."""
    with TestClient(app) as test_client:
        yield test_client
