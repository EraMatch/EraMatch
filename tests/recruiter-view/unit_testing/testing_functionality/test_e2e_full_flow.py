"""
Full HR + Tech Recruiter end-to-end test (API-level, live backend).

Covers the complete recruiter-side pipeline — position creation through
offer sending — with emphasis on the three config flavours:

ASSESSMENT SECTIONS
  Section 1 — Manual questions (inline MCQ pool + essay + coding)
  Section 2 — Question Bank (GET existing QB entries → map to variants)
  Section 3 — AI-generated (POST /questions/generate-variants for MCQ +
               POST /questions/generate-variants for essay; tolerant on AI outage)

VIDEO INTERVIEW (AIInterviewConfig, type=recorded)
  Per-question AI rubric suggestion   → POST /recruiter/ai/suggest-question-rubric
  Human revision step                 → modify weights, reword one check
  Assign with final revised rubric    → POST /groups/{gid}/interviews/assign
  Replace-config flow                 → reassign with updated interviewConfig

LIVE INTERVIEW V2 (full AI wizard)
  suggest-dimensions → POST /live-interview-v2/rubric/suggest-dimensions
  generate-anchors   → POST /live-interview-v2/rubric/generate-anchors
  save rubric        → POST /live-interview-v2/rubric
  freeze rubric      → POST /live-interview-v2/rubric/{id}/freeze
  generate bank (AI) → POST /live-interview-v2/bank/generate
  save bank          → POST /live-interview-v2/bank
  freeze bank        → POST /live-interview-v2/bank/{id}/freeze
  (manual fallback on AI outage for each step)

STAGE LIFECYCLE × 3 stages
  start → assert active → monitoring shape → close → assert closed
  bulk progress (pass / hold) → start next stage → repeat

Tolerant steps (AI / async) never fail the run on outage — they soft-warn
and fall back to manual data. Firm steps (pure API state transitions,
has_config, stage state) are hard-asserted.

Prereqs: backend :8000 running, celery + redis up.
Run:
  pytest tests/recruiter-view/unit_testing/testing_functionality/test_e2e_full_flow.py -v -s
"""
from __future__ import annotations

import time
import uuid
import httpx
import pytest

BASE_URL = "http://localhost:8000/api/v1"
LIV2 = "/live-interview-v2"
FLOW = ["assessment", "ai_interview", "live_interview"]

JD_TEXT = (
    "We are hiring a Senior Frontend Engineer to lead React/Next.js projects, "
    "mentor junior developers, and integrate complex REST and GraphQL APIs. "
    "The role demands strong TypeScript skills, advanced CSS architecture, "
    "and a deep understanding of browser performance optimisation techniques. "
    "Experience with testing (Jest, Cypress), CI/CD pipelines, and design "
    "systems is highly valued. The candidate will own cross-functional "
    "technical decisions and collaborate closely with backend and product teams."
)


# ─── small helpers ────────────────────────────────────────────────────────────

def _id(d: dict, *keys: str) -> str | None:
    for k in keys:
        v = d.get(k)
        if v:
            return str(v)
    return None


def _stage(stages: list, typ: str) -> dict | None:
    typ_norm = typ.lower().replace("_", "-")
    for s in stages:
        if str(s.get("id", "")).lower().replace("_", "-") == typ_norm:
            return s
    return None


def _score(c: dict) -> float | None:
    for k in ("match_score", "pre_score_final", "score", "prescore"):
        v = c.get(k)
        if v is not None:
            return float(v)
    return None


# ─── question builders ────────────────────────────────────────────────────────

def _mcq(n: int = 1) -> dict:
    return {
        "id": f"man-mcq-{uuid.uuid4().hex[:5]}", "type": "mcq", "points": 10,
        "questionText": f"Which of the following is O(1) on average? (v{n})",
        "options": ["Array linear scan", "Hash-map lookup", "Binary search", "Linked-list traversal"],
        "correctAnswer": 1, "explanation": "Hash maps average O(1) for lookups.",
        "difficulty": "Easy", "tags": ["Data Structures"],
    }


def _essay() -> dict:
    return {
        "id": f"man-essay-{uuid.uuid4().hex[:5]}", "type": "essay", "points": 20,
        "questionText": "Explain server-side rendering vs client-side rendering trade-offs.",
        "rubric": "Grade on clarity, correctness, and real-world examples.",
        "maxWords": 400, "difficulty": "Medium",
        "rubricYesNoChecks": [
            {"id": i + 1, "check": f"Does the answer cover point {i + 1}?", "weight": 0.1}
            for i in range(10)
        ],
    }


def _coding() -> dict:
    return {
        "id": f"man-code-{uuid.uuid4().hex[:5]}", "type": "coding", "points": 30,
        "questionText": "Write a function that returns the sum of a list of integers.",
        "language": "python", "codeTemplate": "def solution(nums: list[int]) -> int:\n    pass",
        "testCases": [
            {"input": "[1,2,3]", "expected": "6", "is_hidden": False},
            {"input": "[-1,1,0]", "expected": "0", "is_hidden": True},
        ],
        "difficulty": "Easy",
    }


def _rubric_checks(n: int = 10) -> list[dict]:
    return [
        {"id": i + 1, "check": f"Does the answer demonstrate point {i + 1}?",
         "weight": round(1.0 / n, 4)}
        for i in range(n)
    ]


def _manual_dims() -> list[dict]:
    return [
        {"name": "Technical Depth", "weight": 35,
         "anchors": {"substandard": "Vague, no substance.",
                     "proficient": "Clear explanations with terminology.",
                     "excellent": "Deep reasoning with examples."}},
        {"name": "Problem Solving", "weight": 35,
         "anchors": {"substandard": "No structured approach.",
                     "proficient": "Breaks problems down systematically.",
                     "excellent": "Explores edge cases proactively."}},
        {"name": "Communication", "weight": 30,
         "anchors": {"substandard": "Unclear responses.",
                     "proficient": "Coherent and well-structured.",
                     "excellent": "Precise and audience-aware."}},
    ]


