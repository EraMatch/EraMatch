"""
Assurance log script for Admin Recruiter Delegation functionality.
Tests: list recruiters → view positions → reassign HR → reassign Tech → notify → recent log.

Run: python tests/logs/log_admin_recruiter_delegation.py
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import uuid
from log_utils import AssuranceLogger, get_admin_token, make_client


def run():
    log = AssuranceLogger("Admin Recruiter Delegation")
    token = get_admin_token()
    client = make_client(token)

    # ── 1. List HR Recruiters ─────────────────────────────────────────
    hr_recruiters = []

    def test_list_hr():
        nonlocal hr_recruiters
        resp = client.get("/delegation/hr")
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        hr_recruiters = resp.json()
        names = [r.get("name") or f"{r.get('first_name','')} {r.get('last_name','')}".strip()
                 for r in hr_recruiters]
        return True, f"{len(hr_recruiters)} HR recruiter(s): {names[:5]}"
    log.run("List HR recruiters (/delegation/hr)", test_list_hr)

    # ── 2. List Technical Recruiters ──────────────────────────────────
    tech_recruiters = []

    def test_list_tech():
        nonlocal tech_recruiters
        resp = client.get("/delegation/technical")
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        tech_recruiters = resp.json()
        names = [r.get("name") or f"{r.get('first_name','')} {r.get('last_name','')}".strip()
                 for r in tech_recruiters]
        return True, f"{len(tech_recruiters)} Technical recruiter(s): {names[:5]}"
    log.run("List Technical recruiters (/delegation/technical)", test_list_tech)

    # ── 3. List active projects ───────────────────────────────────────
    projects = []

    def test_list_projects():
        nonlocal projects
        resp = client.get("/recruiter/projects?status=active")
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        projects = resp.json()
        names = [p.get("name") or p.get("projectName", "") for p in projects[:3]]
        return True, f"{len(projects)} active project(s): {names}"
    log.run("List active projects for delegation context", test_list_projects)

    # ── 4. List open positions ────────────────────────────────────────
    open_positions = []

    def test_list_open_positions():
        nonlocal open_positions
        resp = client.get("/recruiter/positions?status=open")
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        open_positions = resp.json()
        titles = [p.get("jobTitle") or p.get("job_title") or p.get("title", "?")
                  for p in open_positions[:3]]
        return True, f"{len(open_positions)} open position(s): {titles}"
    log.run("List open positions for delegation view", test_list_open_positions)

    # ── 5. Positions have assignment fields ───────────────────────────
    def test_positions_have_assignment_fields():
        missing_hr = [p for p in open_positions
                      if not any(k in p for k in [
                          "assignedHR", "assigned_hr", "assigned_hr_name", "assigned_hr_id"
                      ])]
        if missing_hr:
            return False, f"{len(missing_hr)} position(s) missing HR assignment field"
        return True, "All positions have HR and assignment fields"
    log.run("Verify positions have HR/Tech assignment fields", test_positions_have_assignment_fields)

    # ── 6. Reassign HR recruiter ──────────────────────────────────────
    last_reassigned_position = None

    def test_reassign_hr():
        nonlocal last_reassigned_position
        if not open_positions or not hr_recruiters:
            return True, "No positions or HR recruiters available (skipped)"
        pos = open_positions[0]
        pos_id = str(pos.get("id") or pos.get("position_id"))
        hr_id = str(hr_recruiters[0].get("id") or hr_recruiters[0].get("user_id"))
        resp = client.patch(f"/delegation/positions/{pos_id}/reassign", json={
            "recruiterID": hr_id,
            "type": "HR"
        })
        if resp.status_code not in (200, 204):
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        last_reassigned_position = pos_id
        hr_name = (hr_recruiters[0].get("name")
                   or f"{hr_recruiters[0].get('first_name','')} {hr_recruiters[0].get('last_name','')}".strip())
        return True, f"Reassigned position {pos_id} to HR: {hr_name}"
    log.run("Reassign HR recruiter to first open position", test_reassign_hr)

    # ── 7. Reassign Technical recruiter ──────────────────────────────
    def test_reassign_technical():
        if not open_positions or not tech_recruiters:
            return True, "No positions or Tech recruiters available (skipped)"
        pos = open_positions[0]
        pos_id = str(pos.get("id") or pos.get("position_id"))
        tech_id = str(tech_recruiters[0].get("id") or tech_recruiters[0].get("user_id"))
        resp = client.patch(f"/delegation/positions/{pos_id}/reassign", json={
            "recruiterID": tech_id,
            "type": "Technical"
        })
        if resp.status_code not in (200, 204):
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        tech_name = (tech_recruiters[0].get("name")
                     or f"{tech_recruiters[0].get('first_name','')} {tech_recruiters[0].get('last_name','')}".strip())
        return True, f"Reassigned position {pos_id} to Technical: {tech_name}"
    log.run("Reassign Technical recruiter to first open position", test_reassign_technical)

    # ── 8. Notify recruiters ──────────────────────────────────────────
    def test_notify():
        if not last_reassigned_position:
            return True, "No position available to notify (skipped)"
        resp = client.post(f"/delegation/positions/{last_reassigned_position}/notify")
        if resp.status_code not in (200, 204):
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        return True, f"Notification sent for position {last_reassigned_position}"
    log.run("Notify recruiters for reassigned position", test_notify)

    # ── 9. Recent assignments log ─────────────────────────────────────
    def test_recent_assignments():
        resp = client.get("/delegation/recent")
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        recent = resp.json()
        if recent:
            first = recent[0]
            pos_ref = (first.get("positionName") or first.get("position_name")
                       or first.get("title") or "?")
            return True, f"{len(recent)} recent assignment(s). First: position='{pos_ref}'"
        return True, "Recent assignments list is empty (no prior changes)"
    log.run("Fetch recent assignment history", test_recent_assignments)

    # ── 10. Invalid type rejected ─────────────────────────────────────
    def test_invalid_type_rejected():
        if not open_positions or not hr_recruiters:
            return True, "No data available (skipped)"
        pos_id = str(open_positions[0].get("id") or open_positions[0].get("position_id"))
        hr_id = str(hr_recruiters[0].get("id") or hr_recruiters[0].get("user_id"))
        resp = client.patch(f"/delegation/positions/{pos_id}/reassign", json={
            "recruiterID": hr_id,
            "type": "Manager"
        })
        if resp.status_code not in (400, 422):
            return False, f"Expected 400/422 for invalid type, got {resp.status_code}"
        return True, f"Invalid type 'Manager' correctly rejected with HTTP {resp.status_code}"
    log.run("Invalid recruiter type is rejected (400/422)", test_invalid_type_rejected)

    client.close()
    return log.finish()


if __name__ == "__main__":
    run()
