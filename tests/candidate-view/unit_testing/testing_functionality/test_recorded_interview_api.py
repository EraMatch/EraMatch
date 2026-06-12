"""
Integration tests for the recorded video interview API (candidate side).

Covers:
  GET  /interview/config         → question list, time limits, instructions
  POST /interview/start          → session_id, question assignment
  POST /interview/response       → video upload, queued for processing
  GET  /interview/status/{id}    → per-question status, transcript when done
  POST /interview/complete       → marks session completed

Auth requirement:
  Candidate must have an active AI interview stage (status=unlocked).
  Provide credentials via env vars:
    TEST_CANDIDATE_USERNAME=<username>  TEST_CANDIDATE_PASSWORD=<password>

Requires: backend at http://localhost:8000
"""
import os
import io
import uuid
import httpx
import pytest

BASE_URL = "http://localhost:8000/api/v1"

_ENV_USERNAME = os.environ.get("TEST_CANDIDATE_USERNAME", "")
_ENV_PASSWORD = os.environ.get("TEST_CANDIDATE_PASSWORD", "")


# ─────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def iv_client():
    """Authenticated candidate client — skips if no credentials."""
    if not _ENV_USERNAME or not _ENV_PASSWORD:
        pytest.skip(
            "Set TEST_CANDIDATE_USERNAME + TEST_CANDIDATE_PASSWORD to run interview tests."
        )
    with httpx.Client(base_url=BASE_URL, timeout=30.0) as raw:
        r = raw.post("/candidate/login", json={"username": _ENV_USERNAME, "password": _ENV_PASSWORD})
        if r.status_code != 200:
            pytest.skip(f"Interview candidate login failed: {r.status_code}: {r.text[:200]}")
        token = r.json().get("access_token") or r.json().get("token")

    with httpx.Client(
        base_url=BASE_URL,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        timeout=30.0,
    ) as c:
        yield c


@pytest.fixture(scope="module")
def iv_config(iv_client):
    """Fetch interview config — skips if no active AI interview stage."""
    r = iv_client.get("/interview/config")
    if r.status_code == 404:
        pytest.skip("No active AI interview stage for this candidate.")
    assert r.status_code == 200, f"Interview config failed: {r.text}"
    return r.json()


@pytest.fixture(scope="module")
def iv_session(iv_client, iv_config):
    """Start an interview session — returns the session payload."""
    progress_id = iv_config.get("progress_id")
    config_id = iv_config.get("config_id") or iv_config.get("interview_config_id")
    r = iv_client.post("/interview/start", json={
        "progress_id": progress_id,
        "config_id": config_id,
    })
    assert r.status_code == 200, f"Interview start failed: {r.text}"
    return r.json()


def _make_dummy_video() -> bytes:
    """Return a small valid-looking video bytes blob for upload testing."""
    # 1-second silent WebM header (real enough for endpoint to accept)
    # Using a minimal byte sequence; the endpoint stores it without decoding.
    return b"\x1a\x45\xdf\xa3" + b"\x00" * 512  # WebM magic bytes + padding


# ─────────────────────────────────────────────────────────
# Test 1 — Config shape
# ─────────────────────────────────────────────────────────

class TestInterviewConfigShape:
    def test_config_has_questions(self, iv_config):
        qs = iv_config.get("questions") or []
        assert len(qs) >= 1, f"No questions in interview config: {iv_config}"

    def test_config_has_time_limit(self, iv_config):
        has_limit = (
            "time_limit_per_question" in iv_config
            or "total_time_limit" in iv_config
            or "duration_minutes" in iv_config
        )
        assert has_limit, f"No time limit in config: {list(iv_config.keys())}"

    def test_each_question_has_id(self, iv_config):
        for q in iv_config.get("questions", []):
            qid = q.get("question_id") or q.get("id")
            assert qid, f"Question missing id: {q}"

    def test_each_question_has_text(self, iv_config):
        for q in iv_config.get("questions", []):
            text = q.get("question_text") or q.get("text") or q.get("questionText")
            assert text, f"Question missing text: {q}"

    def test_rubric_sent_to_candidate_if_present(self, iv_config):
        """If rubric checks are configured, they should appear in config for candidate context."""
        for q in iv_config.get("questions", []):
            rubric = q.get("rubric_criteria") or q.get("rubricCriteria") or []
            # Not required — just ensure it's a list if present
            assert isinstance(rubric, list), f"rubric_criteria is not a list: {rubric}"


# ─────────────────────────────────────────────────────────
# Test 2 — Start session
# ─────────────────────────────────────────────────────────

class TestStartInterviewSession:
    def test_start_returns_session_id(self, iv_session):
        sid = iv_session.get("session_id")
        assert sid, f"No session_id in start response: {iv_session}"
        assert len(str(sid)) >= 32

    def test_start_idempotent(self, iv_client, iv_config):
        """Starting twice should return same session_id (resume)."""
        progress_id = iv_config.get("progress_id")
        config_id = iv_config.get("config_id") or iv_config.get("interview_config_id")
        r1 = iv_client.post("/interview/start", json={"progress_id": progress_id, "config_id": config_id})
        r2 = iv_client.post("/interview/start", json={"progress_id": progress_id, "config_id": config_id})
        assert r1.status_code == 200
        assert r2.status_code == 200
        assert r1.json().get("session_id") == r2.json().get("session_id")


