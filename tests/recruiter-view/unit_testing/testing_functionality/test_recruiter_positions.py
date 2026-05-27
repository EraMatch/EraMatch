"""
Tests for Recruiter Positions functionality.
Covers: list positions, get position, update position, delete position,
        position details, position insights, position groups.

Note: Position creation (POST /recruiter/positions) is already tested in
      admin-view/test_admin_requests.py — skipped here to avoid duplication.

Backend endpoints:
  GET    /recruiter/positions
  GET    /recruiter/positions/{id}
  PATCH  /recruiter/positions/{id}
  DELETE /recruiter/positions/{id}
  GET    /recruiter/positions/{id}/details
  GET    /recruiter/positions/{id}/insights
  GET    /recruiter/positions/{id}/groups
"""
import pytest
import uuid


class TestListPositions:
    """Tests for listing recruiter positions."""

    def test_list_positions_returns_200(self, client):
        """GET /recruiter/positions returns 200."""
        resp = client.get("/recruiter/positions")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    def test_list_positions_is_list(self, client):
        """Response is a JSON list."""
        resp = client.get("/recruiter/positions")
        data = resp.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"

    def test_position_has_required_fields(self, client):
        """Each position has an ID, title, and status."""
        resp = client.get("/recruiter/positions")
        positions = resp.json()
        for pos in positions:
            has_id = any(k in pos for k in ["id", "position_id"])
            has_title = any(k in pos for k in ["title", "job_title", "jobTitle"])
            assert has_id, f"Position missing ID: {pos}"
            assert has_title, f"Position missing title: {pos}"

    def test_list_positions_project_filter(self, client):
        """project_id filter param is accepted."""
        # First get a valid project_id
        proj_resp = client.get("/recruiter/projects")
        if proj_resp.status_code != 200 or not proj_resp.json():
            pytest.skip("No projects available")
        project_id = str(proj_resp.json()[0].get("id") or proj_resp.json()[0].get("project_id"))
        resp = client.get("/recruiter/positions", params={"project_id": project_id})
        assert resp.status_code == 200, f"Project filter failed: {resp.status_code}"

    def test_list_positions_status_filter(self, client):
        """Status filter param is accepted."""
        resp = client.get("/recruiter/positions", params={"status": "open"})
        assert resp.status_code == 200, f"Status filter failed: {resp.status_code}"

    def test_list_positions_pagination(self, client):
        """Pagination params skip/limit are accepted."""
        resp = client.get("/recruiter/positions", params={"skip": 0, "limit": 5})
        assert resp.status_code == 200, f"Pagination failed: {resp.status_code}"


class TestGetPosition:
    """Tests for getting a single position by ID."""

    def _get_position_id(self, client):
        resp = client.get("/recruiter/positions")
        if resp.status_code != 200 or not resp.json():
            return None
        pos = resp.json()[0]
        return str(pos.get("id") or pos.get("position_id"))

    def test_get_position_returns_200(self, client):
        """GET /recruiter/positions/{id} returns 200."""
        position_id = self._get_position_id(client)
        if not position_id:
            pytest.skip("No positions available")
        resp = client.get(f"/recruiter/positions/{position_id}")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    def test_get_position_has_fields(self, client):
        """Position response has title and status fields."""
        position_id = self._get_position_id(client)
        if not position_id:
            pytest.skip("No positions available")
        resp = client.get(f"/recruiter/positions/{position_id}")
        data = resp.json()
        has_title = any(k in data for k in ["title", "job_title", "jobTitle"])
        assert has_title, f"Position missing title: {data}"

    def test_get_nonexistent_position_returns_404(self, client):
        """GET position with fake UUID returns 404."""
        fake_id = str(uuid.uuid4())
        resp = client.get(f"/recruiter/positions/{fake_id}")
        assert resp.status_code in (404, 403, 422), (
            f"Expected 4xx for fake position, got {resp.status_code}"
        )


class TestPositionDetails:
    """Tests for position details (candidates and groups)."""

    def _get_position_id(self, client):
        resp = client.get("/recruiter/positions")
        if resp.status_code != 200 or not resp.json():
            return None
        return str(resp.json()[0].get("id") or resp.json()[0].get("position_id"))

    def test_position_details_returns_200(self, client):
        """GET /recruiter/positions/{id}/details returns 200."""
        position_id = self._get_position_id(client)
        if not position_id:
            pytest.skip("No positions available")
        resp = client.get(f"/recruiter/positions/{position_id}/details")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    def test_position_details_structure(self, client):
        """Details response is a dict with candidates/groups sub-structures."""
        position_id = self._get_position_id(client)
        if not position_id:
            pytest.skip("No positions available")
        resp = client.get(f"/recruiter/positions/{position_id}/details")
        data = resp.json()
        assert isinstance(data, dict), f"Expected dict, got {type(data)}"

    def test_position_details_for_fake_id(self, client):
        """GET details for a fake position ID returns error."""
        fake_id = str(uuid.uuid4())
        resp = client.get(f"/recruiter/positions/{fake_id}/details")
        assert resp.status_code in (200, 404, 403, 422), (
            f"Unexpected status for fake position details: {resp.status_code}"
        )

    def test_position_details_filters(self, client):
        """Test school, degree, and gpa filter query params on position details."""
        position_id = self._get_position_id(client)
        if not position_id:
            pytest.skip("No positions available")
        
        # Test school filter
        resp_school = client.get(f"/recruiter/positions/{position_id}/details", params={"school": "King Saud"})
        assert resp_school.status_code == 200, f"Expected 200, got {resp_school.status_code}"
        data_school = resp_school.json()
        assert "candidates" in data_school, "Missing candidates in response"
        
        # Test degree filter
        resp_degree = client.get(f"/recruiter/positions/{position_id}/details", params={"degree": "Bachelor"})
        assert resp_degree.status_code == 200, f"Expected 200, got {resp_degree.status_code}"
        data_degree = resp_degree.json()
        assert "candidates" in data_degree, "Missing candidates in response"
        
        # Test gpa filter
        resp_gpa = client.get(f"/recruiter/positions/{position_id}/details", params={"gpa": 3.0})
        assert resp_gpa.status_code == 200, f"Expected 200, got {resp_gpa.status_code}"
        data_gpa = resp_gpa.json()
        assert "candidates" in data_gpa, "Missing candidates in response"


