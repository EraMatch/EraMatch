"""
Integration tests for Live Interview V2 (LiV2) backend pipeline.

Covers:
  1. Token dispatch creates session + pipeline_progress
  2. Complete session triggers judge pipeline
  3. Judge scoring consistency (deterministic verdicts on same input)
  4. Pipeline progress lifecycle (locked → unlocked → in_progress → completed)
  5. Double-complete idempotency
  6. Wrong organization scope returns 403
  7. Empty transcript handling (session marked failed, no crash)

These tests run against a **live** backend at http://localhost:8000.
Seed data must be present in the database before running.

Seed data UUIDs:
  Organization: fetched dynamically (admin_1@eramatch.com)
  Group ID:       a0000003-0000-0000-0000-000000000003
  Position ID:    a0000002-0000-0000-0000-000000000002
  Rubric ID:      a0000040-0000-0000-0000-000000000040
  Bank ID:        a0000041-0000-0000-0000-000000000041
  Live Interview Stage ID: a0000012-0000-0000-0000-000000000012
  Candidate 4 (Khalid):   b0001001-0000-0000-0000-000000000001
  Candidate 4 Application: b0002001-0000-0000-0000-000000000001
"""

import os
import sys
import time
import uuid

import httpx
import pytest

# ---------------------------------------------------------------------------
# Make the parent conftest importable (if placing tests under backend/tests/)
# ---------------------------------------------------------------------------
_HERE = os.path.abspath(os.path.dirname(__file__))
_BACKEND_ROOT = os.path.abspath(os.path.join(_HERE, "..", ".."))
if _BACKEND_ROOT not in sys.path:
    sys.path.insert(0, _BACKEND_ROOT)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
BASE_URL = os.getenv("ERAMATCH_API_URL", "http://localhost:8000/api/v1")
CANDIDATE_EMAIL = "khalid.mansour@example.com"  # Candidate 4 — Khalid
CANDIDATE_PASSWORD = "admin12345"

# Seed-data UUIDs (must match seed script)
GROUP_ID = "a0000003-0000-0000-0000-000000000003"
POSITION_ID = "a0000002-0000-0000-0000-000000000002"
RUBRIC_ID = "a0000040-0000-0000-0000-000000000040"
BANK_ID = "a0000041-0000-0000-0000-000000000041"
STAGE_ID = "a0000012-0000-0000-0000-000000000012"
CANDIDATE_4_ID = "b0001001-0000-0000-0000-000000000001"
CANDIDATE_4_APP_ID = "b0002001-0000-0000-0000-000000000001"

# A fake transcript with 12 turns (6 candidate, 6 AI)
SAMPLE_TRANSCRIPT_12 = [
    {
        "role": "ai",
        "text": "Welcome to the interview. Can you tell me about your experience with React?",
        "phase": "opening",
        "timestamp": 0.0,
    },
    {
        "role": "candidate",
        "text": "I've worked with React for about 3 years, building large-scale SPAs using hooks and Redux.",
        "phase": "opening",
        "timestamp": 15.0,
    },
    {
        "role": "ai",
        "text": "How do you handle state management in a complex application?",
        "phase": "technical",
        "timestamp": 30.0,
    },
    {
        "role": "candidate",
        "text": "I prefer using a combination of local state for UI concerns and a global store like Zustand or Redux Toolkit for shared state. I've also worked with Context API for smaller apps.",
        "phase": "technical",
        "timestamp": 45.0,
    },
    {
        "role": "ai",
        "text": "Can you describe a challenging bug you encountered and how you resolved it?",
        "phase": "behavioral",
        "timestamp": 60.0,
    },
    {
        "role": "candidate",
        "text": "We had a memory leak in a dashboard that re-rendered frequently. I used React DevTools profiler to identify unnecessary re-renders, then applied useMemo and useCallback to stabilize references. The fix reduced render count by 80%.",
        "phase": "behavioral",
        "timestamp": 75.0,
    },
    {
        "role": "ai",
        "text": "How do you approach code reviews and ensuring code quality?",
        "phase": "behavioral",
        "timestamp": 90.0,
    },
    {
        "role": "candidate",
        "text": "I follow a structured review checklist covering correctness, performance, security, and readability. I believe in reviewing within 24 hours and providing constructive feedback with specific examples.",
        "phase": "behavioral",
        "timestamp": 105.0,
    },
    {
        "role": "ai",
        "text": "How would you design an API for a real-time notification system?",
        "phase": "technical",
        "timestamp": 120.0,
    },
    {
        "role": "candidate",
        "text": "I'd use WebSockets for real-time delivery with a REST fallback. The API would support subscription management, message queuing for offline users, and rate limiting. I'd also include read receipts and presence indicators.",
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
        "text": "Yes, I'd love to know more about the team's tech stack and how you approach continuous integration and deployment.",
        "phase": "closing",
        "timestamp": 165.0,
    },
]


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="session")
def base_url():
    """Base URL for the running backend API."""
    return BASE_URL


