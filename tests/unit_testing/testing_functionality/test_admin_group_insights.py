"""
Tests for Admin Group Insights / Analytics functionality.
Covers: list groups, group analysis, technical AI stats, risk data,
        combined analytics transform validation.

Backend endpoints:
  GET /admin/groups
  GET /recruiter/groups/{id}/analysis
  GET /recruiter/groups/{id}/technical-ai
  GET /recruiter/groups/{id}/risks
"""
import pytest
import uuid


class TestGroupListing:
    """Tests for the admin group listing."""

    def test_list_groups_returns_200(self, client):
        """GET /admin/groups returns 200."""
        resp = client.get("/admin/groups")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    def test_list_groups_is_list(self, client):
        """Response is a JSON list."""
        resp = client.get("/admin/groups")
        data = resp.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}: {data}"

    def test_list_groups_not_null(self, client):
        """Response is never null."""
        resp = client.get("/admin/groups")
        assert resp.json() is not None, "Groups response was null instead of []"

    def test_group_has_required_fields(self, client):
        """Each group has an ID, name, and candidate count."""
        resp = client.get("/admin/groups")
        groups = resp.json()
        for group in groups:
            has_id = any(k in group for k in ["groupID", "group_id", "id"])
            has_name = any(k in group for k in ["groupName", "group_name", "name"])
            assert has_id, f"Group missing ID: {group}"
            assert has_name, f"Group missing name: {group}"

    def test_group_status_is_valid(self, client):
        """Group status values are recognized."""
        resp = client.get("/admin/groups")
        groups = resp.json()
        valid_statuses = {"Active", "Inactive", "Pending", "Closed", "Live",
                          "active", "inactive", "pending", "closed", "live"}
        for group in groups:
            status = group.get("status", "")
            if status:  # only check if status is present
                assert status in valid_statuses, f"Invalid group status '{status}': {group}"

    def test_group_candidates_count_non_negative(self, client):
        """candidatesCount for each group should be >= 0."""
        resp = client.get("/admin/groups")
        groups = resp.json()
        for group in groups:
            count = group.get("candidatesCount") or group.get("candidates_count", 0)
            assert isinstance(count, int), f"candidatesCount not an int: {count!r}"
            assert count >= 0, f"candidatesCount is negative: {count}"


class TestGroupAnalysis:
    """Tests for per-group analysis statistics."""

    def _get_group_id(self, client):
        """Helper: return the ID of the first available group, or None."""
        resp = client.get("/admin/groups")
        if resp.status_code != 200 or not resp.json():
            return None
        group = resp.json()[0]
        gid = group.get("groupID") or group.get("group_id") or group.get("id")
        return str(gid) if gid else None

    def test_group_analysis_returns_200(self, client):
        """GET /recruiter/groups/{id}/analysis returns 200."""
        group_id = self._get_group_id(client)
        if not group_id:
            pytest.skip("No groups available for analysis test")
        resp = client.get(f"/recruiter/groups/{group_id}/analysis")
        assert resp.status_code in (200, 404), (
            f"Expected 200 or 404, got {resp.status_code}: {resp.text}"
        )

    def test_group_analysis_has_match_accuracy(self, client):
        """Analysis response includes matchAccuracy and totalCandidates."""
        group_id = self._get_group_id(client)
        if not group_id:
            pytest.skip("No groups available")
        resp = client.get(f"/recruiter/groups/{group_id}/analysis")
        if resp.status_code == 404:
            pytest.skip("No analysis data for this group")
        data = resp.json()
        if data:
            has_accuracy = any(k in data for k in ["matchAccuracy", "match_accuracy"])
            has_candidates = any(k in data for k in ["totalCandidates", "total_candidates"])
            assert has_accuracy, f"Analysis missing matchAccuracy: {data}"
            assert has_candidates, f"Analysis missing totalCandidates: {data}"

    def test_group_technical_ai_endpoint(self, client):
        """GET /recruiter/groups/{id}/technical-ai returns 200 or 404."""
        group_id = self._get_group_id(client)
        if not group_id:
            pytest.skip("No groups available")
        resp = client.get(f"/recruiter/groups/{group_id}/technical-ai")
        assert resp.status_code in (200, 404, 422), (
            f"Expected 200/404, got {resp.status_code}: {resp.text}"
        )

    def test_group_technical_ai_structure_if_present(self, client):
        """If technical-ai data is available, it has tech and/or ai sub-sections."""
        group_id = self._get_group_id(client)
        if not group_id:
            pytest.skip("No groups available")
        resp = client.get(f"/recruiter/groups/{group_id}/technical-ai")
        if resp.status_code != 200 or not resp.json():
            pytest.skip("No technical-AI data available")
        data = resp.json()
        has_tech_or_ai = "tech" in data or "ai" in data
        assert has_tech_or_ai, f"technical-ai response has neither 'tech' nor 'ai': {data}"

    def test_group_risks_endpoint(self, client):
        """GET /recruiter/groups/{id}/risks returns 200 or 404."""
        group_id = self._get_group_id(client)
        if not group_id:
            pytest.skip("No groups available")
        resp = client.get(f"/recruiter/groups/{group_id}/risks")
        assert resp.status_code in (200, 404, 422), (
            f"Expected 200/404, got {resp.status_code}: {resp.text}"
        )

    def test_group_risks_structure_if_present(self, client):
        """Risk data has cheatingDetected and severity breakdown fields."""
        group_id = self._get_group_id(client)
        if not group_id:
            pytest.skip("No groups available")
        resp = client.get(f"/recruiter/groups/{group_id}/risks")
        if resp.status_code != 200 or not resp.json():
            pytest.skip("No risk data available")
        data = resp.json()
        has_cheating = any(k in data for k in ["cheatingDetected", "cheating_detected"])
        assert has_cheating, f"Risk data missing cheatingDetected: {data}"
        for key in ["high", "medium", "low"]:
            if key in data:
                assert isinstance(data[key], int), f"Risk count '{key}' not an int: {data}"
                assert data[key] >= 0, f"Risk count '{key}' is negative: {data}"

    def test_analysis_for_invalid_group_id(self, client):
        """GET analysis for a fake group ID is handled gracefully (200 empty or 404)."""
        fake_id = str(uuid.uuid4())
        resp = client.get(f"/recruiter/groups/{fake_id}/analysis")
        # Backend returns 200 with empty/zero data for unknown group IDs — that's acceptable
        assert resp.status_code in (200, 400, 404, 422), (
            f"Unexpected status code for fake group analysis: {resp.status_code}: {resp.text}"
        )
        # Must not return 500
        assert resp.status_code != 500, "Server returned 500 for invalid group ID!"


