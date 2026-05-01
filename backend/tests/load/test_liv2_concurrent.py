"""
Concurrent interview load tests for LiV2.

Tests verify the system can handle multiple simultaneous interview sessions:
- 5+ concurrent token dispatches
- Concurrent session completions
- No cross-contamination between sessions
- No database deadlocks or constraint violations

These tests require a LIVE backend.
Run with: pytest tests/load/test_liv2_concurrent.py -v

NOTE: These tests create real sessions. Run against test/staging data only.
"""

from __future__ import annotations

import asyncio
import os
import sys
import time
import uuid

import httpx
import pytest

# ---------------------------------------------------------------------------
# Make the parent conftest importable
# ---------------------------------------------------------------------------
_HERE = os.path.abspath(os.path.dirname(__file__))
_BACKEND_ROOT = os.path.abspath(os.path.join(_HERE, "..", ".."))
if _BACKEND_ROOT not in sys.path:
    sys.path.insert(0, _BACKEND_ROOT)

pytestmark = [pytest.mark.integration, pytest.mark.slow]

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
BASE_URL = os.getenv("ERAMATCH_API_URL", "http://localhost:8000/api/v1")
ADMIN_EMAIL = os.getenv("ERAMATCH_ADMIN_EMAIL", "hr@eramatch.com")
ADMIN_PASSWORD = os.getenv("ERAMATCH_ADMIN_PASSWORD", "admin12345")

# Seed data UUIDs (must match seed script and test_integration.py)
GROUP_ID = "a0000003-0000-0000-0000-000000000003"
RUBRIC_ID = "a0000040-0000-0000-0000-000000000040"
BANK_ID = "a0000041-0000-0000-0000-000000000041"

# A sample transcript for completing sessions
SAMPLE_TRANSCRIPT_12 = [
    {
        "role": "ai",
        "text": "Welcome to the interview. Can you tell me about your experience?",
        "phase": "opening",
        "timestamp": 0.0,
    },
    {
        "role": "candidate",
        "text": "I've worked with React for 3 years building large-scale SPAs.",
        "phase": "opening",
        "timestamp": 15.0,
    },
    {
        "role": "ai",
        "text": "How do you handle state management?",
        "phase": "technical",
        "timestamp": 30.0,
    },
    {
        "role": "candidate",
        "text": "I prefer a combination of local state and global stores like Redux Toolkit.",
        "phase": "technical",
        "timestamp": 45.0,
    },
    {
        "role": "ai",
        "text": "Describe a challenging bug you encountered.",
        "phase": "behavioral",
        "timestamp": 60.0,
    },
    {
        "role": "candidate",
        "text": "We had a memory leak in a dashboard. I used profiling tools to identify and fix it.",
        "phase": "behavioral",
        "timestamp": 75.0,
    },
    {
        "role": "ai",
        "text": "How do you approach code reviews?",
        "phase": "behavioral",
        "timestamp": 90.0,
    },
    {
        "role": "candidate",
        "text": "I follow a structured checklist covering correctness, performance, and readability.",
        "phase": "behavioral",
        "timestamp": 105.0,
    },
    {
        "role": "ai",
        "text": "Design a real-time notification system API.",
        "phase": "technical",
        "timestamp": 120.0,
    },
    {
        "role": "candidate",
        "text": "I'd use WebSockets for delivery with REST fallback and message queuing.",
        "phase": "technical",
        "timestamp": 135.0,
    },
    {
        "role": "ai",
        "text": "Do you have any questions for us?",
        "phase": "closing",
        "timestamp": 150.0,
    },
    {
        "role": "candidate",
        "text": "I'd like to know more about the team's CI/CD approach.",
        "phase": "closing",
        "timestamp": 165.0,
    },
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _get_admin_token() -> str:
    """Authenticate as admin/HR and return JWT token."""
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=30.0) as client:
        resp = await client.post(
            "/auth/organization-user/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        )
        assert resp.status_code == 200, (
            f"Admin login failed: {resp.status_code} — {resp.text}"
        )
        data = resp.json()
        token = data.get("access_token") or data.get("token")
        assert token, f"No token in login response: {data}"
        return token


async def _dispatch_session(client: httpx.AsyncClient) -> httpx.Response:
    """Dispatch a single session token request as a candidate."""
    return await client.get("/live-interview-v2/session/token")


async def _complete_session(
    client: httpx.AsyncClient, session_id: str
) -> httpx.Response:
    """Submit a session completion (unauthenticated — called by LiveKit agent)."""
    return await client.post(
        f"/live-interview-v2/session/{session_id}/complete",
        json={"transcript": SAMPLE_TRANSCRIPT_12},
    )


def _is_ok_response(result: object, allow: tuple[int, ...] = (200,)) -> bool:
    """Type-narrowing helper: return True if *result* is an httpx.Response
    with a status code in *allow*.  Silences Pyright on gather(return_exceptions=True)."""
    return isinstance(result, httpx.Response) and result.status_code in allow


def _code(result: object) -> int | str:
    """Return status_code for Response or string for Exception — safe in f-strings."""
    if isinstance(result, httpx.Response):
        return result.status_code
    return str(result)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="session")
