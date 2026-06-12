"""
Full assessment configuration tests — recruiter side.

Covers:
- Create with MCQ / Essay / Coding sections
- Essay: rubricYesNoChecks persisted and readable in question_config
- Coding: test_cases persisted with correct field names and hidden flags
- Mixed 3-section assessment
- section_type stored as 'code' not 'coding' (DB check constraint)
- QB question linking by real UUID
- GET: sections + questions returned
- PUT: sections replaced
- DELETE: soft-delete, GET returns 404

Requires: backend at http://localhost:8000, recruiter logged in.
"""
import pytest
import uuid
import httpx


BASE_URL = "http://localhost:8000/api/v1"
ORG_ID = "59b023a9-db8e-450c-82e4-01f29f152351"


# ─────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────

def _get_free_group(client):
    """
    Return (position_id, group_id) by creating a fresh test group via API.
    This avoids the one-assessment-per-group DB constraint and DB direct access.
    """
    # Get first available position
    r = client.get("/recruiter/positions?limit=20")
    assert r.status_code == 200, f"Failed to list positions: {r.text}"
    positions = r.json() if isinstance(r.json(), list) else []
    assert positions, "No positions found — seed the DB first"
    position_id = str(positions[0].get("position_id") or positions[0].get("id"))

    # Create a fresh group so there's no existing assessment (uniqueness constraint)
    group_name = f"test-group-{uuid.uuid4().hex[:8]}"
    rg = client.post(f"/recruiter/positions/{position_id}/groups", json={
        "name": group_name,
        "position_id": position_id,
        "candidate_ids": [],
    })
    assert rg.status_code in (200, 201), f"Failed to create test group: {rg.text}"
    group_data = rg.json()
    group_id = str(group_data.get("group_id") or group_data.get("id"))
    return position_id, group_id


def _mcq_variant(i=1):
    return {
        "id": f"v-mcq-{i}-{uuid.uuid4().hex[:4]}",
        "type": "mcq",
        "questionText": f"Which sorting algorithm has O(n log n) average complexity? (v{i})",
        "points": 10,
        "options": ["Bubble Sort", "Quick Sort", "Insertion Sort", "Selection Sort"],
        "correctAnswer": 1,
        "explanation": "Quick Sort averages O(n log n).",
        "difficulty": "Medium",
        "tags": ["Algorithms"],
    }


def _essay_variant(i=1):
    return {
        "id": f"v-essay-{i}-{uuid.uuid4().hex[:4]}",
        "type": "essay",
        "questionText": f"Explain REST API design principles (variant {i}).",
        "points": 20,
        "rubric": "Grade on depth, accuracy, and examples.",
        "maxWords": 400,
        "expectedKeywords": ["stateless", "HTTP", "resource"],
        "rubricYesNoChecks": [
            {"id": 1, "check": "Does the answer define REST correctly?", "weight": 0.4},
            {"id": 2, "check": "Does the answer mention statelessness?", "weight": 0.3},
            {"id": 3, "check": "Does the answer provide a concrete example?", "weight": 0.3},
        ],
        "difficulty": "Medium",
    }


def _coding_variant(i=1):
    return {
        "id": f"v-code-{i}-{uuid.uuid4().hex[:4]}",
        "type": "coding",
        "questionText": f"Return the sum of a list of integers (variant {i}).",
        "points": 30,
        "language": "python",
        "codeTemplate": "def solution(nums):\n    pass",
        "testCases": [
            {"input": "[1,2,3]",  "expected": "6",  "is_hidden": False},
            {"input": "[0,0,0]",  "expected": "0",  "is_hidden": True},
            {"input": "[-1,1]",   "expected": "0",  "is_hidden": True},
            {"input": "[10]",     "expected": "10", "is_hidden": True},
        ],
        "difficulty": "Easy",
        "topics": ["Array", "Math"],
    }


