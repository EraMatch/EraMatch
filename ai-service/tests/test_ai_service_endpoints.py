"""
Coverage tests for AI service endpoints.
Uses minimal payloads to validate routing and request validation.
"""
import pytest


def test_health_check(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("status") == "healthy"


def test_custom_models_returns_list(client):
    resp = client.get("/custom/models")
    assert resp.status_code == 200
    data = resp.json()
    assert "models" in data


@pytest.mark.parametrize("path", [
    "/llm/chat",
    "/llm/evaluate",
    "/llm/smart-rank",
    "/llm/extract-keywords",
    "/llm/jd-rank",
    "/transcribe/",
    "/custom/inference",
    "/evaluate/",
    "/evaluate/grade-essay",
    "/evaluate/grade-essay-v2",
    "/evaluate/extract-evidence",
    "/evaluate/verify-evidence",
    "/evaluate/score-hierarchical",
    "/evaluate/grade-code",
    "/anomaly/analyze-rubric",
    "/anomaly/detect-outlier",
    "/anomaly/route-answer",
    "/anomaly/batch-route",
    "/github-analysis/analyze",
    "/question-import/generate",
    "/question-import/extract",
    "/question-import/refine-question",
    "/cv-parsing/parse",
    "/cv-parsing/parse-async",
])
def test_post_endpoints_require_payload(client, path):
    resp = client.post(path, json={})
    assert resp.status_code in (400, 422, 500), (
        f"Expected validation error, got {resp.status_code}: {resp.text}"
    )


def test_anomaly_routing_patterns_returns_200(client):
    resp = client.get("/anomaly/routing-patterns")
    assert resp.status_code == 200


def test_proctoring_status_endpoints_return_200(client):
    wiring = client.get("/proctoring/wiring-status")
    readiness = client.get("/proctoring/inference-readiness")
    assert wiring.status_code == 200
    assert readiness.status_code == 200