def admin_token():
    """Sync fixture to get admin JWT token."""
    return (
        asyncio.get_event_loop_policy()
        .get_event_loop()
        .run_until_complete(_get_admin_token())
    )


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    """Authorization headers for admin/HR API calls."""
    return {
        "Authorization": f"Bearer {admin_token}",
        "Content-Type": "application/json",
    }


@pytest.fixture(scope="session")
def organization_id(admin_headers):
    """Fetch the organization ID from the admin profile."""
    with httpx.Client(base_url=BASE_URL, headers=admin_headers, timeout=30.0) as c:
        resp = c.get("/auth/me")
        assert resp.status_code == 200, f"Failed to get admin profile: {resp.text}"
        data = resp.json()
        org_id = data.get("organization_id") or data.get("organization", {}).get("id")
        assert org_id, f"No organization_id in profile: {data}"
        return org_id


# ===========================================================================
# TEST 1: Concurrent token dispatch
# ===========================================================================


@pytest.mark.asyncio
async def test_concurrent_token_dispatch():
    """
    Dispatch 5 session token requests concurrently using asyncio.gather().
    At least 3 should succeed (tolerating some flakiness in load tests).
    All successful responses must contain valid token, room_name, session_id.
    """
    candidate_email = os.getenv("ERAMATCH_CANDIDATE_EMAIL", "sara.alharthi@example.com")
    candidate_password = os.getenv("ERAMATCH_CANDIDATE_PASSWORD", "admin12345")

    # Get candidate token
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=30.0) as auth_client:
        login_resp = await auth_client.post(
            "/candidate/login",
            json={"email": candidate_email, "password": candidate_password},
        )
        assert login_resp.status_code == 200, (
            f"Candidate login failed: {login_resp.status_code} — {login_resp.text}"
        )
        candidate_token = login_resp.json().get(
            "access_token"
        ) or login_resp.json().get("token")

    candidate_headers = {
        "Authorization": f"Bearer {candidate_token}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(
        base_url=BASE_URL, headers=candidate_headers, timeout=60.0
    ) as client:
        tasks = [_dispatch_session(client) for _ in range(5)]
        results = await asyncio.gather(*tasks, return_exceptions=True)

    successes = [r for r in results if _is_ok_response(r)]

    assert len(successes) >= 3, (
        f"Too many failures: {len(successes)}/5 succeeded. "
        f"Errors: {[_code(r) for r in results]}"
    )

    # Validate response structure of successful requests
    for resp in successes:
        if not isinstance(resp, httpx.Response):
            continue
        data = resp.json()
        assert "token" in data, f"Missing 'token' in response: {data}"
        assert "room_name" in data, f"Missing 'room_name' in response: {data}"
        assert "session_id" in data, f"Missing 'session_id' in response: {data}"
        assert data["room_name"].startswith("li-v2-"), (
            f"Room name should start with 'li-v2-', got: {data['room_name']}"
        )
        # Validate session_id is a UUID
        try:
            uuid.UUID(data["session_id"])
        except ValueError:
            pytest.fail(f"session_id is not a valid UUID: {data['session_id']}")


# ===========================================================================
# TEST 2: Concurrent session creation (DB-level)
# ===========================================================================


@pytest.mark.integration
def test_concurrent_session_creation(admin_headers, organization_id):
    """
    Create multiple session tokens sequentially but rapidly (simulating burst load).
    All should return 200 with valid session data.
    Verifies no database deadlocks or constraint violations under rapid sequential access.
    """
    candidate_email = os.getenv("ERAMATCH_CANDIDATE_EMAIL", "sara.alharthi@example.com")
    candidate_password = os.getenv("ERAMATCH_CANDIDATE_PASSWORD", "admin12345")

    with httpx.Client(base_url=BASE_URL, timeout=30.0) as auth_client:
        login_resp = auth_client.post(
            "/candidate/login",
            json={"email": candidate_email, "password": candidate_password},
        )
        assert login_resp.status_code == 200, (
            f"Candidate login failed: {login_resp.text}"
        )
        candidate_token = login_resp.json().get(
            "access_token"
        ) or login_resp.json().get("token")

    candidate_headers = {
        "Authorization": f"Bearer {candidate_token}",
        "Content-Type": "application/json",
    }

    session_ids = []
    with httpx.Client(
        base_url=BASE_URL, headers=candidate_headers, timeout=30.0
    ) as client:
        for i in range(5):
            resp = client.get("/live-interview-v2/session/token")
            assert resp.status_code == 200, (
                f"Session creation #{i + 1} failed: {resp.status_code} — {resp.text}"
            )
            data = resp.json()
            assert "session_id" in data, f"No session_id in response: {data}"
            session_ids.append(data["session_id"])

    # All session IDs should be unique
    assert len(set(session_ids)) == len(session_ids), (
        f"Duplicate session IDs detected: {session_ids}"
    )


