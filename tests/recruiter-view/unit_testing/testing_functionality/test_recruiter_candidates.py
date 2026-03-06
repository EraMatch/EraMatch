"""
Tests for Recruiter Candidates listing functionality.
Covers: list all candidates in the organization.

Backend endpoint:
  GET /recruiter/candidates
"""
import pytest


class TestListCandidates:
    """Tests for the recruiter candidate listing."""

    def test_list_candidates_returns_200(self, client):
        """GET /recruiter/candidates returns 200."""
        resp = client.get("/recruiter/candidates")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    def test_list_candidates_is_list(self, client):
        """Response is a JSON list (possibly empty)."""
        resp = client.get("/recruiter/candidates")
        data = resp.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}: {data}"

    def test_candidates_not_null(self, client):
        """Response is never null — always a list."""
        resp = client.get("/recruiter/candidates")
        assert resp.json() is not None, "Candidates returned null instead of []"

    def test_candidate_has_required_fields(self, client):
        """Each candidate has an ID and name."""
        resp = client.get("/recruiter/candidates")
        candidates = resp.json()
        if not candidates:
            pytest.skip("No candidates available")
        for cand in candidates:
            has_id = any(k in cand for k in ["id", "candidate_id", "application_id"])
            has_name = any(k in cand for k in ["name", "full_name", "fullName", "candidate_name"])
            assert has_id, f"Candidate missing ID: {cand}"
            assert has_name, f"Candidate missing name: {cand}"

    def test_candidates_unauthenticated_blocked(self, raw_client):
        """GET /recruiter/candidates without token returns 401/403."""
        resp = raw_client.get("/recruiter/candidates")
        assert resp.status_code in (401, 403, 422), (
            f"Expected 401/403 without token, got {resp.status_code}"
        )
