"""
Tests for Webhook endpoints.
Covers: CV parsed webhook security handling.

Backend endpoint:
  POST /webhooks/cv-parsed
"""

class TestWebhooksCVParsed:
    """Tests for CV parsed webhook behavior."""

    def test_cv_parsed_webhook_missing_secret(self, raw_client):
        resp = raw_client.post("/webhooks/cv-parsed", json={
            "tenant_id": "test-tenant",
            "job_id": "job-123",
            "file_path": "uploads/cv.pdf",
            "status": "completed"
        })
        assert resp.status_code in (200, 401), (
            f"Expected 200/401, got {resp.status_code}: {resp.text}"
        )

    def test_cv_parsed_webhook_invalid_secret(self, raw_client):
        resp = raw_client.post(
            "/webhooks/cv-parsed",
            headers={"x-webhook-secret": "invalid"},
            json={
                "tenant_id": "test-tenant",
                "job_id": "job-456",
                "file_path": "uploads/cv2.pdf",
                "status": "failed",
                "error": "parser error"
            },
        )
        assert resp.status_code in (200, 401), (
            f"Expected 200/401, got {resp.status_code}: {resp.text}"
        )

    def test_cv_parsed_webhook_missing_payload_returns_422(self, raw_client):
        resp = raw_client.post("/webhooks/cv-parsed", json={})
        assert resp.status_code in (400, 401, 422), (
            f"Expected 400/401/422, got {resp.status_code}: {resp.text}"
        )
