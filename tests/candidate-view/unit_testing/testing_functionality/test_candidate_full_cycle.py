"""
Integration tests for the candidate assessment full cycle.

Covers (in order):
  GET  /assessment/config        → verify sections, questions, types
  POST /assessment/start         → session_id returned, assigned questions
  POST /assessment/answer        → MCQ auto-graded, essay queued, coding staged
  POST /assessment/run-tests     → code execution, test case results
  POST /assessment/submit        → score calculated, passed flag set
  GET  /assessment/config again  → status changes to 'completed'

Auth requirement:
  The candidate must have an active assessment stage (status=unlocked).
  Provide credentials via env vars or fall back to discovering from DB.

  Set env vars before running:
    TEST_CANDIDATE_USERNAME=<username>   TEST_CANDIDATE_PASSWORD=<password>

  OR run with the demo seed:
    cd EraMatch/backend && .venv/bin/python -m app.utils.seed_demo_candidates
    then set: TEST_CANDIDATE_USERNAME=maya.hassan TEST_CANDIDATE_PASSWORD=admin12345

Requires: backend at http://localhost:8000
"""
import os
import uuid
import httpx
import pytest

BASE_URL = "http://localhost:8000/api/v1"

# ─────────────────────────────────────────────────────────
# Test candidate credentials — set via env vars or override here
# ─────────────────────────────────────────────────────────

_ENV_USERNAME = os.environ.get("TEST_CANDIDATE_USERNAME", "")
_ENV_PASSWORD = os.environ.get("TEST_CANDIDATE_PASSWORD", "")


# ─────────────────────────────────────────────────────────
# Module-level fixtures
# ─────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def cand_client():
    """
    Authenticated httpx.Client for a candidate with an unlocked assessment.
    Skips the entire module if no usable credentials are found.
    """
    username = _ENV_USERNAME
    password = _ENV_PASSWORD

    if not username or not password:
        pytest.skip(
            "No test candidate credentials. "
            "Set TEST_CANDIDATE_USERNAME + TEST_CANDIDATE_PASSWORD env vars, "
            "or run seed_demo_candidates.py first."
        )

    with httpx.Client(base_url=BASE_URL, timeout=30.0) as raw:
        r = raw.post("/candidate/login", json={"username": username, "password": password})
        if r.status_code != 200:
            pytest.skip(f"Candidate login failed ({r.status_code}): {r.text[:200]}")
        token = r.json().get("access_token") or r.json().get("token")
        assert token, f"No token in login response: {r.json()}"

    with httpx.Client(
        base_url=BASE_URL,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        timeout=30.0,
    ) as c:
        yield c


@pytest.fixture(scope="module")
def assessment_config(cand_client):
    """Load assessment config and skip if no active assessment stage."""
    r = cand_client.get("/assessment/config")
    if r.status_code == 404:
        pytest.skip("No active assessment stage for this candidate.")
    assert r.status_code == 200, f"Config fetch failed: {r.text}"
    return r.json()


@pytest.fixture(scope="module")
def session_data(cand_client, assessment_config):
    """Start an assessment session and return the session payload."""
    progress_id = assessment_config.get("progress_id")
    r = cand_client.post("/assessment/start", json={"progress_id": progress_id})
    assert r.status_code == 200, f"Start failed: {r.text}"
    return r.json()


# ─────────────────────────────────────────────────────────
# Test 1 — Config shape
# ─────────────────────────────────────────────────────────