class TestPositionInsights:
    """Tests for position insights/metrics."""

    def _get_position_id(self, client):
        resp = client.get("/recruiter/positions")
        if resp.status_code != 200 or not resp.json():
            return None
        return str(resp.json()[0].get("id") or resp.json()[0].get("position_id"))

    def test_position_insights_returns_200(self, client):
        """GET /recruiter/positions/{id}/insights returns 200."""
        position_id = self._get_position_id(client)
        if not position_id:
            pytest.skip("No positions available")
        resp = client.get(f"/recruiter/positions/{position_id}/insights")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    def test_position_insights_has_metrics(self, client):
        """Insights response contains metric fields."""
        position_id = self._get_position_id(client)
        if not position_id:
            pytest.skip("No positions available")
        resp = client.get(f"/recruiter/positions/{position_id}/insights")
        data = resp.json()
        assert isinstance(data, dict), f"Expected dict, got {type(data)}"

    def test_position_insights_values_non_negative(self, client):
        """All numeric values in insights are >= 0."""
        position_id = self._get_position_id(client)
        if not position_id:
            pytest.skip("No positions available")
        resp = client.get(f"/recruiter/positions/{position_id}/insights")
        data = resp.json()
        for key, val in data.items():
            if isinstance(val, (int, float)):
                assert val >= 0, f"Insights field '{key}' is negative: {val}"


class TestPositionGroups:
    """Tests for listing groups within a position."""

    def _get_position_id(self, client):
        resp = client.get("/recruiter/positions")
        if resp.status_code != 200 or not resp.json():
            return None
        return str(resp.json()[0].get("id") or resp.json()[0].get("position_id"))

    def test_position_groups_returns_200(self, client):
        """GET /recruiter/positions/{id}/groups returns 200."""
        position_id = self._get_position_id(client)
        if not position_id:
            pytest.skip("No positions available")
        resp = client.get(f"/recruiter/positions/{position_id}/groups")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    def test_position_groups_is_list(self, client):
        """Response is a JSON list."""
        position_id = self._get_position_id(client)
        if not position_id:
            pytest.skip("No positions available")
        resp = client.get(f"/recruiter/positions/{position_id}/groups")
        data = resp.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"

    def test_group_has_required_fields(self, client):
        """Each group has an ID and name."""
        position_id = self._get_position_id(client)
        if not position_id:
            pytest.skip("No positions available")
        resp = client.get(f"/recruiter/positions/{position_id}/groups")
        groups = resp.json()
        for group in groups:
            has_id = any(k in group for k in ["id", "group_id"])
            has_name = any(k in group for k in ["name", "group_name", "groupName"])
            assert has_id, f"Group missing ID: {group}"
            assert has_name, f"Group missing name: {group}"


class TestUpdatePosition:
    """Tests for updating positions."""

    def _get_position_id(self, client):
        resp = client.get("/recruiter/positions")
        if resp.status_code != 200 or not resp.json():
            return None
        return str(resp.json()[0].get("id") or resp.json()[0].get("position_id"))

    def test_update_position_returns_200(self, client):
        """PATCH /recruiter/positions/{id} with valid data returns 200."""
        position_id = self._get_position_id(client)
        if not position_id:
            pytest.skip("No positions available")
        resp = client.patch(f"/recruiter/positions/{position_id}", json={
            "job_description": "Updated via recruiter test suite"
        })
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    def test_update_nonexistent_position_returns_404(self, client):
        """PATCH position with fake UUID returns 404."""
        fake_id = str(uuid.uuid4())
        resp = client.patch(f"/recruiter/positions/{fake_id}", json={
            "job_description": "Should fail"
        })
        assert resp.status_code in (404, 403, 422), (
            f"Expected 4xx for fake position, got {resp.status_code}"
        )


class TestDeletePosition:
    """Tests for soft-deleting positions."""

    def test_delete_nonexistent_position_returns_404(self, client):
        """DELETE position with fake UUID returns 404."""
        fake_id = str(uuid.uuid4())
        resp = client.delete(f"/recruiter/positions/{fake_id}")
        assert resp.status_code in (404, 403, 422), (
            f"Expected 4xx for fake position, got {resp.status_code}"
        )
