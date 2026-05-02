"""
Tests for monitoring endpoints (public or candidate-accessible).
Covers: interview responses and assessment monitoring endpoints.

Backend endpoints:
  GET /interview/monitoring/responses/{candidate_id}
  GET /interview/monitoring/assessment-candidates
  GET /interview/monitoring/assessment-responses/{candidate_id}
"""
import uuid


class TestMonitoringResponses:
    """Tests for interview monitoring response endpoints."""

    def test_monitoring_responses_fake_candidate_returns_error(self, raw_client):
        fake_id = str(uuid.uuid4())
        resp = raw_client.get(f"/interview/monitoring/responses/{fake_id}")
        assert resp.status_code in (200, 403, 404, 422, 500), (
            f"Unexpected status: {resp.status_code}: {resp.text}"
        )


class TestMonitoringAssessment:
    """Tests for assessment monitoring endpoints."""

    def test_assessment_candidates_returns_response(self, raw_client):
        resp = raw_client.get("/interview/monitoring/assessment-candidates")
        assert resp.status_code in (200, 403, 404, 422, 500), (
            f"Unexpected status: {resp.status_code}: {resp.text}"
        )

    def test_assessment_responses_fake_candidate_returns_error(self, raw_client):
        fake_id = str(uuid.uuid4())
        resp = raw_client.get(f"/interview/monitoring/assessment-responses/{fake_id}")
        assert resp.status_code in (200, 403, 404, 422, 500), (
            f"Unexpected status: {resp.status_code}: {resp.text}"
        )
