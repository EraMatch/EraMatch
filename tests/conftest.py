"""
Shared pytest fixtures for EraMatch admin view tests.
All tests communicate with the live backend at http://localhost:8000.
"""
import pytest
import httpx

# ─────────────────────────────────────────────
# CONFIGURATION
# ─────────────────────────────────────────────
BASE_URL = "http://localhost:8000/api/v1"
ADMIN_EMAIL = "admin_1@eramatch.com"
ADMIN_PASSWORD = "1234567890"


# ─────────────────────────────────────────────
# FIXTURES
# ─────────────────────────────────────────────

@pytest.fixture(scope="session")
def base_url():
    """Base URL for the running backend API."""
    return BASE_URL


@pytest.fixture(scope="session")
def admin_credentials():
    """Admin login credentials."""
    return {"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}


@pytest.fixture(scope="session")
def admin_token():
    """
    Obtain a valid admin JWT access token once per test session.
    Fails the entire session immediately if login fails.
    """
    with httpx.Client(base_url=BASE_URL, timeout=30.0) as client:
        resp = client.post("/auth/admin/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert resp.status_code == 200, (
            f"Admin login failed: {resp.status_code} — {resp.text}\n"
            "Make sure the backend is running at http://localhost:8000 "
            "and the admin credentials are correct."
        )
        data = resp.json()
        token = data.get("access_token") or data.get("token")
        assert token, f"No token in login response: {data}"
        return token


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    """Authorization headers for all admin API calls."""
    return {
        "Authorization": f"Bearer {admin_token}",
        "Content-Type": "application/json"
    }


@pytest.fixture(scope="session")
def client(admin_headers):
    """
    Shared httpx.Client pre-configured with admin auth headers.
    Reused across the whole test session for performance.
    """
    with httpx.Client(
        base_url=BASE_URL,
        headers=admin_headers,
        timeout=30.0
    ) as c:
        yield c


@pytest.fixture(scope="session")
def raw_client():
    """
    Unauthenticated httpx.Client — for testing auth failures.
    """
    with httpx.Client(base_url=BASE_URL, timeout=30.0) as c:
        yield c
