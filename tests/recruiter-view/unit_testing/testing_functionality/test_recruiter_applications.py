"""
Tests for Recruiter Applications functionality.
Covers: list applications with filters, update application status.

Backend endpoints:
  GET   /recruiter/applications
  PATCH /recruiter/applications/{id}
"""
import pytest
import uuid


class TestListApplications:
    """Tests for listing applications."""

    def test_list_applications_returns_200(self, client):
        """GET /recruiter/applications returns 200."""
        resp = client.get("/recruiter/applications")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    def test_list_applications_is_list(self, client):
        """Response is a JSON list."""
        resp = client.get("/recruiter/applications")
        data = resp.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"

    def test_application_has_required_fields(self, client):
        """Each application has an ID and status."""
        resp = client.get("/recruiter/applications")
        apps = resp.json()
        if not apps:
            pytest.skip("No applications available")
        for app in apps:
            has_id = any(k in app for k in ["id", "application_id"])
            has_status = "status" in app
            assert has_id, f"Application missing ID: {app}"
            assert has_status, f"Application missing status: {app}"

    def test_application_status_is_valid(self, client):
        """Application status values are recognized."""
        resp = client.get("/recruiter/applications")
        apps = resp.json()
        valid_statuses = {
            "applied", "screening", "in_pipeline", "rejected",
            "offered", "hired", "withdrawn", "on_hold"
        }
        for app in apps:
            status = app.get("status", "")
            assert status in valid_statuses, (
                f"Unexpected application status '{status}': {app}"
            )

    def test_list_applications_position_filter(self, client):
        """position_id filter param is accepted."""
        # Get a valid position_id
        pos_resp = client.get("/recruiter/positions")
        if pos_resp.status_code != 200 or not pos_resp.json():
            pytest.skip("No positions available")
        position_id = str(pos_resp.json()[0].get("id") or pos_resp.json()[0].get("position_id"))
        resp = client.get("/recruiter/applications", params={"position_id": position_id})
        assert resp.status_code == 200, f"Position filter failed: {resp.status_code}"

    def test_list_applications_status_filter(self, client):
        """Status filter param is accepted."""
        resp = client.get("/recruiter/applications", params={"status": "applied"})
        assert resp.status_code == 200, f"Status filter failed: {resp.status_code}"

    def test_list_applications_pagination(self, client):
        """Pagination params skip/limit are accepted."""
        resp = client.get("/recruiter/applications", params={"skip": 0, "limit": 5})
        assert resp.status_code == 200, f"Pagination failed: {resp.status_code}"


class TestUpdateApplication:
    """Tests for updating application status."""

    def test_update_nonexistent_application_returns_error(self, client):
        """PATCH application with fake UUID returns 404 or error."""
        fake_id = str(uuid.uuid4())
        resp = client.patch(f"/recruiter/applications/{fake_id}", json={
            "status": "screening"
        })
        assert resp.status_code in (404, 403, 422, 500), (
            f"Expected error for fake application, got {resp.status_code}"
        )