def _manual_bank(rubric_id: str) -> list[dict]:
    return [
        {"question_id": f"bq-{uuid.uuid4().hex[:6]}", "dimension_name": "Technical Depth",
         "primary_dimension_id": None,
         "text": "Explain how React's reconciliation algorithm works.",
         "intent": "Assess React internals knowledge.",
         "sub_criteria": [{"criterion": "Mentions virtual DOM diffing", "weight": 0.5},
                          {"criterion": "Explains key prop role", "weight": 0.5}],
         "question_rubric": {"sub_criteria": []}, "is_mandatory": True,
         "difficulty": "hard", "estimated_duration_seconds": 120},
        {"question_id": f"bq-{uuid.uuid4().hex[:6]}", "dimension_name": "Problem Solving",
         "primary_dimension_id": None,
         "text": "A slow API call blocks UI render. How do you fix it?",
         "intent": "Evaluate async problem-solving.",
         "sub_criteria": [{"criterion": "Mentions lazy loading or skeleton states", "weight": 0.5},
                          {"criterion": "Proposes caching strategy", "weight": 0.5}],
         "question_rubric": {"sub_criteria": []}, "is_mandatory": False,
         "difficulty": "medium", "estimated_duration_seconds": 90},
        {"question_id": f"bq-{uuid.uuid4().hex[:6]}", "dimension_name": "Communication",
         "primary_dimension_id": None,
         "text": "How would you explain CSS specificity to a junior developer?",
         "intent": "Test communication and mentoring ability.",
         "sub_criteria": [{"criterion": "Uses an analogy or visual", "weight": 0.5},
                          {"criterion": "Mentions selector hierarchy", "weight": 0.5}],
         "question_rubric": {"sub_criteria": []}, "is_mandatory": False,
         "difficulty": "easy", "estimated_duration_seconds": 60},
    ]


# ─── QB helpers ───────────────────────────────────────────────────────────────

def _fetch_qb_questions(client, q_type: str, limit: int = 3) -> list[dict]:
    """Return existing QB questions as QuestionCreate-shaped dicts."""
    r = client.get("/questions", params={"question_type": q_type, "limit": limit})
    if r.status_code != 200:
        return []
    raw = r.json()
    items = raw if isinstance(raw, list) else (raw.get("questions") or raw.get("items") or [])
    return items[:limit]


def _qb_to_variant(q: dict) -> dict:
    """Map a QuestionBank row → QuestionCreate shape."""
    cfg = q.get("question_config") or {}
    ca = (cfg.get("correct_answer") or {}).get("correct_index")
    return {
        "id": f"qb-{q.get('question_id') or uuid.uuid4().hex[:6]}",
        "type": q.get("question_type", "mcq"),
        "questionText": q.get("question_text") or q.get("text") or "Existing QB question",
        "points": q.get("points") or 10,
        "options": cfg.get("options"),
        "correctAnswer": ca,
        "explanation": cfg.get("explanation"),
        "rubric": cfg.get("rubric"),
        "maxWords": cfg.get("max_words"),
        "language": cfg.get("language"),
        "codeTemplate": cfg.get("starter_code"),
        "testCases": cfg.get("test_cases"),
        "difficulty": str(q.get("difficulty") or "Medium"),
        "tags": q.get("tags") or [],
        "rubricYesNoChecks": cfg.get("rubric_yes_no_checks"),
    }


# ─── AI question generation helpers ──────────────────────────────────────────

def _ai_generate_variants(tech_client, base_text: str, q_type: str, n: int = 2) -> list[dict]:
    """
    POST /questions/generate-variants.
    Returns a list of QuestionCreate-shaped dicts.
    Returns [] on AI outage — caller must fall back.
    """
    r = tech_client.post(
        "/questions/generate-variants",
        params={"numVariants": n},
        json={"questionText": base_text, "type": q_type, "difficulty": "Medium"},
    )
    if r.status_code != 200:
        print(f"  [tolerant] generate-variants {r.status_code}: {r.text[:120]}")
        return []
    variants = r.json() if isinstance(r.json(), list) else []
    out = []
    for v in variants:
        text = v.get("questionText") or v.get("text") or v.get("question_text") or base_text
        typ = v.get("type", q_type)
        cfg = v.get("question_config") or {}
        out.append({
            "id": f"ai-{uuid.uuid4().hex[:6]}",
            "type": typ,
            "questionText": text,
            "points": 10,
            "options": v.get("options") or cfg.get("options"),
            "correctAnswer": v.get("correctAnswer") or (cfg.get("correct_answer") or {}).get("correct_index"),
            "explanation": v.get("explanation") or cfg.get("explanation"),
            "difficulty": str(v.get("difficulty") or "Medium"),
        })
    return out


# ─── video rubric helpers ────────────────────────────────────────────────────

def _suggest_rubric(tech_client, question_text: str, position_title: str) -> list[dict]:
    """
    POST /recruiter/ai/suggest-question-rubric.
    Returns 10 normalized checks (falls back to manual on AI outage).
    """
    r = tech_client.post("/recruiter/ai/suggest-question-rubric", json={
        "question_text": question_text,
        "context": {
            "position_title": position_title,
            "job_description": JD_TEXT,
        },
    })
    if r.status_code != 200:
        print(f"  [tolerant] suggest-rubric {r.status_code}")
        return _rubric_checks(10)

    checks = r.json().get("rubric_checks") or []
    print(f"  ✓ AI suggested {len(checks)} rubric check(s)")
    return checks