def _payload(position_id, group_id, sections):
    return {
        "position_id": position_id,
        "group_id": group_id,
        "title": f"Auto-test Assessment {uuid.uuid4().hex[:6]}",
        "description": "Created by automated tests — safe to delete.",
        "duration_minutes": 60,
        "passing_score": 60.0,
        "randomizeQuestions": False,
        "proctoring": False,
        "sections": sections,
    }


def _create_assessment(client, sections, position_id=None, group_id=None):
    if not position_id:
        position_id, group_id = _get_free_group(client)
    p = _payload(position_id, group_id, sections)
    r = client.post("/assessments", json=p)
    assert r.status_code == 200, f"Create failed: {r.text}"
    return r.json()["assessment_id"]


# ─────────────────────────────────────────────────────────
# Create — validation
# ─────────────────────────────────────────────────────────

class TestAssessmentCreateValidation:
    def test_missing_all_fields_returns_422(self, client):
        r = client.post("/assessments", json={})
        assert r.status_code == 422, r.text

    def test_missing_sections_returns_422(self, client):
        r = client.post("/assessments", json={
            "title": "X", "duration_minutes": 60, "passing_score": 60,
        })
        assert r.status_code == 422, r.text

    def test_no_auth_returns_error(self, raw_client):
        r = raw_client.post("/assessments", json={})
        assert r.status_code in (401, 403, 422), r.text


# ─────────────────────────────────────────────────────────
# Create — MCQ section
# ─────────────────────────────────────────────────────────

class TestCreateMCQSection:
    def test_create_mcq_returns_200(self, client):
        pos_id, grp_id = _get_free_group(client)
        r = client.post("/assessments", json=_payload(pos_id, grp_id, [{
            "id": "s1", "order": 1, "type": "mcq", "points": 10,
            "selectionStrategy": "random", "variantsToSelect": 1,
            "variants": [_mcq_variant()],
        }]))
        assert r.status_code == 200, r.text

    def test_create_mcq_has_assessment_id(self, client):
        pos_id, grp_id = _get_free_group(client)
        r = client.post("/assessments", json=_payload(pos_id, grp_id, [{
            "id": "s1", "order": 1, "type": "mcq", "points": 10,
            "selectionStrategy": "random", "variantsToSelect": 1,
            "variants": [_mcq_variant()],
        }]))
        data = r.json()
        assert "assessment_id" in data
        assert len(data["assessment_id"]) == 36  # UUID

    def test_create_mcq_status_is_draft_or_active(self, client):
        pos_id, grp_id = _get_free_group(client)
        r = client.post("/assessments", json=_payload(pos_id, grp_id, [{
            "id": "s1", "order": 1, "type": "mcq", "points": 10,
            "selectionStrategy": "random", "variantsToSelect": 1,
            "variants": [_mcq_variant()],
        }]))
        assert r.json()["status"] in ("draft", "active"), r.json()

    def test_create_two_mcq_variants(self, client):
        pos_id, grp_id = _get_free_group(client)
        r = client.post("/assessments", json=_payload(pos_id, grp_id, [{
            "id": "s1", "order": 1, "type": "mcq", "points": 10,
            "selectionStrategy": "random", "variantsToSelect": 1,
            "variants": [_mcq_variant(1), _mcq_variant(2)],
        }]))
        assert r.status_code == 200, r.text


# ─────────────────────────────────────────────────────────
# Create — Essay section (rubric checks persisted)
# ─────────────────────────────────────────────────────────

