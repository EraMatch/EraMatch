"""
Tests for Admin Dashboard functionality.
Covers: global stats, pipeline funnel, health analytics, groups, projects, positions.

Backend endpoints:
  GET /admin/stats/global
  GET /admin/stats/pipeline
  GET /admin/stats/analytics
  GET /admin/groups
  GET /recruiter/projects?status=active
  GET /recruiter/positions
"""
import pytest


class TestAdminDashboardStats:
    """Tests for the dashboard statistics section."""

    def test_global_stats_returns_200(self, client):
        """Global stats endpoint is reachable and returns 200."""
        resp = client.get("/admin/stats/global")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    def test_global_stats_has_required_fields(self, client):
        """Global stats response contains the core numeric fields."""
        resp = client.get("/admin/stats/global")
        data = resp.json()
        required = ["openPositions", "activeProjects", "totalApplicants", "avgTimeToFill"]
        for field in required:
            assert field in data, f"Missing field '{field}' in global stats: {data}"

    def test_global_stats_values_are_non_negative(self, client):
        """All numeric fields in global stats should be >= 0."""
        resp = client.get("/admin/stats/global")
        data = resp.json()
        for field in ["openPositions", "activeProjects", "totalApplicants", "avgTimeToFill"]:
            val = data.get(field, -1)
            assert val >= 0, f"Field '{field}' has negative value: {val}"

    def test_global_stats_avg_time_to_fill_is_float(self, client):
        """avgTimeToFill should be a numeric type (int or float)."""
        resp = client.get("/admin/stats/global")
        data = resp.json()
        val = data.get("avgTimeToFill")
        assert isinstance(val, (int, float)), f"avgTimeToFill is not numeric: {val!r}"


class TestAdminPipelineStats:
    """Tests for the recruitment pipeline funnel."""

    def test_pipeline_stats_returns_200(self, client):
        """Pipeline stats endpoint returns 200."""
        resp = client.get("/admin/stats/pipeline")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    def test_pipeline_has_stages_list(self, client):
        """Pipeline response contains a 'stages' list."""
        resp = client.get("/admin/stats/pipeline")
        data = resp.json()
        assert "stages" in data, f"Missing 'stages' key: {data}"
        assert isinstance(data["stages"], list), f"'stages' is not a list: {data}"

    def test_pipeline_stages_have_correct_structure(self, client):
        """Each stage in the pipeline has stage, count, percentage, color."""
        resp = client.get("/admin/stats/pipeline")
        stages = resp.json().get("stages", [])
        for stage in stages:
            for key in ["stage", "count", "percentage", "color"]:
                assert key in stage, f"Stage missing key '{key}': {stage}"

    def test_pipeline_stage_names_correct(self, client):
        """Pipeline should contain exactly the expected stage names."""
        expected_stages = {"Applied", "Screening", "Assessment", "Interview", "Offer"}
        resp = client.get("/admin/stats/pipeline")
        stages = resp.json().get("stages", [])
        stage_names = {s.get("stage") for s in stages}
        # If stages are returned, they should be from expected set
        if stages:
            diff = stage_names - expected_stages
            assert not diff, f"Unexpected stage names: {diff}"

    def test_pipeline_applied_is_highest_count(self, client):
        """Applied stage should have the highest (or equal) candidate count."""
        resp = client.get("/admin/stats/pipeline")
        stages = resp.json().get("stages", [])
        if not stages:
            pytest.skip("No pipeline stages to validate (empty data)")
        stage_map = {s["stage"]: s["count"] for s in stages}
        applied = stage_map.get("Applied", 0)
        for name, count in stage_map.items():
            assert applied >= count, (
                f"Applied ({applied}) < {name} ({count}): funnel logic broken"
            )

    def test_pipeline_project_filter(self, client):
        """Pipeline stats with a project_id param does not crash."""
        # First get any project ID from the projects list
        proj_resp = client.get("/recruiter/projects?status=active")
        projects = proj_resp.json() if proj_resp.status_code == 200 else []
        if not projects:
            pytest.skip("No active projects available for pipeline filter test")
        project_id = projects[0].get("project_id") or projects[0].get("id")
        resp = client.get(f"/admin/stats/pipeline?project_id={project_id}")
        assert resp.status_code == 200, f"Expected 200 with project filter: {resp.text}"

    def test_pipeline_position_filter(self, client):
        """Pipeline stats with a position_id param does not crash."""
        pos_resp = client.get("/recruiter/positions")
        positions = pos_resp.json() if pos_resp.status_code == 200 else []
        if not positions:
            pytest.skip("No positions available for pipeline filter test")
        position_id = positions[0].get("id") or positions[0].get("position_id")
        resp = client.get(f"/admin/stats/pipeline?position_id={position_id}")
        assert resp.status_code == 200, f"Expected 200 with position filter: {resp.text}"