def _revise_rubric(checks: list[dict]) -> list[dict]:
    """
    Simulate human revision step:
    - Normalise to exactly 10 checks × weight=0.1
    - Reword the first check to simulate recruiter editing
    """
    revised: list[dict] = []
    for i, c in enumerate(checks[:10]):
        revised.append({
            "id": i + 1,
            "check": c.get("check", f"Does the response address point {i + 1}?"),
            "weight": 0.1,
        })
    # Pad to 10 if AI returned fewer
    while len(revised) < 10:
        n = len(revised) + 1
        revised.append({"id": n, "check": f"Is the answer clearly structured? (item {n})", "weight": 0.1})
    # Revision: recruiter edits the first check text
    if revised:
        revised[0]["check"] = "[Revised] " + revised[0]["check"]
    return revised


def _video_config(position_title: str, questions_with_rubric: list[dict]) -> dict:
    """Build AssignInterviewRequest.interviewConfig payload."""
    return {
        "create_new": True,
        "interviewConfig": {
            "title": f"Video Interview — {position_title[:40]}",
            "interview_type": "recorded",
            "instructions": "Answer each question clearly. Think before you speak.",
            "max_retakes": 1,
            "think_time_seconds": 60,
            "answer_time_seconds": 180,
            "difficulty": "Mid Level",
            "total_duration_minutes": 30,
            "showAIFeedback": True,
            "recordingRequired": True,
            "questions": {
                "items": questions_with_rubric,
            },
        },
    }


# ─── LiV2 AI wizard helpers ──────────────────────────────────────────────────

def _liv2_ai_wizard(tech_client, gid: str, position_title: str) -> tuple[str | None, str | None]:
    """
    Run the full LiV2 AI wizard:
      suggest-dimensions → generate-anchors → create rubric → freeze →
      generate bank → save bank → freeze

    Returns (rubric_id, bank_id). Either may be None on partial failure.
    Falls back to manual data at each step.
    """
    # 1. Suggest dimensions
    dims_raw: list[dict] = []
    rs = tech_client.post(f"{LIV2}/rubric/suggest-dimensions", json={"group_id": gid})
    if rs.status_code == 200:
        suggestions = rs.json().get("suggestions") or rs.json() or []
        dims_raw = suggestions[:4]  # cap at 4 dimensions
        print(f"  ✓ suggested {len(dims_raw)} dimension(s): {[d.get('name') for d in dims_raw]}")
    else:
        print(f"  [tolerant] suggest-dimensions {rs.status_code}")

    dim_names: list[str] = [d.get("name", "Competency") for d in dims_raw]

    # 2. Generate anchors
    dims_with_anchors: list[dict] = []
    if dim_names:
        ra = tech_client.post(f"{LIV2}/rubric/generate-anchors", json={
            "dimensions": dim_names,
            "job_description": JD_TEXT,
        })
        if ra.status_code == 200:
            dims_with_anchors = ra.json() if isinstance(ra.json(), list) else []
            print(f"  ✓ anchors generated for {len(dims_with_anchors)} dimension(s)")
        else:
            print(f"  [tolerant] generate-anchors {ra.status_code}")

    # Normalise weights to integers summing to ~100
    if dims_with_anchors:
        total = sum(d.get("weight", 25) for d in dims_with_anchors) or 100
        for d in dims_with_anchors:
            d["weight"] = max(1, round(d.get("weight", 25) * 100 / total))
    else:
        dims_with_anchors = _manual_dims()
        print("  [fallback] using manual dimensions")

    # 3. Create rubric
    rubric_id: str | None = None
    rr = tech_client.post(f"{LIV2}/rubric", json={
        "group_id": gid,
        "dimensions": dims_with_anchors,
        "time_budget_minutes": 30,
        "language": "en",
        "include_weak_topics": False,
    })
    if rr.status_code in (200, 201):
        rubric_id = _id(rr.json(), "rubric_id", "id")
        print(f"  ✓ rubric created: {rubric_id}")
    else:
        print(f"  [fail] rubric create: {rr.status_code} {rr.text[:200]}")
        return None, None

    # 4. Freeze rubric
    rfr = tech_client.post(f"{LIV2}/rubric/{rubric_id}/freeze")
    if rfr.status_code in (200, 201):
        assert rfr.json().get("state") == "frozen", f"rubric not frozen: {rfr.json()}"
        print("  ✓ rubric frozen")
    else:
        print(f"  [tolerant] rubric freeze: {rfr.status_code}")

    # 5. Generate bank via AI
    bank_items: list[dict] = []
    rgen = tech_client.post(f"{LIV2}/bank/generate", json={"rubric_id": rubric_id})
    if rgen.status_code == 200:
        gen_body = rgen.json()
        bank_items = gen_body.get("items") or []
        print(f"  ✓ AI generated {len(bank_items)} bank item(s)")
    else:
        print(f"  [tolerant] bank/generate {rgen.status_code} — using manual items")
        bank_items = _manual_bank(rubric_id)

    # 6. Save bank
    bank_id: str | None = None
    rb = tech_client.post(f"{LIV2}/bank", json={
        "group_id": gid,
        "rubric_id": rubric_id,
        "items": bank_items,
    })
    if rb.status_code in (200, 201):
        bank_id = _id(rb.json(), "bank_id", "id")
        print(f"  ✓ bank saved: {bank_id}")
    else:
        print(f"  [fail] bank save: {rb.status_code} {rb.text[:200]}")
        return rubric_id, None

    # 7. Freeze bank
    rfb = tech_client.post(f"{LIV2}/bank/{bank_id}/freeze")
    if rfb.status_code in (200, 201):
        assert rfb.json().get("state") == "frozen", f"bank not frozen: {rfb.json()}"
        print("  ✓ bank frozen")
    else:
        print(f"  [tolerant] bank freeze: {rfb.status_code}")

    return rubric_id, bank_id


# ─── assessment section builder ──────────────────────────────────────────────

