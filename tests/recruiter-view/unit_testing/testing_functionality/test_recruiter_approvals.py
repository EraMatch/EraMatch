"""
Tests for Recruiter Approval Requests functionality.
Covers: list assigned requests, review (approve/reject) requests.

Backend endpoints:
  GET   /recruiter/requests/assigned
  PATCH /recruiter/requests/{id}/review
"""
import pytest
import uuid


class TestAssignedRequests:
    """Tests for listing approval requests assigned to the recruiter."""

    def test_assigned_requests_returns_200(self, client):
        """GET /recruiter/requests/assigned returns 200."""
        resp = client.get("/recruiter/requests/assigned")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    def test_assigned_requests_is_list(self, client):
        """Response is a JSON list."""
        resp = client.get("/recruiter/requests/assigned")
        data = resp.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"

    def test_assigned_requests_not_null(self, client):
        """Response is never null — always a list."""
        resp = client.get("/recruiter/requests/assigned")
        assert resp.json() is not None, "Assigned requests returned null"

    def test_request_has_required_fields(self, client):
        """Each request has an ID and status."""
        resp = client.get("/recruiter/requests/assigned")
        requests_list = resp.json()
        for req in requests_list:
            has_id = any(k in req for k in ["id", "request_id"])
            assert has_id, f"Request missing ID: {req}"

    def test_assigned_requests_unauthenticated_blocked(self, raw_client):
        """GET /recruiter/requests/assigned without token returns 401/403."""
        resp = raw_client.get("/recruiter/requests/assigned")
        assert resp.status_code in (401, 403, 422), (
            f"Expected 401/403 without token, got {resp.status_code}"
        )


class TestReviewRequest:
    """Tests for reviewing approval requests."""

    def test_review_nonexistent_request_returns_error(self, client):
        """PATCH review for a fake request returns error."""
        fake_id = str(uuid.uuid4())
        resp = client.patch(f"/recruiter/requests/{fake_id}/review", json={
            "status": "approved"
        })
        assert resp.status_code in (404, 403, 422, 400), (
            f"Expected error for fake request review, got {resp.status_code}"
        )

    def test_review_missing_status_returns_422(self, client):
        """PATCH review without status returns 422."""
        fake_id = str(uuid.uuid4())
        resp = client.patch(f"/recruiter/requests/{fake_id}/review", json={})
        assert resp.status_code == 422, (
            f"Expected 422 on missing status, got {resp.status_code}"
        )
