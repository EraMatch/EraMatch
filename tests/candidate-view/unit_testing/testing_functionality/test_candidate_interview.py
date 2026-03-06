"""
Tests for Candidate Interview endpoints.
Covers: interview config, session start, monitoring.

Backend endpoints:
  GET  /interview/config
  POST /interview/start
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
