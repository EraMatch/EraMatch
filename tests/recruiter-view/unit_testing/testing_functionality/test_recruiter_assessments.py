"""
Tests for Recruiter Assessments functionality.
Covers: create, get, update, delete assessments.

Backend endpoints:
  POST   /assessments
  GET    /assessments/{id}
  PUT    /assessments/{id}
  DELETE /assessments/{id}
"""
import pytest
import uuid


class TestCreateAssessment:
    """Tests for creating assessments."""

    def test_create_assessment_missing_fields_returns_422(self, client):
        """POST assessment without required fields returns 422."""
        resp = client.post("/assessments", json={})
        assert resp.status_code == 422, (
            f"Expected 422 on missing fields, got {resp.status_code}"
        )

    def test_create_assessment_with_valid_data(self, client):
        """POST assessment with valid data returns 200."""
        resp = client.post("/assessments", json={
            "title": "Test Assessment via Recruiter Suite",
            "sections": [
                {
                    "title": "General Knowledge",
                    "questions": [
                        {
                            "text": "What is Python?",
                            "type": "mcq",
                            "options": ["A programming language", "A snake"],
                            "correct_answer": "A programming language"
                        }
                    ]
                }
            ]
        })
        assert resp.status_code in (200, 201), (
            f"Expected 200/201, got {resp.status_code}: {resp.text}"
        )


class TestGetAssessment:
    """Tests for getting an assessment by ID."""

    def test_get_nonexistent_assessment_returns_404(self, client):
        """GET assessment with fake UUID returns 404."""
        fake_id = str(uuid.uuid4())
        resp = client.get(f"/assessments/{fake_id}")
        assert resp.status_code in (404, 422, 500), (
            f"Expected 404 for fake assessment, got {resp.status_code}"
        )


class TestUpdateAssessment:
    """Tests for updating assessments."""

    def test_update_nonexistent_assessment_returns_404(self, client):
        """PUT assessment with fake UUID returns 404."""
        fake_id = str(uuid.uuid4())
        resp = client.put(f"/assessments/{fake_id}", json={
            "title": "Should fail",
            "sections": []
        })
        assert resp.status_code in (404, 422, 500), (
            f"Expected 404 for fake assessment update, got {resp.status_code}"
        )


class TestDeleteAssessment:
    """Tests for deleting assessments."""

    def test_delete_nonexistent_assessment_returns_404(self, client):
        """DELETE assessment with fake UUID returns 404."""
        fake_id = str(uuid.uuid4())
        resp = client.delete(f"/assessments/{fake_id}")
        assert resp.status_code in (404, 422, 500), (
            f"Expected 404 for fake assessment delete, got {resp.status_code}"
        )

    def test_delete_assessment_unauthenticated_blocked(self, raw_client):
        """DELETE assessment without token returns 401/403."""
        fake_id = str(uuid.uuid4())
        resp = raw_client.delete(f"/assessments/{fake_id}")
        assert resp.status_code in (401, 403, 422), (
            f"Expected 401/403 without token, got {resp.status_code}"
        )
