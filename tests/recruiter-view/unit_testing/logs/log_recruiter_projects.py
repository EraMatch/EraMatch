"""
Assurance log script for Recruiter Projects functionality.
Run: python tests/recruiter-view/unit_testing/logs/log_recruiter_projects.py
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import uuid
from log_utils import AssuranceLogger, get_recruiter_token, make_client, BASE_URL


def run():
    log = AssuranceLogger("Recruiter Projects")
    token = get_recruiter_token()
    client = make_client(token)

    project_id = None

    def test_list_projects():
        nonlocal project_id
        resp = client.get("/recruiter/projects")
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        data = resp.json()
        if not isinstance(data, list):
            return False, f"Expected list, got {type(data)}"
        if data:
            project_id = str(data[0].get("id") or data[0].get("project_id"))
        return True, f"Listed {len(data)} projects"
    log.run("GET /recruiter/projects returns 200 + list", test_list_projects)

    def test_get_project():
        if not project_id:
            return False, "No projects available to test"
        resp = client.get(f"/recruiter/projects/{project_id}")
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        data = resp.json()
        has_name = any(k in data for k in ["name", "projectName", "project_name"])
        if not has_name:
            return False, f"Project missing name field: {list(data.keys())}"
        return True, f"Got project: {data.get('name') or data.get('projectName')}"
    log.run("GET /recruiter/projects/{id} returns project detail", test_get_project)

    def test_project_positions():
        if not project_id:
            return False, "No projects available"
        resp = client.get(f"/recruiter/projects/{project_id}/positions")
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        data = resp.json()
        if not isinstance(data, list):
            return False, f"Expected list, got {type(data)}"
        return True, f"Project has {len(data)} positions"
    log.run("GET /recruiter/projects/{id}/positions returns list", test_project_positions)

    def test_project_summary():
        if not project_id:
            return False, "No projects available"
        resp = client.get(f"/recruiter/projects/{project_id}/summary")
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        return True, f"Summary keys: {list(resp.json().keys())}"
    log.run("GET /recruiter/projects/{id}/summary returns stats", test_project_summary)

    def test_fake_project_404():
        fake_id = str(uuid.uuid4())
        resp = client.get(f"/recruiter/projects/{fake_id}")
        if resp.status_code not in (404, 403, 422):
            return False, f"Expected 4xx, got {resp.status_code}"
        return True, f"Fake project correctly returned HTTP {resp.status_code}"
    log.run("GET /recruiter/projects/{fake_id} returns 4xx", test_fake_project_404)

    client.close()
    return log.finish()


if __name__ == "__main__":
    run()
