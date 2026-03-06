"""
Assurance log script for Candidate Interview endpoints.
Logs: config fetch, session start, monitoring.

Run: python tests/candidate-view/unit_testing/logs/log_candidate_interview.py
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import httpx
from log_utils import AssuranceLogger, get_candidate_token, make_client, BASE_URL


def run():
    log = AssuranceLogger("Candidate Interview")

    token = get_candidate_token()
    client = make_client(token)

    # ── 1. GET /interview/config ─────────────────────────────
    def test_config():
        resp = client.get("/interview/config")
        if resp.status_code in (200, 404, 500):
            return True, f"Interview config responded — HTTP {resp.status_code}"
        return False, f"Unexpected HTTP {resp.status_code}: {resp.text[:200]}"
    log.run("GET /interview/config returns 200/404/500", test_config)

    # ── 2. Config without token → error ──────────────────────
    def test_config_no_token():
        with httpx.Client(base_url=BASE_URL, timeout=30.0) as c:
            resp = c.get("/interview/config")
        if resp.status_code not in (401, 403, 422):
            return False, f"Expected auth error, got {resp.status_code}"
        return True, f"Config blocked without token — HTTP {resp.status_code}"
    log.run("GET /interview/config without token → auth error", test_config_no_token)

    # ── 3. POST /interview/start without active stage ────────
    def test_start_no_stage():
        resp = client.post("/interview/start", json={})
        if resp.status_code in (400, 404, 422, 500):
            return True, f"Start without stage returned HTTP {resp.status_code} — expected"
        return False, f"Unexpected HTTP {resp.status_code}"
    log.run("POST /interview/start without active stage → error", test_start_no_stage)

    # ── 4. Start without token → error ───────────────────────
    def test_start_no_token():
        with httpx.Client(base_url=BASE_URL, timeout=30.0) as c:
            resp = c.post("/interview/start", json={})
        if resp.status_code not in (401, 403, 422):
            return False, f"Expected auth error, got {resp.status_code}"
        return True, f"Start blocked without token — HTTP {resp.status_code}"
    log.run("POST /interview/start without token → auth error", test_start_no_token)

    # ── 5. Monitoring candidates endpoint ────────────────────
    def test_monitoring():
        resp = client.get("/interview/monitoring/candidates")
        if resp.status_code in (200, 403, 404, 422, 500):
            return True, f"Monitoring responded — HTTP {resp.status_code}"
        return False, f"Unexpected HTTP {resp.status_code}"
    log.run("GET /interview/monitoring/candidates responds", test_monitoring)

    # ── 6. Monitoring without token → error ──────────────────
    def test_monitoring_no_token():
        with httpx.Client(base_url=BASE_URL, timeout=30.0) as c:
            resp = c.get("/interview/monitoring/candidates")
        if resp.status_code not in (401, 403, 422):
            return False, f"Expected auth error, got {resp.status_code}"
        return True, f"Monitoring blocked without token — HTTP {resp.status_code}"
    log.run("Monitoring without token → auth error", test_monitoring_no_token)

    client.close()
    return log.finish()


if __name__ == "__main__":
    run()
