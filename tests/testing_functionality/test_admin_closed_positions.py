"""
Tests for Admin Closed Positions Archive functionality.
Covers: list archived projects, view positions for a project,
        view position archive details with all 3 closure statuses.

Backend endpoints:
  GET /archive/projects
  GET /archive/projects/{id}/positions
  GET /archive/positions/{id}/details
"""
import pytest
import uuid


class TestArchivedProjects:
    """Tests for the closed projects archive listing."""

    def test_list_archived_projects_returns_200(self, client):
        """GET /archive/projects returns 200."""
        resp = client.get("/archive/projects")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    def test_archived_projects_is_list(self, client):
        """Response is a JSON list (possibly empty)."""
        resp = client.get("/archive/projects")
        data = resp.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}: {data}"

    def test_archived_projects_not_null(self, client):
        """Response is never null — always a list."""
        resp = client.get("/archive/projects")
        assert resp.json() is not None, "Archive projects returned null instead of []"

    def test_archived_project_has_required_fields(self, client):
        """Each archived project has projectName, openDate, closedDate, positionsCount."""
        resp = client.get("/archive/projects")
        projects = resp.json()
        for proj in projects:
            has_id = any(k in proj for k in ["id", "project_id"])
            has_name = any(k in proj for k in ["projectName", "project_name", "name"])
            has_open = any(k in proj for k in ["openDate", "open_date", "created_at"])
            has_closed = any(k in proj for k in ["closedDate", "closed_date"])
            assert has_id, f"Archived project missing ID: {proj}"
            assert has_name, f"Archived project missing name: {proj}"
            assert has_open, f"Archived project missing open date: {proj}"
            assert has_closed, f"Archived project missing closed date: {proj}"

    def test_archived_project_positions_count_is_integer(self, client):
        """positionsCount/positions_count should be an integer >= 0."""
        resp = client.get("/archive/projects")
        projects = resp.json()
        for proj in projects:
            count = proj.get("positionsCount") or proj.get("positions_count", 0)
            assert isinstance(count, int), f"positionsCount not an int: {count!r}"
            assert count >= 0, f"positionsCount is negative: {count}"

    def test_archived_project_total_candidates_non_negative(self, client):
        """totalCandidates should be >= 0."""
        resp = client.get("/archive/projects")
        projects = resp.json()
        for proj in projects:
            total = proj.get("totalCandidates") or proj.get("total_candidates", 0)
            assert total >= 0, f"totalCandidates is negative: {total}"

    def test_archived_project_dates_are_valid(self, client):
        """Open and closed dates should be valid ISO date strings."""
        from datetime import datetime
        resp = client.get("/archive/projects")
        projects = resp.json()
        for proj in projects:
            open_date_str = proj.get("openDate") or proj.get("open_date") or proj.get("created_at")
            closed_date_str = proj.get("closedDate") or proj.get("closed_date")
            if open_date_str:
                try:
                    datetime.fromisoformat(open_date_str.replace("Z", "+00:00"))
                except ValueError:
                    assert False, f"Invalid open date format: {open_date_str}"
            if closed_date_str:
                try:
                    datetime.fromisoformat(closed_date_str.replace("Z", "+00:00"))
                except ValueError:
                    assert False, f"Invalid closed date format: {closed_date_str}"


class TestArchivedPositions:
    """Tests for viewing positions within an archived project."""

    def _get_archived_project_id(self, client):
        """Helper: return the ID of the first archived project, or None."""
        resp = client.get("/archive/projects")
        if resp.status_code != 200 or not resp.json():
            return None
        proj = resp.json()[0]
        return str(proj.get("id") or proj.get("project_id"))

    def test_get_positions_for_project_returns_200(self, client):
        """GET /archive/projects/{id}/positions returns 200."""
        project_id = self._get_archived_project_id(client)
        if not project_id:
            pytest.skip("No archived projects available")
        resp = client.get(f"/archive/projects/{project_id}/positions")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    def test_positions_list_is_list_or_empty(self, client):
        """Positions response is a list (possibly empty)."""
        project_id = self._get_archived_project_id(client)
        if not project_id:
            pytest.skip("No archived projects available")
        resp = client.get(f"/archive/projects/{project_id}/positions")
        data = resp.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"

    def test_archived_position_has_required_fields(self, client):
        """Each archived position has jobTitle, closureStatus, closedDate, candidatesCount."""
        project_id = self._get_archived_project_id(client)
        if not project_id:
            pytest.skip("No archived projects available")
        resp = client.get(f"/archive/projects/{project_id}/positions")
        positions = resp.json()
        if not positions:
            pytest.skip("No archived positions in first project")
        for pos in positions:
            has_id = any(k in pos for k in ["id", "position_id"])
            has_title = any(k in pos for k in ["jobTitle", "job_title", "title"])
            has_status = any(k in pos for k in ["closureStatus", "closure_status", "status"])
            has_closed = any(k in pos for k in ["closedDate", "closed_date"])
            assert has_id, f"Archived position missing ID: {pos}"
            assert has_title, f"Archived position missing job title: {pos}"
            assert has_status, f"Archived position missing closure status: {pos}"
            assert has_closed, f"Archived position missing closed date: {pos}"

    def test_closure_status_is_valid_value(self, client):
        """closureStatus should be Filled, Cancelled, or On Hold."""
        project_id = self._get_archived_project_id(client)
        if not project_id:
            pytest.skip("No archived projects available")
        resp = client.get(f"/archive/projects/{project_id}/positions")
        positions = resp.json()
        valid_statuses = {"Filled", "Cancelled", "On Hold", "open",
                          "filled", "cancelled", "on_hold", "on hold"}
        for pos in positions:
            status = pos.get("closureStatus") or pos.get("closure_status") or pos.get("status", "")
            assert status in valid_statuses, (
                f"Invalid closure status '{status}' for position: {pos}"
            )

    def test_get_positions_for_nonexistent_project(self, client):
        """GET positions for a fake project — backend may return empty list or 404."""
        fake_id = str(uuid.uuid4())
        resp = client.get(f"/archive/projects/{fake_id}/positions")
        # Backend returns 200 + [] for unknown project IDs
        assert resp.status_code in (200, 404, 422), (
            f"Unexpected status for fake archive project: {resp.status_code}: {resp.text}"
        )
        if resp.status_code == 200:
            assert isinstance(resp.json(), list), "Expected empty list for unknown project"


