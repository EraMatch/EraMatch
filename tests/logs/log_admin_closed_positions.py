"""
Assurance log script for Admin Closed Positions Archive functionality.
Tests: list archived projects → drill into positions → position archive details
       with all closure statuses (Filled / Cancelled / On Hold).

Run: python tests/logs/log_admin_closed_positions.py
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import uuid
from datetime import datetime
from log_utils import AssuranceLogger, get_admin_token, make_client


def run():
    log = AssuranceLogger("Admin Closed Positions Archive")
    token = get_admin_token()
    client = make_client(token)

    # ── 1. List archived projects ─────────────────────────────────────
    archived_projects = []

    def test_list_archived_projects():
        nonlocal archived_projects
        resp = client.get("/archive/projects")
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        archived_projects = resp.json()
        if archived_projects is None:
            return False, "Response was null (expected list)"
        names = [p.get("projectName") or p.get("project_name") or p.get("name", "?")
                 for p in archived_projects[:5]]
        return True, f"{len(archived_projects)} archived project(s): {names}"
    log.run("GET /archive/projects — list all archived projects", test_list_archived_projects)

    # ── 2. Date fields are parseable ─────────────────────────────────
    def test_project_dates_parseable():
        invalid = []
        for proj in archived_projects:
            for field_key in ["openDate", "open_date", "created_at", "closedDate", "closed_date"]:
                val = proj.get(field_key)
                if val:
                    try:
                        datetime.fromisoformat(val.replace("Z", "+00:00"))
                    except ValueError:
                        invalid.append(f"{proj.get('projectName','')}[{field_key}]={val}")
        if invalid:
            return False, f"Invalid date formats: {'; '.join(invalid)}"
        return True, f"All date fields in {len(archived_projects)} project(s) parse correctly"
    log.run("Project open/close dates are valid ISO format", test_project_dates_parseable)

    # ── 3. Drill into first project's positions ───────────────────────
    archived_positions = []
    first_project = None

    def test_get_positions_for_project():
        nonlocal archived_positions, first_project
        if not archived_projects:
            return True, "No archived projects to drill into (skipped)"
        first_project = archived_projects[0]
        project_id = str(first_project.get("id") or first_project.get("project_id"))
        project_name = first_project.get("projectName") or first_project.get("name", "?")
        resp = client.get(f"/archive/projects/{project_id}/positions")
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        archived_positions = resp.json()
        titles = [p.get("jobTitle") or p.get("job_title") or p.get("title", "?")
                  for p in archived_positions[:3]]
        return True, f"Project '{project_name}': {len(archived_positions)} archived position(s): {titles}"
    log.run("GET positions for first archived project", test_get_positions_for_project)

    # ── 4. Positions have closure status ─────────────────────────────
    def test_positions_have_closure_status():
        if not archived_positions:
            return True, "No archived positions (skipped)"
        valid_statuses = {"Filled", "Cancelled", "On Hold", "filled", "cancelled",
                          "on_hold", "on hold"}
        invalid = []
        for pos in archived_positions:
            status = pos.get("closureStatus") or pos.get("closure_status") or pos.get("status", "")
            if status and status not in valid_statuses:
                invalid.append(f"{pos.get('jobTitle','?')}: '{status}'")
        if invalid:
            return False, f"Invalid closure statuses: {'; '.join(invalid)}"
        statuses = {p.get("closureStatus") or p.get("closure_status") or p.get("status")
                    for p in archived_positions}
        return True, f"All closure statuses valid. Found: {statuses}"
    log.run("All archived positions have valid closure status", test_positions_have_closure_status)

    # ── 5. Drill into first position archive details ──────────────────
    position_details = {}
    first_position = None

    def test_get_position_archive_details():
        nonlocal position_details, first_position
        if not archived_positions:
            return True, "No archived positions (skipped)"
        first_position = archived_positions[0]
        pos_id = str(first_position.get("id") or first_position.get("position_id"))
        resp = client.get(f"/archive/positions/{pos_id}/details")
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        position_details = resp.json()
        return True, (
            f"jobTitle={position_details.get('jobTitle')}, "
            f"closureStatus={position_details.get('closureStatus')}, "
            f"totalCandidates={position_details.get('totalCandidates')}, "
            f"groupsCreated={position_details.get('groupsCreated')}"
        )
    log.run("GET archive details for first position", test_get_position_archive_details)

    # ── 6. Recruitment stats are non-negative ─────────────────────────
    def test_recruitment_stats_non_negative():
        if not position_details:
            return True, "No position details (skipped)"
        stat_fields = ["totalCandidates", "groupsCreated", "assessmentsPassed",
                       "aiInterviewsPassed", "liveInterviewsPassed"]
        negatives = [(f, position_details[f]) for f in stat_fields
                     if f in position_details and position_details[f] < 0]
        if negatives:
            return False, f"Negative recruitment stats: {negatives}"
        found_stats = {f: position_details.get(f) for f in stat_fields if f in position_details}
        return True, f"All stats non-negative: {found_stats}"
    log.run("Archive details recruitment stats are all ≥ 0", test_recruitment_stats_non_negative)

    # ── 7. Filled position has hiredCandidate key ─────────────────────
    def test_filled_has_hired_candidate_key():
        if not position_details:
            return True, "No position details (skipped)"
        if position_details.get("closureStatus") == "Filled":
            if "hiredCandidate" not in position_details:
                return False, "Filled position missing 'hiredCandidate' key"
            hired = position_details["hiredCandidate"]
            return True, f"hiredCandidate present: {hired}"
        return True, f"Position is not Filled (status={position_details.get('closureStatus')}) — skip"
    log.run("Filled position has 'hiredCandidate' key (may be null)", test_filled_has_hired_candidate_key)

    # ── 8. Scan all closure status types across all positions ─────────
    def test_closure_status_coverage():
        if not archived_projects:
            return True, "No archived projects (skipped)"
        # Collect all statuses from positions of all archived projects
        all_statuses = set()
        for proj in archived_projects[:3]:  # Check first 3 projects max to avoid too many calls
            proj_id = str(proj.get("id") or proj.get("project_id"))
            resp = client.get(f"/archive/projects/{proj_id}/positions")
            if resp.status_code == 200:
                for pos in resp.json():
                    s = pos.get("closureStatus") or pos.get("closure_status") or pos.get("status")
                    if s:
                        all_statuses.add(s)
        return True, f"Closure statuses found across archive: {all_statuses}"
    log.run("Survey closure status variety across archived projects", test_closure_status_coverage)

    # ── 9. Non-existent project positions return 404 ──────────────────
    def test_nonexistent_project_404():
        fake_id = str(uuid.uuid4())
        resp = client.get(f"/archive/projects/{fake_id}/positions")
        if resp.status_code not in (404, 422):
            return False, f"Expected 404/422, got {resp.status_code}"
        return True, f"Non-existent project positions return HTTP {resp.status_code}"
    log.run("Non-existent project positions return 404/422", test_nonexistent_project_404)

    # ── 10. Non-existent position details return 404 ──────────────────
    def test_nonexistent_position_404():
        fake_id = str(uuid.uuid4())
        resp = client.get(f"/archive/positions/{fake_id}/details")
        if resp.status_code not in (404, 422):
            return False, f"Expected 404/422, got {resp.status_code}"
        return True, f"Non-existent position details return HTTP {resp.status_code}"
    log.run("Non-existent position archive details return 404/422", test_nonexistent_position_404)

    client.close()
    return log.finish()


if __name__ == "__main__":
    run()
