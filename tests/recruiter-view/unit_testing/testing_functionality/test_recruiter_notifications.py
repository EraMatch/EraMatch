"""
Tests for Recruiter Notifications functionality.
Covers: list notifications, response structure, pagination.

Backend endpoint:
  GET /recruiter/notifications
"""
import pytest


class TestRecruiterNotifications:
    """Tests for the recruiter notifications listing."""

    def test_notifications_returns_200(self, client):
        """GET /recruiter/notifications returns 200."""
        resp = client.get("/recruiter/notifications")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    def test_notifications_is_list(self, client):
        """Response is a JSON list (possibly empty)."""
        resp = client.get("/recruiter/notifications")
        data = resp.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}: {data}"

    def test_notifications_not_null(self, client):
        """Response is never null — always a list."""
        resp = client.get("/recruiter/notifications")
        assert resp.json() is not None, "Notifications returned null instead of []"

    def test_notification_has_required_fields(self, client):
        """Each notification has an ID, title/type, and created_at/timestamp."""
        resp = client.get("/recruiter/notifications")
        notifications = resp.json()
        for notif in notifications:
            has_id = any(k in notif for k in ["id", "notification_id"])
            has_title = any(k in notif for k in ["title", "message", "type"])
            has_time = any(k in notif for k in ["created_at", "timestamp", "date"])
            assert has_id, f"Notification missing ID: {notif}"
            assert has_title, f"Notification missing title/type: {notif}"
            assert has_time, f"Notification missing timestamp: {notif}"

    def test_notification_is_read_is_boolean(self, client):
        """is_read field should be a boolean if present."""
        resp = client.get("/recruiter/notifications")
        notifications = resp.json()
        for notif in notifications:
            is_read = notif.get("is_read")
            if is_read is not None:
                assert isinstance(is_read, bool), f"is_read not boolean: {is_read!r}"

    def test_notifications_pagination_params(self, client):
        """Pagination parameters skip and limit are accepted."""
        resp = client.get("/recruiter/notifications", params={"skip": 0, "limit": 5})
        assert resp.status_code == 200, f"Pagination failed: {resp.status_code}"

    def test_notifications_unauthenticated_blocked(self, raw_client):
        """GET /recruiter/notifications without token returns 401/403."""
        resp = raw_client.get("/recruiter/notifications")
        assert resp.status_code in (401, 403, 422), (
            f"Expected 401/403 without token, got {resp.status_code}"
        )
