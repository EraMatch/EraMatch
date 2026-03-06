"""
Assurance log script for Candidate Login functionality.
Logs every step of the login flow with timing and detailed output.

Run: python tests/candidate-view/unit_testing/logs/log_candidate_login.py
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import httpx
from log_utils import AssuranceLogger, get_candidate_token, make_client, BASE_URL


def run():
    log = AssuranceLogger("Candidate Login")

    # ── 1. Valid candidate login ──────────────────────────────
    token = None

    def test_valid_login():
        nonlocal token
        with httpx.Client(base_url=BASE_URL, timeout=30.0) as c:
            resp = c.post("/candidate/login", json={
                "email": "candidate2@eramatch.com",
                "password": "test123"
            })
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        data = resp.json()
        t = data.get("access_token") or data.get("token")
        if not t:
            return False, f"No token in response: {data}"
        token = t
        return True, f"Login OK — token length={len(t)}, keys={list(data.keys())}"
    log.run("Valid candidate login returns 200 + token", test_valid_login)

    # ── 2. Token is valid JWT format ─────────────────────────
    def test_jwt_format():
        if not token:
            return False, "No token available"
        parts = token.split(".")
        if len(parts) != 3:
            return False, f"Token has {len(parts)} parts (expected 3): {token[:80]}"
        return True, "Token has correct 3-part JWT structure"
    log.run("Token has valid JWT (3-part) format", test_jwt_format)

    # ── 3. Refresh token present ─────────────────────────────
    def test_refresh_token():
        with httpx.Client(base_url=BASE_URL, timeout=30.0) as c:
            resp = c.post("/candidate/login", json={
                "email": "candidate2@eramatch.com",
                "password": "test123"
            })
        data = resp.json()
        if "refresh_token" not in data:
            return False, f"No refresh_token in response: {list(data.keys())}"
        return True, f"Refresh token present, length={len(data['refresh_token'])}"
    log.run("Login response contains refresh_token", test_refresh_token)

    # ── 4. Token grants access to profile ────────────────────
    def test_token_grants_access():
        if not token:
            return False, "No token to test"
        with httpx.Client(base_url=BASE_URL, timeout=30.0) as c:
            resp = c.get("/candidate/me",
                         headers={"Authorization": f"Bearer {token}"})
        if resp.status_code != 200:
            return False, f"Profile endpoint returned {resp.status_code}: {resp.text[:200]}"
        return True, f"Profile accessible — status 200, keys={list(resp.json().keys())}"
    log.run("Token grants access to /candidate/me", test_token_grants_access)

    # ── 5. Wrong password blocked ────────────────────────────
    def test_wrong_password():
        with httpx.Client(base_url=BASE_URL, timeout=30.0) as c:
            resp = c.post("/candidate/login", json={
                "email": "candidate2@eramatch.com",
                "password": "WRONG_PASSWORD_!!!"
            })
        if resp.status_code not in (400, 401, 422):
            return False, f"Expected 4xx, got {resp.status_code}: {resp.text[:200]}"
        return True, f"Wrong password correctly rejected with HTTP {resp.status_code}"
    log.run("Wrong password returns 4xx (not 200)", test_wrong_password)

    # ── 6. Unknown email blocked ─────────────────────────────
    def test_unknown_email():
        with httpx.Client(base_url=BASE_URL, timeout=30.0) as c:
            resp = c.post("/candidate/login", json={
                "email": "nobody_exists_here@eramatch.com",
                "password": "test123"
            })
        if resp.status_code not in (400, 401, 404, 422):
            return False, f"Expected 4xx, got {resp.status_code}: {resp.text[:200]}"
        return True, f"Unknown email correctly rejected with HTTP {resp.status_code}"
    log.run("Non-existent email returns 4xx", test_unknown_email)

    # ── 7. Empty credentials blocked ─────────────────────────
    def test_empty_credentials():
        with httpx.Client(base_url=BASE_URL, timeout=30.0) as c:
            resp = c.post("/candidate/login", json={"email": "", "password": ""})
        if resp.status_code not in (400, 401, 422):
            return False, f"Expected 4xx, got {resp.status_code}"
        return True, f"Empty credentials rejected with HTTP {resp.status_code}"
    log.run("Empty credentials return 4xx", test_empty_credentials)

    # ── 8. Missing fields ────────────────────────────────────
    def test_missing_fields():
        with httpx.Client(base_url=BASE_URL, timeout=30.0) as c:
            resp = c.post("/candidate/login", json={})
        if resp.status_code != 422:
            return False, f"Expected 422, got {resp.status_code}"
        return True, "Missing fields correctly return HTTP 422"
    log.run("Missing fields return 422 validation error", test_missing_fields)

    # ── 9. No token → protected endpoint blocked ─────────────
    def test_no_token_blocked():
        with httpx.Client(base_url=BASE_URL, timeout=30.0) as c:
            resp = c.get("/candidate/me")
        if resp.status_code not in (401, 403, 422):
            return False, f"Expected 401/403/422 without token, got {resp.status_code}"
        return True, f"Unauthenticated request blocked with HTTP {resp.status_code}"
    log.run("Request without token is blocked (401/403)", test_no_token_blocked)

    # ── 10. Invalid token blocked ────────────────────────────
    def test_invalid_token():
        with httpx.Client(base_url=BASE_URL, timeout=30.0) as c:
            resp = c.get("/candidate/me",
                         headers={"Authorization": "Bearer garbage.token.here"})
        if resp.status_code not in (401, 403, 422):
            return False, f"Expected 401/403/422, got {resp.status_code}"
        return True, f"Bad token rejected with HTTP {resp.status_code}"
    log.run("Garbage token is rejected (401/403)", test_invalid_token)

    # ── 11. SQL injection safety ─────────────────────────────
    def test_sql_injection():
        with httpx.Client(base_url=BASE_URL, timeout=30.0) as c:
            resp = c.post("/candidate/login", json={
                "email": "' OR '1'='1'; --",
                "password": "anything"
            })
        if resp.status_code == 500:
            return False, "Server returned 500 on SQL injection — possible vulnerability!"
        if resp.status_code == 200:
            return False, "SQL injection unexpectedly succeeded — critical!"
        return True, f"SQL injection safely rejected with HTTP {resp.status_code}"
    log.run("SQL injection in email is safely rejected", test_sql_injection)

    return log.finish()


if __name__ == "__main__":
    run()
