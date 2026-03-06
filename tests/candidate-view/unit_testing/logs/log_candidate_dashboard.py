"""
Assurance log script for Candidate Dashboard / Portal.
Logs profile, home, and assessments list endpoint results.

Run: python tests/candidate-view/unit_testing/logs/log_candidate_dashboard.py
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import httpx
from log_utils import AssuranceLogger, get_candidate_token, make_client, BASE_URL


def run():
    log = AssuranceLogger("Candidate Dashboard")

    token = get_candidate_token()
    client = make_client(token)

    # ── 1. GET /candidate/me ─────────────────────────────────
    def test_profile():
        resp = client.get("/candidate/me")
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        data = resp.json()
        email = data.get("email") or data.get("candidate", {}).get("email")
        return True, f"Profile OK — email={email}, keys={list(data.keys())}"
    log.run("GET /candidate/me returns 200 + profile data", test_profile)

    # ── 2. Profile has name fields ───────────────────────────
    def test_profile_name():
        resp = client.get("/candidate/me")
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}"
        data = resp.json()
        flat = data if "first_name" in data else data.get("candidate", data.get("data", {}))
        has_name = any(k in flat for k in ("first_name", "full_name", "name"))
        if not has_name:
            return False, f"No name fields found: {list(flat.keys())}"
        return True, f"Name fields present in profile"
    log.run("Profile contains name information", test_profile_name)

    # ── 3. Profile without token blocked ─────────────────────
    def test_profile_no_token():
        with httpx.Client(base_url=BASE_URL, timeout=30.0) as c:
            resp = c.get("/candidate/me")
        if resp.status_code not in (401, 403, 422):
            return False, f"Expected auth error, got {resp.status_code}"
        return True, f"Profile blocked without token — HTTP {resp.status_code}"
    log.run("GET /candidate/me without token → auth error", test_profile_no_token)

    # ── 4. GET /candidate/home ───────────────────────────────
    def test_home():
        resp = client.get("/candidate/home")
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        data = resp.json()
        return True, f"Home OK — keys={list(data.keys())}"
    log.run("GET /candidate/home returns 200", test_home)

    # ── 5. Home has pipeline stages ──────────────────────────
    def test_home_stages():
        resp = client.get("/candidate/home")
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}"
        data = resp.json()
        stage_keys = ("pipeline_stages", "stages", "steps", "pipeline", "group_pipeline_stages")
        found = [k for k in stage_keys if k in data]
        if not found:
            return False, f"No stage keys in: {list(data.keys())}"
        return True, f"Pipeline stages found: {found}"
    log.run("Home response contains pipeline stages", test_home_stages)

    # ── 6. Home without token blocked ────────────────────────
    def test_home_no_token():
        with httpx.Client(base_url=BASE_URL, timeout=30.0) as c:
            resp = c.get("/candidate/home")
        if resp.status_code not in (401, 403, 422):
            return False, f"Expected auth error, got {resp.status_code}"
        return True, f"Home blocked without token — HTTP {resp.status_code}"
    log.run("GET /candidate/home without token → auth error", test_home_no_token)

    # ── 7. GET /candidate/assessments ────────────────────────
    def test_assessments_list():
        resp = client.get("/candidate/assessments")
        if resp.status_code not in (200, 404):
            return False, f"Expected 200 or 404, got {resp.status_code}: {resp.text[:200]}"
        if resp.status_code == 200:
            data = resp.json()
            is_list = isinstance(data, list) or isinstance(data.get("assessments", None), list)
            return True, f"Assessments returned (200), is_list={is_list}"
        return True, f"No assessments found (404) — acceptable"
    log.run("GET /candidate/assessments returns 200/404", test_assessments_list)

    client.close()
    return log.finish()


if __name__ == "__main__":
    run()
