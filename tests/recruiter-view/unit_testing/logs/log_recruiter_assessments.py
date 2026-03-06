"""
Assurance log script for Recruiter Assessments functionality.
Run: python tests/recruiter-view/unit_testing/logs/log_recruiter_assessments.py
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import uuid
from log_utils import AssuranceLogger, get_recruiter_token, make_client


def run():
    log = AssuranceLogger("Recruiter Assessments")
    token = get_recruiter_token()
    client = make_client(token)

    def test_create_assessment():
        resp = client.post("/assessments", json={
            "title": "Log Runner Test Assessment",
            "sections": [{
                "title": "General",
                "questions": [{
                    "text": "What is Python?",
                    "type": "mcq",
                    "options": ["A language", "A snake"],
                    "correct_answer": "A language"
                }]
            }]
        })
        if resp.status_code not in (200, 201):
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        return True, f"Assessment created: {resp.json()}"
    log.run("POST /assessments creates assessment", test_create_assessment)

    def test_create_missing_fields():
        resp = client.post("/assessments", json={})
        if resp.status_code != 422:
            return False, f"Expected 422, got {resp.status_code}"
        return True, "Missing fields correctly return 422"
    log.run("POST /assessments with empty body returns 422", test_create_missing_fields)

    def test_get_fake_assessment():
        fake_id = str(uuid.uuid4())
        resp = client.get(f"/assessments/{fake_id}")
        if resp.status_code not in (404, 422, 500):
            return False, f"Expected 404, got {resp.status_code}"
        return True, f"Fake assessment returned HTTP {resp.status_code}"
    log.run("GET /assessments/{fake_id} returns error", test_get_fake_assessment)

    def test_delete_fake_assessment():
        fake_id = str(uuid.uuid4())
        resp = client.delete(f"/assessments/{fake_id}")
        if resp.status_code not in (404, 422, 500):
            return False, f"Expected 404, got {resp.status_code}"
        return True, f"Fake assessment delete returned HTTP {resp.status_code}"
    log.run("DELETE /assessments/{fake_id} returns error", test_delete_fake_assessment)

    client.close()
    return log.finish()


if __name__ == "__main__":
    run()
