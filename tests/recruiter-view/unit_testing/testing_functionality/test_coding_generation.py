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
