"""
E2E tests — Live Interview V2 Happy Path.

Validates the FULL LiV2 interview flow:
  1. Candidate login → access_token
  2. Session token dispatch → LiveKit JWT + session_id
  3. Session completion (POST /complete with transcript)
  4. Judge pipeline runs (mock LLM for speed)
  5. Evaluation produced with dimension_scores, per_question_results, cited quotes
  6. Recruiter can fetch results via session API

Requires:
  - Backend running at http://localhost:8000
  - Seeded test data (see LIV2_TEST_CREDENTIALS.md)
  - JUDGE_MOCK_LLM=true env var (set by conftest fixture)

Usage:
    JUDGE_MOCK_LLM=true pytest tests/e2e/test_live_interview_v2.py -v
"""

import os
import time

import httpx
import pytest

BASE_URL = os.environ.get("BACKEND_URL", "http://localhost:8000/api/v1")

CANDIDATE_4_EMAIL = "khalid.mansour@example.com"
CANDIDATE_4_PASSWORD = "admin12345"

HR_EMAIL = "hr@eramatch.com"
HR_PASSWORD = "admin12345"

GROUP_ID = "a0000003-0000-0000-0000-000000000003"

MOCK_TRANSCRIPT = [
    {
        "role": "agent",
        "text": "Hello Khalid! Welcome to your Live Interview for the Senior React Developer position. I'm your AI interviewer today. Are you ready to begin?",
        "pillar_idx": None,
        "phase": "welcome",
    },
    {
        "role": "candidate",
        "text": "Yes, absolutely! Happy to be here.",
        "pillar_idx": None,
        "phase": "welcome",
    },
    {
        "role": "agent",
        "text": "Great. Let's start with Technical Depth. Can you explain how React's reconciliation algorithm and virtual DOM diffing work under the hood?",
        "pillar_idx": 0,
        "phase": "topic",
    },
    {
        "role": "candidate",
        "text": "Sure. React maintains a virtual DOM — a lightweight JS representation of the real DOM. When state changes, it re-renders the virtual tree and diffs it against the previous snapshot using a heuristic O(n) algorithm. If root element types differ, it tears down and rebuilds. For same-type elements it updates only changed props. Keys on lists are critical to prevent unnecessary re-mounts.",
        "pillar_idx": 0,
        "phase": "topic",
    },
    {
        "role": "agent",
        "text": "Excellent. Now for Problem Solving — your API response times degrade under load. Walk me through your debugging and resolution approach.",
        "pillar_idx": 1,
        "phase": "topic",
    },
    {
        "role": "candidate",
        "text": "First I'd profile — Chrome DevTools for the network layer, checking TTFB and payload sizes. Then I'd look at server-side metrics: Datadog or CloudWatch for p95 latency spikes. Common culprits are N+1 queries, missing indexes, or heavy synchronous work on the main thread. I'd add pagination, caching with Redis for hot reads, and consider moving compute-heavy work to background tasks.",
        "pillar_idx": 1,
        "phase": "topic",
    },
    {
        "role": "agent",
        "text": "Thank you for your time, Khalid. That concludes our interview.",
        "pillar_idx": None,
        "phase": "closing",
    },
]


@pytest.fixture(scope="module")
def http_client():
    with httpx.Client(timeout=30.0) as c:
        yield c


