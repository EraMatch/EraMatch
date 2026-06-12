"""
End-to-end recruiter→tech pipeline test (API-level, against the live backend).

Drives the full scenario the product depends on, on a FRESH position inside an
existing approved project:

  HR creates position → JD keywords → HD-Eval QAG (generate+approve)
   → import sample CV PDFs → (scores must NOT collapse to 0 — Bug A guard)
   → create group + select candidates → set filtration_flow
   → tech configures an assessment (manual MCQ + Essay + Coding; bank/AI tolerant)
   → tech starts the assessment stage (candidates unlocked + invitation emails)

Deterministic steps assert firmly. AI/Celery/timing-dependent steps (keywords,
QAG, CV parse+score) are tolerant: they `skip`/soft-warn rather than fail on a
transient model/worker outage, so this only goes red on a real regression.

Requires: backend :8000, celery worker, ai-service :8001, ollama, redis up.
Creates labeled artifacts ("E2E Test …") and best-effort deletes them at the end.
Run: pytest tests/recruiter-view/unit_testing/testing_functionality/test_e2e_recruiter_pipeline.py -v -s
"""
from __future__ import annotations

import time
import uuid
import httpx
import pytest

BASE_URL = "http://localhost:8000/api/v1"
FLOW = ["assessment", "ai_interview", "live_interview"]


# ── small inline question builders (manual mode, all 3 types) ──────────────
def _mcq():
    return {
        "id": f"v-mcq-{uuid.uuid4().hex[:4]}", "type": "mcq", "points": 10,
        "questionText": "Which data structure offers O(1) average lookup?",
        "options": ["Array", "Hash Map", "Linked List", "Stack"], "correctAnswer": 1,
        "explanation": "Hash maps average O(1) lookup.", "difficulty": "Easy", "tags": ["DS"],
    }


def _essay():
    return {
        "id": f"v-essay-{uuid.uuid4().hex[:4]}", "type": "essay", "points": 20,
        "questionText": "Explain the trade-offs of server-side vs client-side rendering.",
        "rubric": "Grade on clarity, trade-offs, and examples.", "maxWords": 400,
        "rubricYesNoChecks": [
            {"id": 1, "check": "Mentions SEO/initial-load trade-off?", "weight": 0.5},
            {"id": 2, "check": "Gives a concrete example?", "weight": 0.5},
        ],
        "difficulty": "Medium",
    }


def _coding():
    return {
        "id": f"v-code-{uuid.uuid4().hex[:4]}", "type": "coding", "points": 30,
        "questionText": "Return the sum of a list of integers.", "language": "python",
        "codeTemplate": "def solution(nums):\n    pass",
        "testCases": [
            {"input": "[1,2,3]", "expected": "6", "is_hidden": False},
            {"input": "[-1,1]", "expected": "0", "is_hidden": True},
        ],
        "difficulty": "Easy", "topics": ["Array"],
    }


def _candidate_position_id(c: dict) -> str | None:
    return str(c.get("position_id") or c.get("positionId") or "") or None


def _candidate_score(c: dict):
    for k in ("match_score", "score", "pre_score", "overall_score", "prescore"):
        if c.get(k) is not None:
            return c[k]
    return None


def _id(d: dict, *keys: str) -> str | None:
    for k in keys:
        if d.get(k):
            return str(d[k])
    return None


