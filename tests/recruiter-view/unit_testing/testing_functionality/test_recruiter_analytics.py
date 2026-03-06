"""
Tests for Recruiter Analytics Dashboard functionality.
Covers: analytics overview, stats, and data validation.

Backend endpoint:
  GET /recruiter/analytics
"""
import pytest


class TestRecruiterAnalytics:
    """Tests for recruiter dashboard analytics."""

    def test_analytics_returns_200(self, client):
        """GET /recruiter/analytics returns 200."""
        resp = client.get("/recruiter/analytics")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    def test_analytics_is_dict(self, client):
        """Response is a JSON dict."""
        resp = client.get("/recruiter/analytics")
        data = resp.json()
        assert isinstance(data, dict), f"Expected dict, got {type(data)}"

    def test_analytics_has_overview(self, client):
        """Analytics response includes overview stats."""
        resp = client.get("/recruiter/analytics")
        data = resp.json()
        has_overview = any(k in data for k in [
            "overview", "overviewStats", "overview_stats",
            "total_positions", "totalPositions", "active_positions"
        ])
        assert has_overview, f"Analytics missing overview stats: {list(data.keys())}"

    def test_analytics_numeric_values_non_negative(self, client):
        """All numeric values at the top level are >= 0."""
        resp = client.get("/recruiter/analytics")
        data = resp.json()
        for key, val in data.items():
            if isinstance(val, (int, float)):
                assert val >= 0, f"Analytics field '{key}' is negative: {val}"

    def test_analytics_overview_stats_non_negative(self, client):
        """Nested overview stats have non-negative values."""
        resp = client.get("/recruiter/analytics")
        data = resp.json()
        overview = data.get("overview") or data.get("overviewStats") or data.get("overview_stats", {})
        if isinstance(overview, dict):
            for key, val in overview.items():
                if isinstance(val, (int, float)):
                    assert val >= 0, f"Overview stat '{key}' is negative: {val}"

    def test_analytics_unauthenticated_blocked(self, raw_client):
        """GET /recruiter/analytics without token returns 401/403."""
        resp = raw_client.get("/recruiter/analytics")
        assert resp.status_code in (401, 403, 422), (
            f"Expected 401/403 without token, got {resp.status_code}"
        )
