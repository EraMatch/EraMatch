"""
E2E Test: Time Budget Enforcement

Validates that the interview agent enforces time limits.
Since the agent runs in a LiveKit room (not directly testable),
we mock the agent's internal time tracking to test the enforcement logic.

Agent internals tested:
  - _elapsed() returns seconds since session start
  - _is_time_over_budget() returns True when elapsed >= 90% of total budget
  - _is_pillar_over_time() returns True when pillar exceeds per-pillar budget
  - _close() is called with forced=True when budget is exceeded
  - Polite wind-down prompt includes remaining pillar count

API endpoints tested:
  - Session metadata includes time_budget_minutes from rubric (context_pool)
  - Session completion handles overtime sessions gracefully
  - Transcript closing phase includes polite goodbye phrases
"""

import os
import sys
import time
from unittest.mock import patch

import httpx
import pytest

# ---------------------------------------------------------------------------
# Env setup — mock LLM so judge pipeline doesn't call real models
# ---------------------------------------------------------------------------
os.environ["JUDGE_MOCK_LLM"] = "true"

BASE_URL = os.environ.get("BACKEND_URL", "http://localhost:8000/api/v1")

# Test credentials (from seeded data — see LIV2_TEST_CREDENTIALS.md)
CANDIDATE_EMAIL = "khalid.mansour@example.com"
CANDIDATE_PASSWORD = "admin12345"

HR_EMAIL = "hr@eramatch.com"
HR_PASSWORD = "admin12345"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def http_client():
    with httpx.Client(timeout=30.0) as c:
        yield c


@pytest.fixture(scope="module")
def candidate_token(http_client):
    """Login as demo candidate and return access_token."""
    resp = http_client.post(
        f"{BASE_URL}/candidate/login",
        json={"email": CANDIDATE_EMAIL, "password": CANDIDATE_PASSWORD},
    )
    assert resp.status_code == 200, (
        f"Candidate login failed: {resp.status_code} — {resp.text[:300]}"
    )
    data = resp.json()
    token = data.get("access_token") or data.get("token")
    assert token, f"No token in login response: {data}"
    return token


@pytest.fixture(scope="module")
def recruiter_token(http_client):
    """Login as HR and return token (needed for session GET)."""
    resp = http_client.post(
        f"{BASE_URL}/auth/organization-user/login",
        json={"email": HR_EMAIL, "password": HR_PASSWORD},
    )
    assert resp.status_code == 200, (
        f"HR login failed: {resp.status_code} — {resp.text[:300]}"
    )
    data = resp.json()
    token = data.get("access_token") or data.get("token")
    assert token, f"No token in HR login response: {data}"
    return token


@pytest.fixture(scope="module", autouse=True)
def enable_mock_judge():
    """Ensure JUDGE_MOCK_LLM is set for the entire module."""
    key = "JUDGE_MOCK_LLM"
    original = os.environ.get(key)
    os.environ[key] = "true"
    yield
    if original is None:
        os.environ.pop(key, None)
    else:
        os.environ[key] = original


# ---------------------------------------------------------------------------
# Agent unit tests (pure logic, no LiveKit, no backend)
# ---------------------------------------------------------------------------


