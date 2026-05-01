"""
Root conftest.py for EraMatch backend tests.

Provides shared pytest fixtures for authentication and HTTP clients,
used across all test directories (e2e, live_interview_v2, etc.).

These fixtures hit a **live** backend — no database mocking.
Seed data must be present before running integration tests.
"""

import os
from pathlib import Path

import httpx
import pytest

# ---------------------------------------------------------------------------
# Load backend .env so DATABASE_URL and other config are available
# ---------------------------------------------------------------------------
_BACKEND_ENV = Path(__file__).resolve().parent.parent / ".env"
if _BACKEND_ENV.exists():
    with open(_BACKEND_ENV) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                key = key.strip()
                value = value.strip().strip("'").strip('"')
                if key and key not in os.environ:
                    os.environ[key] = value

# ---------------------------------------------------------------------------
# Configuration constants
# ---------------------------------------------------------------------------
BASE_URL = os.getenv("ERAMATCH_API_URL", "http://localhost:8000/api/v1")

# Seed data credentials (match AGENTS.md test credentials)
ADMIN_EMAIL = os.getenv("ERAMATCH_ADMIN_EMAIL", "hr@eramatch.com")
ADMIN_PASSWORD = os.getenv("ERAMATCH_ADMIN_PASSWORD", "admin12345")

CANDIDATE_EMAIL = os.getenv("ERAMATCH_CANDIDATE_EMAIL", "sara.alharthi@example.com")
CANDIDATE_PASSWORD = os.getenv("ERAMATCH_CANDIDATE_PASSWORD", "admin12345")


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="session")
def base_url():
    """Base URL for the running backend API."""
    return BASE_URL


@pytest.fixture(scope="session")
def admin_token():
    """
    Obtain a valid admin/HR JWT token via org-user login endpoint.
    Uses hr@eramatch.com credentials by default.
    """
    with httpx.Client(base_url=BASE_URL, timeout=30.0) as client:
        resp = client.post(
            "/auth/organization-user/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        )
        assert resp.status_code == 200, (
            f"Admin login failed: {resp.status_code} — {resp.text}\n"
            f"Make sure the backend is running and seed data includes '{ADMIN_EMAIL}'."
        )
        data = resp.json()
        token = data.get("access_token") or data.get("token")
        assert token, f"No token in login response: {data}"
        return token


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    """Authorization headers for admin/HR API calls."""
    return {
        "Authorization": f"Bearer {admin_token}",
        "Content-Type": "application/json",
    }


@pytest.fixture(scope="session")
def candidate_token():
    """
    Obtain a valid candidate JWT access token via candidate login endpoint.
    Uses sara.alharthi@example.com credentials by default.
    """
    with httpx.Client(base_url=BASE_URL, timeout=30.0) as client:
        resp = client.post(
            "/candidate/login",
            json={"email": CANDIDATE_EMAIL, "password": CANDIDATE_PASSWORD},
        )
        assert resp.status_code == 200, (
            f"Candidate login failed: {resp.status_code} — {resp.text}\n"
            f"Make sure the backend is running and seed data includes '{CANDIDATE_EMAIL}'."
        )
        data = resp.json()
        token = data.get("access_token") or data.get("token")
        assert token, f"No token in login response: {data}"
        return token


@pytest.fixture(scope="session")
def candidate_headers(candidate_token):
    """Authorization headers for candidate API calls."""
    return {
        "Authorization": f"Bearer {candidate_token}",
        "Content-Type": "application/json",
    }


@pytest.fixture(scope="session")
def http_client(admin_headers):
    """Authenticated httpx.Client (admin/HR auth) with base_url set."""
    with httpx.Client(base_url=BASE_URL, headers=admin_headers, timeout=30.0) as c:
        yield c


@pytest.fixture(scope="session")
def candidate_http_client(candidate_headers):
    """Authenticated httpx.Client (candidate auth) with base_url set."""
    with httpx.Client(base_url=BASE_URL, headers=candidate_headers, timeout=30.0) as c:
        yield c


@pytest.fixture(scope="session")
def raw_http_client():
    """Unauthenticated httpx.Client for testing auth failures."""
    with httpx.Client(base_url=BASE_URL, timeout=30.0) as c:
        yield c


@pytest.fixture(scope="session")
def organization_id(http_client):
    """Fetch the organization ID from the admin/HR user's profile."""
    resp = http_client.get("/auth/me")
    assert resp.status_code == 200, (
        f"Failed to get admin profile: {resp.status_code} — {resp.text}"
    )
    data = resp.json()
    org_id = data.get("organization_id") or data.get("organization", {}).get("id")
    assert org_id, f"No organization_id in profile: {data}"
    return org_id
