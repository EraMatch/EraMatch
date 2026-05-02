"""
Tests for Recruiter CV Ingestion endpoints.
Covers: ZIP ingestion, drive schedule creation/cancel.

Backend endpoints:
  POST   /ingestion/zip
  POST   /ingestion/drive-schedule
  DELETE /ingestion/drive-schedule/{schedule_id}
"""
import uuid
import pytest


class TestCVIngestionZip:
    """Tests for ZIP ingestion endpoint."""

    def test_zip_upload_missing_file_returns_error(self, client):
        resp = client.post("/ingestion/zip")
        assert resp.status_code in (400, 422), (
            f"Expected 400/422, got {resp.status_code}: {resp.text}"
        )

    def test_zip_upload_unauthenticated_blocked(self, raw_client):
        resp = raw_client.post("/ingestion/zip")
        assert resp.status_code in (401, 403, 422), (
            f"Expected 401/403/422, got {resp.status_code}: {resp.text}"
        )


class TestDriveSchedule:
    """Tests for drive schedule endpoints."""

    def test_drive_schedule_missing_fields_returns_error(self, client):
        resp = client.post("/ingestion/drive-schedule")
        assert resp.status_code in (400, 422), (
            f"Expected 400/422, got {resp.status_code}: {resp.text}"
        )

    def test_cancel_drive_schedule_fake_id_returns_error(self, client):
        fake_id = str(uuid.uuid4())
        resp = client.delete(f"/ingestion/drive-schedule/{fake_id}")
        assert resp.status_code in (404, 422), (
            f"Expected 404/422, got {resp.status_code}: {resp.text}"
        )
