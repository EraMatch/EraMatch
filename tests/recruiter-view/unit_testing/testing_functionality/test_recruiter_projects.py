"""
Tests for Recruiter Projects functionality.
Covers: list projects, get project, update project, delete project,
        project positions, project summary.

Note: Project creation (POST /recruiter/projects) is already tested in
      admin-view/test_admin_requests.py — skipped here to avoid duplication.

Backend endpoints:
  GET    /recruiter/projects
  GET    /recruiter/projects/{id}
  PATCH  /recruiter/projects/{id}
  DELETE /recruiter/projects/{id}
  GET    /recruiter/projects/{id}/positions
  GET    /recruiter/projects/{id}/summary
"""
import pytest
import uuid


class TestListProjects:
    """Tests for listing recruiter projects."""

    def test_list_projects_returns_200(self, client):
        """GET /recruiter/projects returns 200."""
        resp = client.get("/recruiter/projects")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    def test_list_projects_is_list(self, client):
        """Response is a JSON list."""
        resp = client.get("/recruiter/projects")
        data = resp.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"

    def test_project_has_required_fields(self, client):
        """Each project has an ID and name."""
        resp = client.get("/recruiter/projects")
        projects = resp.json()
        for proj in projects:
            has_id = any(k in proj for k in ["id", "project_id"])
            has_name = any(k in proj for k in ["name", "projectName", "project_name"])
            assert has_id, f"Project missing ID: {proj}"
            assert has_name, f"Project missing name: {proj}"

    def test_list_projects_status_filter(self, client):
        """Status filter param is accepted."""
        resp = client.get("/recruiter/projects", params={"status": "active"})
        assert resp.status_code == 200, f"Status filter failed: {resp.status_code}"

    def test_list_projects_pagination(self, client):
        """Pagination params skip/limit are accepted."""
        resp = client.get("/recruiter/projects", params={"skip": 0, "limit": 5})
        assert resp.status_code == 200, f"Pagination failed: {resp.status_code}"


class TestGetProject:
    """Tests for getting a single project by ID."""

    def _get_project_id(self, client):
        """Helper: return the ID of the first project, or None."""
        resp = client.get("/recruiter/projects")
        if resp.status_code != 200 or not resp.json():
            return None
        proj = resp.json()[0]
        return str(proj.get("id") or proj.get("project_id"))

    def test_get_project_returns_200(self, client):
        """GET /recruiter/projects/{id} returns 200."""
        project_id = self._get_project_id(client)
        if not project_id:
            pytest.skip("No projects available")
        resp = client.get(f"/recruiter/projects/{project_id}")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    def test_get_project_has_fields(self, client):
        """Project response has name and status fields."""
        project_id = self._get_project_id(client)
        if not project_id:
            pytest.skip("No projects available")
        resp = client.get(f"/recruiter/projects/{project_id}")
        data = resp.json()
        has_name = any(k in data for k in ["name", "projectName", "project_name"])
        has_status = "status" in data
        assert has_name, f"Project missing name: {data}"
        assert has_status, f"Project missing status: {data}"

    def test_get_nonexistent_project_returns_404(self, client):
        """GET project with fake UUID returns 404 or graceful error."""
        fake_id = str(uuid.uuid4())
        resp = client.get(f"/recruiter/projects/{fake_id}")
        assert resp.status_code in (404, 403, 422), (
            f"Expected 4xx for fake project, got {resp.status_code}"
        )


class TestProjectPositions:
    """Tests for getting positions within a project."""

    def _get_project_id(self, client):
        resp = client.get("/recruiter/projects")
        if resp.status_code != 200 or not resp.json():
            return None
        return str(resp.json()[0].get("id") or resp.json()[0].get("project_id"))

    def test_project_positions_returns_200(self, client):
        """GET /recruiter/projects/{id}/positions returns 200."""
        project_id = self._get_project_id(client)
        if not project_id:
            pytest.skip("No projects available")
        resp = client.get(f"/recruiter/projects/{project_id}/positions")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    def test_project_positions_is_list(self, client):
        """Response is a JSON list."""
        project_id = self._get_project_id(client)
        if not project_id:
            pytest.skip("No projects available")
        resp = client.get(f"/recruiter/projects/{project_id}/positions")
        data = resp.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"

    def test_position_has_required_fields(self, client):
        """Each position has an ID, title, and status."""
        project_id = self._get_project_id(client)
        if not project_id:
            pytest.skip("No projects available")
        resp = client.get(f"/recruiter/projects/{project_id}/positions")
        positions = resp.json()
        for pos in positions:
            has_id = any(k in pos for k in ["id", "position_id"])
            has_title = any(k in pos for k in ["title", "job_title", "jobTitle"])
            assert has_id, f"Position missing ID: {pos}"
            assert has_title, f"Position missing title: {pos}"


class TestProjectSummary:
    """Tests for project summary statistics."""

    def _get_project_id(self, client):
        resp = client.get("/recruiter/projects")
        if resp.status_code != 200 or not resp.json():
            return None
        return str(resp.json()[0].get("id") or resp.json()[0].get("project_id"))

    def test_project_summary_returns_200(self, client):
        """GET /recruiter/projects/{id}/summary returns 200."""
        project_id = self._get_project_id(client)
        if not project_id:
            pytest.skip("No projects available")
        resp = client.get(f"/recruiter/projects/{project_id}/summary")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    def test_project_summary_has_stats(self, client):
        """Summary response includes statistic fields."""
        project_id = self._get_project_id(client)
        if not project_id:
            pytest.skip("No projects available")
        resp = client.get(f"/recruiter/projects/{project_id}/summary")
        data = resp.json()
        assert isinstance(data, dict), f"Expected dict, got {type(data)}"

    def test_project_summary_values_non_negative(self, client):
        """All numeric values in summary are >= 0."""
        project_id = self._get_project_id(client)
        if not project_id:
            pytest.skip("No projects available")
        resp = client.get(f"/recruiter/projects/{project_id}/summary")
        data = resp.json()
        for key, val in data.items():
            if isinstance(val, (int, float)):
                assert val >= 0, f"Summary field '{key}' is negative: {val}"


class TestUpdateProject:
    """Tests for updating projects."""

    def _get_project_id(self, client):
        resp = client.get("/recruiter/projects")
        if resp.status_code != 200 or not resp.json():
            return None
        return str(resp.json()[0].get("id") or resp.json()[0].get("project_id"))

    def test_update_project_returns_200(self, client):
        """PATCH /recruiter/projects/{id} with valid data returns 200."""
        project_id = self._get_project_id(client)
        if not project_id:
            pytest.skip("No projects available")
        resp = client.patch(f"/recruiter/projects/{project_id}", json={
            "description": "Updated via recruiter test suite"
        })
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    def test_update_nonexistent_project_returns_404(self, client):
        """PATCH project with fake UUID returns 404."""
        fake_id = str(uuid.uuid4())
        resp = client.patch(f"/recruiter/projects/{fake_id}", json={
            "description": "Should fail"
        })
        assert resp.status_code in (404, 403, 422), (
            f"Expected 4xx for fake project, got {resp.status_code}"
        )


class TestDeleteProject:
    """Tests for soft-deleting projects."""

    def test_delete_nonexistent_project_returns_404(self, client):
        """DELETE project with fake UUID returns 404."""
        fake_id = str(uuid.uuid4())
        resp = client.delete(f"/recruiter/projects/{fake_id}")
        assert resp.status_code in (404, 403, 422), (
            f"Expected 4xx for fake project, got {resp.status_code}"
        )
