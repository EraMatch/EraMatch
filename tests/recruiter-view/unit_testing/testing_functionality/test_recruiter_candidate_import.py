"""
Tests for Recruiter Candidate Import functionality.
Covers: ZIP upload for candidate CVs, group creation from position.

Backend endpoints:
  POST /recruiter/positions/{id}/candidates/upload
  POST /recruiter/positions/{id}/groups
"""
import pytest
import uuid


class TestUploadCandidates:
    """Tests for uploading candidate ZIP files."""

    def _get_position_id(self, client):
        resp = client.get("/recruiter/positions")
        if resp.status_code != 200 or not resp.json():
            return None
        return str(resp.json()[0].get("id") or resp.json()[0].get("position_id"))

    def test_upload_without_file_returns_error(self, client):
        """POST upload without file returns 422."""
        position_id = self._get_position_id(client)
        if not position_id:
            pytest.skip("No positions available")
        resp = client.post(f"/recruiter/positions/{position_id}/candidates/upload")
        assert resp.status_code in (400, 422), (
            f"Expected 400/422 without file, got {resp.status_code}"
        )

    def test_upload_to_fake_position_returns_error(self, client):
        """POST upload to fake position returns error."""
        fake_id = str(uuid.uuid4())
        resp = client.post(f"/recruiter/positions/{fake_id}/candidates/upload")
        assert resp.status_code in (400, 404, 422), (
            f"Expected error for fake position upload, got {resp.status_code}"
        )


class TestCreatePositionGroup:
    """Tests for creating a candidate group for a position."""

    def _get_position_id(self, client):
        resp = client.get("/recruiter/positions")
        if resp.status_code != 200 or not resp.json():
            return None
        return str(resp.json()[0].get("id") or resp.json()[0].get("position_id"))

    def test_create_group_missing_fields_returns_422(self, client):
        """POST group creation with missing required fields returns 422."""
        position_id = self._get_position_id(client)
        if not position_id:
            pytest.skip("No positions available")
        resp = client.post(f"/recruiter/positions/{position_id}/groups", json={})
        assert resp.status_code in (400, 422), (
            f"Expected 400/422 on missing fields, got {resp.status_code}"
        )

    def test_create_group_position_mismatch_returns_error(self, client):
        """POST group with mismatched position_id returns 400."""
        position_id = self._get_position_id(client)
        if not position_id:
            pytest.skip("No positions available")
        different_id = str(uuid.uuid4())
        resp = client.post(f"/recruiter/positions/{position_id}/groups", json={
            "name": "Test Group",
            "position_id": different_id,
            "candidate_ids": []
        })
        assert resp.status_code in (400, 422), (
            f"Expected 400 on position mismatch, got {resp.status_code}"
        )

    def test_create_group_for_fake_position_returns_error(self, client):
        """POST group to fake position returns error."""
        fake_id = str(uuid.uuid4())
        resp = client.post(f"/recruiter/positions/{fake_id}/groups", json={
            "name": "Test Group",
            "position_id": fake_id,
            "candidate_ids": []
        })
        assert resp.status_code in (400, 403, 404, 422), (
            f"Expected error for fake position group creation, got {resp.status_code}"
        )
