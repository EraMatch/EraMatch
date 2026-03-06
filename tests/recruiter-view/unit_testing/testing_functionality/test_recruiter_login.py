"""
Tests for Recruiter Login functionality.
Covers: authentication via org-user login, token structure, error handling,
        /auth/me endpoint, logout.

Backend endpoints:
  POST /auth/organization-user/login
  GET  /auth/me
  POST /auth/logout
  POST /auth/organization-user/forgot-password
"""
import httpx
import pytest

import os, sys

# Ensure the recruiter-view conftest directory is importable
_RECRUITER_VIEW_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if _RECRUITER_VIEW_DIR not in sys.path:
    sys.path.insert(0, _RECRUITER_VIEW_DIR)

from conftest import BASE_URL, RECRUITER_EMAIL, RECRUITER_PASSWORD


class TestRecruiterLogin:
    """Test suite for recruiter login / authentication."""

    # ──────────────────────────────────────────
    # SUCCESS SCENARIOS
    # ──────────────────────────────────────────

    def test_valid_recruiter_login_returns_200(self, raw_client, recruiter_credentials):
        """Recruiter can log in with correct credentials and receives HTTP 200."""
        resp = raw_client.post("/auth/organization-user/login", json=recruiter_credentials)
        assert resp.status_code == 200, (
            f"Expected 200 but got {resp.status_code}. Body: {resp.text}"
        )

    def test_valid_recruiter_login_returns_token(self, raw_client, recruiter_credentials):
        """Successful login response contains an access_token."""
        resp = raw_client.post("/auth/organization-user/login", json=recruiter_credentials)
        data = resp.json()
        token = data.get("access_token") or data.get("token")
        assert token is not None, f"No token in response: {data}"
        assert len(token) > 20, f"Token appears too short: {token}"

    def test_login_response_has_user_info(self, raw_client, recruiter_credentials):
        """Successful login response includes user info (email or role)."""
        resp = raw_client.post("/auth/organization-user/login", json=recruiter_credentials)
        data = resp.json()
        has_user = "user" in data or "email" in data or "role" in data
        assert has_user, f"No user info in login response: {data}"

    def test_token_format_is_bearer_jwt(self, raw_client, recruiter_credentials):
        """Access token should be a JWT (3 parts separated by dots)."""
        resp = raw_client.post("/auth/organization-user/login", json=recruiter_credentials)
        data = resp.json()
        token = data.get("access_token") or data.get("token") or ""
        parts = token.split(".")
        assert len(parts) == 3, f"Token does not look like JWT: {token}"

    def test_authenticated_recruiter_can_access_protected_endpoint(self, recruiter_headers, raw_client):
        """A token obtained from login grants access to recruiter-protected endpoints."""
        resp = raw_client.get("/recruiter/projects", headers=recruiter_headers)
        assert resp.status_code == 200, (
            f"Protected endpoint failed with recruiter token: {resp.status_code} — {resp.text}"
        )

    # ──────────────────────────────────────────
    # /auth/me ENDPOINT
    # ──────────────────────────────────────────

    def test_auth_me_returns_200(self, client):
        """GET /auth/me with valid token returns 200."""
        resp = client.get("/auth/me")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    def test_auth_me_has_user_fields(self, client):
        """GET /auth/me returns user info with email and role."""
        resp = client.get("/auth/me")
        data = resp.json()
        has_email = "email" in data
        has_role = "role" in data
        assert has_email, f"Missing email in /auth/me response: {data}"
        assert has_role, f"Missing role in /auth/me response: {data}"

    def test_auth_me_email_matches_recruiter(self, client):
        """GET /auth/me email matches the recruiter login email."""
        resp = client.get("/auth/me")
        data = resp.json()
        email = data.get("email", "")
        assert email == RECRUITER_EMAIL, f"Expected {RECRUITER_EMAIL}, got {email}"

    # ──────────────────────────────────────────
    # LOGOUT
    # ──────────────────────────────────────────

    def test_logout_returns_success(self, base_url, recruiter_credentials):
        """POST /auth/logout with valid token returns 200."""
        with httpx.Client(base_url=base_url, timeout=30.0) as c:
            # Login first to get a fresh token for logout
            login_resp = c.post("/auth/organization-user/login", json=recruiter_credentials)
            token = login_resp.json().get("access_token") or login_resp.json().get("token")
            resp = c.post("/auth/logout", headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            })
            assert resp.status_code == 200, (
                f"Logout failed: {resp.status_code} — {resp.text}"
            )

    # ──────────────────────────────────────────
    # FAILURE SCENARIOS
    # ──────────────────────────────────────────

    def test_wrong_password_returns_401(self, raw_client):
        """Login with the wrong password should return 401 Unauthorized."""
        resp = raw_client.post("/auth/organization-user/login", json={
            "email": RECRUITER_EMAIL,
            "password": "WRONG_PASSWORD_123"
        })
        assert resp.status_code in (401, 400, 422), (
            f"Expected 4xx on wrong password, got {resp.status_code}"
        )

    def test_wrong_email_returns_401(self, raw_client):
        """Login with a non-existent email should return 401."""
        resp = raw_client.post("/auth/organization-user/login", json={
            "email": "nonexistent_recruiter@eramatch.com",
            "password": RECRUITER_PASSWORD
        })
        assert resp.status_code in (401, 400, 404, 422), (
            f"Expected 4xx on wrong email, got {resp.status_code}"
        )

    def test_empty_email_returns_error(self, raw_client):
        """Login with empty email should return 422 (validation error)."""
        resp = raw_client.post("/auth/organization-user/login", json={
            "email": "",
            "password": RECRUITER_PASSWORD
        })
        assert resp.status_code in (400, 422), (
            f"Expected 400/422 on empty email, got {resp.status_code}"
        )

    def test_empty_password_returns_error(self, raw_client):
        """Login with empty password should return 422 or 401."""
        resp = raw_client.post("/auth/organization-user/login", json={
            "email": RECRUITER_EMAIL,
            "password": ""
        })
        assert resp.status_code in (400, 401, 422), (
            f"Expected 4xx on empty password, got {resp.status_code}"
        )

    def test_missing_fields_returns_422(self, raw_client):
        """Login with completely missing fields should return 422."""
        resp = raw_client.post("/auth/organization-user/login", json={})
        assert resp.status_code == 422, (
            f"Expected 422 on missing fields, got {resp.status_code}"
        )

    def test_unauthenticated_request_blocked(self, raw_client):
        """Protected endpoint without token returns 401 or 403."""
        resp = raw_client.get("/recruiter/projects")
        assert resp.status_code in (401, 403, 422), (
            f"Expected 401/403/422 without token, got {resp.status_code}"
        )

    def test_invalid_token_blocked(self, raw_client):
        """Protected endpoint with a garbage token is rejected."""
        resp = raw_client.get("/recruiter/projects", headers={
            "Authorization": "Bearer this.is.not.a.valid.token"
        })
        assert resp.status_code in (401, 403, 422), (
            f"Expected 401/403/422 with bad token, got {resp.status_code}"
        )

    def test_sql_injection_in_email_is_safe(self, raw_client):
        """SQL injection in email field should not crash the server."""
        resp = raw_client.post("/auth/organization-user/login", json={
            "email": "' OR '1'='1",
            "password": RECRUITER_PASSWORD
        })
        assert resp.status_code != 500, "Server crashed on SQL injection attempt!"
        assert resp.status_code != 200, "SQL injection unexpectedly succeeded!"

    def test_malformed_json_returns_error(self, raw_client):
        """Sending malformed JSON body should be handled gracefully."""
        resp = raw_client.post(
            "/auth/organization-user/login",
            content=b"not valid json at all {{{",
            headers={"Content-Type": "application/json"}
        )
        assert resp.status_code in (400, 422), (
            f"Expected 400/422 on malformed JSON, got {resp.status_code}"
        )


class TestForgotPassword:
    """Tests for recruiter forgot-password flow."""

    def test_forgot_password_returns_success(self, raw_client):
        """POST /auth/organization-user/forgot-password returns 200 regardless of email."""
        resp = raw_client.post("/auth/organization-user/forgot-password", json={
            "email": RECRUITER_EMAIL
        })
        assert resp.status_code == 200, (
            f"Expected 200, got {resp.status_code}: {resp.text}"
        )

    def test_forgot_password_unknown_email_still_200(self, raw_client):
        """Forgot-password with unknown email should still return 200 (no email enumeration)."""
        resp = raw_client.post("/auth/organization-user/forgot-password", json={
            "email": "unknown_user@eramatch.com"
        })
        assert resp.status_code == 200, (
            f"Expected 200 for unknown email, got {resp.status_code}"
        )

    def test_forgot_password_missing_email_returns_422(self, raw_client):
        """Forgot-password with missing email should return 422."""
        resp = raw_client.post("/auth/organization-user/forgot-password", json={})
        assert resp.status_code == 422, (
            f"Expected 422 on missing email, got {resp.status_code}"
        )