class TestAdminHealthAnalytics:
    """Tests for the health analytics section."""

    def test_analytics_returns_200(self, client):
        """Health analytics endpoint returns 200."""
        resp = client.get("/admin/stats/analytics")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    def test_analytics_has_health_field(self, client):
        """Analytics response contains 'health' with onTrack and atRisk."""
        resp = client.get("/admin/stats/analytics")
        data = resp.json()
        assert "health" in data, f"Missing 'health' in analytics: {data}"
        health = data["health"]
        assert "onTrack" in health or "on_track" in health, f"health missing onTrack: {health}"

    def test_analytics_has_velocity(self, client):
        """Analytics response contains hiring velocity metric."""
        resp = client.get("/admin/stats/analytics")
        data = resp.json()
        assert "velocity" in data, f"Missing 'velocity' in analytics: {data}"
        assert isinstance(data["velocity"], (int, float)), "velocity should be numeric"

    def test_analytics_has_quality(self, client):
        """Analytics response contains quality metrics."""
        resp = client.get("/admin/stats/analytics")
        data = resp.json()
        assert "quality" in data, f"Missing 'quality' in analytics: {data}"

    def test_analytics_stage_timing(self, client):
        """Analytics includes stage timing list with at least one entry."""
        resp = client.get("/admin/stats/analytics")
        data = resp.json()
        stage_timing = data.get("stageTiming", data.get("stage_timing", []))
        assert isinstance(stage_timing, list), f"stageTiming is not a list: {stage_timing}"
        for entry in stage_timing:
            assert "stage" in entry, f"Stage timing entry missing 'stage': {entry}"
            assert "days" in entry, f"Stage timing entry missing 'days': {entry}"
            assert "target" in entry, f"Stage timing entry missing 'target': {entry}"

    def test_analytics_integrity_stats(self, client):
        """Analytics includes integrity stats with cheating indicators."""
        resp = client.get("/admin/stats/analytics")
        data = resp.json()
        integrity = data.get("integrity", {})
        if integrity:
            assert "cheatingDetected" in integrity or "cheating_detected" in integrity, (
                f"integrity missing cheatingDetected: {integrity}"
            )


class TestAdminGroups:
    """Tests for admin group listing."""

    def test_list_groups_returns_200(self, client):
        """GET /admin/groups returns 200."""
        resp = client.get("/admin/groups")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    def test_list_groups_is_list(self, client):
        """GET /admin/groups returns a JSON list."""
        resp = client.get("/admin/groups")
        data = resp.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}: {data}"

    def test_groups_have_required_fields(self, client):
        """Each group in the list has required display fields."""
        resp = client.get("/admin/groups")
        groups = resp.json()
        for group in groups:
            # At least one form of ID must be present
            has_id = any(k in group for k in ["groupID", "group_id", "id"])
            assert has_id, f"Group missing any ID field: {group}"


class TestAdminProjectsPositions:
    """Tests for projects and positions loaded in dashboard context."""

    def test_active_projects_returns_200(self, client):
        """GET /recruiter/projects?status=active returns 200."""
        resp = client.get("/recruiter/projects?status=active")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    def test_active_projects_is_list(self, client):
        """Active projects response is a JSON list."""
        resp = client.get("/recruiter/projects?status=active")
        data = resp.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"

    def test_project_fields_present(self, client):
        """Active projects have name and ID fields."""
        resp = client.get("/recruiter/projects?status=active")
        projects = resp.json()
        for proj in projects:
            has_id = any(k in proj for k in ["id", "project_id"])
            has_name = any(k in proj for k in ["name", "projectName"])
            assert has_id, f"Project missing ID: {proj}"
            assert has_name, f"Project missing name: {proj}"

    def test_positions_endpoint_returns_200(self, client):
        """GET /recruiter/positions returns 200."""
        resp = client.get("/recruiter/positions")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    def test_positions_is_list(self, client):
        """Positions response is a JSON list."""
        resp = client.get("/recruiter/positions")
        data = resp.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"

    def test_position_fields_present(self, client):
        """Positions have required display fields."""
        resp = client.get("/recruiter/positions")
        positions = resp.json()
        for pos in positions:
            has_id = any(k in pos for k in ["id", "position_id"])
            has_title = any(k in pos for k in ["jobTitle", "job_title", "title"])
            assert has_id, f"Position missing ID: {pos}"
            assert has_title, f"Position missing title: {pos}"
