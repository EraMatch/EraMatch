"""
Assurance log script for Recruiter Positions functionality.
Run: python tests/recruiter-view/unit_testing/logs/log_recruiter_positions.py
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import uuid
from log_utils import AssuranceLogger, get_recruiter_token, make_client


def run():
    log = AssuranceLogger("Recruiter Positions")
    token = get_recruiter_token()
    client = make_client(token)

    position_id = None

    def test_list_positions():
        nonlocal position_id
        resp = client.get("/recruiter/positions")
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        data = resp.json()
        if not isinstance(data, list):
            return False, f"Expected list, got {type(data)}"
        if data:
            position_id = str(data[0].get("id") or data[0].get("position_id"))
        return True, f"Listed {len(data)} positions"
    log.run("GET /recruiter/positions returns 200 + list", test_list_positions)

    def test_get_position():
        if not position_id:
            return False, "No positions available"
        resp = client.get(f"/recruiter/positions/{position_id}")
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        data = resp.json()
        has_title = any(k in data for k in ["title", "job_title", "jobTitle"])
        if not has_title:
            return False, f"Position missing title: {list(data.keys())}"
        return True, f"Got position: {data.get('title') or data.get('job_title') or data.get('jobTitle')}"
    log.run("GET /recruiter/positions/{id} returns detail", test_get_position)

    def test_position_insights():
        if not position_id:
            return False, "No positions available"
        resp = client.get(f"/recruiter/positions/{position_id}/insights")
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        return True, f"Insights keys: {list(resp.json().keys())}"
    log.run("GET /recruiter/positions/{id}/insights returns metrics", test_position_insights)

    def test_position_groups():
        if not position_id:
            return False, "No positions available"
        resp = client.get(f"/recruiter/positions/{position_id}/groups")
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        data = resp.json()
        if not isinstance(data, list):
            return False, f"Expected list, got {type(data)}"
        return True, f"Position has {len(data)} groups"
    log.run("GET /recruiter/positions/{id}/groups returns list", test_position_groups)

    def test_fake_position_404():
        fake_id = str(uuid.uuid4())
        resp = client.get(f"/recruiter/positions/{fake_id}")
        if resp.status_code not in (404, 403, 422):
            return False, f"Expected 4xx, got {resp.status_code}"
        return True, f"Fake position correctly returned HTTP {resp.status_code}"
    log.run("GET /recruiter/positions/{fake_id} returns 4xx", test_fake_position_404)

    client.close()
    return log.finish()


if __name__ == "__main__":
    run()
