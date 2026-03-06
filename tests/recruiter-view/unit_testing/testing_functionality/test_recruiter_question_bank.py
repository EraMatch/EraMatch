"""
Tests for Recruiter Question Bank functionality.
Covers: list questions, create question, toggle favorite, delete question.

Backend endpoints:
  GET    /questions/bank
  POST   /questions/bank
  POST   /questions/bank/{id}/favorite
  DELETE /questions/bank/{id}
"""
import pytest
import uuid


class TestListQuestionBank:
    """Tests for listing question bank items."""

    def test_list_questions_returns_200(self, client):
        """GET /questions/bank returns 200."""
        resp = client.get("/questions/bank")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    def test_list_questions_is_list(self, client):
        """Response is a JSON list."""
        resp = client.get("/questions/bank")
        data = resp.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"

    def test_question_has_required_fields(self, client):
        """Each question has an ID and text."""
        resp = client.get("/questions/bank")
        questions = resp.json()
        for q in questions:
            has_id = any(k in q for k in ["id", "question_id"])
            has_text = any(k in q for k in ["text", "question_text", "questionText"])
            assert has_id, f"Question missing ID: {q}"
            assert has_text, f"Question missing text: {q}"

    def test_question_has_type(self, client):
        """Each question has a type field."""
        resp = client.get("/questions/bank")
        questions = resp.json()
        for q in questions:
            has_type = any(k in q for k in ["type", "question_type", "questionType"])
            assert has_type, f"Question missing type: {q}"

    def test_list_questions_unauthenticated_blocked(self, raw_client):
        """GET /questions/bank without token returns 401/403."""
        resp = raw_client.get("/questions/bank")
        assert resp.status_code in (401, 403, 422), (
            f"Expected 401/403 without token, got {resp.status_code}"
        )


class TestCreateQuestion:
    """Tests for creating questions in the bank."""

    def test_create_question_missing_fields_returns_422(self, client):
        """POST question without required fields returns 422."""
        resp = client.post("/questions/bank", json={})
        assert resp.status_code == 422, (
            f"Expected 422 on missing fields, got {resp.status_code}"
        )

    def test_create_question_with_valid_data(self, client):
        """POST question with valid data returns 200/201."""
        resp = client.post("/questions/bank", json={
            "question_text": "Test question from recruiter suite",
            "question_type": "essay",
            "tags": ["test"],
            "difficulty": 3
        })
        assert resp.status_code in (200, 201), (
            f"Expected 200/201, got {resp.status_code}: {resp.text}"
        )


class TestToggleFavorite:
    """Tests for toggling question favorites."""

    def _get_question_id(self, client):
        """Helper: return the ID of the first question, or None."""
        resp = client.get("/questions/bank")
        if resp.status_code != 200 or not resp.json():
            return None
        q = resp.json()[0]
        return str(q.get("id") or q.get("question_id"))

    def test_toggle_favorite_returns_200(self, client):
        """POST toggle favorite returns 200."""
        qid = self._get_question_id(client)
        if not qid:
            pytest.skip("No questions available")
        resp = client.post(f"/questions/bank/{qid}/favorite")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    def test_toggle_favorite_returns_boolean(self, client):
        """Toggle favorite response includes isFavorite boolean."""
        qid = self._get_question_id(client)
        if not qid:
            pytest.skip("No questions available")
        resp = client.post(f"/questions/bank/{qid}/favorite")
        data = resp.json()
        has_fav = "isFavorite" in data or "is_favorite" in data
        assert has_fav, f"Toggle response missing isFavorite: {data}"

    def test_toggle_favorite_for_fake_id(self, client):
        """POST toggle favorite for a fake question ID returns error."""
        fake_id = str(uuid.uuid4())
        resp = client.post(f"/questions/bank/{fake_id}/favorite")
        assert resp.status_code in (404, 422, 500), (
            f"Expected error for fake question favorite toggle, got {resp.status_code}"
        )


class TestDeleteQuestion:
    """Tests for soft-deleting questions from the bank."""

    def test_delete_nonexistent_question_returns_error(self, client):
        """DELETE question with fake UUID returns error."""
        fake_id = str(uuid.uuid4())
        resp = client.delete(f"/questions/bank/{fake_id}")
        assert resp.status_code in (404, 422, 500), (
            f"Expected error for fake question delete, got {resp.status_code}"
        )
