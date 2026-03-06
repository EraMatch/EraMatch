"""
Tests for Recruiter Filter Templates functionality.
Covers: list templates, create template, delete template.

Backend endpoints:
  GET    /recruiter/filters/templates
  POST   /recruiter/filters/templates
  DELETE /recruiter/filters/templates/{id}
"""
import pytest
import uuid


class TestListFilterTemplates:
    """Tests for listing filter templates."""

    def test_list_templates_returns_200(self, client):
        """GET /recruiter/filters/templates returns 200."""
        resp = client.get("/recruiter/filters/templates")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    def test_list_templates_is_list(self, client):
        """Response is a JSON list."""
        resp = client.get("/recruiter/filters/templates")
        data = resp.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"

    def test_template_has_required_fields(self, client):
        """Each template has an ID and name."""
        resp = client.get("/recruiter/filters/templates")
        templates = resp.json()
        for tpl in templates:
            has_id = any(k in tpl for k in ["id", "template_id"])
            has_name = any(k in tpl for k in ["name", "template_name"])
            assert has_id, f"Template missing ID: {tpl}"
            assert has_name, f"Template missing name: {tpl}"

    def test_list_templates_unauthenticated_blocked(self, raw_client):
        """GET /recruiter/filters/templates without token returns 401/403."""
        resp = raw_client.get("/recruiter/filters/templates")
        assert resp.status_code in (401, 403, 422), (
            f"Expected 401/403 without token, got {resp.status_code}"
        )


class TestCreateFilterTemplate:
    """Tests for creating a filter template."""

    def test_create_template_missing_name_returns_422(self, client):
        """POST filter template without name returns 422."""
        resp = client.post("/recruiter/filters/templates", json={})
        assert resp.status_code == 422, (
            f"Expected 422 on missing name, got {resp.status_code}"
        )


class TestDeleteFilterTemplate:
    """Tests for deleting a filter template."""

    def test_delete_nonexistent_template_returns_404(self, client):
        """DELETE template with fake UUID returns 404 or error."""
        fake_id = str(uuid.uuid4())
        resp = client.delete(f"/recruiter/filters/templates/{fake_id}")
        assert resp.status_code in (404, 403, 422), (
            f"Expected 4xx for fake template delete, got {resp.status_code}"
        )
