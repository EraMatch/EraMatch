"""
Assurance log script for Recruiter Candidates functionality.
Run: python tests/recruiter-view/unit_testing/logs/log_recruiter_candidates.py
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import uuid
from log_utils import AssuranceLogger, get_recruiter_token, make_client


def run():
    log = AssuranceLogger("Recruiter Candidates")
    token = get_recruiter_token()
    client = make_client(token)

    candidate_id = None

    def test_list_candidates():
        nonlocal candidate_id
        resp = client.get("/recruiter/candidates")
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        data = resp.json()
        if not isinstance(data, list):
            return False, f"Expected list, got {type(data)}"
        if data:
            candidate_id = str(data[0].get("id") or data[0].get("candidate_id"))
        return True, f"Listed {len(data)} candidates"
    log.run("GET /recruiter/candidates returns 200 + list", test_list_candidates)

    def test_get_candidate():
        if not candidate_id:
            return False, "No candidates available"
        resp = client.get(f"/candidates/{candidate_id}")
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        data = resp.json()
        has_name = any(k in data for k in ["full_name", "fullName", "name"])
        if not has_name:
            return False, f"Candidate missing name: {list(data.keys())}"
        return True, f"Got candidate: {data.get('full_name') or data.get('fullName') or data.get('name')}"
    log.run("GET /candidates/{id} returns candidate detail", test_get_candidate)

    def test_suspect_review():
        if not candidate_id:
            return False, "No candidates available"
        resp = client.get(f"/candidates/{candidate_id}/suspect-review")
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        data = resp.json()
        if not isinstance(data, list):
            return False, f"Expected list, got {type(data)}"
        return True, f"Suspect review returned {len(data)} entries"
    log.run("GET /candidates/{id}/suspect-review returns list", test_suspect_review)

    def test_knowledge_graph():
        if not candidate_id:
            return False, "No candidates available"
        resp = client.get(f"/candidates/{candidate_id}/knowledge-graph")
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        data = resp.json()
        if not isinstance(data, dict):
            return False, f"Expected dict, got {type(data)}"
        return True, f"Knowledge graph keys: {list(data.keys())}"
    log.run("GET /candidates/{id}/knowledge-graph returns dict", test_knowledge_graph)

    def test_fake_candidate_404():
        fake_id = str(uuid.uuid4())
        resp = client.get(f"/candidates/{fake_id}")
        if resp.status_code not in (404, 422):
            return False, f"Expected 404, got {resp.status_code}"
        return True, f"Fake candidate correctly returned HTTP {resp.status_code}"
    log.run("GET /candidates/{fake_id} returns 404", test_fake_candidate_404)

    client.close()
    return log.finish()


if __name__ == "__main__":
    run()