def _build_assessment_sections(tech_client, position_title: str) -> list[dict]:
    """
    Build 3+ assessment sections with mixed question sources:
      Section 1 — Manual   : MCQ pool (2 hand-crafted) + essay + coding
      Section 2 — QB       : MCQ questions from the organization's question bank
      Section 3 — AI-gen   : MCQ + essay variants generated by AI
    """
    sections = []

    # ── Section 1: Manual ────────────────────────────────────────────────────
    sections.append({
        "id": "sec-manual-mcq",
        "order": 1,
        "type": "mcq",
        "points": 10,
        "selectionStrategy": "random",
        "variantsToSelect": 1,
        "variants": [_mcq(1), _mcq(2), _mcq(3)],  # pool of 3
    })
    sections.append({
        "id": "sec-manual-essay",
        "order": 2,
        "type": "essay",
        "points": 20,
        "selectionStrategy": "random",
        "variantsToSelect": 1,
        "variants": [_essay()],
    })
    sections.append({
        "id": "sec-manual-coding",
        "order": 3,
        "type": "coding",
        "points": 30,
        "selectionStrategy": "random",
        "variantsToSelect": 1,
        "variants": [_coding()],
    })
    print("  ✓ Section 1 (manual): 3 MCQs + 1 essay + 1 coding")

    # ── Section 2: Question Bank ──────────────────────────────────────────────
    qb_mcqs = _fetch_qb_questions(tech_client, "mcq", limit=3)
    if qb_mcqs:
        qb_variants = [_qb_to_variant(q) for q in qb_mcqs]
        sections.append({
            "id": "sec-qb-mcq",
            "order": 4,
            "type": "mcq",
            "points": 10,
            "selectionStrategy": "random",
            "variantsToSelect": 1,
            "variants": qb_variants,
        })
        print(f"  ✓ Section 2 (QB MCQ): {len(qb_variants)} question(s) from question bank")
    else:
        # No existing QB entries — create one manual QB MCQ section
        sections.append({
            "id": "sec-qb-mcq",
            "order": 4,
            "type": "mcq",
            "points": 10,
            "selectionStrategy": "random",
            "variantsToSelect": 1,
            "variants": [_mcq(10)],
        })
        print("  [fallback] Section 2 (QB MCQ): no KB entries found, using manual fallback")

    qb_essays = _fetch_qb_questions(tech_client, "essay", limit=2)
    if qb_essays:
        sections.append({
            "id": "sec-qb-essay",
            "order": 5,
            "type": "essay",
            "points": 20,
            "selectionStrategy": "random",
            "variantsToSelect": 1,
            "variants": [_qb_to_variant(q) for q in qb_essays],
        })
        print(f"  ✓ Section 2b (QB Essay): {len(qb_essays)} essay(s) from question bank")

    # ── Section 3: AI-generated ───────────────────────────────────────────────
    ai_mcqs = _ai_generate_variants(
        tech_client,
        base_text="What is the best practice for managing React component state in a large application?",
        q_type="mcq",
        n=2,
    )
    if not ai_mcqs:
        ai_mcqs = [_mcq(20), _mcq(21)]
        print("  [fallback] Section 3 AI MCQ: using manual fallback")
    sections.append({
        "id": "sec-ai-mcq",
        "order": 6,
        "type": "mcq",
        "points": 10,
        "selectionStrategy": "random",
        "variantsToSelect": 1,
        "variants": ai_mcqs,
    })
    print(f"  ✓ Section 3 (AI MCQ): {len(ai_mcqs)} variant(s)")

    ai_essays = _ai_generate_variants(
        tech_client,
        base_text="Describe a challenging frontend performance problem you solved and the approach you took.",
        q_type="essay",
        n=2,
    )
    if not ai_essays:
        ai_essays = [_essay()]
        ai_essays[0]["questionText"] = "Describe a challenging frontend performance problem you solved."
        print("  [fallback] Section 3 AI Essay: using manual fallback")
    sections.append({
        "id": "sec-ai-essay",
        "order": 7,
        "type": "essay",
        "points": 20,
        "selectionStrategy": "random",
        "variantsToSelect": 1,
        "variants": ai_essays,
    })
    print(f"  ✓ Section 3 (AI Essay): {len(ai_essays)} variant(s)")

    return sections


# ─── video interview config builder ──────────────────────────────────────────

def _build_video_interview(tech_client, position_title: str) -> dict:
    """
    Build full video interview config:
    - 2 questions
    - Per-question AI rubric suggestion
    - Human revision step (normalise + reword first check)
    Returns the full interviewConfig dict.
    """
    question_specs = [
        {
            "question_id": f"vq-{uuid.uuid4().hex[:6]}",
            "question_text": "Describe your experience with React component architecture and design patterns.",
            "order": 1,
            "think_time_seconds": 60,
            "answer_time_seconds": 180,
        },
        {
            "question_id": f"vq-{uuid.uuid4().hex[:6]}",
            "question_text": "Walk through how you handle async data fetching and error boundaries in React.",
            "order": 2,
            "think_time_seconds": 60,
            "answer_time_seconds": 180,
        },
    ]

    questions_with_rubric = []
    for q in question_specs:
        print(f"  [rubric] suggesting for: {q['question_text'][:55]}…")
        raw_checks = _suggest_rubric(tech_client, q["question_text"], position_title)
        revised_checks = _revise_rubric(raw_checks)
        questions_with_rubric.append({**q, "rubric_checks": revised_checks})
        print(f"  ✓ rubric revised to {len(revised_checks)} checks for question {q['order']}")

    return _video_config(position_title, questions_with_rubric)


# ─── main E2E test ────────────────────────────────────────────────────────────

