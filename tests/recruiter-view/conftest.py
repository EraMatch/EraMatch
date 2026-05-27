"""
Shared pytest fixtures for EraMatch recruiter view tests.
All tests communicate with the live backend at http://localhost:8000.
"""
import pytest
import httpx

# ─────────────────────────────────────────────
# CONFIGURATION
# ─────────────────────────────────────────────
BASE_URL = "http://localhost:8000/api/v1"
RECRUITER_EMAIL = "hr@eramatch.com"
RECRUITER_PASSWORD = "admin12345"


# ─────────────────────────────────────────────
# FIXTURES
# ─────────────────────────────────────────────

@pytest.fixture(scope="session")
def base_url():
    """Base URL for the running backend API."""
    return BASE_URL


@pytest.fixture(scope="session")
def recruiter_credentials():
    """Recruiter login credentials."""
    return {"email": RECRUITER_EMAIL, "password": RECRUITER_PASSWORD}


@pytest.fixture(scope="session")
def recruiter_token():
    """
    Obtain a valid recruiter JWT access token once per test session.
    Uses the organization-user login endpoint.
    Fails the entire session immediately if login fails.
    """
    with httpx.Client(base_url=BASE_URL, timeout=30.0) as client:
        resp = client.post("/auth/organization-user/login", json={
            "email": RECRUITER_EMAIL,
            "password": RECRUITER_PASSWORD
        })
        assert resp.status_code == 200, (
            f"Recruiter login failed: {resp.status_code} — {resp.text}\n"
            "Make sure the backend is running at http://localhost:8000 "
            "and the recruiter credentials are correct."
        )
        data = resp.json()
        token = data.get("access_token") or data.get("token")
        assert token, f"No token in login response: {data}"
        return token


@pytest.fixture(scope="session")
def recruiter_headers(recruiter_token):
    """Authorization headers for all recruiter API calls."""
    return {
        "Authorization": f"Bearer {recruiter_token}",
        "Content-Type": "application/json"
    }


@pytest.fixture(scope="session")
def client(recruiter_headers):
    """
    Shared httpx.Client pre-configured with recruiter auth headers.
    Reused across the whole test session for performance.
    """
    with httpx.Client(
        base_url=BASE_URL,
        headers=recruiter_headers,
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