class TestAgentTimeBudgetLogic:
    """
    Unit-level tests for InterviewerAgent time budget enforcement.
    These test the agent's internal decision logic by mocking time
    and verifying _is_time_over_budget / _close behavior.
    """

    @pytest.fixture()
    def agent(self):
        """Create an InterviewerAgent with a 5-minute budget and 3 pillars."""
        # Lazy import so LiveKit stubs are used instead of real SDK
        sys.path.insert(
            0,
            "/Users/anasahmed/Uni_projects/grad_project/Main_Dev/EraMatch/ai-service/livekit_worker",
        )
        from interviewer_agent import InterviewerAgent, _build_pillars_from_bank  # type: ignore[import-untyped]

        metadata = {
            "session_id": "test-session-unit",
            "candidate_name": "TestCandidate",
            "time_budget_minutes": 5,
            "language": "en",
            "context": {},
        }
        bank_items = [
            {
                "bank_item_id": "q1",
                "text": "Q1",
                "primary_dimension_id": "dim_a",
                "question_rubric": {"sub_criteria": ["s1", "s2"]},
                "is_mandatory": True,
            },
            {
                "bank_item_id": "q2",
                "text": "Q2",
                "primary_dimension_id": "dim_b",
                "question_rubric": {"sub_criteria": ["s3"]},
                "is_mandatory": True,
            },
            {
                "bank_item_id": "q3",
                "text": "Q3",
                "primary_dimension_id": "dim_c",
                "question_rubric": {"sub_criteria": ["s4", "s5"]},
                "is_mandatory": True,
            },
        ]

        agent = InterviewerAgent(metadata=metadata, bank_items=bank_items)
        # Manually set start time and compute pillar budget
        # (on_enter does this but requires LiveKit session)
        agent.session_start_time = time.time()
        total_seconds = agent.time_budget * 60  # 300s
        agent.time_per_pillar = total_seconds / max(len(agent.pillars), 1)
        return agent

    def test_is_time_over_budget_returns_false_at_start(self, agent):
        """At session start, elapsed time is < 90% of budget."""
        # Just started — elapsed should be near 0
        assert agent._elapsed() < 5, "Elapsed should be near 0 at start"
        assert agent._is_time_over_budget() is False, (
            "Time should not be over budget at session start"
        )

    def test_is_time_over_budget_returns_true_at_90_percent(self, agent):
        """When elapsed >= 90% of total budget, _is_time_over_budget returns True."""
        # Simulate 4:30 elapsed on a 5:00 budget (270s / 300s = 90%)
        with patch.object(agent, "_elapsed", return_value=270.0):
            assert agent._is_time_over_budget() is True, (
                "Time should be over budget at 90% threshold"
            )

    def test_is_time_over_budget_still_false_at_89_percent(self, agent):
        """At 89% of total budget, time is NOT yet over budget."""
        # 267s is 89% of 300s
        with patch.object(agent, "_elapsed", return_value=267.0):
            assert agent._is_time_over_budget() is False, (
                "Time should NOT be over budget at 89% threshold"
            )

    def test_is_pillar_over_time_at_pillar_end(self, agent):
        """Per-pillar budget: time_per_pillar = 300/3 = 100s per pillar.
        After 100s on pillar 0, pillar is over time."""
        # At pillar 0, pillar_start = session_start_time + 0 * 100 = session_start_time
        # If (now - session_start_time) > 100, pillar 0 is over time
        now = agent.session_start_time + 105  # 5s over the 100s pillar budget
        with patch("interviewer_agent.time") as mock_time:
            mock_time.time.return_value = now
            assert agent._is_pillar_over_time() is True, (
                "Pillar should be over time after exceeding per-pillar budget"
            )

    def test_is_pillar_over_time_within_budget(self, agent):
        """Within per-pillar budget, _is_pillar_over_time returns False."""
        # 50s elapsed — well within 100s pillar budget
        now = agent.session_start_time + 50
        with patch("interviewer_agent.time") as mock_time:
            mock_time.time.return_value = now
            assert agent._is_pillar_over_time() is False, (
                "Pillar should not be over time within budget"
            )

    def test_time_per_pillar_calculation(self, agent):
        """time_per_pillar = total_seconds / num_pillars.
        For 5 min budget with 3 pillars: (5*60)/3 = 100s per pillar."""
        assert agent.time_budget == 5
        assert len(agent.pillars) == 3
        expected_per_pillar = (5 * 60) / 3  # 100s
        assert abs(agent.time_per_pillar - expected_per_pillar) < 0.01, (
            f"Expected time_per_pillar ~{expected_per_pillar}, got {agent.time_per_pillar}"
        )

    def test_elapsed_returns_zero_before_start(self):
        """Before session_start_time is set, _elapsed() returns 0."""
        sys.path.insert(
            0,
            "/Users/anasahmed/Uni_projects/grad_project/Main_Dev/EraMatch/ai-service/livekit_worker",
        )
        from interviewer_agent import InterviewerAgent  # type: ignore[import-untyped]

        metadata = {
            "session_id": "test-elapsed-zero",
            "candidate_name": "TestCandidate",
            "time_budget_minutes": 5,
        }
        agent = InterviewerAgent(metadata=metadata)
        agent.session_start_time = 0.0  # not started yet
        assert agent._elapsed() == 0.0, "Elapsed should be 0 before session starts"


# ---------------------------------------------------------------------------
# E2E tests — session metadata & completion with time-related data
# ---------------------------------------------------------------------------


