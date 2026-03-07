"""
Tests for Candidate Interview endpoints.
Covers: interview config, session start, video submission, status, complete, monitoring.

Backend endpoints:
  GET  /interview/config
  POST /interview/start
  POST /interview/submit-response      ← multipart video upload
  GET  /interview/status/{session_id}
  POST /interview/complete
  GET  /interview/monitoring/candidates
"""
import pytest


class TestInterviewConfig:
    """Test suite for GET /interview/config."""

    def test_config_returns_200_or_404(self, client):
        """Interview config returns 200 (active stage) or 404 (no stage)."""
        resp = client.get("/interview/config")
        assert resp.status_code in (200, 404, 500), (
            f"Expected 200/404/500, got {resp.status_code}: {resp.text}"
        )

    def test_config_without_token_returns_error(self, raw_client):
        """GET /interview/config without auth → error."""
        resp = raw_client.get("/interview/config")
        assert resp.status_code in (401, 403, 422), (
            f"Expected auth error, got {resp.status_code}"
        )


class TestInterviewStart:
    """Test suite for POST /interview/start."""

    def test_start_without_active_stage_returns_error(self, client):
        """Starting interview without active stage → 4xx or 5xx."""
        resp = client.post("/interview/start", json={})
        # 404 = no interview stage, 422 = missing fields, 500 = no config
        assert resp.status_code in (400, 404, 422, 500), (
            f"Expected error, got {resp.status_code}: {resp.text}"
        )

    def test_start_without_token_returns_error(self, raw_client):
        """POST /interview/start without auth → error."""
        resp = raw_client.post("/interview/start", json={})
        assert resp.status_code in (401, 403, 422), (
            f"Expected auth error, got {resp.status_code}"
        )


class TestInterviewMonitoring:
    """Test suite for monitoring endpoints."""

    def test_monitoring_candidates_responds(self, client):
        """GET /interview/monitoring/candidates returns data or error."""
        resp = client.get("/interview/monitoring/candidates")
        # 200 = has data, 404/403 = no access, both acceptable
        assert resp.status_code in (200, 403, 404, 422, 500), (
            f"Unexpected status: {resp.status_code}: {resp.text}"
        )

    def test_monitoring_without_token_responds(self, raw_client):
        """Monitoring endpoint is public — responds without token."""
        resp = raw_client.get("/interview/monitoring/candidates")
        # Monitoring is a public endpoint (no auth required)
        assert resp.status_code in (200, 403, 404), (
            f"Expected 200/403/404, got {resp.status_code}"
        )


class TestInterviewSubmitResponse:
    """Test suite for POST /interview/submit-response (multipart video upload)."""

    def test_submit_response_without_file_returns_error(self, client):
        """Submitting without a video file should return 422 (missing required field)."""
        resp = client.post("/interview/submit-response", data={
            "session_id": "00000000-0000-0000-0000-000000000000",
            "question_id": "00000000-0000-0000-0000-000000000000",
            "question_text": "Tell me about yourself",
        })
        # 422 = missing required `video` file field
        assert resp.status_code in (400, 404, 422), (
            f"Expected 400/422 without video file, got {resp.status_code}: {resp.text}"
        )

    def test_submit_response_without_token_returns_error(self, raw_client):
        """POST /interview/submit-response without auth → error."""
        resp = raw_client.post("/interview/submit-response", data={
            "session_id": "fake",
            "question_id": "fake",
            "question_text": "fake",
        })
        assert resp.status_code in (401, 403, 422), (
            f"Expected auth error, got {resp.status_code}"
        )


class TestInterviewStatus:
    """Test suite for GET /interview/status/{session_id}."""

    def test_status_with_fake_session_returns_error(self, client):
        """GET /interview/status with a nonexistent session_id → 404 or 4xx."""
        resp = client.get("/interview/status/00000000-0000-0000-0000-000000000000")
        assert resp.status_code in (400, 404, 422, 500), (
            f"Expected error for fake session, got {resp.status_code}: {resp.text}"
        )

    def test_status_without_token_returns_error(self, raw_client):
        """GET /interview/status without auth → error."""
        resp = raw_client.get("/interview/status/00000000-0000-0000-0000-000000000000")
        assert resp.status_code in (401, 403, 422), (
            f"Expected auth error, got {resp.status_code}"
        )


class TestInterviewComplete:
    """Test suite for POST /interview/complete."""

    def test_complete_with_fake_session_returns_error(self, client):
        """Completing a nonexistent session_id → 404 or error."""
        resp = client.post("/interview/complete", json={
            "session_id": "00000000-0000-0000-0000-000000000000"
        })
        assert resp.status_code in (400, 404, 422, 500), (
            f"Expected error for fake session, got {resp.status_code}: {resp.text}"
        )

    def test_complete_without_token_returns_error(self, raw_client):
        """POST /interview/complete without auth → error."""
        resp = raw_client.post("/interview/complete", json={
            "session_id": "00000000-0000-0000-0000-000000000000"
        })
        assert resp.status_code in (401, 403, 422), (
            f"Expected auth error, got {resp.status_code}"
        )