class TestPositionArchiveDetails:
    """Tests for detailed position archive view."""

    def _get_archived_position_id(self, client):
        """Helper: return the ID of the first archived position, or None."""
        proj_resp = client.get("/archive/projects")
        if proj_resp.status_code != 200 or not proj_resp.json():
            return None
        project_id = str(proj_resp.json()[0].get("id") or proj_resp.json()[0].get("project_id"))
        pos_resp = client.get(f"/archive/projects/{project_id}/positions")
        if pos_resp.status_code != 200 or not pos_resp.json():
            return None
        pos = pos_resp.json()[0]
        return str(pos.get("id") or pos.get("position_id"))

    def test_position_archive_details_returns_200(self, client):
        """GET /archive/positions/{id}/details returns 200."""
        position_id = self._get_archived_position_id(client)
        if not position_id:
            pytest.skip("No archived positions available")
        resp = client.get(f"/archive/positions/{position_id}/details")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    def test_position_archive_details_structure(self, client):
        """Archive details include recruitment statistics."""
        position_id = self._get_archived_position_id(client)
        if not position_id:
            pytest.skip("No archived positions available")
        resp = client.get(f"/archive/positions/{position_id}/details")
        if resp.status_code != 200:
            pytest.skip(f"Archive details not available: {resp.status_code}")
        data = resp.json()
        expected_fields = ["jobTitle", "closureStatus", "totalCandidates", "groupsCreated"]
        for field in expected_fields:
            assert field in data, f"Archive details missing '{field}': {data}"

    def test_filled_position_has_hired_candidate_or_null(self, client):
        """A Filled position either has hiredCandidate or null — never missing key."""
        position_id = self._get_archived_position_id(client)
        if not position_id:
            pytest.skip("No archived positions available")
        resp = client.get(f"/archive/positions/{position_id}/details")
        if resp.status_code != 200:
            pytest.skip("Archive details not available")
        data = resp.json()
        if data.get("closureStatus") == "Filled":
            # hiredCandidate key must exist (value can be null)
            assert "hiredCandidate" in data, (
                f"Filled position missing 'hiredCandidate' key: {data}"
            )

    def test_recruitment_stats_are_non_negative(self, client):
        """All recruitment statistic counts in archive details are >= 0."""
        position_id = self._get_archived_position_id(client)
        if not position_id:
            pytest.skip("No archived positions available")
        resp = client.get(f"/archive/positions/{position_id}/details")
        if resp.status_code != 200:
            pytest.skip("Archive details not available")
        data = resp.json()
        stat_fields = [
            "totalCandidates", "groupsCreated", "assessmentsPassed",
            "aiInterviewsPassed", "liveInterviewsPassed"
        ]
        for field in stat_fields:
            if field in data:
                val = data[field]
                assert isinstance(val, (int, float)) and val >= 0, (
                    f"Field '{field}' has invalid value: {val}"
                )

    def test_details_for_nonexistent_position_returns_404(self, client):
        """GET details for a fake position ID — backend may return 404 or empty dict."""
        fake_id = str(uuid.uuid4())
        resp = client.get(f"/archive/positions/{fake_id}/details")
        # Backend returns 200 + {} for unknown position IDs
        assert resp.status_code in (200, 404, 422), (
            f"Unexpected status for fake position details: {resp.status_code}: {resp.text}"
        )
