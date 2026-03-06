"""
Tests for Admin Login functionality.
Covers: authentication, token structure, error handling, logout.

Backend endpoint: POST /auth/login
Admin credentials: admin_1@eramatch.com / 1234567890
"""
import httpx
import pytest

BASE_URL = "http://localhost:8000/api/v1"


class TestAdminLogin:
    """Test suite for admin login / authentication."""

    # ──────────────────────────────────────────
    # SUCCESS SCENARIOS
    # ──────────────────────────────────────────

    def test_valid_admin_login_returns_200(self, raw_client):
        """Admin can log in with correct credentials and receives HTTP 200."""
        resp = raw_client.post("/auth/admin/login", json={
            "email": "admin_1@eramatch.com",
            "password": "1234567890"
        })
        assert resp.status_code == 200, (
            f"Expected 200 but got {resp.status_code}. Body: {resp.text}"
        )

    def test_valid_admin_login_returns_token(self, raw_client):
        """Successful login response contains an access_token."""
        resp = raw_client.post("/auth/admin/login", json={
            "email": "admin_1@eramatch.com",
            "password": "1234567890"
        })
        data = resp.json()
        token = data.get("access_token") or data.get("token")
        assert token is not None, f"No token in response: {data}"
        assert len(token) > 20, f"Token appears too short: {token}"

    def test_login_response_has_user_info(self, raw_client):
        """Successful login response includes user info (email or role)."""
        resp = raw_client.post("/auth/admin/login", json={
            "email": "admin_1@eramatch.com",
            "password": "1234567890"
        })
        data = resp.json()
        # At minimum, either a user object or email should be present
        has_user = "user" in data or "email" in data or "role" in data
        assert has_user, f"No user info in login response: {data}"

    def test_token_format_is_bearer_jwt(self, raw_client):
        """Access token should be a JWT (3 parts separated by dots)."""
        resp = raw_client.post("/auth/admin/login", json={
            "email": "admin_1@eramatch.com",
            "password": "1234567890"
        })
        data = resp.json()
        token = data.get("access_token") or data.get("token") or ""
        parts = token.split(".")
        assert len(parts) == 3, f"Token does not look like JWT: {token}"

    def test_authenticated_admin_can_access_protected_endpoint(self, admin_headers, raw_client):
        """A token obtained from login grants access to admin-protected endpoints."""
        resp = raw_client.get("/admin/stats/global", headers=admin_headers)
        assert resp.status_code == 200, (
            f"Protected endpoint failed with admin token: {resp.status_code} — {resp.text}"
        )

    # ──────────────────────────────────────────
    # FAILURE SCENARIOS
    # ──────────────────────────────────────────

    def test_wrong_password_returns_401(self, raw_client):
        """Login with the wrong password should return 401 Unauthorized."""
        resp = raw_client.post("/auth/admin/login", json={
            "email": "admin_1@eramatch.com",
            "password": "WRONG_PASSWORD_123"
        })
        assert resp.status_code in (401, 400, 422), (
            f"Expected 4xx on wrong password, got {resp.status_code}"
        )

    def test_wrong_email_returns_401(self, raw_client):
        """Login with a non-existent email should return 401."""
        resp = raw_client.post("/auth/admin/login", json={
            "email": "nonexistent_admin@eramatch.com",
            "password": "1234567890"
        })
        assert resp.status_code in (401, 400, 404, 422), (
            f"Expected 4xx on wrong email, got {resp.status_code}"
        )

    def test_empty_email_returns_error(self, raw_client):
        """Login with empty email should return 422 (validation error)."""
        resp = raw_client.post("/auth/admin/login", json={
            "email": "",
            "password": "1234567890"
        })
        assert resp.status_code in (400, 422), (
            f"Expected 400/422 on empty email, got {resp.status_code}"
        )

    def test_empty_password_returns_error(self, raw_client):
        """Login with empty password should return 422 or 401."""
        resp = raw_client.post("/auth/admin/login", json={
            "email": "admin_1@eramatch.com",
            "password": ""
        })
        assert resp.status_code in (400, 401, 422), (
            f"Expected 4xx on empty password, got {resp.status_code}"
        )

    def test_missing_fields_returns_422(self, raw_client):
        """Login with completely missing fields should return 422."""
        resp = raw_client.post("/auth/admin/login", json={})
        assert resp.status_code == 422, (
            f"Expected 422 on missing fields, got {resp.status_code}"
        )

    def test_unauthenticated_request_blocked(self, raw_client):
        """Protected endpoint without token returns 401 or 403."""
        resp = raw_client.get("/admin/stats/global")
        assert resp.status_code in (401, 403, 422), (
            f"Expected 401/403/422 without token, got {resp.status_code}"
        )

    def test_invalid_token_blocked(self, raw_client):
        """Protected endpoint with a garbage token is rejected."""
        resp = raw_client.get("/admin/stats/global", headers={
            "Authorization": "Bearer this.is.not.a.valid.token"
        })
        assert resp.status_code in (401, 403, 422), (
            f"Expected 401/403/422 with bad token, got {resp.status_code}"
        )

    def test_sql_injection_in_email_is_safe(self, raw_client):
        """SQL injection in email field should not crash the server."""
        resp = raw_client.post("/auth/admin/login", json={
            "email": "' OR '1'='1",
            "password": "1234567890"
        })
        # Should return error (not 500) and certainly not 200
        assert resp.status_code != 500, "Server crashed on SQL injection attempt!"
        assert resp.status_code != 200, "SQL injection unexpectedly succeeded!"

    def test_malformed_json_returns_error(self, raw_client):
        """Sending malformed JSON body should be handled gracefully."""
        resp = raw_client.post(
            "/auth/login",
            content=b"not valid json at all {{{",
            headers={"Content-Type": "application/json"}
        )
        assert resp.status_code in (400, 422), (
            f"Expected 400/422 on malformed JSON, got {resp.status_code}"
        )