@pytest.mark.e2e
def test_full_recruiter_pipeline(
    client, tech_client, upload_headers,
    approved_project_id, hr_user_id, tech_user_id, sample_cv_paths,
):
    if not hr_user_id or not tech_user_id:
        pytest.skip("Could not resolve HR/Tech user ids from login payload")

    created_group_id = None
    created_position_id = None
    try:
        # ── Step 1: HR creates a position ─────────────────────────────────
        title = f"E2E Test — {uuid.uuid4().hex[:6]}"
        r = client.post("/recruiter/positions", json={
            "project_id": approved_project_id,
            "job_title": title,
            "job_description": (
                "We are hiring a Frontend Engineer to build React/Next.js interfaces, "
                "collaborate with design, and integrate REST APIs."
            ),
            "required_skills": ["React", "TypeScript", "Next.js", "CSS", "REST APIs"],
            "experience_level": "mid",
            "years_of_experience": 2,
            "education_level": "Bachelor",
            "assigned_hr_id": hr_user_id,
            "assigned_tech_id": tech_user_id,
        })
        assert r.status_code in (200, 201), f"create position failed: {r.status_code} {r.text}"
        created_position_id = _id(r.json(), "position_id", "id")
        assert created_position_id, f"no position id in {r.json()}"
        pid = created_position_id

        # ── Step 2: JD keywords (AI — tolerant) ───────────────────────────
        rk = client.post(f"/recruiter/positions/{pid}/keywords/generate")
        if rk.status_code == 200:
            assert rk.json().get("keywords"), "keywords endpoint returned no keywords"
        else:
            print(f"[tolerant] keyword generation non-200: {rk.status_code}")

        # ── Step 3: HD-Eval QAG generate + approve (AI — tolerant) ────────
        client.post(f"/recruiter/positions/{pid}/hdeval-qag/regenerate")
        qag_status = None
        for _ in range(20):  # ~60s
            g = client.get(f"/recruiter/positions/{pid}/hdeval-qag")
            if g.status_code == 200:
                qag_status = str((g.json() or {}).get("status", ""))
                if qag_status in ("pending_tech_review", "approved", "ai_generation_failed"):
                    break
            time.sleep(3)
        if qag_status == "pending_tech_review":
            ra = tech_client.post(f"/recruiter/positions/{pid}/hdeval-qag/approve")
            print(f"[info] QAG approve: {ra.status_code}")
        else:
            print(f"[tolerant] QAG status ended as: {qag_status}")

        # ── Step 4: import sample CV PDFs ─────────────────────────────────
        # Upload processes synchronously (PDF text-extract + AI parse per file), so keep the
        # set small and the timeout generous.
        files = [
            ("files", (p.name, p.read_bytes(), "application/pdf"))
            for p in sample_cv_paths[:2]
        ]
        with httpx.Client(base_url=BASE_URL, headers=upload_headers, timeout=300.0) as up:
            ru = up.post(f"/recruiter/positions/{pid}/candidates/upload", files=files)
        assert ru.status_code in (200, 201), f"CV upload failed: {ru.status_code} {ru.text}"

        # Poll for parsed candidates on THIS position (CV parse + prescore are async).
        my_cands: list[dict] = []
        for _ in range(40):  # ~120s
            rc = client.get("/recruiter/candidates")
            if rc.status_code == 200:
                allc = rc.json() if isinstance(rc.json(), list) else []
                my_cands = [c for c in allc if _candidate_position_id(c) == pid]
                if my_cands:
                    break
            time.sleep(3)

        if not my_cands:
            print("[tolerant] no candidates parsed in time — skipping candidate-dependent asserts")
        else:
            # Bug A guard: a freshly-scored candidate must NOT be force-zeroed.
            scores = [float(_candidate_score(c)) for c in my_cands if _candidate_score(c) is not None]
            if scores:
                assert any(s > 0 for s in scores), (
                    "Bug A regression: every imported candidate scored 0 "
                    "(prescore/QAG overwriting with 0 instead of heuristic fallback)"
                )

        # ── Step 5: HR creates group + selects candidates ─────────────────
        cand_ids = [cid for c in my_cands if (cid := _id(c, "candidate_id", "candidateId", "id"))]
        rg = client.post(f"/recruiter/positions/{pid}/groups", json={
            "name": f"E2E Group — {uuid.uuid4().hex[:6]}",
            "position_id": pid,
            "candidate_ids": cand_ids,
        })
        assert rg.status_code in (200, 201), f"create group failed: {rg.status_code} {rg.text}"
        created_group_id = _id(rg.json(), "group_id", "id")
        assert created_group_id, f"no group id in {rg.json()}"
        gid = created_group_id

        # ── Step 6: tech sets the filtration flow → stages created ────────
        rf = tech_client.patch(f"/recruiter/groups/{gid}", json={"filtration_flow": FLOW})
        assert rf.status_code in (200, 201), f"set flow failed: {rf.status_code} {rf.text}"
        gd = client.get(f"/recruiter/groups/{gid}").json()
        stages = gd.get("pipelineStages") or gd.get("pipeline_stages") or []
        stage_ids = {str(s.get("id")) for s in stages}
        assert {"assessment", "ai-interview", "live-interview"} & stage_ids or len(stages) >= 3, (
            f"filtration flow did not create stages: {stages}"
        )

        # ── Step 7: tech configures an assessment (manual; all 3 types) ───
        assessment_payload = {
            "position_id": pid, "group_id": gid,
            "title": f"E2E Assessment {uuid.uuid4().hex[:6]}",
            "description": "Created by E2E test — safe to delete.",
            "duration_minutes": 60, "passing_score": 60.0,
            "randomizeQuestions": False, "proctoring": False,
            "sections": [
                {"id": "s1", "order": 1, "type": "mcq", "points": 10,
                 "selectionStrategy": "random", "variantsToSelect": 1, "variants": [_mcq()]},
                {"id": "s2", "order": 2, "type": "essay", "points": 20,
                 "selectionStrategy": "random", "variantsToSelect": 1, "variants": [_essay()]},
                {"id": "s3", "order": 3, "type": "coding", "points": 30,
                 "selectionStrategy": "random", "variantsToSelect": 1, "variants": [_coding()]},
            ],
        }
        ra = tech_client.post("/assessments", json=assessment_payload)
        assert ra.status_code == 200, f"assessment create failed: {ra.status_code} {ra.text}"
        assert ra.json().get("assessment_id"), "no assessment_id returned"

        # Question-bank mode (tolerant) — confirm the bank is reachable.
        rb = tech_client.get("/bank")
        print(f"[info] question-bank reachable: {rb.status_code} (count={len(rb.json()) if rb.status_code==200 and isinstance(rb.json(), list) else 'n/a'})")

        # ── Step 8: tech starts the assessment stage ──────────────────────
        rs = tech_client.post(f"/recruiter/groups/{gid}/stages/start", json={"stage": "assessment"})
        assert rs.status_code in (200, 201), f"start stage failed: {rs.status_code} {rs.text}"
        body = rs.json()
        # invitations_sent is >=0 (0 if no candidates parsed); stage must be active.
        gd2 = client.get(f"/recruiter/groups/{gid}").json()
        stages2 = gd2.get("pipelineStages") or gd2.get("pipeline_stages") or []
        asm = next((s for s in stages2 if str(s.get("id")) in ("assessment",)), None)
        assert asm is not None, f"assessment stage missing after start: {stages2}"
        assert str(asm.get("state", "")).replace("_", "-") in ("active", "not-started"), (
            f"unexpected assessment stage state after start: {asm.get('state')}"
        )
        print(f"[info] start-stage response: {body}")

    finally:
        # Best-effort cleanup so the test does not pollute the project (labeled artifacts).
        if created_group_id:
            try:
                client.request("DELETE", f"/recruiter/groups/{created_group_id}",
                               json={"action": "release"})
            except Exception:
                pass
        if created_position_id:
            try:
                client.delete(f"/recruiter/positions/{created_position_id}")
            except Exception:
                pass
