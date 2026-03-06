"""
Tests for Recruiter Settings functionality.
Covers: get settings, update profile, update preferences, update AI pipeline.

Backend endpoints:
  GET   /recruiter/settings
  PATCH /recruiter/settings/profile
  PATCH /recruiter/settings/preferences
  PATCH /recruiter/settings/ai-pipeline
"""
import pytest


class TestGetSettings:
    """Tests for getting recruiter settings."""

    def test_get_settings_returns_200(self, client):
        """GET /recruiter/settings returns 200."""
        resp = client.get("/recruiter/settings")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    def test_settings_is_dict(self, client):
        """Response is a JSON dict."""
        resp = client.get("/recruiter/settings")
        data = resp.json()
        assert isinstance(data, dict), f"Expected dict, got {type(data)}"

    def test_settings_has_user_info(self, client):
        """Settings response includes user-identifying information."""
        resp = client.get("/recruiter/settings")
        data = resp.json()
        has_email = any(k in data for k in ["email", "user", "profile"])
        assert has_email, f"Settings missing user info: {list(data.keys())}"

    def test_settings_unauthenticated_blocked(self, raw_client):
        """GET /recruiter/settings without token returns 401/403."""
        resp = raw_client.get("/recruiter/settings")
        assert resp.status_code in (401, 403, 422), (
            f"Expected 401/403 without token, got {resp.status_code}"
        )


class TestUpdateProfile:
    """Tests for updating recruiter profile settings."""

    def test_update_profile_returns_200(self, client):
        """PATCH /recruiter/settings/profile with valid data returns 200."""
        resp = client.patch("/recruiter/settings/profile", json={
            "first_name": "Helen",
            "last_name": "Recruiter"
        })
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    def test_update_profile_unauthenticated_blocked(self, raw_client):
        """PATCH /recruiter/settings/profile without token returns 401/403."""
        resp = raw_client.patch("/recruiter/settings/profile", json={
            "first_name": "Hacked"
        })
        assert resp.status_code in (401, 403, 422), (
            f"Expected 401/403 without token, got {resp.status_code}"
        )


class TestUpdatePreferences:
    """Tests for updating recruiter preferences."""

    def test_update_preferences_returns_200(self, client):
        """PATCH /recruiter/settings/preferences with valid data returns 200."""
        resp = client.patch("/recruiter/settings/preferences", json={
            "language": "en",
            "theme": "dark"
        })
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"


class TestUpdateAIPipeline:
    """Tests for updating AI pipeline settings."""

    def test_update_ai_pipeline_returns_200(self, client):
        """PATCH /recruiter/settings/ai-pipeline with valid data returns 200."""
        resp = client.patch("/recruiter/settings/ai-pipeline", json={
            "enabled": True
        })
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