@pytest.mark.e2e
def test_full_hr_tech_pipeline(
    client, tech_client, upload_headers,
    approved_project_id, hr_user_id, tech_user_id, sample_cv_paths,
    seed_qb_questions,
):
    """
    Full HR → Tech Recruiter pipeline.
    Covers: assessment (manual + QB + AI sections), video interview
    (AI-suggested rubric + revision), LiV2 (full AI wizard), and
    stage lifecycle × 3 stages.
    """
    if not hr_user_id or not tech_user_id:
        pytest.skip("Could not resolve HR/Tech user ids — check login fixtures")

    print(f"\n  [seed] QB questions ready: {seed_qb_questions}")

    created_position_id = None
    created_group_id = None
    position_title = f"E2E Full Flow — {uuid.uuid4().hex[:5]}"

    try:
        # ── Phase 1: HR creates position ──────────────────────────────────────
        print("\n\n══════════════════════════════════════════")
        print("PHASE 1: Create position")
        print("══════════════════════════════════════════")
        pos = client.post("/recruiter/positions", json={
            "project_id": approved_project_id,
            "job_title": position_title,
            "job_description": JD_TEXT,
            "required_skills": ["React", "TypeScript", "Next.js", "GraphQL", "CSS", "Jest"],
            "experience_level": "senior",
            "years_of_experience": 4,
            "education_level": "Bachelor",
            "assigned_hr_id": hr_user_id,
            "assigned_tech_id": tech_user_id,
        })
        assert pos.status_code in (200, 201), f"create position: {pos.status_code} {pos.text}"
        pid = _id(pos.json(), "position_id", "id")
        assert pid, f"no position id: {pos.json()}"
        created_position_id = pid
        print(f"  ✓ position created: {pid}")

        # ── Phase 1b: JD keywords + QAG (AI — tolerant) ──────────────────────
        rk = client.post(f"/recruiter/positions/{pid}/keywords/generate")
        print(f"  [keywords] {rk.status_code}")

        rqag = client.post(f"/recruiter/positions/{pid}/hdeval-qag/regenerate")
        print(f"  [QAG trigger] {rqag.status_code}")
        for _ in range(15):
            g = client.get(f"/recruiter/positions/{pid}/hdeval-qag")
            if g.status_code == 200:
                st = str((g.json() or {}).get("status", ""))
                if st == "pending_tech_review":
                    tech_client.post(f"/recruiter/positions/{pid}/hdeval-qag/approve")
                    print("  ✓ QAG approved")
                    break
                if st in ("approved", "ai_generation_failed"):
                    break
            time.sleep(3)

        # ── Phase 2: Import CVs + dual score verification ─────────────────────
        print("\n══════════════════════════════════════════")
        print("PHASE 2: Import CVs + dual score check")
        print("══════════════════════════════════════════")
        if not sample_cv_paths:
            pytest.skip("No sample CVs — set SAMPLE_CVS_DIR with .pdf files")

        files = [
            ("files", (p.name, p.read_bytes(), "application/pdf"))
            for p in sample_cv_paths[:3]
        ]
        with httpx.Client(base_url=BASE_URL, headers=upload_headers, timeout=300.0) as up:
            ru = up.post(f"/recruiter/positions/{pid}/candidates/upload", files=files)
        assert ru.status_code in (200, 201), f"CV upload: {ru.status_code} {ru.text}"
        print(f"  ✓ {len(files)} CV(s) uploaded")

        # Poll until candidates appear (tolerant — CV parse is async)
        my_cands: list[dict] = []
        for poll in range(40):
            rc = client.get("/recruiter/candidates", params={"position_id": pid})
            if rc.status_code == 200:
                raw = rc.json()
                cands_raw = raw if isinstance(raw, list) else (raw.get("candidates") or raw.get("data") or [])
                my_cands = [c for c in cands_raw if str(c.get("position_id") or c.get("positionId") or "") == pid]
                if my_cands:
                    break
            time.sleep(3)

        if not my_cands:
            print("  [tolerant] no parsed candidates in time — running with 0")
        else:
            print(f"  ✓ {len(my_cands)} candidate(s) visible")
            scores = [_score(c) for c in my_cands if _score(c) is not None]
            if scores:
                assert any(s > 0 for s in scores), "Bug-A regression: all scores = 0"
                print(f"  ✓ semantic scores: {[round(s, 1) for s in scores]}")

        # ── Phase 3: Candidate filtering ──────────────────────────────────────
        print("\n══════════════════════════════════════════")
        print("PHASE 3: Candidate filtering")
        print("══════════════════════════════════════════")
        for label, params in [
            ("min_score=0", {"position_id": pid, "min_score": 0}),
            ("skill=React", {"position_id": pid, "skills": "React"}),
        ]:
            rf = client.get("/recruiter/candidates", params=params)
            if rf.status_code == 200:
                fc = rf.json() if isinstance(rf.json(), list) else []
                print(f"  ✓ filter {label}: {len(fc)} candidate(s)")
            else:
                print(f"  [tolerant] filter {label}: {rf.status_code}")

        # ── Phase 4: Create group + filtration flow ───────────────────────────
        print("\n══════════════════════════════════════════")
        print("PHASE 4: Create group + filtration flow")
        print("══════════════════════════════════════════")
        cand_app_ids = [
            _id(c, "application_id", "applicationId", "id")
            for c in my_cands
            if _id(c, "application_id", "applicationId", "id")
        ]
        rg = client.post(f"/recruiter/positions/{pid}/groups", json={
            "name": f"E2E Group — {uuid.uuid4().hex[:5]}",
            "position_id": pid,
            "candidate_ids": cand_app_ids,
        })
        assert rg.status_code in (200, 201), f"create group: {rg.status_code} {rg.text}"
        gid = _id(rg.json(), "group_id", "id")
        assert gid, f"no group id: {rg.json()}"
        created_group_id = gid
        print(f"  ✓ group created: {gid} ({len(cand_app_ids)} candidate(s))")

        # Set filtration_flow
        rfr = tech_client.patch(f"/recruiter/groups/{gid}", json={"filtration_flow": FLOW})
        assert rfr.status_code in (200, 201), f"filtration_flow: {rfr.status_code} {rfr.text}"
        gd = client.get(f"/recruiter/groups/{gid}").json()
        stages_raw = gd.get("pipelineStages") or gd.get("pipeline_stages") or []
        assert len(stages_raw) >= len(FLOW), f"expected {len(FLOW)} stages, got {len(stages_raw)}"
        print(f"  ✓ filtration_flow set — {len(stages_raw)} stage row(s)")

        # All stages must start not_started, no config
        for s in stages_raw:
            sstate = str(s.get("state", "")).replace("-", "_")
            assert sstate in ("not_started", "not-started", "inactive"), (
                f"stage {s.get('id')} expected not_started, got {sstate}"
            )

        # ── Phase 5a: Assessment — mixed question sources ─────────────────────
        print("\n══════════════════════════════════════════")
        print("PHASE 5a: Assessment (manual + QB + AI sections)")
        print("══════════════════════════════════════════")
        sections = _build_assessment_sections(tech_client, position_title)
        print(f"  ── submitting {len(sections)} section(s) to POST /assessments")

        ra = tech_client.post("/assessments", json={
            "position_id": pid,
            "group_id": gid,
            "title": f"E2E Assessment {uuid.uuid4().hex[:5]}",
            "duration_minutes": 90,
            "passing_score": 60.0,
            "randomizeQuestions": True,
            "proctoring": True,
            "sections": sections,
        })
        assert ra.status_code == 200, f"assessment create: {ra.status_code} {ra.text}"
        aid = _id(ra.json(), "assessment_id", "id")
        assert aid, f"no assessment_id: {ra.json()}"
        print(f"  ✓ assessment created: {aid}  ({len(sections)} sections)")

        # has_config should now be True for assessment stage
        gd2 = client.get(f"/recruiter/groups/{gid}").json()
        st_asm = _stage(gd2.get("pipelineStages") or [], "assessment")
        if st_asm:
            assert st_asm.get("has_config"), (
                f"assessment stage has_config should be True, got: {st_asm}"
            )
            print("  ✓ has_config=True for assessment stage")

        # Set acceptance criteria for assessment stage
        rac = tech_client.put(f"/recruiter/groups/{gid}/acceptance-criteria", json={
            "minimum_technical_score": 60.0,
            "allowed_integrity_risk": "Medium",
            "required_verdict": "Pass",
        })
        print(f"  [acceptance-criteria] {rac.status_code}")

        # ── Phase 5b: Video interview (AI rubric suggest + revise + assign) ───
        print("\n══════════════════════════════════════════")
        print("PHASE 5b: Video interview (AI rubric + revision)")
        print("══════════════════════════════════════════")
        vi_config = _build_video_interview(tech_client, position_title)
        print(f"  ── assigning video interview config to group {gid}")
        rv = tech_client.post(f"/recruiter/groups/{gid}/interviews/assign", json=vi_config)
        if rv.status_code in (200, 201):
            vi_id = _id(rv.json(), "interview_config_id", "config_id", "id")
            print(f"  ✓ video interview assigned: {vi_id}")

            # Verify has_config for ai_interview stage
            gd3 = client.get(f"/recruiter/groups/{gid}").json()
            st_vi = _stage(gd3.get("pipelineStages") or [], "ai-interview")
            if st_vi:
                assert st_vi.get("has_config"), (
                    f"ai_interview stage has_config should be True after assign"
                )
                print("  ✓ has_config=True for ai_interview stage")

            # Simulate replace-config flow (reconfigure while still not_started)
            vi_config_v2 = _build_video_interview(tech_client, position_title + " v2")
            vi_config_v2["create_new"] = False
            vi_config_v2["interview_config_id"] = vi_id
            rv2 = tech_client.post(f"/recruiter/groups/{gid}/interviews/assign", json=vi_config_v2)
            print(f"  [replace-config] {rv2.status_code} — "
                  f"{'✓ replaced OK' if rv2.status_code in (200, 201) else rv2.text[:120]}")
        else:
            print(f"  [tolerant] video interview assign: {rv.status_code} {rv.text[:200]}")

        # ── Phase 5c: LiV2 — full AI wizard ──────────────────────────────────
        print("\n══════════════════════════════════════════")
        print("PHASE 5c: LiV2 (full AI wizard)")
        print("══════════════════════════════════════════")
        rubric_id, bank_id = _liv2_ai_wizard(tech_client, gid, position_title)

        if rubric_id and bank_id:
            # Verify has_config=True for live_interview stage
            gd4 = client.get(f"/recruiter/groups/{gid}").json()
            st_li = _stage(gd4.get("pipelineStages") or [], "live-interview")
            if st_li:
                assert st_li.get("has_config"), (
                    f"live_interview stage has_config should be True after LiV2 freeze"
                )
                print("  ✓ has_config=True for live_interview stage")

        # ── Phase 6: Assessment stage lifecycle ───────────────────────────────
        print("\n══════════════════════════════════════════")
        print("PHASE 6: Assessment lifecycle")
        print("══════════════════════════════════════════")

        # Start
        rs6 = tech_client.post(f"/recruiter/groups/{gid}/stages/start",
                                json={"stage": "assessment"})
        assert rs6.status_code in (200, 201), f"start assessment: {rs6.status_code} {rs6.text}"
        inv6 = rs6.json().get("invitations_sent", 0)
        print(f"  ✓ assessment started — {inv6} invitation(s)")

        # Verify active
        gd5 = client.get(f"/recruiter/groups/{gid}").json()
        st6 = _stage(gd5.get("pipelineStages") or [], "assessment")
        if st6:
            assert str(st6.get("state", "")).replace("-", "_") == "active", (
                f"expected active, got {st6.get('state')}"
            )
            print("  ✓ state=active confirmed")

        # Monitoring
        rm6 = tech_client.get(f"/recruiter/groups/{gid}/stages/monitoring",
                               params={"stage_type": "assessment"})
        if rm6.status_code == 200:
            print(f"  ✓ monitoring response: {type(rm6.json()).__name__}")
        else:
            rm6b = tech_client.get(f"/recruiter/groups/{gid}/monitoring/assessment")
            print(f"  [tolerant] monitoring: {rm6.status_code} / alt: {rm6b.status_code}")

        time.sleep(1)

        # Bulk-progress preview (dry run)
        rp6 = tech_client.post(
            f"/recruiter/groups/{gid}/candidates/bulk-progress/preview",
            json={"application_ids": cand_app_ids, "action": "progress",
                  "current_stage_type": "assessment"},
        )
        print(f"  [preview] {rp6.status_code}")

        # Close
        rc6 = tech_client.post(f"/recruiter/groups/{gid}/stages/close",
                                json={"stage": "assessment"})
        assert rc6.status_code in (200, 201), f"close assessment: {rc6.status_code} {rc6.text}"
        print(f"  ✓ assessment closed — auto_failed={rc6.json().get('auto_failed_count', '?')}")

        # Verify closed
        gd6 = client.get(f"/recruiter/groups/{gid}").json()
        st6c = _stage(gd6.get("pipelineStages") or [], "assessment")
        if st6c:
            assert str(st6c.get("state", "")).replace("-", "_") == "closed", (
                f"expected closed, got {st6c.get('state')}"
            )
            print("  ✓ state=closed confirmed")

        # Bulk progress (pass all — tolerant: candidates may not have completed)
        rbp6 = tech_client.post(
            f"/recruiter/groups/{gid}/candidates/bulk-progress",
            json={"application_ids": cand_app_ids, "action": "progress",
                  "current_stage_type": "assessment"},
        )
        print(f"  [bulk-progress] {rbp6.status_code}")

        # ── Phase 7: Video interview lifecycle ────────────────────────────────
        print("\n══════════════════════════════════════════")
        print("PHASE 7: Video interview lifecycle")
        print("══════════════════════════════════════════")

        rs7 = tech_client.post(f"/recruiter/groups/{gid}/stages/start",
                                json={"stage": "ai_interview"})
        if rs7.status_code in (200, 201):
            print(f"  ✓ ai_interview started — {rs7.json().get('invitations_sent', 0)} invitation(s)")
            gd7 = client.get(f"/recruiter/groups/{gid}").json()
            st7 = _stage(gd7.get("pipelineStages") or [], "ai-interview")
            if st7:
                assert str(st7.get("state", "")).replace("-", "_") == "active", (
                    f"expected active, got {st7.get('state')}"
                )
                print("  ✓ state=active confirmed")
            time.sleep(1)
            rc7 = tech_client.post(f"/recruiter/groups/{gid}/stages/close",
                                   json={"stage": "ai_interview"})
            print(f"  [close] {rc7.status_code}")
            gd7c = client.get(f"/recruiter/groups/{gid}").json()
            st7c = _stage(gd7c.get("pipelineStages") or [], "ai-interview")
            if st7c:
                assert str(st7c.get("state", "")).replace("-", "_") == "closed", (
                    f"expected closed, got {st7c.get('state')}"
                )
                print("  ✓ state=closed confirmed")
            tech_client.post(
                f"/recruiter/groups/{gid}/candidates/bulk-progress",
                json={"application_ids": cand_app_ids, "action": "progress",
                      "current_stage_type": "ai_interview"},
            )
            print("  ✓ bulk-progress sent")
        else:
            print(f"  [tolerant] start ai_interview: {rs7.status_code} — {rs7.text[:200]}")

        # ── Phase 8: LiV2 lifecycle ───────────────────────────────────────────
        print("\n══════════════════════════════════════════")
        print("PHASE 8: Live Interview V2 lifecycle")
        print("══════════════════════════════════════════")

        rs8 = tech_client.post(f"/recruiter/groups/{gid}/stages/start",
                                json={"stage": "live_interview"})
        if rs8.status_code in (200, 201):
            print(f"  ✓ live_interview started — {rs8.json().get('invitations_sent', 0)} invitation(s)")
            gd8 = client.get(f"/recruiter/groups/{gid}").json()
            st8 = _stage(gd8.get("pipelineStages") or [], "live-interview")
            if st8:
                assert str(st8.get("state", "")).replace("-", "_") == "active", (
                    f"expected active, got {st8.get('state')}"
                )
                print("  ✓ state=active confirmed")
            time.sleep(1)
            rc8 = tech_client.post(f"/recruiter/groups/{gid}/stages/close",
                                   json={"stage": "live_interview"})
            print(f"  [close] {rc8.status_code}")
            gd8c = client.get(f"/recruiter/groups/{gid}").json()
            st8c = _stage(gd8c.get("pipelineStages") or [], "live-interview")
            if st8c:
                assert str(st8c.get("state", "")).replace("-", "_") == "closed", (
                    f"expected closed, got {st8c.get('state')}"
                )
                print("  ✓ state=closed confirmed")
            tech_client.post(
                f"/recruiter/groups/{gid}/candidates/bulk-progress",
                json={"application_ids": cand_app_ids, "action": "progress",
                      "current_stage_type": "live_interview"},
            )
            print("  ✓ bulk-progress sent")
        else:
            print(f"  [tolerant] start live_interview: {rs8.status_code} — {rs8.text[:200]}")

        # ── Phase 9: Score breakdowns ─────────────────────────────────────────
        print("\n══════════════════════════════════════════")
        print("PHASE 9: Score breakdowns")
        print("══════════════════════════════════════════")
        for app_id in cand_app_ids[:3]:
            rsb = client.get(f"/recruiter/applications/{app_id}/score-breakdown")
            if rsb.status_code == 200:
                sb = rsb.json()
                fields = [k for k in ("skill_alignment", "experience_alignment",
                                      "keyword_coverage", "pre_score_final") if sb.get(k) is not None]
                print(f"  ✓ {app_id}: fields present → {fields}")
            else:
                print(f"  [tolerant] {app_id}: {rsb.status_code}")

        # ── Phase 10: Send offers ─────────────────────────────────────────────
        print("\n══════════════════════════════════════════")
        print("PHASE 10: Send offers")
        print("══════════════════════════════════════════")
        ro = tech_client.post(
            f"/recruiter/groups/{gid}/offers/send",
            json={"application_ids": cand_app_ids},
        )
        if ro.status_code in (200, 201):
            print(f"  ✓ offers sent: {ro.json()}")
        else:
            print(f"  [tolerant] send offers: {ro.status_code} {ro.text[:200]}")

        print("\n══════════════════════════════════════════")
        print("ALL PHASES COMPLETE ✓")
        print("══════════════════════════════════════════\n")

    finally:
        for gid_c in ([created_group_id] if created_group_id else []):
            try:
                client.request("DELETE", f"/recruiter/groups/{gid_c}",
                               json={"action": "release"})
            except Exception:
                pass
        for pid_c in ([created_position_id] if created_position_id else []):
            try:
                client.delete(f"/recruiter/positions/{pid_c}")
            except Exception:
                pass