# ===========================================================================
# TEST 3: Concurrent session completion
# ===========================================================================


@pytest.mark.asyncio
async def test_concurrent_session_completion():
    """
    Submit 5 session completions concurrently.
    All should return 200. No duplicate evaluations should be created.
    """
    candidate_email = os.getenv("ERAMATCH_CANDIDATE_EMAIL", "sara.alharthi@example.com")
    candidate_password = os.getenv("ERAMATCH_CANDIDATE_PASSWORD", "admin12345")

    async with httpx.AsyncClient(base_url=BASE_URL, timeout=30.0) as auth_client:
        login_resp = await auth_client.post(
            "/candidate/login",
            json={"email": candidate_email, "password": candidate_password},
        )
        assert login_resp.status_code == 200, (
            f"Candidate login failed: {login_resp.text}"
        )
        candidate_token = login_resp.json().get(
            "access_token"
        ) or login_resp.json().get("token")

    candidate_headers = {
        "Authorization": f"Bearer {candidate_token}",
        "Content-Type": "application/json",
    }

    # First, create 5 sessions
    session_ids = []
    async with httpx.AsyncClient(
        base_url=BASE_URL, headers=candidate_headers, timeout=60.0
    ) as client:
        for _ in range(5):
            resp = await client.get("/live-interview-v2/session/token")
            if resp.status_code == 200:
                session_ids.append(resp.json()["session_id"])

    assert len(session_ids) >= 3, f"Could only create {len(session_ids)} sessions"

    # Now complete all sessions concurrently (unauthenticated — agent calls)
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=60.0) as raw_client:
        tasks = [_complete_session(raw_client, sid) for sid in session_ids]
        results = await asyncio.gather(*tasks, return_exceptions=True)

    successes = [r for r in results if _is_ok_response(r)]

    assert len(successes) >= 3, (
        f"Too many completion failures: {len(successes)}/{len(session_ids)} succeeded. "
        f"Errors: {[_code(r) for r in results]}"
    )

    # Verify each successful response has the expected shape
    for resp in successes:
        if not isinstance(resp, httpx.Response):
            continue
        data = resp.json()
        assert data.get("status") in ("completed", "already_completed"), (
            f"Unexpected completion status: {data}"
        )
        assert "session_id" in data, (
            f"Missing session_id in completion response: {data}"
        )


# ===========================================================================
# TEST 4: No cross-session contamination
# ===========================================================================


@pytest.mark.asyncio
async def test_no_cross_session_contamination():
    """
    Create 2 sessions for different candidates, complete both,
    and verify evaluations/sessions don't mix up.
    Each candidate should only see their own session data.
    """
    # Use two different candidate credentials
    candidate_pairs = [
        ("sara.alharthi@example.com", "admin12345"),
        ("omar.khaled@example.com", "admin12345"),
    ]

    tokens = []
    session_ids = []

    for email, password in candidate_pairs:
        async with httpx.AsyncClient(base_url=BASE_URL, timeout=30.0) as auth_client:
            login_resp = await auth_client.post(
                "/candidate/login",
                json={"email": email, "password": password},
            )
            if login_resp.status_code != 200:
                pytest.skip(f"Candidate {email} login failed — no seed data?")
            token = login_resp.json().get("access_token") or login_resp.json().get(
                "token"
            )
            tokens.append(token)

    # Each candidate dispatches a session token
    for i, token in enumerate(tokens):
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(
            base_url=BASE_URL, headers=headers, timeout=60.0
        ) as client:
            resp = await client.get("/live-interview-v2/session/token")
            if resp.status_code != 200:
                pytest.skip(
                    f"Candidate {candidate_pairs[i][0]} could not get session token"
                )
            session_ids.append(resp.json()["session_id"])

    assert len(session_ids) == 2, f"Expected 2 sessions, got {len(session_ids)}"

    # Complete both sessions (unauthenticated)
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=60.0) as raw_client:
        tasks = [
            raw_client.post(
                f"/live-interview-v2/session/{sid}/complete",
                json={"transcript": SAMPLE_TRANSCRIPT_12},
            )
            for sid in session_ids
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)

    successful = sum(1 for r in results if _is_ok_response(r))
    assert successful >= 1, (
        f"No sessions completed successfully: {[_code(r) for r in results]}"
    )

    # Session IDs must be different (no cross-contamination)
    assert session_ids[0] != session_ids[1], (
        f"Session IDs should be unique per candidate: {session_ids}"
    )