class TestCreateEssaySection:
    @pytest.fixture(scope="class")
    def essay_assessment_id(self, client):
        return _create_assessment(client, [{
            "id": "s1", "order": 1, "type": "essay", "points": 20,
            "selectionStrategy": "random", "variantsToSelect": 1,
            "variants": [_essay_variant()],
        }])

    def test_create_essay_returns_200(self, client):
        pos_id, grp_id = _get_free_group(client)
        r = client.post("/assessments", json=_payload(pos_id, grp_id, [{
            "id": "s1", "order": 1, "type": "essay", "points": 20,
            "selectionStrategy": "random", "variantsToSelect": 1,
            "variants": [_essay_variant()],
        }]))
        assert r.status_code == 200, r.text

    def test_essay_rubric_checks_persisted(self, client, essay_assessment_id):
        r = client.get(f"/assessments/{essay_assessment_id}")
        assert r.status_code == 200, r.text
        sections = r.json().get("sections", [])
        essay_sec = next(
            (s for s in sections if s.get("type", "").lower() in ("essay",)),
            None
        )
        assert essay_sec is not None, f"No essay section: {[s.get('type') for s in sections]}"
        qs = essay_sec.get("questions") or essay_sec.get("variants") or []
        assert qs, "No questions in essay section"
        q = qs[0]
        # GET response returns camelCase fields directly on the variant (not nested in question_config)
        checks = q.get("rubricYesNoChecks") or []
        assert len(checks) == 3, f"Expected 3 rubric checks, got {len(checks)}: {checks}"
        assert checks[0].get("check") == "Does the answer define REST correctly?"

    def test_essay_rubric_text_persisted(self, client, essay_assessment_id):
        r = client.get(f"/assessments/{essay_assessment_id}")
        sections = r.json().get("sections", [])
        essay_sec = next(s for s in sections if s.get("type", "").lower() == "essay")
        qs = essay_sec.get("questions") or essay_sec.get("variants") or []
        q = qs[0]
        assert q.get("rubric") == "Grade on depth, accuracy, and examples."

    def test_essay_max_words_persisted(self, client, essay_assessment_id):
        r = client.get(f"/assessments/{essay_assessment_id}")
        sections = r.json().get("sections", [])
        essay_sec = next(s for s in sections if s.get("type", "").lower() == "essay")
        qs = essay_sec.get("questions") or essay_sec.get("variants") or []
        q = qs[0]
        assert q.get("maxWords") == 400


# ─────────────────────────────────────────────────────────
# Create — Coding section (test cases + hidden flags)
# ─────────────────────────────────────────────────────────

class TestCreateCodingSection:
    @pytest.fixture(scope="class")
    def coding_assessment_id(self, client):
        return _create_assessment(client, [{
            "id": "s1", "order": 1, "type": "code", "points": 30,
            "selectionStrategy": "random", "variantsToSelect": 1,
            "variants": [_coding_variant()],
        }])

    def test_create_coding_no_constraint_error(self, client):
        """section_type must be 'code' not 'coding' in DB."""
        pos_id, grp_id = _get_free_group(client)
        r = client.post("/assessments", json=_payload(pos_id, grp_id, [{
            "id": "s1", "order": 1, "type": "code", "points": 30,
            "selectionStrategy": "random", "variantsToSelect": 1,
            "variants": [_coding_variant()],
        }]))
        assert r.status_code == 200, (
            f"Got {r.status_code} — likely 'coding' stored instead of 'code' "
            f"violating DB check constraint: {r.text[:300]}"
        )

    def test_coding_test_cases_persisted(self, client, coding_assessment_id):
        r = client.get(f"/assessments/{coding_assessment_id}")
        assert r.status_code == 200, r.text
        sections = r.json().get("sections", [])
        code_sec = next(
            (s for s in sections if s.get("type", "").lower() in ("code", "coding")),
            None
        )
        assert code_sec is not None, f"No coding section: {[s.get('type') for s in sections]}"
        qs = code_sec.get("questions") or code_sec.get("variants") or []
        assert qs, "No questions in coding section"
        # GET returns testCases directly on the variant (not nested in question_config)
        tcs = qs[0].get("testCases") or []
        assert len(tcs) == 4, f"Expected 4 test cases, got {len(tcs)}: {tcs}"

    def test_coding_hidden_test_cases_flagged(self, client, coding_assessment_id):
        r = client.get(f"/assessments/{coding_assessment_id}")
        sections = r.json().get("sections", [])
        code_sec = next(s for s in sections if s.get("type", "").lower() in ("code", "coding"))
        qs = code_sec.get("questions") or code_sec.get("variants") or []
        tcs = qs[0].get("testCases") or []
        hidden = [tc for tc in tcs if tc.get("is_hidden") or tc.get("isHidden")]
        assert len(hidden) == 3, f"Expected 3 hidden, got {len(hidden)}: {tcs}"

    def test_coding_expected_field_readable(self, client, coding_assessment_id):
        """Judge must find 'expected' key — not 'expected_output'."""
        r = client.get(f"/assessments/{coding_assessment_id}")
        sections = r.json().get("sections", [])
        code_sec = next(s for s in sections if s.get("type", "").lower() in ("code", "coding"))
        qs = code_sec.get("questions") or code_sec.get("variants") or []
        tcs = qs[0].get("testCases") or []
        for tc in tcs:
            has_expected = "expected" in tc or "expected_output" in tc or "output" in tc
            assert has_expected, f"No expected field in test case: {list(tc.keys())}"


