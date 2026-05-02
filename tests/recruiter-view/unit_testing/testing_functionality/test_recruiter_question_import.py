"""
Tests for Recruiter Question Import endpoints.
Covers: template download, preflight validation, job listing, and job actions.

Backend endpoints:
  GET  /questions/import/template
  POST /questions/import/preflight
  POST /questions/import/spreadsheet/preflight
  POST /questions/import
  GET  /questions/import/jobs
  GET  /questions/import/jobs/{job_id}/draft
  POST /questions/import/jobs/{job_id}/draft/refine
  POST /questions/import/jobs/{job_id}/approve
  GET  /questions/import/jobs/{job_id}/row-errors-report
"""
import uuid
import pytest


class TestQuestionImportTemplate:
    """Tests for template download."""

    def test_import_template_returns_csv(self, client):
        resp = client.get("/questions/import/template")
        assert resp.status_code == 200, (
            f"Expected 200, got {resp.status_code}: {resp.text}"
        )
        content_type = resp.headers.get("content-type", "")
        assert "text/csv" in content_type, (
            f"Expected CSV content-type, got {content_type}"
        )


class TestQuestionImportPreflight:
    """Tests for preflight validation endpoints."""

    def test_import_preflight_missing_file_returns_422(self, client):
        resp = client.post("/questions/import/preflight")
        assert resp.status_code in (400, 422), (
            f"Expected 400/422, got {resp.status_code}: {resp.text}"
        )

    def test_spreadsheet_preflight_missing_file_returns_422(self, client):
        resp = client.post("/questions/import/spreadsheet/preflight")
        assert resp.status_code in (400, 422), (
            f"Expected 400/422, got {resp.status_code}: {resp.text}"
        )

    def test_import_missing_payload_returns_422(self, client):
        resp = client.post("/questions/import", json={})
        assert resp.status_code in (400, 422), (
            f"Expected 400/422, got {resp.status_code}: {resp.text}"
        )


class TestQuestionImportJobs:
    """Tests for import job listing and actions."""

    def test_list_import_jobs_returns_200(self, client):
        resp = client.get("/questions/import/jobs")
        assert resp.status_code == 200, (
            f"Expected 200, got {resp.status_code}: {resp.text}"
        )

    def test_get_draft_for_fake_job_returns_error(self, client):
        fake_id = str(uuid.uuid4())
        resp = client.get(f"/questions/import/jobs/{fake_id}/draft")
        assert resp.status_code in (404, 409, 422), (
            f"Expected 404/409/422, got {resp.status_code}: {resp.text}"
        )

    def test_refine_draft_for_fake_job_returns_error(self, client):
        fake_id = str(uuid.uuid4())
        resp = client.post(f"/questions/import/jobs/{fake_id}/draft/refine", json={})
        assert resp.status_code in (404, 422), (
            f"Expected 404/422, got {resp.status_code}: {resp.text}"
        )

    def test_approve_fake_job_returns_error(self, client):
        fake_id = str(uuid.uuid4())
        resp = client.post(f"/questions/import/jobs/{fake_id}/approve", json={"questions": []})
        assert resp.status_code in (404, 422), (
            f"Expected 404/422, got {resp.status_code}: {resp.text}"
        )

    def test_row_errors_report_for_fake_job_returns_error(self, client):
        fake_id = str(uuid.uuid4())
        resp = client.get(f"/questions/import/jobs/{fake_id}/row-errors-report")
        assert resp.status_code in (404, 422), (
            f"Expected 404/422, got {resp.status_code}: {resp.text}"
        )