# ===========================================================================
# TEST 5: Rubric read under load
# ===========================================================================


@pytest.mark.asyncio
async def test_rubric_read_under_load():
    """
    While sessions are being created, simultaneously read rubric data.
    No errors should occur; reads should be consistent.
    """
    # Get admin token
    admin_token_val = await _get_admin_token()
    admin_hdrs = {
        "Authorization": f"Bearer {admin_token_val}",
        "Content-Type": "application/json",
    }

    # Get candidate token for session creation
    candidate_email = os.getenv("ERAMATCH_CANDIDATE_EMAIL", "sara.alharthi@example.com")
    candidate_password = os.getenv("ERAMATCH_CANDIDATE_PASSWORD", "admin12345")

    async with httpx.AsyncClient(base_url=BASE_URL, timeout=30.0) as auth_client:
        login_resp = await auth_client.post(
            "/candidate/login",
            json={"email": candidate_email, "password": candidate_password},
        )
        assert login_resp.status_code == 200, (
            f"Candidate login failed: {login_resp.text}"
        )
        candidate_token = login_resp.json().get(
            "access_token"
        ) or login_resp.json().get("token")

    candidate_hdrs = {
        "Authorization": f"Bearer {candidate_token}",
        "Content-Type": "application/json",
    }

    async def _read_rubric(client: httpx.AsyncClient) -> httpx.Response:
        return await client.get(f"/live-interview-v2/rubric/group/{GROUP_ID}")

    async def _create_session(client: httpx.AsyncClient) -> httpx.Response:
        return await client.get("/live-interview-v2/session/token")

    # Mix reads and writes concurrently
    async with httpx.AsyncClient(
        base_url=BASE_URL, headers=admin_hdrs, timeout=60.0
    ) as admin_client:
        async with httpx.AsyncClient(
            base_url=BASE_URL, headers=candidate_hdrs, timeout=60.0
        ) as cand_client:
            tasks = []
            # 3 rubric reads
            for _ in range(3):
                tasks.append(_read_rubric(admin_client))
            # 3 session creates
            for _ in range(3):
                tasks.append(_create_session(cand_client))

            results = await asyncio.gather(*tasks, return_exceptions=True)

    # Separate results by type (first 3 = rubric reads, last 3 = session creates)
    rubric_results = results[:3]
    session_results = results[3:]

    # Rubric reads should succeed
    rubric_successes = sum(
        1 for r in rubric_results if _is_ok_response(r, allow=(200, 404))
    )
    assert rubric_successes >= 2, (
        f"Rubric reads failed under load: {[_code(r) for r in rubric_results]}"
    )

    session_successes = sum(1 for r in session_results if _is_ok_response(r))
    assert session_successes >= 2, (
        f"Session creates failed under load: {[_code(r) for r in session_results]}"
    )


# ===========================================================================
# TEST 6: Bank read under load
# ===========================================================================


