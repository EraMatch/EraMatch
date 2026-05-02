"""
Tests for Debug endpoints.
Covers: read logs, read response logs, clear logs.

Backend endpoints:
  GET    /debug/video-processing
  GET    /debug/video-processing/{response_id}
  DELETE /debug/video-processing
"""
import uuid


class TestDebugVideoProcessing:
    """Tests for debug video processing logs."""

    def test_get_video_processing_logs_returns_200(self, client):
        resp = client.get("/debug/video-processing")
        assert resp.status_code == 200, (
            f"Expected 200, got {resp.status_code}: {resp.text}"
        )

    def test_get_video_processing_logs_for_fake_id_returns_200(self, client):
        fake_id = str(uuid.uuid4())
        resp = client.get(f"/debug/video-processing/{fake_id}")
        assert resp.status_code == 200, (
            f"Expected 200, got {resp.status_code}: {resp.text}"
        )

    def test_clear_video_processing_logs_returns_200(self, client):
        resp = client.delete("/debug/video-processing")
        assert resp.status_code == 200, (
            f"Expected 200, got {resp.status_code}: {resp.text}"
        )