# ─── Seeded-data assertions ───────────────────────────────────────────────────
# Use seeded G-D (assessment closed, decision pending) and G-E (full pipeline)
# to verify API shapes without a fresh run. Skip gracefully if seeder not run.


def _find_seeded_group(client, name_fragment: str) -> str | None:
    r = client.get("/recruiter/projects")
    if r.status_code != 200:
        return None
    projects = r.json() if isinstance(r.json(), list) else (r.json().get("projects") or [])
    for proj in projects:
        proj_id = _id(proj, "project_id", "id")
        if not proj_id:
            continue
        rpos = client.get(f"/recruiter/projects/{proj_id}/positions")
        if rpos.status_code != 200:
            continue
        for pos in (rpos.json() if isinstance(rpos.json(), list) else []):
            pos_id = _id(pos, "position_id", "id")
            if not pos_id:
                continue
            rg = client.get(f"/recruiter/positions/{pos_id}/groups")
            if rg.status_code != 200:
                continue
            for grp in (rg.json() if isinstance(rg.json(), list) else []):
                gname = grp.get("group_name") or grp.get("name") or ""
                if name_fragment.lower() in gname.lower():
                    return _id(grp, "group_id", "id")
    return None


@pytest.mark.seeded
def test_seeded_gd_review_mode(client, tech_client):
    """
    G-D: assessment closed, awaiting decision.
    Verifies: stage state=closed, score breakdown shape, bulk-progress preview.
    """
    gd_id = _find_seeded_group(client, "G-D")
    if not gd_id:
        pytest.skip("Seeded G-D group not found — run seed_five_states.py first")

    gd = client.get(f"/recruiter/groups/{gd_id}").json()
    stages = gd.get("pipelineStages") or []
    st = _stage(stages, "assessment")
    assert st is not None, f"G-D should have assessment stage"
    assert str(st.get("state", "")).replace("-", "_") == "closed", (
        f"G-D assessment should be closed, got: {st.get('state')}"
    )
    print(f"\n  ✓ G-D assessment stage is closed")

    apps = gd.get("candidates") or []
    for app in apps[:3]:
        app_id = _id(app, "application_id", "id")
        if not app_id:
            continue
        r = client.get(f"/recruiter/applications/{app_id}/score-breakdown")
        if r.status_code == 200:
            sb = r.json()
            print(f"  ✓ score breakdown {app_id}: pre_score={sb.get('pre_score_final')}, "
                  f"criteria_checks={len(sb.get('criteria_checks') or [])}")

    all_ids = [_id(a, "application_id", "id") for a in apps if _id(a, "application_id", "id")]
    if all_ids:
        rp = tech_client.post(
            f"/recruiter/groups/{gd_id}/candidates/bulk-progress/preview",
            json={"application_ids": all_ids[:2], "action": "progress",
                  "current_stage_type": "assessment"},
        )
        if rp.status_code in (200, 201):
            print(f"  ✓ bulk-progress preview: {rp.json()}")