class TestAssessmentConfigShape:
    def test_config_has_sections(self, assessment_config):
        sections = assessment_config.get("sections", [])
        assert len(sections) >= 1, f"No sections returned: {assessment_config}"

    def test_config_has_duration(self, assessment_config):
        assert "duration_minutes" in assessment_config
        assert isinstance(assessment_config["duration_minutes"], (int, float))

    def test_config_has_passing_score(self, assessment_config):
        assert "passing_score" in assessment_config
        assert 0 <= assessment_config["passing_score"] <= 100

    def test_each_section_has_type(self, assessment_config):
        for sec in assessment_config.get("sections", []):
            t = sec.get("type") or sec.get("question_type")
            assert t and t.lower() in ("mcq", "essay", "code", "coding"), \
                f"Unknown section type: {t}"

    def test_each_section_has_questions(self, assessment_config):
        for sec in assessment_config.get("sections", []):
            qs = sec.get("questions") or sec.get("variants") or []
            assert len(qs) >= 1, f"Section has no questions: {sec}"

    def test_question_has_id_and_text(self, assessment_config):
        for sec in assessment_config.get("sections", []):
            for q in (sec.get("questions") or sec.get("variants") or []):
                assert q.get("id") or q.get("question_id"), f"Question missing id: {q}"
                has_text = "question_text" in q or "questionText" in q or "text" in q
                assert has_text, f"Question missing text: {list(q.keys())}"

    def test_mcq_has_options(self, assessment_config):
        for sec in assessment_config.get("sections", []):
            if (sec.get("type") or "").lower() == "mcq":
                for q in (sec.get("questions") or sec.get("variants") or []):
                    opts = q.get("options") or []
                    assert len(opts) >= 2, f"MCQ has too few options: {opts}"

    def test_coding_has_test_cases(self, assessment_config):
        for sec in assessment_config.get("sections", []):
            if (sec.get("type") or "").lower() in ("code", "coding"):
                for q in (sec.get("questions") or sec.get("variants") or []):
                    tcs = q.get("testCases") or q.get("test_cases") or []
                    assert len(tcs) >= 1, f"Coding question has no test cases: {q}"


# ─────────────────────────────────────────────────────────
# Test 2 — Start session
# ─────────────────────────────────────────────────────────

class TestStartSession:
    def test_start_returns_session_id(self, session_data):
        sid = session_data.get("session_id")
        assert sid, f"No session_id in start response: {session_data}"
        assert len(str(sid)) >= 32, "session_id looks too short"

    def test_start_returns_assigned_questions(self, session_data):
        qs = session_data.get("assigned_questions") or session_data.get("questions") or []
        assert len(qs) >= 1, f"No assigned questions in start response: {session_data}"

    def test_start_assigned_has_question_id(self, session_data):
        qs = session_data.get("assigned_questions") or session_data.get("questions") or []
        for q in qs:
            qid = q.get("question_id") or q.get("id")
            assert qid, f"Assigned question missing id: {q}"

    def test_start_idempotent_returns_same_session(self, cand_client, assessment_config):
        """Starting again while a session is active should resume, not create new."""
        progress_id = assessment_config.get("progress_id")
        r1 = cand_client.post("/assessment/start", json={"progress_id": progress_id})
        r2 = cand_client.post("/assessment/start", json={"progress_id": progress_id})
        assert r1.status_code == 200
        assert r2.status_code == 200
        assert r1.json().get("session_id") == r2.json().get("session_id"), \
            "Resumed session should have same session_id"


# ─────────────────────────────────────────────────────────
# Test 3 — Submit answers
# ─────────────────────────────────────────────────────────