# ─────────────────────────────────────────────────────────
# Test 3 — Submit video response (multipart upload)
# ─────────────────────────────────────────────────────────

class TestSubmitVideoResponse:
    def _first_question(self, iv_config):
        qs = iv_config.get("questions", [])
        if not qs:
            return None, None
        q = qs[0]
        return str(q.get("question_id") or q.get("id")), q.get("question_text") or q.get("text", "")

    def test_submit_video_returns_200(self, iv_client, iv_config, iv_session):
        sid = iv_session["session_id"]
        qid, qtext = self._first_question(iv_config)
        if not qid:
            pytest.skip("No question to submit response for")
        video_bytes = _make_dummy_video()
        r = iv_client.post(
            "/interview/response",
            content=None,
            data={
                "session_id": str(sid),
                "question_id": qid,
                "question_text": qtext or "Test question",
            },
            files={"video": ("test.webm", io.BytesIO(video_bytes), "video/webm")},
            headers={},  # reset content-type so httpx sets multipart boundary
        )
        assert r.status_code == 200, f"Video submit failed: {r.status_code}: {r.text}"

    def test_submit_video_response_has_response_id(self, iv_client, iv_config, iv_session):
        sid = iv_session["session_id"]
        qid, qtext = self._first_question(iv_config)
        if not qid:
            pytest.skip("No question")
        video_bytes = _make_dummy_video()
        r = iv_client.post(
            "/interview/response",
            data={
                "session_id": str(sid),
                "question_id": qid,
                "question_text": qtext or "Test question",
            },
            files={"video": ("test.webm", io.BytesIO(video_bytes), "video/webm")},
            headers={},
        )
        data = r.json()
        rid = data.get("response_id") or data.get("id")
        assert rid, f"No response_id in submit response: {list(data.keys())}"

    def test_submit_missing_video_returns_422(self, iv_client, iv_session):
        sid = iv_session["session_id"]
        # No files — multipart with no video
        r = iv_client.post(
            "/interview/response",
            data={"session_id": str(sid), "question_id": str(uuid.uuid4()), "question_text": "X"},
            headers={},
        )
        assert r.status_code in (400, 422), f"Expected error without video file: {r.status_code}"


# ─────────────────────────────────────────────────────────
# Test 4 — Status polling
# ─────────────────────────────────────────────────────────

class TestStatusPolling:
    def test_status_returns_200(self, iv_client, iv_session):
        sid = iv_session["session_id"]
        r = iv_client.get(f"/interview/status/{sid}")
        assert r.status_code == 200, f"Status failed: {r.text}"

    def test_status_has_responses_list(self, iv_client, iv_session):
        sid = iv_session["session_id"]
        r = iv_client.get(f"/interview/status/{sid}")
        data = r.json()
        responses = data.get("responses") or data.get("question_statuses") or []
        assert isinstance(responses, list), f"responses not a list: {data}"

    def test_status_response_has_status_field(self, iv_client, iv_session):
        sid = iv_session["session_id"]
        r = iv_client.get(f"/interview/status/{sid}")
        data = r.json()
        responses = data.get("responses") or data.get("question_statuses") or []
        for resp in responses:
            status = resp.get("status") or resp.get("processing_status")
            assert status in ("pending", "processing", "completed", "failed", None), \
                f"Unknown status value: {status}"

    def test_status_unknown_session_returns_404(self, iv_client):
        fake_sid = str(uuid.uuid4())
        r = iv_client.get(f"/interview/status/{fake_sid}")
        assert r.status_code == 404, f"Expected 404 for unknown session: {r.status_code}"

    def test_completed_response_has_transcript_field(self, iv_client, iv_session):
        """When status=completed, transcript and ai_score should be present (may be null)."""
        sid = iv_session["session_id"]
        r = iv_client.get(f"/interview/status/{sid}")
        data = r.json()
        responses = data.get("responses") or data.get("question_statuses") or []
        for resp in responses:
            if (resp.get("status") or resp.get("processing_status")) == "completed":
                assert "transcript" in resp, f"Completed response missing transcript: {resp}"
                assert "ai_score" in resp or "score" in resp, f"Completed response missing score: {resp}"


# ─────────────────────────────────────────────────────────
# Test 5 — Complete session
# ─────────────────────────────────────────────────────────

class TestCompleteSession:
    def test_complete_returns_200(self, iv_client, iv_session):
        sid = iv_session["session_id"]
        r = iv_client.post("/interview/complete", json={"session_id": str(sid)})
        assert r.status_code == 200, f"Complete failed: {r.text}"

    def test_complete_response_has_session_status(self, iv_client, iv_session):
        sid = iv_session["session_id"]
        r = iv_client.post("/interview/complete", json={"session_id": str(sid)})
        data = r.json()
        has_status = "status" in data or "session_status" in data or "message" in data
        assert has_status, f"Complete response missing status: {list(data.keys())}"

    def test_complete_idempotent(self, iv_client, iv_session):
        """Completing twice should not 500."""
        sid = iv_session["session_id"]
        r = iv_client.post("/interview/complete", json={"session_id": str(sid)})
        assert r.status_code in (200, 400, 409), \
            f"Unexpected status on double complete: {r.status_code}: {r.text}"
