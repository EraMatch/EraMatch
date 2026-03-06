"""
Assurance log script for Recruiter Login functionality.
Run: python tests/recruiter-view/unit_testing/logs/log_recruiter_login.py
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import httpx
from log_utils import AssuranceLogger, get_recruiter_token, make_client, BASE_URL, RECRUITER_EMAIL, RECRUITER_PASSWORD


def run():
    log = AssuranceLogger("Recruiter Login")

    token = None

    def test_valid_login():
        nonlocal token
        with httpx.Client(base_url=BASE_URL, timeout=30.0) as c:
            resp = c.post("/auth/organization-user/login", json={
                "email": RECRUITER_EMAIL,
                "password": RECRUITER_PASSWORD
            })
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        data = resp.json()
        t = data.get("access_token") or data.get("token")
        if not t:
            return False, f"No token in response: {data}"
        token = t
        return True, f"Login OK — token length={len(t)}, keys={list(data.keys())}"
    log.run("Valid recruiter login returns 200 + token", test_valid_login)

    def test_jwt_format():
        if not token:
            return False, "No token available"
        parts = token.split(".")
        if len(parts) != 3:
            return False, f"Token has {len(parts)} parts (expected 3): {token[:80]}"
        return True, "Token has correct 3-part JWT structure"
    log.run("Token has valid JWT (3-part) format", test_jwt_format)

    def test_token_grants_access():
        if not token:
            return False, "No token to test"
        with httpx.Client(base_url=BASE_URL, timeout=30.0) as c:
            resp = c.get("/recruiter/projects",
                         headers={"Authorization": f"Bearer {token}"})
        if resp.status_code != 200:
            return False, f"Protected endpoint returned {resp.status_code}: {resp.text[:200]}"
        return True, f"Protected endpoint accessible — status 200"
    log.run("Token grants access to /recruiter/projects", test_token_grants_access)

    def test_auth_me():
        if not token:
            return False, "No token to test"
        with httpx.Client(base_url=BASE_URL, timeout=30.0) as c:
            resp = c.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        data = resp.json()
        email = data.get("email", "")
        if email != RECRUITER_EMAIL:
            return False, f"Expected {RECRUITER_EMAIL}, got {email}"
        return True, f"/auth/me returned email={email}, role={data.get('role')}"
    log.run("GET /auth/me returns correct recruiter info", test_auth_me)

    def test_wrong_password():
        with httpx.Client(base_url=BASE_URL, timeout=30.0) as c:
            resp = c.post("/auth/organization-user/login", json={
                "email": RECRUITER_EMAIL,
                "password": "WRONG_PASSWORD_!!!"
            })
        if resp.status_code not in (400, 401, 422):
            return False, f"Expected 4xx, got {resp.status_code}: {resp.text[:200]}"
        return True, f"Wrong password correctly rejected with HTTP {resp.status_code}"
    log.run("Wrong password returns 4xx (not 200)", test_wrong_password)

    def test_unknown_email():
        with httpx.Client(base_url=BASE_URL, timeout=30.0) as c:
            resp = c.post("/auth/organization-user/login", json={
                "email": "nobody_exists_here@eramatch.com",
                "password": RECRUITER_PASSWORD
            })
        if resp.status_code not in (400, 401, 404, 422):
            return False, f"Expected 4xx, got {resp.status_code}: {resp.text[:200]}"
        return True, f"Unknown email correctly rejected with HTTP {resp.status_code}"
    log.run("Non-existent email returns 4xx", test_unknown_email)

    def test_empty_credentials():
        with httpx.Client(base_url=BASE_URL, timeout=30.0) as c:
            resp = c.post("/auth/organization-user/login", json={"email": "", "password": ""})
        if resp.status_code not in (400, 401, 422):
            return False, f"Expected 4xx, got {resp.status_code}"
        return True, f"Empty credentials rejected with HTTP {resp.status_code}"
    log.run("Empty credentials return 4xx", test_empty_credentials)

    def test_missing_fields():
        with httpx.Client(base_url=BASE_URL, timeout=30.0) as c:
            resp = c.post("/auth/organization-user/login", json={})
        if resp.status_code != 422:
            return False, f"Expected 422, got {resp.status_code}"
        return True, "Missing fields correctly return HTTP 422"
    log.run("Missing fields return 422 validation error", test_missing_fields)

    def test_no_token_blocked():
        with httpx.Client(base_url=BASE_URL, timeout=30.0) as c:
            resp = c.get("/recruiter/projects")
        if resp.status_code not in (401, 403):
            return False, f"Expected 401/403 without token, got {resp.status_code}"
        return True, f"Unauthenticated request blocked with HTTP {resp.status_code}"
    log.run("Request without token is blocked (401/403)", test_no_token_blocked)

    def test_sql_injection():
        with httpx.Client(base_url=BASE_URL, timeout=30.0) as c:
            resp = c.post("/auth/organization-user/login", json={
                "email": "' OR '1'='1'; --",
                "password": "anything"
            })
        if resp.status_code == 500:
            return False, "Server returned 500 on SQL injection — possible vulnerability!"
        if resp.status_code == 200:
            return False, "SQL injection succeeded — critical security issue!"
        return True, f"SQL injection safely rejected with HTTP {resp.status_code}"
    log.run("SQL injection in email is safely rejected", test_sql_injection)

    return log.finish()


if __name__ == "__main__":
    run()