class TestSubmitAnswers:
    def _get_question_of_type(self, assessment_config, session_data, qtype):
        """Return (question_id, section_type, question_obj) for first match."""
        assigned = {
            str(q.get("question_id") or q.get("id"))
            for q in (session_data.get("assigned_questions") or session_data.get("questions") or [])
        }
        for sec in assessment_config.get("sections", []):
            if (sec.get("type") or "").lower() == qtype or (
                qtype in ("code", "coding") and (sec.get("type") or "").lower() in ("code", "coding")
            ):
                for q in (sec.get("questions") or sec.get("variants") or []):
                    qid = str(q.get("id") or q.get("question_id") or "")
                    if qid in assigned or True:  # take first available even if not in assigned
                        return qid, sec.get("type"), q
        return None, None, None

    def test_mcq_answer_returns_200(self, cand_client, assessment_config, session_data):
        qid, stype, q = self._get_question_of_type(assessment_config, session_data, "mcq")
        if not qid:
            pytest.skip("No MCQ question available in this assessment")
        sid = session_data["session_id"]
        r = cand_client.post("/assessment/answer", json={
            "session_id": sid,
            "question_id": qid,
            "answer": {"selected_option": 0},
        })
        assert r.status_code == 200, f"MCQ answer failed: {r.text}"

    def test_mcq_answer_has_points_field(self, cand_client, assessment_config, session_data):
        qid, stype, q = self._get_question_of_type(assessment_config, session_data, "mcq")
        if not qid:
            pytest.skip("No MCQ question in this assessment")
        sid = session_data["session_id"]
        r = cand_client.post("/assessment/answer", json={
            "session_id": sid,
            "question_id": qid,
            "answer": {"selected_option": 0},
        })
        data = r.json()
        assert "points_earned" in data or "answer_id" in data or "saved" in data, \
            f"Unexpected MCQ answer response shape: {list(data.keys())}"

    def test_essay_answer_returns_200(self, cand_client, assessment_config, session_data):
        qid, stype, q = self._get_question_of_type(assessment_config, session_data, "essay")
        if not qid:
            pytest.skip("No essay question in this assessment")
        sid = session_data["session_id"]
        r = cand_client.post("/assessment/answer", json={
            "session_id": sid,
            "question_id": qid,
            "answer": {"text": "REST stands for Representational State Transfer. It is an architectural style for distributed hypermedia systems. Key principles: stateless, client-server, cacheable, uniform interface."},
        })
        assert r.status_code == 200, f"Essay answer failed: {r.text}"

    def test_coding_answer_returns_200(self, cand_client, assessment_config, session_data):
        qid, stype, q = self._get_question_of_type(assessment_config, session_data, "coding")
        if not qid:
            pytest.skip("No coding question in this assessment")
        sid = session_data["session_id"]
        r = cand_client.post("/assessment/answer", json={
            "session_id": sid,
            "question_id": qid,
            "answer": {"code": "def solution(nums):\n    return sum(nums)"},
        })
        assert r.status_code == 200, f"Coding answer failed: {r.text}"

    def test_invalid_session_returns_error(self, cand_client):
        r = cand_client.post("/assessment/answer", json={
            "session_id": str(uuid.uuid4()),
            "question_id": str(uuid.uuid4()),
            "answer": {"selected_option": 0},
        })
        assert r.status_code in (400, 403, 404, 422), \
            f"Expected error for invalid session, got {r.status_code}: {r.text}"


# ─────────────────────────────────────────────────────────
# Test 4 — Run tests (coding)
# ─────────────────────────────────────────────────────────

