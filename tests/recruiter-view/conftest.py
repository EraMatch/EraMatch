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
def approved_project_id(client, admin_headers):
    """
    Return an active/approved project id.
    If none exists, creates one via the admin client (bypasses approval flow)
    so the E2E test always has somewhere to attach positions.
    """
    resp = client.get("/recruiter/projects")
    projects = []
    if resp.status_code == 200:
        raw = resp.json()
        projects = raw if isinstance(raw, list) else (raw.get("projects") or raw.get("data") or [])

    def _status(p):
        return str(p.get("status", "")).lower()

    active = [p for p in projects if any(s in _status(p) for s in ("active", "approved", "open"))]
    if active:
        return str(active[0].get("id") or active[0].get("project_id"))

    # Fall back to ANY project
    if projects:
        return str(projects[0].get("id") or projects[0].get("project_id"))

    # No projects at all — create one via admin so it starts approved
    with httpx.Client(base_url=BASE_URL, headers=admin_headers, timeout=30.0) as ac:
        cr = ac.post("/recruiter/projects", json={
            "name": "E2E Seed Project",
            "description": "Auto-created by test fixtures — safe to delete.",
            "target_hire_count": 5,
            "status": "active",
            "priority": "medium",
        })
        assert cr.status_code in (200, 201), (
            f"Auto-create project failed: {cr.status_code} — {cr.text}\n"
            "Create at least one project manually before running E2E tests."
        )
        data = cr.json()
        pid = str(data.get("project_id") or data.get("id") or "")
        assert pid, f"No project_id in response: {data}"
        return pid


@pytest.fixture(scope="session")
def sample_cv_paths():
    """Absolute paths to the sample CV PDFs (skip the suite if missing)."""
    if not SAMPLE_CVS_DIR.exists():
        pytest.skip(f"Sample CV directory not found: {SAMPLE_CVS_DIR}")
    pdfs = sorted(SAMPLE_CVS_DIR.glob("*.pdf"))
    if not pdfs:
        pytest.skip(f"No sample CV PDFs in {SAMPLE_CVS_DIR}")
    return pdfs


_SEED_MCQ_QUESTIONS = [
    {
        "question_type": "mcq", "question_text": "Which React hook is used for side effects?",
        "question_config": {
            "options": ["useState", "useEffect", "useContext", "useReducer"],
            "correct_answer": {"correct_index": 1},
            "explanation": "useEffect runs after render for side effects.",
        },
        "difficulty": "Easy", "tags": ["React", "Hooks"], "points": 10,
        "category": "Frontend",
    },
    {
        "question_type": "mcq",
        "question_text": "What is the time complexity of inserting into a balanced BST?",
        "question_config": {
            "options": ["O(1)", "O(log n)", "O(n)", "O(n log n)"],
            "correct_answer": {"correct_index": 1},
            "explanation": "Balanced BST insert is O(log n) because each level halves the search space.",
        },
        "difficulty": "Medium", "tags": ["Data Structures", "Algorithms"], "points": 10,
        "category": "Computer Science",
    },
    {
        "question_type": "mcq",
        "question_text": "Which CSS property controls stacking order of overlapping elements?",
        "question_config": {
            "options": ["z-index", "position", "display", "overflow"],
            "correct_answer": {"correct_index": 0},
            "explanation": "z-index controls the stack order for positioned elements.",
        },
        "difficulty": "Easy", "tags": ["CSS"], "points": 10,
        "category": "Frontend",
    },
    {
        "question_type": "mcq",
        "question_text": "What does the TypeScript `keyof` operator return?",
        "question_config": {
            "options": [
                "All values of an object type",
                "A union of all property keys of an object type",
                "A boolean indicating key existence",
                "An array of keys",
            ],
            "correct_answer": {"correct_index": 1},
            "explanation": "`keyof T` produces a union type of string/number literal types for T's keys.",
        },
        "difficulty": "Medium", "tags": ["TypeScript"], "points": 10,
        "category": "Frontend",
    },
    {
        "question_type": "mcq",
        "question_text": "In GraphQL, what is a resolver?",
        "question_config": {
            "options": [
                "A caching layer for queries",
                "A function that returns data for a specific field",
                "A type definition in the schema",
                "A middleware for authentication",
            ],
            "correct_answer": {"correct_index": 1},
            "explanation": "Resolvers are functions responsible for fetching data for each schema field.",
        },
        "difficulty": "Medium", "tags": ["GraphQL"], "points": 10,
        "category": "Backend",
    },
]

_SEED_ESSAY_QUESTIONS = [
    {
        "question_type": "essay",
        "question_text": "Describe the key differences between REST and GraphQL APIs. When would you choose one over the other?",
        "question_config": {
            "max_words": 400,
            "rubric": "Grade on technical accuracy, real-world trade-off analysis, and clarity.",
            "rubric_yes_no_checks": [
                {"id": i + 1, "check": f"Does the answer address point {i + 1}?", "weight": 0.1}
                for i in range(10)
            ],
        },
        "difficulty": "Medium", "tags": ["API Design", "GraphQL", "REST"], "points": 20,
        "category": "Backend",
    },
    {
        "question_type": "essay",
        "question_text": "Explain how you would approach optimising the performance of a slow React application.",
        "question_config": {
            "max_words": 500,
            "rubric": "Evaluate breadth of optimisation strategies and concrete examples.",
            "rubric_yes_no_checks": [
                {"id": i + 1, "check": f"Does the answer address point {i + 1}?", "weight": 0.1}
                for i in range(10)
            ],
        },
        "difficulty": "Hard", "tags": ["React", "Performance"], "points": 20,
        "category": "Frontend",
    },
    {
        "question_type": "essay",
        "question_text": "What strategies would you use to ensure accessibility (a11y) in a web application?",
        "question_config": {
            "max_words": 350,
            "rubric": "Assess knowledge of WCAG guidelines, semantic HTML, and ARIA.",
            "rubric_yes_no_checks": [
                {"id": i + 1, "check": f"Does the answer address point {i + 1}?", "weight": 0.1}
                for i in range(10)
            ],
        },
        "difficulty": "Medium", "tags": ["Accessibility", "HTML"], "points": 20,
        "category": "Frontend",
    },
]


@pytest.fixture(scope="session")
def seed_qb_questions(tech_client):
    """
    Ensure the question bank has enough questions for the E2E tests to pull from.
    Seeds 5 MCQ + 3 essay questions if fewer than 3 of either type exist.
    Safe to run multiple times — uses POST /questions only when the bank is sparse.
    Returns counts: {"mcq": int, "essay": int}
    """
    counts: dict[str, int] = {}
    for q_type, seeds in [("mcq", _SEED_MCQ_QUESTIONS), ("essay", _SEED_ESSAY_QUESTIONS)]:
        r = tech_client.get("/questions", params={"question_type": q_type, "limit": 10})
        existing = 0
        if r.status_code == 200:
            raw = r.json()
            items = raw if isinstance(raw, list) else (raw.get("questions") or raw.get("items") or [])
            existing = len(items)

        if existing >= 3:
            counts[q_type] = existing
            continue

        # Seed
        created = 0
        for q in seeds:
            cr = tech_client.post("/questions", json=q)
            if cr.status_code in (200, 201):
                created += 1
        counts[q_type] = existing + created

    return counts