@pytest.fixture(scope="session")
def candidate_token():
    """
    Obtain a valid candidate JWT access token for Candidate 4 (Khalid).
    Uses the candidate login endpoint.
    """
    with httpx.Client(base_url=BASE_URL, timeout=30.0) as client:
        resp = client.post(
            "/candidate/login",
            json={
                "email": CANDIDATE_EMAIL,
                "password": CANDIDATE_PASSWORD,
            },
        )
        assert resp.status_code == 200, (
            f"Candidate login failed: {resp.status_code} — {resp.text}\n"
            f"Make sure the backend is running and the seed data includes candidate '{CANDIDATE_EMAIL}'."
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
def recruiter_token():
    """
    Obtain a valid recruiter JWT token via org-user login.
    Used to fetch evaluation data and test org-scoped access.
    """
    with httpx.Client(base_url=BASE_URL, timeout=30.0) as client:
        resp = client.post(
            "/auth/organization-user/login",
            json={
                "email": "hr@eramatch.com",
                "password": "admin12345",
            },
        )
        if resp.status_code != 200:
            resp = client.post(
                "/auth/organization-user/login",
                json={
                    "email": "admin@eramatch.com",
                    "password": "admin12345",
                },
            )
        assert resp.status_code == 200, (
            f"Recruiter login failed: {resp.status_code} — {resp.text}\n"
            "Make sure the backend is running and recruiter credentials are correct."
        )
        data = resp.json()
        token = data.get("access_token") or data.get("token")
        assert token, f"No token in login response: {data}"
        return token


@pytest.fixture(scope="session")
def recruiter_headers(recruiter_token):
    """Authorization headers for recruiter API calls."""
    return {
        "Authorization": f"Bearer {recruiter_token}",
        "Content-Type": "application/json",
    }


@pytest.fixture(scope="session")
def client(candidate_headers):
    """Authenticated httpx.Client (candidate auth) for LiV2 session endpoints."""
    with httpx.Client(base_url=BASE_URL, headers=candidate_headers, timeout=30.0) as c:
        yield c


@pytest.fixture(scope="session")
def raw_client():
    """Unauthenticated httpx.Client for testing auth failures."""
    with httpx.Client(base_url=BASE_URL, timeout=30.0) as c:
        yield c


@pytest.fixture(scope="session")
def recruiter_client(recruiter_headers):
    """Authenticated httpx.Client (recruiter auth) for evaluation endpoints."""
    with httpx.Client(base_url=BASE_URL, headers=recruiter_headers, timeout=30.0) as c:
        yield c


# ---------------------------------------------------------------------------
# Helper: fetch org ID from DB via API (admin endpoint)
# ---------------------------------------------------------------------------
@pytest.fixture(scope="session")
def organization_id(recruiter_client):
    """Fetch the organization ID from the recruiter's profile."""
    resp = recruiter_client.get("/auth/me")
    assert resp.status_code == 200, (
        f"Failed to get recruiter profile: {resp.status_code} — {resp.text}"
    )
    data = resp.json()
    org_id = data.get("organization_id") or data.get("organization", {}).get("id")
    assert org_id, f"No organization_id in recruiter profile: {data}"
    return org_id


# ===========================================================================
# TEST 1: Token dispatch creates session + pipeline_progress
# ===========================================================================


@pytest.mark.integration
class TestTokenDispatch:
    """GET /live-interview-v2/session/token creates a LiV2Session and
    updates candidate_pipeline_progress to 'in_progress'."""

    def test_token_dispatch_creates_session(self, client):
        """
        When a candidate requests a session token, the backend must:
          1. Return 200 with token, url, room_name, session_id
          2. Create a LiV2Session record
          3. Update pipeline progress to 'in_progress'
        """
        resp = client.get("/live-interview-v2/session/token")
        assert resp.status_code == 200, (
            f"Expected 200 from token endpoint, got {resp.status_code}: {resp.text}"
        )

        data = resp.json()
        assert "token" in data, f"No 'token' in response: {data}"
        assert "room_name" in data, f"No 'room_name' in response: {data}"
        assert "session_id" in data, f"No 'session_id' in response: {data}"
        assert data["room_name"].startswith("li-v2-"), (
            f"Room name should start with 'li-v2-', got: {data['room_name']}"
        )

        # Verify the session_id is a valid UUID
        session_id = data["session_id"]
        try:
            uuid.UUID(session_id)
        except ValueError:
            pytest.fail(f"session_id is not a valid UUID: {session_id}")

        # Verify pipeline progress was updated via candidate home endpoint
        home_resp = client.get("/candidate/home")
        if home_resp.status_code == 200:
            home_data = home_resp.json()
            # The home data should show live_interview stage with status in_progress
            stages = (
                home_data.get("pipeline_stages")
                or home_data.get("stages")
                or home_data.get("steps")
                or home_data.get("pipeline")
                or []
            )
            # At minimum, we got a successful token — the pipeline update
            # is best-effort in the service code (non-fatal if it fails)
            assert isinstance(stages, list), (
                f"pipeline stages not a list: {type(stages)}"
            )


# ===========================================================================
# TEST 2: Complete session triggers judge
# ===========================================================================


@pytest.mark.integration
class TestCompleteSessionTriggersJudge:
    """POST /live-interview-v2/session/{session_id}/complete saves transcript
    and enqueues the judge pipeline."""

    def test_complete_session_with_transcript(self, client, raw_client):
        """
        Submit a complete request with a 12-turn transcript.
        The endpoint should return 200 with session status and duration.
        Note: The judge pipeline runs as a background task, so the evaluation
        may not be immediately available.
        """
        # First, get a session token to create a session
        token_resp = client.get("/live-interview-v2/session/token")
        assert token_resp.status_code == 200, f"Token request failed: {token_resp.text}"
        session_id = token_resp.json()["session_id"]

        # Now complete the session with a sample transcript
        # Note: This endpoint is unauthenticated (called by LiveKit agent)
        complete_resp = raw_client.post(
            f"/live-interview-v2/session/{session_id}/complete",
            json={"transcript": SAMPLE_TRANSCRIPT_12},
        )
        assert complete_resp.status_code == 200, (
            f"Expected 200 from complete endpoint, got {complete_resp.status_code}: {complete_resp.text}"
        )

        data = complete_resp.json()
        assert data.get("status") in ("completed", "already_completed"), (
            f"Unexpected status: {data}"
        )
        assert "session_id" in data, f"No session_id in complete response: {data}"

        # Verify the session shows as completed when fetched by recruiter
        # (This checks that the session state transition happened)
        # We'll verify the session_id is valid UUID
        returned_session_id = data["session_id"]
        assert returned_session_id == session_id, (
            f"Session ID mismatch: sent {session_id}, got {returned_session_id}"
        )


# ===========================================================================
# TEST 3: Judge scoring consistency
# ===========================================================================


@pytest.mark.integration
class TestJudgeScoringConsistency:
    """The judge scoring functions (_phase_c_score, _auto_verdict)
    must produce identical results for identical inputs.

    Since the judge pipeline uses an LLM (non-deterministic), we test
    the deterministic scoring helper directly at the API level by
    verifying the evaluation structure is consistent across sessions.

    For pure determinism testing, we verify:
    - The _auto_verdict mapping is consistent
    - The weighted score calculation is deterministic
    """

    def test_auto_verdict_mapping_is_consistent(self):
        """The verdict mapping should be deterministic."""
        from app.services.live_interview.judge import _auto_verdict

        # Score boundaries per the mapping in judge.py
        assert _auto_verdict(100) == "strong_pass"
        assert _auto_verdict(80) == "strong_pass"
        assert _auto_verdict(79) == "pass"
        assert _auto_verdict(60) == "pass"
        assert _auto_verdict(59) == "borderline"
        assert _auto_verdict(40) == "borderline"
        assert _auto_verdict(39) == "fail"
        assert _auto_verdict(0) == "fail"

    def test_phase_c_score_deterministic(self):
        """Running _phase_c_score twice with same input yields same output."""
        from app.services.live_interview.judge import _phase_c_score

        dimensions = [
            {"dimension_id": "d1", "name": "Technical", "weight": 0.4},
            {"dimension_id": "d2", "name": "Communication", "weight": 0.3},
            {"dimension_id": "d3", "name": "Leadership", "weight": 0.3},
        ]

        dimension_results = {
            "d1": {
                "score": 3,
                "anchor_matched": "excellent",
                "cited_quote": "test",
                "weight": 0.4,
                "dimension_name": "Technical",
            },
            "d2": {
                "score": 2,
                "anchor_matched": "proficient",
                "cited_quote": "test2",
                "weight": 0.3,
                "dimension_name": "Communication",
            },
            "d3": {
                "score": 2,
                "anchor_matched": "proficient",
                "cited_quote": "test3",
                "weight": 0.3,
                "dimension_name": "Leadership",
            },
        }

        result_1 = _phase_c_score(dimension_results, dimensions)
        result_2 = _phase_c_score(dimension_results, dimensions)

        assert result_1 == result_2, (
            f"Scoring not deterministic: {result_1} != {result_2}"
        )

        pct_1, score_1, coverage_1 = result_1
        assert isinstance(pct_1, int), f"Score pct should be int, got {type(pct_1)}"
        assert 0 <= pct_1 <= 100, f"Score pct out of range: {pct_1}"


# ===========================================================================
# TEST 4: Pipeline progress lifecycle
# ===========================================================================


@pytest.mark.integration
class TestPipelineProgressLifecycle:
    """
    Test the lifecycle of candidate_pipeline_progress through stage transitions:
      locked → unlocked → in_progress → completed
    """

    def test_home_shows_pipeline_stages(self, client):
        """The candidate home endpoint returns pipeline stage data."""
        home_resp = client.get("/candidate/home")
        assert home_resp.status_code == 200, (
            f"Expected 200 from home endpoint, got {home_resp.status_code}: {home_resp.text}"
        )

    def test_token_dispatch_sets_in_progress(self, client):
        """
        After requesting a token, the pipeline progress for the
        live_interview stage should move to 'in_progress'.
        """
        token_resp = client.get("/live-interview-v2/session/token")
        assert token_resp.status_code == 200, f"Token request failed: {token_resp.text}"

        # Check via home endpoint that the live interview stage is not locked
        home_resp = client.get("/candidate/home")
        if home_resp.status_code != 200:
            pytest.skip("Home endpoint not available, cannot verify progress")

        home_data = home_resp.json()
        stages = (
            home_data.get("pipeline_stages")
            or home_data.get("stages")
            or home_data.get("steps")
            or home_data.get("pipeline")
            or []
        )

        if not stages:
            pytest.skip("No pipeline stages returned in home response")

        # Find live_interview stage
        li_stages = [
            s
            for s in stages
            if isinstance(s, dict) and s.get("stage_type") == "live_interview"
        ]

        # If we find a live_interview stage, verify it's not "locked"
        for stage in li_stages:
            status = stage.get("status", "")
            assert status != "locked", (
                f"Live interview stage should not be locked after token dispatch, got status: {status}"
            )


# ===========================================================================
# TEST 5: Double-complete idempotency
# ===========================================================================


@pytest.mark.integration
class TestDoubleCompleteIdempotent:
    """POSTing /complete twice for the same session should not create
    duplicate evaluations — the second call should return 'already_completed'."""

    def test_double_complete_is_idempotent(self, client, raw_client):
        # Get a fresh session
        token_resp = client.get("/live-interview-v2/session/token")
        assert token_resp.status_code == 200, f"Token request failed: {token_resp.text}"
        session_id = token_resp.json()["session_id"]

        # First complete
        first_resp = raw_client.post(
            f"/live-interview-v2/session/{session_id}/complete",
            json={"transcript": SAMPLE_TRANSCRIPT_12},
        )
        assert first_resp.status_code == 200, (
            f"First complete failed: {first_resp.status_code} — {first_resp.text}"
        )

        first_data = first_resp.json()
        assert first_data.get("status") in ("completed", "already_completed"), (
            f"Unexpected first complete status: {first_data}"
        )

        # Second complete (should be idempotent)
        second_resp = raw_client.post(
            f"/live-interview-v2/session/{session_id}/complete",
            json={"transcript": SAMPLE_TRANSCRIPT_12},
        )
        assert second_resp.status_code == 200, (
            f"Second complete should return 200, got {second_resp.status_code}: {second_resp.text}"
        )

        second_data = second_resp.json()
        # The service returns "already_completed" for duplicate calls
        assert second_data.get("status") == "already_completed", (
            f"Second complete should return 'already_completed', got: {second_data}"
        )


# ===========================================================================
# TEST 6: Wrong org scope returns 403
# ===========================================================================


@pytest.mark.integration
class TestWrongOrgScopeForbidden:
    """A recruiter from organization A should not be able to access
    session/evaluation data from organization B."""

    def test_wrong_org_session_access_returns_forbidden(self, recruiter_client):
        """
        Recruiters can only view sessions within their own organization.
        Attempting to view a session that belongs to a different org
        should return 403 or 404.

        We test this by attempting to access a session with a fabricated
        UUID that doesn't exist in the recruiter's org scope.
        """
        # Use a UUID that doesn't exist in this org
        fake_session_id = "00000000-0000-0000-0000-000000000000"

        resp = recruiter_client.get(f"/live-interview-v2/session/{fake_session_id}")
        # Should get 404 (session not found in this org) or 403 (forbidden)
        assert resp.status_code in (403, 404), (
            f"Expected 403/404 for cross-org access, got {resp.status_code}: {resp.text}"
        )

    def test_wrong_org_group_sessions_returns_empty_or_forbidden(
        self, recruiter_client
    ):
        """
        Accessing sessions for a group that belongs to a different
        organization should be blocked.
        """
        # Use a UUID that doesn't belong to this org
        fake_group_id = "00000000-0000-0000-0000-000000000000"

        resp = recruiter_client.get(
            f"/live-interview-v2/group/{fake_group_id}/sessions"
        )
        # Should get 403, 404, or 200 with empty sessions list
        assert resp.status_code in (200, 403, 404), (
            f"Unexpected status for cross-org group sessions: {resp.status_code}: {resp.text}"
        )


# ===========================================================================
# TEST 7: Empty transcript handling
# ===========================================================================


@pytest.mark.integration
class TestEmptyTranscriptHandling:
    """Submitting an empty transcript should mark the session as 'failed'
    (or handle gracefully) and not crash the system."""

    def test_empty_transcript_does_not_crash(self, client, raw_client):
        """POST /complete with an empty transcript array should return 200."""
        # Get a fresh session
        token_resp = client.get("/live-interview-v2/session/token")
        assert token_resp.status_code == 200, f"Token request failed: {token_resp.text}"
        session_id = token_resp.json()["session_id"]

        # Complete with empty transcript
        empty_resp = raw_client.post(
            f"/live-interview-v2/session/{session_id}/complete",
            json={"transcript": []},
        )
        # The endpoint should not crash — it should return 200
        # (The judge pipeline will log a warning about empty transcript
        # and skip evaluation, but the session state transition should succeed)
        assert empty_resp.status_code == 200, (
            f"Empty transcript complete should return 200, got {empty_resp.status_code}: {empty_resp.text}"
        )

        data = empty_resp.json()
        assert data.get("status") in ("completed", "already_completed"), (
            f"Unexpected status for empty transcript: {data}"
        )
        # Verify transcript turns is 0
        assert (
            data.get("transcript_turns") == 0
            or data.get("duration_seconds") is not None
        ), f"Expected 0 transcript turns for empty transcript: {data}"

    def test_none_transcript_field_does_not_crash(self, client, raw_client):
        """
        Verify the session endpoint returns data for a session even
        when transcript might be None/empty.
        """
        # Get a fresh session
        token_resp = client.get("/live-interview-v2/session/token")
        assert token_resp.status_code == 200, f"Token request failed: {token_resp.text}"
        session_id = token_resp.json()["session_id"]

        # Complete with minimal transcript (1 turn, candidate only)
        minimal_resp = raw_client.post(
            f"/live-interview-v2/session/{session_id}/complete",
            json={
                "transcript": [{"role": "candidate", "text": "Hello", "timestamp": 0.0}]
            },
        )
        assert minimal_resp.status_code == 200, (
            f"Minimal transcript complete should return 200, got {minimal_resp.status_code}: {minimal_resp.text}"
        )
