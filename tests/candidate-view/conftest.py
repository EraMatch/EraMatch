"""
Shared pytest fixtures for EraMatch candidate view tests.
All tests communicate with the live backend at http://localhost:8000.
"""
import pytest
import httpx

# ─────────────────────────────────────────────
# CONFIGURATION
# ─────────────────────────────────────────────
BASE_URL = "http://localhost:8000/api/v1"
CANDIDATE_EMAIL = "candidate2@eramatch.com"
CANDIDATE_PASSWORD = "test123"


# ─────────────────────────────────────────────
# FIXTURES
# ─────────────────────────────────────────────

@pytest.fixture(scope="session")
def base_url():
    """Base URL for the running backend API."""
    return BASE_URL


@pytest.fixture(scope="session")
def candidate_credentials():
    """Candidate login credentials."""
    return {"email": CANDIDATE_EMAIL, "password": CANDIDATE_PASSWORD}


@pytest.fixture(scope="session")
def candidate_token():
    """
    Obtain a valid candidate JWT access token once per test session.
    Fails the entire session immediately if login fails.
    """
    with httpx.Client(base_url=BASE_URL, timeout=30.0) as client:
        # Candidate login uses 'username' field (not 'email') — matches frontend auth.service.ts
        resp = client.post("/candidate/login", json={
            "username": CANDIDATE_EMAIL,
            "password": CANDIDATE_PASSWORD
        })
        assert resp.status_code == 200, (
            f"Candidate login failed: {resp.status_code} — {resp.text}\n"
            "Make sure the backend is running at http://localhost:8000 "
            "and the candidate credentials are correct."
        )
        data = resp.json()
        token = data.get("access_token") or data.get("token")
        assert token, f"No token in login response: {data}"
        return token


@pytest.fixture(scope="session")
def candidate_headers(candidate_token):
    """Authorization headers for all candidate API calls."""
    return {
        "Authorization": f"Bearer {candidate_token}",
        "Content-Type": "application/json"
    }


@pytest.fixture(scope="session")
def client(candidate_headers):
    """
    Shared httpx.Client pre-configured with candidate auth headers.
    Reused across the whole test session for performance.
    """
    with httpx.Client(
        base_url=BASE_URL,
        headers=candidate_headers,
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
