"""
Full candidate submission flow simulation for coding questions.
Tests the complete path: start session → get question → run code → submit.

Requires:
- Backend running at http://localhost:8000
- At least one active assessment stage with a coding question
- Candidate credentials configured below
"""
import pytest
import httpx

BASE_URL = "http://localhost:8000/api/v1"
CANDIDATE_EMAIL = "candidate2@eramatch.com"
CANDIDATE_PASSWORD = "test123"


@pytest.fixture(scope="module")
def candidate_client():
    with httpx.Client(base_url=BASE_URL, timeout=30.0) as c:
        resp = c.post("/auth/candidate/login", json={
            "email": CANDIDATE_EMAIL, "password": CANDIDATE_PASSWORD
        })
        if resp.status_code != 200:
            pytest.skip(f"Candidate login failed ({resp.status_code}): {resp.text}")
        token = resp.json().get("access_token")
    return httpx.Client(
        base_url=BASE_URL,
        headers={"Authorization": f"Bearer {token}"},
        timeout=30.0,
    )


@pytest.fixture(scope="module")
def assessment_config(candidate_client):
    """Fetch assessment config — skip entire module if none available."""
    resp = candidate_client.get("/assessment/config")
    if resp.status_code != 200:
        pytest.skip("No active assessment — skipping submission simulation")
    return resp.json()


@pytest.fixture(scope="module")
def assessment_session(candidate_client, assessment_config):
    """Start or resume an assessment session."""
    start_resp = candidate_client.post("/assessment/start", json={
        "assessment_id": assessment_config["assessment_id"]
    })
    if start_resp.status_code not in (200, 409):
        pytest.skip(f"Could not start assessment: {start_resp.text}")
    data = start_resp.json()
    return data.get("session_id"), data.get("questions", [])


class TestCodingSubmissionSimulation:
    """Simulate a real candidate completing a coding question end-to-end."""

    def test_config_has_assessment_id(self, assessment_config):
        """GET /assessment/config returns expected shape."""
        assert "assessment_id" in assessment_config

    def test_coding_question_has_starter_code(self, assessment_config):
        """Coding questions in the config have starter_code in question_config."""
        sections = assessment_config.get("sections", [])
        coding_found = False
        for section in sections:
            for q in section.get("questions", []):
                if q.get("question_type") in ("code", "coding"):
                    cfg = q.get("question_config", {})
                    if cfg.get("starter_code"):
                        assert isinstance(cfg["starter_code"], str)
                        assert len(cfg["starter_code"]) > 0
                        coding_found = True
                        break
        if not coding_found:
            pytest.skip("No coding question with starter_code in active assessment")

    def test_session_starts_successfully(self, assessment_session):
        """Assessment session can be started and has a session_id."""
        session_id, questions = assessment_session
        assert session_id is not None
        assert isinstance(session_id, str)

    def test_run_tests_wrong_solution_returns_failures(self, candidate_client, assessment_session):
        """Submitting wrong code returns visible failures with got vs expected."""
        session_id, questions = assessment_session
        coding_qs = [q for q in questions if q.get("type") in ("coding", "code")]
        if not coding_qs:
            pytest.skip("No coding question in this assessment session")

        q = coding_qs[0]
        cfg = q.get("question_config", {})
        fn = cfg.get("function_name") or "solution"
        wrong_code = f"def {fn}(*args, **kwargs):\n    return None"

        resp = candidate_client.post("/assessment/run-tests", json={
            "session_id": session_id,
            "question_id": q["id"],
            "code": wrong_code,
            "language": "python",
        })
        if resp.status_code == 400 and "attempt" in resp.text.lower():
            pytest.skip("Max attempts already reached from prior test runs")
        assert resp.status_code == 200, f"run-tests failed: {resp.text}"
        data = resp.json()
        assert "visible_results" in data
        assert data["all_passed"] is False
        visible = data["visible_results"]
        assert len(visible) > 0
        failed = [r for r in visible if not r["passed"]]
        assert len(failed) > 0
        for f in failed:
            assert "actual" in f
            assert "expected" in f

    def test_hidden_tests_not_revealed_in_run_tests_response(self, candidate_client, assessment_session):
        """Hidden test inputs/outputs are NOT in visible_results."""
        session_id, questions = assessment_session
        coding_qs = [q for q in questions if q.get("type") in ("coding", "code")]
        if not coding_qs:
            pytest.skip("No coding question in this assessment session")

        q = coding_qs[0]
        cfg = q.get("question_config", {})
        fn = cfg.get("function_name") or "solution"
        all_tcs = cfg.get("test_cases", [])
        visible_tcs = [t for t in all_tcs if not t.get("is_hidden")]

        resp = candidate_client.post("/assessment/run-tests", json={
            "session_id": session_id,
            "question_id": q["id"],
            "code": f"def {fn}(*args, **kwargs): return None",
            "language": "python",
        })
        if resp.status_code == 400 and "attempt" in resp.text.lower():
            pytest.skip("Max attempts reached — cannot test hidden count")
        assert resp.status_code == 200
        data = resp.json()
        visible_count = len(data.get("visible_results", []))
        assert visible_count <= max(len(visible_tcs), 1), (
            "visible_results should not include hidden test cases"
        )

    def test_hidden_total_count_present(self, candidate_client, assessment_session):
        """run-tests response includes hidden_total count."""
        session_id, questions = assessment_session
        coding_qs = [q for q in questions if q.get("type") in ("coding", "code")]
        if not coding_qs:
            pytest.skip("No coding question in this assessment session")

        q = coding_qs[0]
        cfg = q.get("question_config", {})
        fn = cfg.get("function_name") or "solution"

        resp = candidate_client.post("/assessment/run-tests", json={
            "session_id": session_id,
            "question_id": q["id"],
            "code": f"def {fn}(*args, **kwargs): return None",
            "language": "python",
        })
        if resp.status_code == 400 and "attempt" in resp.text.lower():
            pytest.skip("Max attempts reached")
        assert resp.status_code == 200
        data = resp.json()
        assert "hidden_total" in data
        assert isinstance(data["hidden_total"], int)

    def test_submit_assessment_returns_score(self, candidate_client, assessment_session):
        """POST /assessment/submit completes with a score response."""
        session_id, _ = assessment_session
        resp = candidate_client.post("/assessment/submit", json={"session_id": session_id})
        # 200 = submitted, 400 = already submitted from previous run — both acceptable
        assert resp.status_code in (200, 400), f"Unexpected: {resp.text}"
        if resp.status_code == 200:
            data = resp.json()
            assert "total_score" in data or "percentage" in data

    def test_resubmit_after_completion_returns_400(self, candidate_client, assessment_session):
        """Re-submitting a completed assessment returns 400."""
        session_id, _ = assessment_session
        resp = candidate_client.post("/assessment/submit", json={"session_id": session_id})
        assert resp.status_code == 400