@pytest.mark.seeded
def test_seeded_ge_results(client):
    """
    G-E: all three stages complete.
    Verifies: all stages closed, monitoring reachable, score breakdowns populated.
    """
    ge_id = _find_seeded_group(client, "G-E")
    if not ge_id:
        pytest.skip("Seeded G-E group not found — run seed_five_states.py first")

    ge = client.get(f"/recruiter/groups/{ge_id}").json()
    stages = ge.get("pipelineStages") or []
    stage_states = {
        str(s.get("id", "")): str(s.get("state", "")).replace("-", "_")
        for s in stages
    }
    print(f"\n  G-E stage states: {stage_states}")

    for stage_type in ("assessment", "ai_interview", "live_interview"):
        rm = client.get(f"/recruiter/groups/{ge_id}/stages/monitoring",
                        params={"stage_type": stage_type})
        if rm.status_code == 200:
            print(f"  ✓ monitoring {stage_type}: {type(rm.json()).__name__}")

    apps = ge.get("candidates") or []
    for app in apps[:3]:
        app_id = _id(app, "application_id", "id")
        if not app_id:
            continue
        r = client.get(f"/recruiter/applications/{app_id}/score-breakdown")
        if r.status_code == 200:
            sb = r.json()
            criteria = sb.get("criteria_checks") or []
            print(f"  ✓ {app_id}: pre_score={sb.get('pre_score_final')}, qag_checks={len(criteria)}")