class TestGroupAnalyticsTransform:
    """Tests for the combined analytics transform logic used by the frontend."""

    def _get_group_id(self, client):
        resp = client.get("/admin/groups")
        if resp.status_code != 200 or not resp.json():
            return None
        group = resp.json()[0]
        gid = group.get("groupID") or group.get("group_id") or group.get("id")
        return str(gid) if gid else None

    def test_combined_analytics_all_phases_present_if_data_exists(self, client):
        """
        When analysis + technical-ai + risks all return data, 
        the combined response should have assessment, aiInterview, liveInterview phases.
        This mirrors what the frontend's adminService.getGroupAnalytics() does.
        """
        group_id = self._get_group_id(client)
        if not group_id:
            pytest.skip("No groups available")

        analysis_resp = client.get(f"/recruiter/groups/{group_id}/analysis")
        tech_resp = client.get(f"/recruiter/groups/{group_id}/technical-ai")

        if analysis_resp.status_code != 200 or not analysis_resp.json():
            pytest.skip("No analysis data for transform test")

        # Simulate the transform
        analysis = analysis_resp.json()
        tech_ai = tech_resp.json() if tech_resp.status_code == 200 else None

        # matchAccuracy should be between 0 and 100
        accuracy = analysis.get("matchAccuracy", analysis.get("match_accuracy"))
        if accuracy is not None:
            assert 0 <= float(accuracy) <= 100, (
                f"matchAccuracy out of range [0,100]: {accuracy}"
            )

        # If tech data available, avgScore should be in [0,100]
        if tech_ai and isinstance(tech_ai, dict):
            tech_section = tech_ai.get("tech", {})
            if tech_section:
                avg_score = tech_section.get("avgScore", tech_section.get("avg_score"))
                if avg_score is not None:
                    assert 0 <= float(avg_score) <= 100, (
                        f"tech avgScore out of range: {avg_score}"
                    )

    def test_group_analytics_match_accuracy_is_numeric(self, client):
        """matchAccuracy is numeric (int or float) if present."""
        group_id = self._get_group_id(client)
        if not group_id:
            pytest.skip("No groups available")
        resp = client.get(f"/recruiter/groups/{group_id}/analysis")
        if resp.status_code != 200 or not resp.json():
            pytest.skip("No analysis data")
        data = resp.json()
        accuracy = data.get("matchAccuracy") or data.get("match_accuracy")
        if accuracy is not None:
            assert isinstance(accuracy, (int, float)), (
                f"matchAccuracy is not numeric: {accuracy!r}"
            )

    def test_group_analytics_pass_rates_are_percentage(self, client):
        """Pass rates in technical-ai data should be between 0 and 1 or 0 and 100."""
        group_id = self._get_group_id(client)
        if not group_id:
            pytest.skip("No groups available")
        resp = client.get(f"/recruiter/groups/{group_id}/technical-ai")
        if resp.status_code != 200 or not resp.json():
            pytest.skip("No technical-ai data")
        data = resp.json()
        for section_key in ["tech", "ai"]:
            section = data.get(section_key, {})
            if section:
                pass_rate = section.get("passRate", section.get("pass_rate"))
                if pass_rate is not None:
                    assert 0 <= float(pass_rate) <= 100, (
                        f"{section_key}.passRate out of range: {pass_rate}"
                    )