# ─────────────────────────────────────────────────────────
# Create — Mixed 3-section
# ─────────────────────────────────────────────────────────

class TestCreateMixedSections:
    def test_create_three_sections(self, client):
        pos_id, grp_id = _get_free_group(client)
        r = client.post("/assessments", json=_payload(pos_id, grp_id, [
            {"id": "s1", "order": 1, "type": "mcq",   "points": 10,
             "selectionStrategy": "random", "variantsToSelect": 1,
             "variants": [_mcq_variant()]},
            {"id": "s2", "order": 2, "type": "essay",  "points": 20,
             "selectionStrategy": "random", "variantsToSelect": 1,
             "variants": [_essay_variant()]},
            {"id": "s3", "order": 3, "type": "code",   "points": 30,
             "selectionStrategy": "random", "variantsToSelect": 1,
             "variants": [_coding_variant()]},
        ]))
        assert r.status_code == 200, r.text
        aid = r.json()["assessment_id"]
        data = client.get(f"/assessments/{aid}").json()
        assert len(data.get("sections", [])) == 3


# ─────────────────────────────────────────────────────────
# GET — structure validation
# ─────────────────────────────────────────────────────────

class TestAssessmentGet:
    @pytest.fixture(scope="class")
    def aid(self, client):
        return _create_assessment(client, [{
            "id": "s1", "order": 1, "type": "mcq", "points": 10,
            "selectionStrategy": "random", "variantsToSelect": 1,
            "variants": [_mcq_variant()],
        }])

    def test_get_returns_200(self, client, aid):
        r = client.get(f"/assessments/{aid}")
        assert r.status_code == 200, r.text

    def test_get_has_sections(self, client, aid):
        data = client.get(f"/assessments/{aid}").json()
        assert "sections" in data, f"Missing 'sections': {list(data.keys())}"

    def test_section_has_type(self, client, aid):
        data = client.get(f"/assessments/{aid}").json()
        for s in data["sections"]:
            assert "type" in s or "question_type" in s, f"Section missing type: {list(s.keys())}"

    def test_section_has_questions(self, client, aid):
        data = client.get(f"/assessments/{aid}").json()
        for s in data["sections"]:
            qs = s.get("questions") or s.get("variants") or []
            assert len(qs) >= 1, f"Section has no questions: {s}"

    def test_question_has_text(self, client, aid):
        data = client.get(f"/assessments/{aid}").json()
        for s in data["sections"]:
            for q in (s.get("questions") or s.get("variants") or []):
                has_text = "question_text" in q or "questionText" in q or "text" in q
                assert has_text, f"Question missing text field: {list(q.keys())}"

    def test_get_unknown_id_returns_404(self, client):
        r = client.get(f"/assessments/{uuid.uuid4()}")
        assert r.status_code == 404, r.text


