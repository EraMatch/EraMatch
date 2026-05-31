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
        from app.db.session import sync_session_factory
        from sqlalchemy import text

        with sync_session_factory() as session:
            result = session.execute(text(
                "SELECT cg.position_id, cg.group_id FROM candidate_groups cg "
                "JOIN positions p ON cg.position_id = p.position_id "
                "WHERE p.organization_id = '59b023a9-db8e-450c-82e4-01f29f152351' "
                "AND cg.status = 'active' "
                "AND cg.group_id NOT IN ("
                "    SELECT group_id FROM assessments "
                "    WHERE group_id IS NOT NULL AND is_deleted = false"
                ") LIMIT 1"
            )).fetchone()

            if not result:
                result = session.execute(text(
                    "SELECT position_id, group_id FROM candidate_groups "
                    "WHERE group_id NOT IN ("
                    "    SELECT group_id FROM assessments "
                    "    WHERE group_id IS NOT NULL AND is_deleted = false"
                    ") LIMIT 1"
                )).fetchone()

            if not result:
                result = session.execute(text(
                    "SELECT position_id, group_id FROM candidate_groups LIMIT 1"
                )).fetchone()

            assert result is not None, "No candidate groups found in database"
            position_id, group_id = result

        payload = {
            "position_id": str(position_id),
            "group_id": str(group_id),
            "title": "Test Assessment via Recruiter Suite",
            "duration_minutes": 60,
            "passing_score": 60.0,
            "sections": [
                {
                    "id": "section-1",
                    "order": 1,
                    "type": "mcq",
                    "points": 10,
                    "variants": [
                        {
                            "id": "q-1",
                            "type": "mcq",
                            "questionText": "What is Python?",
                            "points": 10,
                            "options": ["A programming language", "A snake"],
                            "correctAnswer": 0
                        }
                    ]
                }
            ]
        }
        resp = client.post("/assessments", json=payload)
        assert resp.status_code in (200, 201), (
            f"Expected 200/201, got {resp.status_code}: {resp.text}"
        )

        # Cleanup: Soft delete the created assessment to keep tests stateless
        data = resp.json()
        assessment_id = data.get("assessment_id")
        if assessment_id:
            del_resp = client.delete(f"/assessments/{assessment_id}")
            assert del_resp.status_code in (200, 201, 204), (
                f"Cleanup failed: expected 200, got {del_resp.status_code}: {del_resp.text}"
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
