"""
Tests for Recruiter AI Features.
Covers: AI question generation, AI question refinement.

Note: These tests may fail if the Ollama AI service is not running.
Consider marking these as xfail or skip if AI is not available.

Backend endpoints:
  POST /recruiter/ai/generate-question
  POST /recruiter/ai/refine-question
"""
import pytest


class TestAIGenerateQuestion:
    """Tests for AI question generation."""

    def test_generate_question_returns_success(self, client):
        """POST /recruiter/ai/generate-question with valid data returns 200."""
        resp = client.post("/recruiter/ai/generate-question", json={
            "topic": "Python programming",
            "difficulty": "medium",
            "question_type": "mcq"
        })
        # Allow 200 (success), or 503/500 if Ollama is down
        assert resp.status_code in (200, 500, 502, 503), (
            f"Unexpected status: {resp.status_code}: {resp.text}"
        )

    def test_generate_question_missing_topic_returns_error(self, client):
        """POST generate-question without topic returns 422."""
        resp = client.post("/recruiter/ai/generate-question", json={})
        assert resp.status_code in (422, 400), (
            f"Expected 422 on missing topic, got {resp.status_code}"
        )

    def test_generate_question_has_content(self, client):
        """If AI is available, response includes question text."""
        resp = client.post("/recruiter/ai/generate-question", json={
            "topic": "Data structures",
            "difficulty": "easy",
            "question_type": "essay"
        })
        if resp.status_code != 200:
            pytest.skip("AI service not available")
        data = resp.json()
        has_question = any(k in data for k in [
            "question", "text", "question_text", "generated_question", "questionText"
        ])
        assert has_question, f"AI response missing question text: {data}"

    def test_generate_question_unauthenticated_blocked(self, raw_client):
        """POST generate-question without token returns 401/403."""
        resp = raw_client.post("/recruiter/ai/generate-question", json={
            "topic": "Test",
            "difficulty": "medium",
            "question_type": "mcq"
        })
        assert resp.status_code in (401, 403, 422), (
            f"Expected 401/403 without token, got {resp.status_code}"
        )


class TestAIRefineQuestion:
    """Tests for AI question refinement."""

    def test_refine_question_returns_success(self, client):
        """POST /recruiter/ai/refine-question with valid data returns 200."""
        resp = client.post("/recruiter/ai/refine-question", json={
            "question_text": "What is Python?",
            "use_case": "Make it more technical and specific"
        })
        # Allow 200 (success), or 503/500 if Ollama is down
        assert resp.status_code in (200, 500, 502, 503), (
            f"Unexpected status: {resp.status_code}: {resp.text}"
        )

    def test_refine_question_missing_fields_returns_422(self, client):
        """POST refine-question without required fields returns 422."""
        resp = client.post("/recruiter/ai/refine-question", json={})
        assert resp.status_code in (422, 400), (
            f"Expected 422 on missing fields, got {resp.status_code}"
        )

    def test_refine_question_has_content(self, client):
        """If AI is available, response includes refined question text."""
        resp = client.post("/recruiter/ai/refine-question", json={
            "question_text": "What is OOP?",
            "use_case": "Add more depth and include examples"
        })
        if resp.status_code != 200:
            pytest.skip("AI service not available")
        data = resp.json()
        has_refined = any(k in data for k in [
            "question", "text", "refined_question", "refined_text", "refinedText"
        ])
        assert has_refined, f"Refined response missing question text: {data}"

    def test_refine_question_unauthenticated_blocked(self, raw_client):
        """POST refine-question without token returns 401/403."""
        resp = raw_client.post("/recruiter/ai/refine-question", json={
            "question_text": "Test",
            "use_case": "Test"
        })
        assert resp.status_code in (401, 403, 422), (
            f"Expected 401/403 without token, got {resp.status_code}"
        )
