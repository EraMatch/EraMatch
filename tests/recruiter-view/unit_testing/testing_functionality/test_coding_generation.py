"""
Tests for coding question generation and variant generation.
Backend must be running at http://localhost:8000.
"""
import pytest
import httpx

BASE_URL = "http://localhost:8000/api/v1"
RECRUITER_EMAIL = "hr@eramatch.com"
RECRUITER_PASSWORD = "admin12345"


@pytest.fixture(scope="module")
def recruiter_client():
    with httpx.Client(base_url=BASE_URL, timeout=30.0) as c:
        resp = c.post("/auth/organization-user/login", json={
            "email": RECRUITER_EMAIL, "password": RECRUITER_PASSWORD
        })
        assert resp.status_code == 200
        token = resp.json()["access_token"]
    return httpx.Client(
        base_url=BASE_URL,
        headers={"Authorization": f"Bearer {token}"},
        timeout=120.0,
    )


class TestCodingQuestionGeneration:
    """AI generation produces well-formed coding questions."""

    @pytest.fixture(scope="class")
    def generated_question(self, recruiter_client):
        resp = recruiter_client.post("/recruiter/ai/generate-question", json={
            "use_case": "assessment_question_generation",
            "question_type": "code",
            "topic": "Two Sum",
            "difficulty": "Easy",
            "context": "Python backend engineering assessment",
        })
        assert resp.status_code == 200, f"Generation failed: {resp.text}"
        return resp.json()

    def test_has_question_text(self, generated_question):
        assert generated_question.get("questionText") or generated_question.get("text")

    def test_has_starter_code_or_template(self, generated_question):
        has_starter = bool(generated_question.get("starterCode"))
        has_template = bool(generated_question.get("codeTemplate"))
        assert has_starter or has_template, "Expected starterCode or codeTemplate"

    def test_has_test_cases(self, generated_question):
        tcs = generated_question.get("testCases") or []
        assert len(tcs) >= 3, f"Expected >= 3 test cases, got {len(tcs)}"

    def test_has_examples(self, generated_question):
        ex = generated_question.get("examples") or []
        assert len(ex) >= 1, "Expected at least 1 example"

    def test_has_hidden_test_cases(self, generated_question):
        tcs = generated_question.get("testCases") or []
        hidden = [t for t in tcs if t.get("isHidden") or t.get("is_hidden")]
        assert len(hidden) >= 1, "Expected at least 1 hidden test case"


class TestVariantGeneration:
    """POST /questions/bank/{id}/variant creates a text-only remix."""

    @pytest.fixture(scope="class")
    def base_question_id(self, recruiter_client):
        payload = {
            "text": "Two Sum: return indices of two numbers that add to target.",
            "type": "Code",
            "difficulty": "Easy",
            "category": "Array",
            "tags": ["Array"],
            "starterCode": "def two_sum(nums, target):\n    pass",
            "functionName": "two_sum",
            "inputFormat": "nums: List[int]\ntarget: int",
            "outputFormat": "List[int]",
            "examples": [{"input": "nums=[2,7], target=9", "output": "[0,1]", "explanation": "2+7=9"}],
            "constraints": ["2 ≤ n ≤ 100"],
            "testCases": [
                {"input": "[2,7]\n9", "expected": "[0,1]", "is_hidden": False},
                {"input": "[3,2,4]\n6", "expected": "[1,2]", "is_hidden": True},
            ],
        }
        resp = recruiter_client.post("/questions/bank", json=payload)
        assert resp.status_code == 200, f"Base question creation failed: {resp.text}"
        return resp.json()["id"]

    @pytest.fixture(scope="class")
    def variant(self, recruiter_client, base_question_id):
        resp = recruiter_client.post(f"/questions/bank/{base_question_id}/variant")
        assert resp.status_code == 200, f"Variant generation failed: {resp.text}"
        return resp.json()

    def test_variant_has_different_question_text(self, variant, recruiter_client, base_question_id):
        base_resp = recruiter_client.get("/questions/bank")
        base_q = next(x for x in base_resp.json() if x["id"] == base_question_id)
        assert variant["text"] != base_q["text"], "Variant text should differ"

    def test_variant_inherits_test_cases(self, variant, recruiter_client, base_question_id):
        base_resp = recruiter_client.get("/questions/bank")
        base_q = next(x for x in base_resp.json() if x["id"] == base_question_id)
        assert variant["testCases"] == base_q["testCases"], "Variant must keep same test cases"

    def test_variant_inherits_starter_code(self, variant, recruiter_client, base_question_id):
        base_resp = recruiter_client.get("/questions/bank")
        base_q = next(x for x in base_resp.json() if x["id"] == base_question_id)
        assert variant["starterCode"] == base_q["starterCode"]

    def test_org_isolation(self, recruiter_client):
        fake_id = "00000000-0000-0000-0000-000000000000"
        resp = recruiter_client.post(f"/questions/bank/{fake_id}/variant")
        assert resp.status_code in (403, 404)
