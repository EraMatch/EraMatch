"""
Tests for Candidate Dashboard / Portal endpoints.
Covers: profile, home screen, pipeline stages, assessments list.

Backend endpoints:
  GET /candidate/me
  GET /candidate/home
  GET /candidate/assessments
"""
import pytest


class TestCandidateProfile:
    """Test suite for GET /candidate/me."""

    def test_get_profile_returns_200(self, client):
        """Authenticated candidate can fetch their profile."""
        resp = client.get("/candidate/me")
        assert resp.status_code == 200, (
            f"Expected 200, got {resp.status_code}: {resp.text}"
        )

    def test_profile_has_email(self, client):
        """Profile response contains the candidate's email."""
        resp = client.get("/candidate/me")
        data = resp.json()
        # Could be nested under 'candidate' or at root level
        email = (
            data.get("email")
            or data.get("candidate", {}).get("email")
            or data.get("data", {}).get("email")
        )
        assert email is not None, f"No email in profile response: {data}"

    def test_profile_has_name(self, client):
        """Profile response contains candidate name fields."""
        resp = client.get("/candidate/me")
        data = resp.json()
        # Check at root, under 'profile', or under 'candidate'/'data'
        flat = data
        for key in ("profile", "candidate", "data"):
            if key in data and isinstance(data[key], dict):
                flat = data[key]
                break
        has_name = any(k in flat for k in ("first_name", "full_name", "name", "email"))
        assert has_name, f"No name/email field in profile: {list(flat.keys())}"

    def test_profile_without_token_returns_error(self, raw_client):
        """GET /candidate/me without auth token → 401 or 422."""
        resp = raw_client.get("/candidate/me")
        assert resp.status_code in (401, 403, 422), (
            f"Expected auth error, got {resp.status_code}"
        )


class TestCandidateHome:
    """Test suite for GET /candidate/home."""

    def test_home_returns_200(self, client):
        """Authenticated candidate can fetch home screen data."""
        resp = client.get("/candidate/home")
        assert resp.status_code == 200, (
            f"Expected 200, got {resp.status_code}: {resp.text}"
        )

    def test_home_has_candidate_info(self, client):
        """Home response contains candidate/profile information."""
        resp = client.get("/candidate/home")
        data = resp.json()
        has_info = (
            "profile" in data
            or "candidate" in data
            or "first_name" in data
            or "email" in data
            or "data" in data
        )
        assert has_info, f"No candidate info in home response: {list(data.keys())}"

    def test_home_has_pipeline_stages(self, client):
        """Home response contains pipeline stages or steps."""
        resp = client.get("/candidate/home")
        data = resp.json()
        has_stages = (
            "pipeline_stages" in data
            or "stages" in data
            or "steps" in data
            or "pipeline" in data
            or "group_pipeline_stages" in data
        )
        assert has_stages, (
            f"No pipeline stages in home response: {list(data.keys())}"
        )

    def test_home_without_token_returns_error(self, raw_client):
        """GET /candidate/home without token → auth error."""
        resp = raw_client.get("/candidate/home")
        assert resp.status_code in (401, 403, 422), (
            f"Expected auth error, got {resp.status_code}"
        )


class TestCandidateAssessmentsList:
    """Test suite for GET /candidate/assessments (list view)."""

    def test_assessments_endpoint_responds(self, client):
        """GET /candidate/assessments returns 200 or 404 (no assessments)."""
        resp = client.get("/candidate/assessments")
        assert resp.status_code in (200, 404), (
            f"Expected 200 or 404, got {resp.status_code}: {resp.text}"
        )

    def test_assessments_returns_list_if_200(self, client):
        """If 200, response should be a list or contain assessments array."""
        resp = client.get("/candidate/assessments")
        if resp.status_code == 200:
            data = resp.json()
            is_list = isinstance(data, list)
            has_array = isinstance(data.get("assessments", None), list) if isinstance(data, dict) else False
            assert is_list or has_array, (
                f"Expected list or {{assessments: [...]}}, got: {type(data)}"
            )