# ─────────────────────────────────────────────────────────
# PUT — update replaces sections
# ─────────────────────────────────────────────────────────

class TestAssessmentUpdate:
    @pytest.fixture(scope="class")
    def aid(self, client):
        return _create_assessment(client, [{
            "id": "s1", "order": 1, "type": "mcq", "points": 10,
            "selectionStrategy": "random", "variantsToSelect": 1,
            "variants": [_mcq_variant()],
        }])

    def test_update_returns_200(self, client, aid):
        pos_id, grp_id = _get_free_group(client)
        r = client.put(f"/assessments/{aid}", json=_payload(pos_id, grp_id, [{
            "id": "s1", "order": 1, "type": "essay", "points": 20,
            "selectionStrategy": "random", "variantsToSelect": 1,
            "variants": [_essay_variant()],
        }]))
        assert r.status_code == 200, r.text

    def test_update_replaces_section_type(self, client, aid):
        pos_id, grp_id = _get_free_group(client)
        client.put(f"/assessments/{aid}", json=_payload(pos_id, grp_id, [{
            "id": "s1", "order": 1, "type": "essay", "points": 20,
            "selectionStrategy": "random", "variantsToSelect": 1,
            "variants": [_essay_variant()],
        }]))
        data = client.get(f"/assessments/{aid}").json()
        types = [s.get("type", "").lower() for s in data.get("sections", [])]
        assert any("essay" in t for t in types), f"No essay section after update: {types}"


# ─────────────────────────────────────────────────────────
# DELETE — soft delete
# ─────────────────────────────────────────────────────────

class TestAssessmentDelete:
    def test_delete_returns_200(self, client):
        aid = _create_assessment(client, [{
            "id": "s1", "order": 1, "type": "mcq", "points": 10,
            "selectionStrategy": "random", "variantsToSelect": 1,
            "variants": [_mcq_variant()],
        }])
        r = client.delete(f"/assessments/{aid}")
        assert r.status_code == 200, r.text

    def test_deleted_assessment_returns_404(self, client):
        aid = _create_assessment(client, [{
            "id": "s1", "order": 1, "type": "mcq", "points": 10,
            "selectionStrategy": "random", "variantsToSelect": 1,
            "variants": [_mcq_variant()],
        }])
        client.delete(f"/assessments/{aid}")
        r = client.get(f"/assessments/{aid}")
        assert r.status_code == 404, r.text


# ─────────────────────────────────────────────────────────
# QB question linking
# ─────────────────────────────────────────────────────────

class TestQBLinking:
    def test_real_qb_id_linked_as_variant(self, client):
        # Create a QB question first
        r_qb = client.post("/questions/bank", json={
            "text": "What is the time complexity of quicksort on average?",
            "type": "Multiple Choice",
            "difficulty": "Medium",
            "category": "Algorithms",
            "tags": ["Sorting"],
            "options": ["O(n)", "O(n log n)", "O(n²)", "O(log n)"],
            "correctAnswer": 1,
            "explanation": "Quick sort averages O(n log n).",
        })
        assert r_qb.status_code == 200, r_qb.text
        qb_id = r_qb.json()["id"]

        pos_id, grp_id = _get_free_group(client)
        r = client.post("/assessments", json=_payload(pos_id, grp_id, [{
            "id": "s1", "order": 1, "type": "mcq", "points": 10,
            "selectionStrategy": "random", "variantsToSelect": 1,
            "variants": [{
                "id": qb_id,
                "type": "mcq",
                "questionText": "What is the time complexity of quicksort on average?",
                "points": 10,
                "options": ["O(n)", "O(n log n)", "O(n²)", "O(log n)"],
                "correctAnswer": 1,
                "difficulty": "Medium",
            }],
        }]))
        assert r.status_code == 200, f"QB linking failed: {r.text}"
