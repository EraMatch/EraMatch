"""
Assurance log script for Recruiter Group Management functionality.
Run: python tests/recruiter-view/unit_testing/logs/log_recruiter_groups.py
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import uuid
from log_utils import AssuranceLogger, get_recruiter_token, make_client


def run():
    log = AssuranceLogger("Recruiter Group Management")
    token = get_recruiter_token()
    client = make_client(token)

    group_id = None

    # Find a group through positions
    def test_find_group():
        nonlocal group_id
        pos_resp = client.get("/recruiter/positions")
        if pos_resp.status_code != 200 or not pos_resp.json():
            return False, "No positions available to find groups"
        position_id = str(pos_resp.json()[0].get("id") or pos_resp.json()[0].get("position_id"))
        groups_resp = client.get(f"/recruiter/positions/{position_id}/groups")
        if groups_resp.status_code != 200 or not groups_resp.json():
            return False, f"No groups for position {position_id}"
        group_id = str(groups_resp.json()[0].get("id") or groups_resp.json()[0].get("group_id"))
        return True, f"Found group {group_id}"
    log.run("Discover a group from positions", test_find_group)

    def test_group_details():
        if not group_id:
            return False, "No group available"
        resp = client.get(f"/recruiter/groups/{group_id}")
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        data = resp.json()
        has_name = any(k in data for k in ["name", "group_name", "groupName"])
        if not has_name:
            return False, f"Group missing name: {list(data.keys())}"
        return True, f"Group name: {data.get('name') or data.get('group_name')}"
    log.run("GET /recruiter/groups/{id} returns detail", test_group_details)

    def test_group_stats():
        if not group_id:
            return False, "No group available"
        resp = client.get(f"/recruiter/groups/{group_id}/stats")
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        return True, f"Stats keys: {list(resp.json().keys())}"
    log.run("GET /recruiter/groups/{id}/stats returns stats", test_group_stats)

    def test_candidate_progress():
        if not group_id:
            return False, "No group available"
        resp = client.get(f"/recruiter/groups/{group_id}/candidates/progress")
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        data = resp.json()
        if not isinstance(data, list):
            return False, f"Expected list, got {type(data)}"
        return True, f"Progress list has {len(data)} candidates"
    log.run("GET /recruiter/groups/{id}/candidates/progress returns list", test_candidate_progress)

    def test_activity_log():
        if not group_id:
            return False, "No group available"
        resp = client.get(f"/recruiter/groups/{group_id}/activity")
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        data = resp.json()
        if not isinstance(data, list):
            return False, f"Expected list, got {type(data)}"
        return True, f"Activity log has {len(data)} entries"
    log.run("GET /recruiter/groups/{id}/activity returns list", test_activity_log)

    def test_fake_group_404():
        fake_id = str(uuid.uuid4())
        resp = client.get(f"/recruiter/groups/{fake_id}")
        if resp.status_code not in (404, 403, 422):
            return False, f"Expected 4xx, got {resp.status_code}"
        return True, f"Fake group correctly returned HTTP {resp.status_code}"
    log.run("GET /recruiter/groups/{fake_id} returns 4xx", test_fake_group_404)

    client.close()
    return log.finish()


if __name__ == "__main__":
    run()
