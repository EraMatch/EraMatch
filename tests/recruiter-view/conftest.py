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


# ─────────────────────────────────────────────
# E2E PIPELINE FIXTURES (tech + admin + project + sample CVs)
# ─────────────────────────────────────────────
from pathlib import Path

TECH_EMAIL = "tech@eramatch.com"
TECH_PASSWORD = "admin12345"
ADMIN_EMAIL = "admin_1@eramatch.com"
ADMIN_PASSWORD = "admin12345"
# Sample CV PDFs provided by the user for ingestion tests.
SAMPLE_CVS_DIR = Path("/Users/anasahmed/Uni_projects/grad_project/Main_Dev/sample_pdfs")


def _login(email: str, password: str) -> dict:
    """Log an organization user in and return the full response payload."""
    with httpx.Client(base_url=BASE_URL, timeout=30.0) as client:
        resp = client.post("/auth/organization-user/login", json={"email": email, "password": password})
        assert resp.status_code == 200, f"Login failed for {email}: {resp.status_code} — {resp.text}"
        data = resp.json()
        assert data.get("access_token") or data.get("token"), f"No token for {email}: {data}"
        return data


@pytest.fixture(scope="session")
def hr_user_id():
    data = _login(RECRUITER_EMAIL, RECRUITER_PASSWORD)
    user = data.get("user") or {}
    return user.get("id") or user.get("user_id")


@pytest.fixture(scope="session")
def tech_login():
    return _login(TECH_EMAIL, TECH_PASSWORD)


@pytest.fixture(scope="session")
def tech_token(tech_login):
    return tech_login.get("access_token") or tech_login.get("token")


@pytest.fixture(scope="session")
def tech_user_id(tech_login):
    user = tech_login.get("user") or {}
    return user.get("id") or user.get("user_id")


@pytest.fixture(scope="session")
def tech_headers(tech_token):
    return {"Authorization": f"Bearer {tech_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def tech_client(tech_headers):
    with httpx.Client(base_url=BASE_URL, headers=tech_headers, timeout=60.0) as c:
        yield c


@pytest.fixture(scope="session")
def admin_token():
    data = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    return data.get("access_token") or data.get("token")


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def upload_headers(recruiter_token):
    """Auth header WITHOUT Content-Type so httpx can set the multipart boundary for file uploads."""
    return {"Authorization": f"Bearer {recruiter_token}"}


@pytest.fixture(scope="session")
def approved_project_id(client):
    """Pick an existing approved/active project to host the E2E test position."""
    resp = client.get("/recruiter/projects")
    assert resp.status_code == 200, f"Could not list projects: {resp.status_code} — {resp.text}"
    projects = resp.json()
    if isinstance(projects, dict):
        projects = projects.get("projects") or projects.get("data") or []
    assert projects, "No projects available to host the E2E position. Create/approve a project first."

    def _status(p):
        return str(p.get("status", "")).lower()

    # Prefer an explicitly active/approved/open project; fall back to the first.
    chosen = next(
        (p for p in projects if any(s in _status(p) for s in ("active", "approved", "open"))),
        projects[0],
    )
    return str(chosen.get("id") or chosen.get("project_id"))


@pytest.fixture(scope="session")
def sample_cv_paths():
    """Absolute paths to the sample CV PDFs (skip the suite if missing)."""
    if not SAMPLE_CVS_DIR.exists():
        pytest.skip(f"Sample CV directory not found: {SAMPLE_CVS_DIR}")
    pdfs = sorted(SAMPLE_CVS_DIR.glob("*.pdf"))
    if not pdfs:
        pytest.skip(f"No sample CV PDFs in {SAMPLE_CVS_DIR}")
    return pdfs