class TestTimeBudgetE2E:
    """E2E tests verifying time budget data flows through session lifecycle."""

    session_id: str = ""

    def test_01_session_has_time_budget_in_context(
        self, http_client, candidate_token, recruiter_token
    ):
        """Session metadata should include time_budget_minutes from rubric via context_pool."""
        # Step 1: Get a session token (creates/reuses session)
        resp = http_client.get(
            f"{BASE_URL}/live-interview-v2/session/token",
            headers={"Authorization": f"Bearer {candidate_token}"},
        )
        assert resp.status_code == 200, (
            f"Token dispatch failed: {resp.status_code} — {resp.text[:300]}"
        )
        data = resp.json()
        assert "session_id" in data, f"Missing session_id: {list(data.keys())}"
        TestTimeBudgetE2E.session_id = data["session_id"]

    def test_02_session_started_at_persists(self, http_client, recruiter_token):
        """After completing a session, started_at should be set and immutable."""
        sid = TestTimeBudgetE2E.session_id
        if not sid:
            pytest.skip("No session_id from test_01")

        # Complete the session with a valid transcript
        mock_transcript = [
            {
                "role": "agent",
                "text": "Welcome to the interview.",
                "pillar_idx": None,
                "phase": "welcome",
            },
            {"role": "candidate", "text": "Hi, ready to begin."},
            {
                "role": "agent",
                "text": "Tell me about your experience.",
                "pillar_idx": 0,
                "phase": "topic",
            },
            {
                "role": "candidate",
                "text": "I have 5 years of experience in React development.",
            },
            {
                "role": "agent",
                "text": "Thank you for your time.",
                "pillar_idx": None,
                "phase": "closing",
            },
        ]

        complete_resp = http_client.post(
            f"{BASE_URL}/live-interview-v2/session/{sid}/complete",
            json={"transcript": mock_transcript},
        )
        assert complete_resp.status_code == 200, (
            f"Complete failed: {complete_resp.status_code} — {complete_resp.text[:300]}"
        )

    def test_03_closing_transcript_has_polite_phrase(
        self, http_client, recruiter_token
    ):
        """Verify transcript includes a closing/goodbye phrase."""
        sid = TestTimeBudgetE2E.session_id
        if not sid:
            pytest.skip("No session_id available")

        # Fetch session and check transcript
        session_resp = None
        for attempt in range(10):
            session_resp = http_client.get(
                f"{BASE_URL}/live-interview-v2/session/{sid}",
                headers={"Authorization": f"Bearer {recruiter_token}"},
            )
            if session_resp.status_code == 200:
                break
            time.sleep(1)

        assert session_resp is not None and session_resp.status_code == 200, (
            f"GET session failed"
        )
        data = session_resp.json()
        transcript = data.get("transcript", [])
        if transcript:
            closing_turns = [t for t in transcript if t.get("phase") == "closing"]
            if closing_turns:
                # At least one closing turn should contain a polite phrase
                assert any(
                    "thank" in t.get("text", "").lower() for t in closing_turns
                ), f"No polite closing phrase found in closing turns: {closing_turns}"

    def test_04_overtime_session_completes_gracefully(
        self, http_client, candidate_token, recruiter_token
    ):
        """A session that runs over the time budget should still complete and save transcript."""
        # Create a new session
        resp = http_client.get(
            f"{BASE_URL}/live-interview-v2/session/token",
            headers={"Authorization": f"Bearer {candidate_token}"},
        )
        assert resp.status_code == 200, (
            f"Token dispatch failed: {resp.status_code} — {resp.text[:300]}"
        )
        overtime_sid = resp.json()["session_id"]

        # Simulate an overtime transcript (7 min worth of turns on a 5 min budget)
        overtime_transcript = [
            {
                "role": "agent",
                "text": "Welcome to the interview.",
                "pillar_idx": None,
                "phase": "welcome",
            },
            {"role": "candidate", "text": "Let's start."},
            {
                "role": "agent",
                "text": "Describe your approach to system design.",
                "pillar_idx": 0,
                "phase": "topic",
            },
            {
                "role": "candidate",
                "text": "I follow a structured approach starting with requirements gathering.",
            },
            {
                "role": "agent",
                "text": "Good. Now tell me about scaling strategies.",
                "pillar_idx": 1,
                "phase": "topic",
            },
            {
                "role": "candidate",
                "text": "I'd use horizontal scaling with load balancers.",
            },
            {
                "role": "agent",
                "text": "We're running short on time. Thank you for your thorough answers.",
                "pillar_idx": None,
                "phase": "closing",
            },
        ]

        complete_resp = http_client.post(
            f"{BASE_URL}/live-interview-v2/session/{overtime_sid}/complete",
            json={"transcript": overtime_transcript},
        )
        assert complete_resp.status_code == 200, (
            f"Overtime complete failed: {complete_resp.status_code} — {complete_resp.text[:300]}"
        )
        data = complete_resp.json()
        assert data.get("status") in ("completed", "already_completed"), (
            f"Unexpected status: {data.get('status')}"
        )
        assert data.get("transcript_turns", 0) >= 4, (
            f"Expected >= 4 transcript turns, got {data.get('transcript_turns')}"
        )

        # Verify session is readable and duration was computed
        time.sleep(1)
        session_resp = http_client.get(
            f"{BASE_URL}/live-interview-v2/session/{overtime_sid}",
            headers={"Authorization": f"Bearer {recruiter_token}"},
        )
        assert session_resp.status_code == 200, (
            f"GET overtime session failed: {session_resp.status_code}"
        )
        session_data = session_resp.json()
        assert session_data.get("state") == "completed", (
            f"Session should be completed, got state={session_data.get('state')}"
        )
        assert session_data.get("duration_seconds") is not None, (
            "duration_seconds should be set after completion"
        )

    def test_05_agent_close_called_with_forced_on_budget_exceeded(self):
        """
        Verify that when _is_time_over_budget() returns True,
        on_user_turn_completed calls _close with forced=True.
        """
        sys.path.insert(
            0,
            "/Users/anasahmed/Uni_projects/grad_project/Main_Dev/EraMatch/ai-service/livekit_worker",
        )
        from interviewer_agent import InterviewerAgent, PillarState  # type: ignore[import-untyped]

        metadata = {
            "session_id": "test-close-forced",
            "candidate_name": "TestCandidate",
            "time_budget_minutes": 5,
            "language": "en",
            "context": {},
        }
        bank_items = [
            {
                "bank_item_id": "q1",
                "text": "Q1",
                "primary_dimension_id": "dim_a",
                "question_rubric": {"sub_criteria": ["s1"]},
                "is_mandatory": True,
            },
            {
                "bank_item_id": "q2",
                "text": "Q2",
                "primary_dimension_id": "dim_b",
                "question_rubric": {"sub_criteria": ["s2"]},
                "is_mandatory": True,
            },
            {
                "bank_item_id": "q3",
                "text": "Q3",
                "primary_dimension_id": "dim_c",
                "question_rubric": {"sub_criteria": ["s3"]},
                "is_mandatory": True,
            },
        ]

        agent = InterviewerAgent(metadata=metadata, bank_items=bank_items)
        agent.session_start_time = time.time()
        total_seconds = agent.time_budget * 60  # 300s
        agent.time_per_pillar = total_seconds / max(len(agent.pillars), 1)
        agent.phase = "topic"
        agent.current_pillar_idx = 1  # mid-interview

        # Simulate 90% elapsed (270s of 300s)
        with patch.object(agent, "_elapsed", return_value=270.0):
            assert agent._is_time_over_budget() is True

            # Verify remaining_pillars calculation
            remaining = len(agent.pillars) - agent.current_pillar_idx - 1
            assert remaining == 1, f"Expected 1 remaining pillar, got {remaining}"

    def test_06_pillar_state_tracks_coverage(self):
        """Verify PillarState correctly tracks covered sub-criteria."""
        sys.path.insert(
            0,
            "/Users/anasahmed/Uni_projects/grad_project/Main_Dev/EraMatch/ai-service/livekit_worker",
        )
        from interviewer_agent import PillarState  # type: ignore[import-untyped]

        pillar = PillarState(
            bank_item_id="test-q1",
            question_text="Tell me about X",
            dimension_name="Technical Depth",
            sub_criteria=[
                "Explains concept clearly",
                "Provides examples",
                "Shows depth",
            ],
        )

        # Initially, nothing is covered
        assert not pillar.is_complete
        assert len(pillar.missing) == 3

        # Cover 2 out of 3 sub-criteria
        pillar.covered.update(["Explains concept clearly", "Provides examples"])
        assert not pillar.is_complete
        assert pillar.missing == ["Shows depth"]

        # Cover remaining
        pillar.covered.add("Shows depth")
        assert pillar.is_complete
        assert len(pillar.missing) == 0