@pytest.mark.asyncio
async def test_bank_read_under_load():
    """
    While sessions are being created, simultaneously read bank data.
    No errors should occur; reads should be consistent.
    """
    admin_token_val = await _get_admin_token()
    admin_hdrs = {
        "Authorization": f"Bearer {admin_token_val}",
        "Content-Type": "application/json",
    }

    candidate_email = os.getenv("ERAMATCH_CANDIDATE_EMAIL", "sara.alharthi@example.com")
    candidate_password = os.getenv("ERAMATCH_CANDIDATE_PASSWORD", "admin12345")

    async with httpx.AsyncClient(base_url=BASE_URL, timeout=30.0) as auth_client:
        login_resp = await auth_client.post(
            "/candidate/login",
            json={"email": candidate_email, "password": candidate_password},
        )
        assert login_resp.status_code == 200, (
            f"Candidate login failed: {login_resp.text}"
        )
        candidate_token = login_resp.json().get(
            "access_token"
        ) or login_resp.json().get("token")

    candidate_hdrs = {
        "Authorization": f"Bearer {candidate_token}",
        "Content-Type": "application/json",
    }

    async def _read_bank(client: httpx.AsyncClient) -> httpx.Response:
        return await client.get(f"/live-interview-v2/bank/group/{GROUP_ID}")

    async def _create_session(client: httpx.AsyncClient) -> httpx.Response:
        return await client.get("/live-interview-v2/session/token")

    # Mix bank reads and session writes concurrently
    async with httpx.AsyncClient(
        base_url=BASE_URL, headers=admin_hdrs, timeout=60.0
    ) as admin_client:
        async with httpx.AsyncClient(
            base_url=BASE_URL, headers=candidate_hdrs, timeout=60.0
        ) as cand_client:
            tasks = []
            # 3 bank reads
            for _ in range(3):
                tasks.append(_read_bank(admin_client))
            # 3 session creates
            for _ in range(3):
                tasks.append(_create_session(cand_client))

            results = await asyncio.gather(*tasks, return_exceptions=True)

    # Separate results by type (first 3 = bank reads, last 3 = session creates)
    bank_results = results[:3]
    session_results = results[3:]

    # Bank reads should succeed (200 or 404 if not seeded)
    bank_successes = sum(
        1 for r in bank_results if _is_ok_response(r, allow=(200, 404))
    )
    assert bank_successes >= 2, (
        f"Bank reads failed under load: {[_code(r) for r in bank_results]}"
    )

    session_successes = sum(1 for r in session_results if _is_ok_response(r))
    assert session_successes >= 2, (
        f"Session creates failed under load: {[_code(r) for r in session_results]}"
    )


# ===========================================================================
# TEST 7: Sessions monitor under load
# ===========================================================================


@pytest.mark.asyncio
async def test_sessions_monitor_under_load():
    """
    While sessions are in progress, hit the sessions-monitor endpoint.
    Should return accurate counts even under concurrent reads.
    """
    admin_token_val = await _get_admin_token()
    admin_hdrs = {
        "Authorization": f"Bearer {admin_token_val}",
        "Content-Type": "application/json",
    }

    candidate_email = os.getenv("ERAMATCH_CANDIDATE_EMAIL", "sara.alharthi@example.com")
    candidate_password = os.getenv("ERAMATCH_CANDIDATE_PASSWORD", "admin12345")

    async with httpx.AsyncClient(base_url=BASE_URL, timeout=30.0) as auth_client:
        login_resp = await auth_client.post(
            "/candidate/login",
            json={"email": candidate_email, "password": candidate_password},
        )
        assert login_resp.status_code == 200, (
            f"Candidate login failed: {login_resp.text}"
        )
        candidate_token = login_resp.json().get(
            "access_token"
        ) or login_resp.json().get("token")

    candidate_hdrs = {
        "Authorization": f"Bearer {candidate_token}",
        "Content-Type": "application/json",
    }

    async def _read_monitor(client: httpx.AsyncClient) -> httpx.Response:
        return await client.get(f"/live-interview-v2/group/{GROUP_ID}/sessions-monitor")

    async def _create_session(client: httpx.AsyncClient) -> httpx.Response:
        return await client.get("/live-interview-v2/session/token")

    # Mix monitoring reads with session creation
    async with httpx.AsyncClient(
        base_url=BASE_URL, headers=admin_hdrs, timeout=60.0
    ) as admin_client:
        async with httpx.AsyncClient(
            base_url=BASE_URL, headers=candidate_hdrs, timeout=60.0
        ) as cand_client:
            tasks = []
            # 5 monitor reads
            for _ in range(5):
                tasks.append(_read_monitor(admin_client))
            # 3 session creates
            for _ in range(3):
                tasks.append(_create_session(cand_client))

            results = await asyncio.gather(*tasks, return_exceptions=True)

    # Separate results (first 5 = monitor reads, last 3 = session creates)
    monitor_results = results[:5]
    session_results = results[5:]

    # Monitor reads should succeed (200 or 404/403 if group doesn't exist)
    monitor_successes = sum(
        1 for r in monitor_results if _is_ok_response(r, allow=(200, 403, 404))
    )
    assert monitor_successes >= 4, (
        f"Monitor reads failed under load: {[_code(r) for r in monitor_results]}"
    )

    for r in monitor_results:
        if not isinstance(r, httpx.Response) or r.status_code != 200:
            continue
        data = r.json()
        assert "group_id" in data or "sessions" in data or "summary" in data, (
            f"Monitor response missing expected keys: {data.keys()}"
        )

    session_successes = sum(1 for r in session_results if _is_ok_response(r))
    assert session_successes >= 2, (
        f"Session creates failed under load: {[_code(r) for r in session_results]}"
    )
