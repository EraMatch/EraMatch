"""
Tests for Candidate Login functionality.
Covers: authentication, token structure, refresh, error handling, security.

Backend endpoint: POST /candidate/login
Candidate credentials: candidate2@eramatch.com / test123
"""
import httpx
import pytest

BASE_URL = "http://localhost:8000/api/v1"


class TestCandidateLogin:
    """Test suite for candidate login / authentication."""

    # ──────────────────────────────────────────
    # SUCCESS SCENARIOS
    # ──────────────────────────────────────────

    def test_valid_login_returns_200(self, raw_client):
        """Candidate can log in with correct credentials and receives HTTP 200."""
        resp = raw_client.post("/candidate/login", json={
            "email": "candidate2@eramatch.com",
            "password": "test123"
        })
        assert resp.status_code == 200, (
            f"Expected 200 but got {resp.status_code}. Body: {resp.text}"
        )

    def test_valid_login_returns_access_token(self, raw_client):
        """Successful login response contains an access_token."""
        resp = raw_client.post("/candidate/login", json={
            "email": "candidate2@eramatch.com",
            "password": "test123"
        })
        data = resp.json()
        token = data.get("access_token") or data.get("token")
        assert token is not None, f"No token in response: {data}"
        assert len(token) > 20, f"Token appears too short: {token}"

    def test_valid_login_returns_refresh_token(self, raw_client):
        """Successful login response contains a refresh_token."""
        resp = raw_client.post("/candidate/login", json={
            "email": "candidate2@eramatch.com",
            "password": "test123"
        })
        data = resp.json()
        assert "refresh_token" in data, f"No refresh_token in response: {data}"

    def test_token_format_is_jwt(self, raw_client):
        """Access token should be a JWT (3 parts separated by dots)."""
        resp = raw_client.post("/candidate/login", json={
            "email": "candidate2@eramatch.com",
            "password": "test123"
        })
        data = resp.json()
        token = data.get("access_token") or data.get("token") or ""
        parts = token.split(".")
        assert len(parts) == 3, f"Token does not look like JWT: {token}"

    def test_authenticated_candidate_can_access_profile(self, client):
        """A token obtained from login grants access to candidate profile."""
        resp = client.get("/candidate/me")
        assert resp.status_code == 200, (
            f"Protected endpoint failed with candidate token: {resp.status_code} — {resp.text}"
        )

    # ──────────────────────────────────────────
    # REFRESH TOKEN
    # ──────────────────────────────────────────

    def test_refresh_token_returns_new_tokens(self, raw_client):
        """Refresh endpoint returns new access and refresh tokens."""
        # First login to get a refresh token
        login_resp = raw_client.post("/candidate/login", json={
            "email": "candidate2@eramatch.com",
            "password": "test123"
        })
        refresh_tok = login_resp.json().get("refresh_token")
        assert refresh_tok, "No refresh_token from login"

        # Use refresh token
        resp = raw_client.post("/candidate/refresh", json={
            "refresh_token": refresh_tok
        })
        assert resp.status_code == 200, (
            f"Refresh failed: {resp.status_code} — {resp.text}"
        )
        data = resp.json()
        assert "access_token" in data, f"No new access_token: {data}"

    # ──────────────────────────────────────────
    # FAILURE SCENARIOS
    # ──────────────────────────────────────────

    def test_wrong_password_returns_401(self, raw_client):
        """Login with the wrong password should return 401."""
        resp = raw_client.post("/candidate/login", json={
            "email": "candidate2@eramatch.com",
            "password": "WRONG_PASSWORD_123"
        })
        assert resp.status_code in (401, 400, 422), (
            f"Expected 4xx on wrong password, got {resp.status_code}"
        )

    def test_nonexistent_email_returns_401(self, raw_client):
        """Login with a non-existent email should return 401."""
        resp = raw_client.post("/candidate/login", json={
            "email": "nobody_exists_here@eramatch.com",
            "password": "test123"
        })
        assert resp.status_code in (401, 400, 404, 422), (
            f"Expected 4xx on wrong email, got {resp.status_code}"
        )

    def test_empty_credentials_returns_error(self, raw_client):
        """Login with empty email/password should return 4xx."""
        resp = raw_client.post("/candidate/login", json={
            "email": "",
            "password": ""
        })
        assert resp.status_code in (400, 401, 422), (
            f"Expected 4xx on empty credentials, got {resp.status_code}"
        )

    def test_missing_fields_returns_422(self, raw_client):
        """Login with completely missing fields should return 422."""
        resp = raw_client.post("/candidate/login", json={})
        assert resp.status_code == 422, (
            f"Expected 422 on missing fields, got {resp.status_code}"
        )

    def test_unauthenticated_request_blocked(self, raw_client):
        """Protected endpoint without token returns 401 or 422."""
        resp = raw_client.get("/candidate/me")
        assert resp.status_code in (401, 403, 422), (
            f"Expected 401/403/422 without token, got {resp.status_code}"
        )

    def test_invalid_token_blocked(self, raw_client):
        """Protected endpoint with a garbage token is rejected."""
        resp = raw_client.get("/candidate/me", headers={
            "Authorization": "Bearer this.is.not.a.valid.token"
        })
        assert resp.status_code in (401, 403, 422), (
            f"Expected 401/403/422 with bad token, got {resp.status_code}"
        )

    # ──────────────────────────────────────────
    # SECURITY
    # ──────────────────────────────────────────

    def test_sql_injection_in_email_is_safe(self, raw_client):
        """SQL injection in email field should not crash the server."""
        resp = raw_client.post("/candidate/login", json={
            "email": "' OR '1'='1'; --",
            "password": "test123"
        })
        assert resp.status_code != 500, "Server crashed on SQL injection attempt!"
        assert resp.status_code != 200, "SQL injection unexpectedly succeeded!"

    def test_xss_in_email_is_safe(self, raw_client):
        """XSS payload in email field should be handled safely."""
        resp = raw_client.post("/candidate/login", json={
            "email": "<script>alert('xss')</script>",
            "password": "test123"
        })
        assert resp.status_code != 500, "Server crashed on XSS payload!"
        if resp.status_code == 200:
            body = resp.text
            assert "<script>" not in body, "XSS payload reflected in response!"

    def test_malformed_json_returns_error(self, raw_client):
        """Sending malformed JSON body should be handled gracefully."""
        resp = raw_client.post(
            "/candidate/login",
            content=b"not valid json at all {{{",
            headers={"Content-Type": "application/json"}
        )
        assert resp.status_code in (400, 422), (
            f"Expected 400/422 on malformed JSON, got {resp.status_code}"
        )