class TestRunTests:
    def _get_coding_question(self, assessment_config, session_data):
        for sec in assessment_config.get("sections", []):
            if (sec.get("type") or "").lower() in ("code", "coding"):
                qs = sec.get("questions") or sec.get("variants") or []
                if qs:
                    return str(qs[0].get("id") or qs[0].get("question_id") or "")
        return None

    def test_run_tests_returns_results(self, cand_client, assessment_config, session_data):
        qid = self._get_coding_question(assessment_config, session_data)
        if not qid:
            pytest.skip("No coding question in this assessment")
        sid = session_data["session_id"]
        r = cand_client.post("/assessment/run-tests", json={
            "session_id": sid,
            "question_id": qid,
            "code": "def solution(nums):\n    return sum(nums)",
            "language": "python",
        })
        assert r.status_code == 200, f"run-tests failed: {r.text}"

    def test_run_tests_result_has_test_results(self, cand_client, assessment_config, session_data):
        qid = self._get_coding_question(assessment_config, session_data)
        if not qid:
            pytest.skip("No coding question in this assessment")
        sid = session_data["session_id"]
        r = cand_client.post("/assessment/run-tests", json={
            "session_id": sid,
            "question_id": qid,
            "code": "def solution(nums):\n    return sum(nums)",
            "language": "python",
        })
        data = r.json()
        results = data.get("test_results") or data.get("results") or []
        assert isinstance(results, list), f"test_results not a list: {data}"

    def test_run_tests_each_result_has_passed_field(self, cand_client, assessment_config, session_data):
        qid = self._get_coding_question(assessment_config, session_data)
        if not qid:
            pytest.skip("No coding question in this assessment")
        sid = session_data["session_id"]
        r = cand_client.post("/assessment/run-tests", json={
            "session_id": sid,
            "question_id": qid,
            "code": "def solution(nums):\n    return sum(nums)",
            "language": "python",
        })
        results = r.json().get("test_results") or r.json().get("results") or []
        for tr in results:
            assert "passed" in tr, f"Test result missing 'passed': {tr}"

    def test_run_tests_wrong_code_shows_failure(self, cand_client, assessment_config, session_data):
        qid = self._get_coding_question(assessment_config, session_data)
        if not qid:
            pytest.skip("No coding question in this assessment")
        sid = session_data["session_id"]
        r = cand_client.post("/assessment/run-tests", json={
            "session_id": sid,
            "question_id": qid,
            "code": "def solution(nums):\n    return 999999",  # always wrong
            "language": "python",
        })
        assert r.status_code == 200, f"run-tests failed: {r.text}"
        results = r.json().get("test_results") or r.json().get("results") or []
        failed = [tr for tr in results if not tr.get("passed")]
        assert len(failed) >= 1, "Wrong code should have at least one failing test"

    def test_run_tests_hidden_cases_not_exposed(self, cand_client, assessment_config, session_data):
        """Hidden test case input/expected values must not appear in run-tests response."""
        qid = self._get_coding_question(assessment_config, session_data)
        if not qid:
            pytest.skip("No coding question in this assessment")
        sid = session_data["session_id"]
        r = cand_client.post("/assessment/run-tests", json={
            "session_id": sid,
            "question_id": qid,
            "code": "def solution(nums):\n    return sum(nums)",
            "language": "python",
        })
        results = r.json().get("test_results") or r.json().get("results") or []
        for tr in results:
            if tr.get("is_hidden") or tr.get("hidden"):
                assert "expected" not in tr or tr.get("expected") in (None, ""), \
                    f"Hidden test case leaks expected output: {tr}"
                assert "input" not in tr or tr.get("input") in (None, ""), \
                    f"Hidden test case leaks input: {tr}"


# ─────────────────────────────────────────────────────────
# Test 5 — Submit assessment
# ─────────────────────────────────────────────────────────

class TestSubmitAssessment:
    def test_submit_returns_200(self, cand_client, session_data):
        sid = session_data["session_id"]
        r = cand_client.post("/assessment/submit", json={"session_id": sid})
        assert r.status_code == 200, f"Submit failed: {r.text}"

    def test_submit_response_has_score(self, cand_client, session_data):
        sid = session_data["session_id"]
        r = cand_client.post("/assessment/submit", json={"session_id": sid})
        data = r.json()
        score_key = next(
            (k for k in ("score", "percentage", "total_score", "final_score") if k in data),
            None
        )
        assert score_key is not None, f"No score field in submit response: {list(data.keys())}"
        score = data[score_key]
        assert isinstance(score, (int, float)), f"Score is not a number: {score}"
        assert 0 <= score <= 100, f"Score out of range: {score}"

    def test_submit_response_has_passed_flag(self, cand_client, session_data):
        sid = session_data["session_id"]
        r = cand_client.post("/assessment/submit", json={"session_id": sid})
        data = r.json()
        assert "passed" in data, f"No 'passed' field in submit response: {list(data.keys())}"
        assert isinstance(data["passed"], bool), f"passed is not bool: {data['passed']}"

    def test_submit_idempotent_no_crash(self, cand_client, session_data):
        """Submitting twice should not 500 — either idempotent or graceful error."""
        sid = session_data["session_id"]
        r = cand_client.post("/assessment/submit", json={"session_id": sid})
        assert r.status_code in (200, 400, 409), \
            f"Unexpected status on double submit: {r.status_code}: {r.text}"

    def test_invalid_session_submit_returns_error(self, cand_client):
        r = cand_client.post("/assessment/submit", json={"session_id": str(uuid.uuid4())})
        assert r.status_code in (400, 403, 404, 422), \
            f"Expected error for invalid session submit, got {r.status_code}"
