"""
Tests for Candidate Assessment flow.
Covers: config fetch, session start, MCQ/essay/code answers, submission.

Backend endpoints:
  GET  /assessment/config
  POST /assessment/start
  POST /assessment/answer
  POST /assessment/run-code
  POST /assessment/submit
"""
import pytest


class TestAssessmentConfig:
    """Test suite for GET /assessment/config."""

    def test_config_returns_200_or_404(self, client):
        """Assessment config returns 200 (active stage) or 404 (no stage)."""
        resp = client.get("/assessment/config")
        assert resp.status_code in (200, 404), (
            f"Expected 200 or 404, got {resp.status_code}: {resp.text}"
        )

    def test_config_has_assessment_id_if_200(self, client):
        """If 200, response contains assessment_id."""
        resp = client.get("/assessment/config")
        if resp.status_code == 200:
            data = resp.json()
            assert "assessment_id" in data, (
                f"No assessment_id in config: {list(data.keys())}"
            )

    def test_config_has_sections_if_200(self, client):
        """If 200, response contains sections or questions info."""
        resp = client.get("/assessment/config")
        if resp.status_code == 200:
            data = resp.json()
            has_sections = (
                "sections" in data
                or "questions" in data
                or "total_questions" in data
                or "question_count" in data
            )
            assert has_sections, (
                f"No sections/questions info in config: {list(data.keys())}"
            )

    def test_config_without_token_returns_error(self, raw_client):
        """GET /assessment/config without auth → error."""
        resp = raw_client.get("/assessment/config")
        assert resp.status_code in (401, 403, 422), (
            f"Expected auth error, got {resp.status_code}"
        )


class TestAssessmentSession:
    """Test suite for POST /assessment/start."""

    @pytest.fixture(scope="class")
    def assessment_config(self, client):
        """Fetch assessment config to determine if assessment is available."""
        resp = client.get("/assessment/config")
        if resp.status_code == 200:
            return resp.json()
        return None

    def test_start_session_returns_200_or_expected_error(self, client, assessment_config):
        """Start session returns 200 or 400/409 (already started)."""
        if assessment_config is None:
            pytest.skip("No active assessment stage — skipping session tests")
        
        assessment_id = assessment_config.get("assessment_id")
        stage_id = assessment_config.get("stage_id")
        resp = client.post("/assessment/start", json={
            "assessment_id": assessment_id,
            "stage_id": stage_id
        })
        assert resp.status_code in (200, 400, 409), (
            f"Expected 200/400/409, got {resp.status_code}: {resp.text}"
        )

    def test_session_has_session_id_if_200(self, client, assessment_config):
        """If session starts successfully, response has session_id."""
        if assessment_config is None:
            pytest.skip("No active assessment stage")
        
        assessment_id = assessment_config.get("assessment_id")
        stage_id = assessment_config.get("stage_id")
        resp = client.post("/assessment/start", json={
            "assessment_id": assessment_id,
            "stage_id": stage_id
        })
        if resp.status_code == 200:
            data = resp.json()
            assert "session_id" in data, (
                f"No session_id in start response: {list(data.keys())}"
            )

    def test_session_has_questions_if_200(self, client, assessment_config):
        """If session starts, response contains questions array."""
        if assessment_config is None:
            pytest.skip("No active assessment stage")

        assessment_id = assessment_config.get("assessment_id")
        stage_id = assessment_config.get("stage_id")
        resp = client.post("/assessment/start", json={
            "assessment_id": assessment_id,
            "stage_id": stage_id
        })
        if resp.status_code == 200:
            data = resp.json()
            has_questions = "questions" in data or "sections" in data
            assert has_questions, (
                f"No questions in start response: {list(data.keys())}"
            )


class TestAssessmentAnswers:
    """Test suite for POST /assessment/answer and /assessment/run-code."""

    def test_answer_invalid_session_returns_4xx(self, client):
        """Answering with a fake session_id should return 404 or 4xx."""
        resp = client.post("/assessment/answer", json={
            "session_id": "00000000-0000-0000-0000-000000000000",
            "question_id": "00000000-0000-0000-0000-000000000000",
            "answer": {"selected_option": 0}
        })
        assert resp.status_code in (400, 404, 422, 500), (
            f"Expected error on fake session, got {resp.status_code}"
        )

    def test_answer_without_token_returns_error(self, raw_client):
        """POST /assessment/answer without auth → error."""
        resp = raw_client.post("/assessment/answer", json={
            "session_id": "fake",
            "question_id": "fake",
            "answer": {"selected_option": 0}
        })
        assert resp.status_code in (401, 403, 422), (
            f"Expected auth error, got {resp.status_code}"
        )

    def test_run_code_returns_expected_shape(self, client):
        """POST /assessment/run-code returns expected fields or error."""
        resp = client.post("/assessment/run-code", json={
            "language": "python",
            "code": "print('hello')"
        })
        # Could be 200 (code ran) or 4xx/5xx (no active session)
        if resp.status_code == 200:
            data = resp.json()
            has_output = "stdout" in data or "output" in data or "status" in data
            assert has_output, f"No output in run-code: {list(data.keys())}"


class TestAssessmentSubmit:
    """Test suite for POST /assessment/submit."""

    def test_submit_invalid_session_returns_error(self, client):
        """Submitting a fake session should return error."""
        resp = client.post("/assessment/submit", json={
            "session_id": "00000000-0000-0000-0000-000000000000"
        })
        assert resp.status_code in (400, 404, 422, 500), (
            f"Expected error on fake session submit, got {resp.status_code}"
        )

    def test_submit_without_token_returns_error(self, raw_client):
        """POST /assessment/submit without auth → error."""
        resp = raw_client.post("/assessment/submit", json={
            "session_id": "fake"
        })
        assert resp.status_code in (401, 403, 422), (
            f"Expected auth error, got {resp.status_code}"
        )
