"""
Assurance log script for Recruiter Question Bank functionality.
Run: python tests/recruiter-view/unit_testing/logs/log_recruiter_question_bank.py
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import uuid
from log_utils import AssuranceLogger, get_recruiter_token, make_client


def run():
    log = AssuranceLogger("Recruiter Question Bank")
    token = get_recruiter_token()
    client = make_client(token)

    question_id = None

    def test_list_questions():
        nonlocal question_id
        resp = client.get("/questions/bank")
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        data = resp.json()
        if not isinstance(data, list):
            return False, f"Expected list, got {type(data)}"
        if data:
            question_id = str(data[0].get("id") or data[0].get("question_id"))
        return True, f"Question bank has {len(data)} questions"
    log.run("GET /questions/bank returns 200 + list", test_list_questions)

    def test_create_question():
        resp = client.post("/questions/bank", json={
            "question_text": "Log runner test question",
            "question_type": "essay",
            "tags": ["test"],
            "difficulty": 3
        })
        if resp.status_code not in (200, 201):
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        return True, f"Question created: {resp.json()}"
    log.run("POST /questions/bank creates question", test_create_question)

    def test_toggle_favorite():
        if not question_id:
            return False, "No questions available"
        resp = client.post(f"/questions/bank/{question_id}/favorite")
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        data = resp.json()
        has_fav = "isFavorite" in data or "is_favorite" in data
        if not has_fav:
            return False, f"Missing isFavorite in response: {data}"
        return True, f"Toggled favorite: {data}"
    log.run("POST /questions/bank/{id}/favorite toggles", test_toggle_favorite)

    def test_delete_fake_question():
        fake_id = str(uuid.uuid4())
        resp = client.delete(f"/questions/bank/{fake_id}")
        if resp.status_code not in (404, 422, 500):
            return False, f"Expected error, got {resp.status_code}"
        return True, f"Fake question delete returned HTTP {resp.status_code}"
    log.run("DELETE /questions/bank/{fake_id} returns error", test_delete_fake_question)

    client.close()
    return log.finish()


if __name__ == "__main__":
    run()
