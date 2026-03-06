"""
Assurance log script for Recruiter Analytics functionality.
Run: python tests/recruiter-view/unit_testing/logs/log_recruiter_analytics.py
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from log_utils import AssuranceLogger, get_recruiter_token, make_client, BASE_URL
import httpx


def run():
    log = AssuranceLogger("Recruiter Analytics")
    token = get_recruiter_token()
    client = make_client(token)

    def test_analytics_returns_200():
        resp = client.get("/recruiter/analytics")
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        data = resp.json()
        if not isinstance(data, dict):
            return False, f"Expected dict, got {type(data)}"
        return True, f"Analytics keys: {list(data.keys())}"
    log.run("GET /recruiter/analytics returns 200 + dict", test_analytics_returns_200)

    def test_analytics_non_negative():
        resp = client.get("/recruiter/analytics")
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}"
        data = resp.json()
        negatives = [k for k, v in data.items() if isinstance(v, (int, float)) and v < 0]
        if negatives:
            return False, f"Negative values in: {negatives}"
        return True, "All numeric values are non-negative"
    log.run("Analytics numeric values are non-negative", test_analytics_non_negative)

    def test_analytics_unauthenticated():
        with httpx.Client(base_url=BASE_URL, timeout=30.0) as c:
            resp = c.get("/recruiter/analytics")
        if resp.status_code not in (401, 403, 422):
            return False, f"Expected 401/403, got {resp.status_code}"
        return True, f"Unauthenticated request blocked with HTTP {resp.status_code}"
    log.run("GET /recruiter/analytics without token is blocked", test_analytics_unauthenticated)

    client.close()
    return log.finish()


if __name__ == "__main__":
    run()