@pytest.fixture(scope="module")
def candidate_token(http_client):
    resp = http_client.post(
        f"{BASE_URL}/candidate/login",
        json={"email": CANDIDATE_4_EMAIL, "password": CANDIDATE_4_PASSWORD},
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
    key = "JUDGE_MOCK_LLM"
    original = os.environ.get(key)
    os.environ[key] = "true"
    yield
    if original is None:
        os.environ.pop(key, None)
    else:
        os.environ[key] = original


class TestLiveInterviewV2HappyPath:
    """Full E2E happy path: login → token → complete → judge → evaluation."""

    session_id: str = ""

    def test_01_candidate_login(self, candidate_token):
        assert candidate_token, "Candidate must get a valid token"

    def test_02_session_token_dispatch(self, http_client, candidate_token):
        resp = http_client.get(
            f"{BASE_URL}/live-interview-v2/session/token",
            headers={"Authorization": f"Bearer {candidate_token}"},
        )
        assert resp.status_code == 200, (
            f"Token dispatch failed: {resp.status_code} — {resp.text[:300]}"
        )
        data = resp.json()
        assert "session_id" in data, (
            f"Missing session_id in response: {list(data.keys())}"
        )
        assert "token" in data, f"Missing LiveKit token in response"
        assert "room_name" in data, f"Missing room_name in response"
        assert data["room_name"].startswith("li-v2-"), (
            f"Unexpected room_name format: {data['room_name']}"
        )
        TestLiveInterviewV2HappyPath.session_id = data["session_id"]

    def test_03_complete_session(self, http_client):
        sid = TestLiveInterviewV2HappyPath.session_id
        assert sid, "Session ID must be set by test_02"

        resp = http_client.post(
            f"{BASE_URL}/live-interview-v2/session/{sid}/complete",
            json={"transcript": MOCK_TRANSCRIPT},
        )
        assert resp.status_code == 200, (
            f"Complete session failed: {resp.status_code} — {resp.text[:500]}"
        )
        data = resp.json()
        assert data.get("status") in ("completed", "already_completed"), (
            f"Unexpected status after completion: {data.get('status')}"
        )
        assert data.get("transcript_turns", 0) >= 4, (
            f"Expected at least 4 transcript turns, got {data.get('transcript_turns')}"
        )

    def test_04_judge_evaluation_produced(self, http_client, recruiter_token):
        sid = TestLiveInterviewV2HappyPath.session_id
        assert sid, "Session ID must be set by test_02"

        eval_data = None
        for _ in range(30):
            resp = http_client.get(
                f"{BASE_URL}/live-interview-v2/session/{sid}",
                headers={"Authorization": f"Bearer {recruiter_token}"},
            )
            assert resp.status_code == 200, f"GET session failed: {resp.status_code}"
            data = resp.json()
            evaluation = data.get("evaluation")
            if evaluation and evaluation.get("judged_at"):
                eval_data = evaluation
                break
            time.sleep(1)

        assert eval_data is not None, (
            "Judge pipeline did not produce evaluation within 30s"
        )

        assert "overall_score_pct" in eval_data, (
            f"Missing overall_score_pct: {list(eval_data.keys())}"
        )
        assert eval_data["overall_score_pct"] > 0, (
            f"Score must be > 0, got {eval_data['overall_score_pct']}"
        )

        assert "dimension_scores" in eval_data, "Missing dimension_scores in evaluation"
        dim_scores = eval_data["dimension_scores"]
        assert len(dim_scores) >= 2, (
            f"Expected >= 2 dimension scores, got {len(dim_scores)}"
        )

        assert "auto_verdict" in eval_data, "Missing auto_verdict"
        assert eval_data["auto_verdict"] in (
            "strong_pass",
            "pass",
            "borderline",
            "fail",
        ), f"Invalid verdict: {eval_data['auto_verdict']}"

        for dim_id, dim_data in dim_scores.items():
            assert "cited_quote" in dim_data, f"Dimension {dim_id} missing cited_quote"
            assert len(dim_data.get("cited_quote", "")) > 0, (
                f"Dimension {dim_id} has empty cited_quote"
            )
            assert "reasoning" in dim_data, f"Dimension {dim_id} missing reasoning"
            assert len(dim_data.get("reasoning", "")) > 0, (
                f"Dimension {dim_id} has empty reasoning"
            )
            assert "score" in dim_data, f"Dimension {dim_id} missing score"
            assert dim_data["score"] in (1, 2, 3), (
                f"Dimension {dim_id} has invalid score: {dim_data['score']}"
            )

        assert "per_question_results" in eval_data, "Missing per_question_results"
        pqr = eval_data["per_question_results"]
        if isinstance(pqr, dict):
            assert len(pqr) >= 1, "per_question_results dict is empty"
        elif isinstance(pqr, list):
            assert len(pqr) >= 1, "per_question_results list is empty"


class TestRecruiterSeesResults:
    """Recruiter can fetch evaluation results after judge completes."""

    def test_recruiter_session_results(self, http_client, recruiter_token):
        sid = TestLiveInterviewV2HappyPath.session_id
        if not sid:
            pytest.skip("No session_id available — run happy path tests first")

        resp = http_client.get(
            f"{BASE_URL}/live-interview-v2/session/{sid}",
            headers={"Authorization": f"Bearer {recruiter_token}"},
        )
        assert resp.status_code == 200
        data = resp.json()

        assert "evaluation" in data, "Missing evaluation key in session response"
        evaluation = data["evaluation"]
        assert evaluation is not None, "Evaluation should exist after judge completes"

        assert "dimension_scores" in evaluation
        assert "per_question_results" in evaluation
        assert "auto_verdict" in evaluation
        assert "overall_score_pct" in evaluation
        assert "judged_at" in evaluation

    def test_recruiter_group_sessions_list(self, http_client, recruiter_token):
        resp = http_client.get(
            f"{BASE_URL}/live-interview-v2/group/{GROUP_ID}/sessions",
            headers={"Authorization": f"Bearer {recruiter_token}"},
        )
        assert resp.status_code == 200
        data = resp.json()

        assert "sessions" in data, "Missing sessions key in group response"
        sessions = data["sessions"]
        assert isinstance(sessions, list), "sessions should be a list"
        assert len(sessions) > 0, "Group should have at least one session"

        completed = [s for s in sessions if s.get("state") == "completed"]
        assert len(completed) > 0, "At least one session should be completed"
