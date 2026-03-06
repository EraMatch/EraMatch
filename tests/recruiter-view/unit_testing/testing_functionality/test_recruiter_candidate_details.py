"""
Tests for Recruiter Candidate Details functionality.
Covers: get individual candidate, suspect review, knowledge graph.

Backend endpoints:
  GET /candidates/{id}
  GET /candidates/{id}/suspect-review
  GET /candidates/{id}/knowledge-graph
"""
import pytest
import uuid


class TestGetCandidate:
    """Tests for getting an individual candidate profile."""

    def _get_candidate_id(self, client):
        """Helper: return the ID of the first candidate, or None."""
        resp = client.get("/recruiter/candidates")
        if resp.status_code != 200 or not resp.json():
            return None
        cand = resp.json()[0]
        return str(cand.get("id") or cand.get("candidate_id"))

    def test_get_candidate_returns_200(self, client):
        """GET /candidates/{id} returns 200."""
        cid = self._get_candidate_id(client)
        if not cid:
            pytest.skip("No candidates available")
        resp = client.get(f"/candidates/{cid}")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    def test_get_candidate_has_fields(self, client):
        """Candidate response has name and email fields."""
        cid = self._get_candidate_id(client)
        if not cid:
            pytest.skip("No candidates available")
        resp = client.get(f"/candidates/{cid}")
        data = resp.json()
        has_name = any(k in data for k in ["full_name", "fullName", "name"])
        has_email = "email" in data
        assert has_name, f"Candidate missing name: {data}"
        assert has_email, f"Candidate missing email: {data}"

    def test_get_nonexistent_candidate_returns_404(self, client):
        """GET candidate with fake UUID returns 404."""
        fake_id = str(uuid.uuid4())
        resp = client.get(f"/candidates/{fake_id}")
        assert resp.status_code in (404, 422), (
            f"Expected 404 for fake candidate, got {resp.status_code}"
        )


class TestSuspectReview:
    """Tests for candidate suspect review activities."""

    def _get_candidate_id(self, client):
        resp = client.get("/recruiter/candidates")
        if resp.status_code != 200 or not resp.json():
            return None
        cand = resp.json()[0]
        return str(cand.get("id") or cand.get("candidate_id"))

    def test_suspect_review_returns_200(self, client):
        """GET /candidates/{id}/suspect-review returns 200."""
        cid = self._get_candidate_id(client)
        if not cid:
            pytest.skip("No candidates available")
        resp = client.get(f"/candidates/{cid}/suspect-review")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    def test_suspect_review_is_list(self, client):
        """Suspect review response is a list."""
        cid = self._get_candidate_id(client)
        if not cid:
            pytest.skip("No candidates available")
        resp = client.get(f"/candidates/{cid}/suspect-review")
        data = resp.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"

    def test_suspect_review_for_fake_id(self, client):
        """GET suspect-review for a fake candidate ID handles gracefully."""
        fake_id = str(uuid.uuid4())
        resp = client.get(f"/candidates/{fake_id}/suspect-review")
        assert resp.status_code in (200, 404, 422), (
            f"Unexpected status for fake candidate suspect review: {resp.status_code}"
        )


class TestKnowledgeGraph:
    """Tests for candidate knowledge graph data."""

    def _get_candidate_id(self, client):
        resp = client.get("/recruiter/candidates")
        if resp.status_code != 200 or not resp.json():
            return None
        cand = resp.json()[0]
        return str(cand.get("id") or cand.get("candidate_id"))

    def test_knowledge_graph_returns_200(self, client):
        """GET /candidates/{id}/knowledge-graph returns 200."""
        cid = self._get_candidate_id(client)
        if not cid:
            pytest.skip("No candidates available")
        resp = client.get(f"/candidates/{cid}/knowledge-graph")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    def test_knowledge_graph_is_dict(self, client):
        """Knowledge graph response is a dict."""
        cid = self._get_candidate_id(client)
        if not cid:
            pytest.skip("No candidates available")
        resp = client.get(f"/candidates/{cid}/knowledge-graph")
        data = resp.json()
        assert isinstance(data, dict), f"Expected dict, got {type(data)}"

    def test_knowledge_graph_for_fake_id(self, client):
        """GET knowledge-graph for a fake candidate ID handles gracefully."""
        fake_id = str(uuid.uuid4())
        resp = client.get(f"/candidates/{fake_id}/knowledge-graph")
        assert resp.status_code in (200, 404, 422), (
            f"Unexpected status for fake candidate knowledge graph: {resp.status_code}"
        )
