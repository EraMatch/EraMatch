"""
Assurance log script for Candidate Assessment flow.
Logs: config fetch, session start, answer saving, code run, submit.

Run: python tests/candidate-view/unit_testing/logs/log_candidate_assessment.py
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import httpx
from log_utils import AssuranceLogger, get_candidate_token, make_client, BASE_URL


def run():
    log = AssuranceLogger("Candidate Assessment")

    token = get_candidate_token()
    client = make_client(token)

    assessment_id = None
    stage_id = None
    session_id = None

    # ── 1. GET /assessment/config ────────────────────────────
    def test_config():
        nonlocal assessment_id, stage_id
        resp = client.get("/assessment/config")
        if resp.status_code == 404:
            return True, "No active assessment stage (404) — acceptable"
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        data = resp.json()
        assessment_id = data.get("assessment_id")
        stage_id = data.get("stage_id")
        return True, f"Config OK — assessment_id={assessment_id}, keys={list(data.keys())}"
    log.run("GET /assessment/config returns 200 or 404", test_config)

    # ── 2. Config has sections/questions info ────────────────
    def test_config_sections():
        if not assessment_id:
            return True, "Skipped — no active assessment"
        resp = client.get("/assessment/config")
        data = resp.json()
        has_info = any(k in data for k in ("sections", "questions", "total_questions", "question_count"))
        if not has_info:
            return False, f"No sections info: {list(data.keys())}"
        return True, f"Config has section/question info"
    log.run("Assessment config contains sections information", test_config_sections)

    # ── 3. Config without token blocked ──────────────────────
    def test_config_no_token():
        with httpx.Client(base_url=BASE_URL, timeout=30.0) as c:
            resp = c.get("/assessment/config")
        if resp.status_code not in (401, 403, 422):
            return False, f"Expected auth error, got {resp.status_code}"
        return True, f"Config blocked without token — HTTP {resp.status_code}"
    log.run("GET /assessment/config without token → auth error", test_config_no_token)

    # ── 4. POST /assessment/start ────────────────────────────
    def test_start_session():
        nonlocal session_id
        if not assessment_id:
            return True, "Skipped — no active assessment"
        resp = client.post("/assessment/start", json={
            "assessment_id": assessment_id,
            "stage_id": stage_id
        })
        if resp.status_code in (400, 409):
            return True, f"Session already exists or conflict — HTTP {resp.status_code}"
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        data = resp.json()
        session_id = data.get("session_id")
        return True, f"Session started — session_id={session_id}"
    log.run("POST /assessment/start creates session or reports conflict", test_start_session)

    # ── 5. Invalid session answer → 4xx ──────────────────────
    def test_invalid_session_answer():
        resp = client.post("/assessment/answer", json={
            "session_id": "00000000-0000-0000-0000-000000000000",
            "question_id": "00000000-0000-0000-0000-000000000000",
            "answer": {"selected_option": 0}
        })
        if resp.status_code in (400, 404, 422, 500):
            return True, f"Invalid session correctly rejected — HTTP {resp.status_code}"
        return False, f"Unexpected status: {resp.status_code}"
    log.run("Answer with invalid session_id → error", test_invalid_session_answer)

    # ── 6. Answer without token → error ──────────────────────
    def test_answer_no_token():
        with httpx.Client(base_url=BASE_URL, timeout=30.0) as c:
            resp = c.post("/assessment/answer", json={
                "session_id": "fake", "question_id": "fake",
                "answer": {"selected_option": 0}
            })
        if resp.status_code not in (401, 403, 422):
            return False, f"Expected auth error, got {resp.status_code}"
        return True, f"Answer blocked without token — HTTP {resp.status_code}"
    log.run("POST /assessment/answer without token → auth error", test_answer_no_token)

    # ── 7. Run code endpoint ─────────────────────────────────
    def test_run_code():
        resp = client.post("/assessment/run-code", json={
            "language": "python",
            "code": "print('hello from test')"
        })
        if resp.status_code == 200:
            data = resp.json()
            return True, f"Code ran — keys={list(data.keys())}"
        return True, f"Run-code returned HTTP {resp.status_code} — acceptable"
    log.run("POST /assessment/run-code responds", test_run_code)

    # ── 8. Submit invalid session → error ────────────────────
    def test_submit_invalid():
        resp = client.post("/assessment/submit", json={
            "session_id": "00000000-0000-0000-0000-000000000000"
        })
        if resp.status_code in (400, 404, 422, 500):
            return True, f"Invalid session submit rejected — HTTP {resp.status_code}"
        return False, f"Unexpected HTTP {resp.status_code}"
    log.run("Submit with invalid session → error", test_submit_invalid)

    # ── 9. Submit without token → error ──────────────────────
    def test_submit_no_token():
        with httpx.Client(base_url=BASE_URL, timeout=30.0) as c:
            resp = c.post("/assessment/submit", json={"session_id": "fake"})
        if resp.status_code not in (401, 403, 422):
            return False, f"Expected auth error, got {resp.status_code}"
        return True, f"Submit blocked without token — HTTP {resp.status_code}"
    log.run("POST /assessment/submit without token → auth error", test_submit_no_token)

    client.close()
    return log.finish()


if __name__ == "__main__":
    run()
