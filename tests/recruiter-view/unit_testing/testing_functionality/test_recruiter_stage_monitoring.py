"""
Tests for stage monitoring integrity verdict contract.

Backend endpoint:
  GET /recruiter/groups/{group_id}/stages/{stage_type}/monitoring
  GET /recruiter/groups/{group_id}/assessments/monitoring (legacy)

Phase 1 adds:
  - per-candidate `integrity_verdict` in {clean, monitoring, suspicious_review, confirmed_cheating}
  - response-level `integrity_summary` with counts per bucket that sum to total_candidates
"""
import pytest


VALID_VERDICTS = {"clean", "monitoring", "suspicious_review", "confirmed_cheating"}


def _first_group_id(client):
    """Return the ID of the first group from the first position, or None."""
    resp = client.get("/recruiter/positions")
    if resp.status_code != 200 or not resp.json():
        return None
    pos = resp.json()[0]
    position_id = str(pos.get("id") or pos.get("position_id"))
    g = client.get(f"/recruiter/positions/{position_id}/groups")
    if g.status_code != 200 or not g.json():
        return None
    grp = g.json()[0]
    return str(grp.get("id") or grp.get("group_id"))


class TestStageMonitoringIntegrityContract:
    def test_monitoring_returns_200(self, client):
        gid = _first_group_id(client)
        if not gid:
            pytest.skip("No groups available")
        resp = client.get(f"/recruiter/groups/{gid}/stages/assessment/monitoring")
        assert resp.status_code in (200, 404), f"got {resp.status_code}: {resp.text}"

    def test_response_has_integrity_summary(self, client):
        gid = _first_group_id(client)
        if not gid:
            pytest.skip("No groups available")
        resp = client.get(f"/recruiter/groups/{gid}/stages/assessment/monitoring")
        if resp.status_code == 404:
            pytest.skip("Assessment stage not configured for this group")
        body = resp.json()
        assert "integrity_summary" in body, f"missing integrity_summary: {body.keys()}"
        s = body["integrity_summary"]
        for k in ("clean", "monitoring", "suspicious_review", "confirmed_cheating"):
            assert k in s, f"integrity_summary missing {k}"

    def test_each_candidate_has_valid_verdict(self, client):
        gid = _first_group_id(client)
        if not gid:
            pytest.skip("No groups available")
        resp = client.get(f"/recruiter/groups/{gid}/stages/assessment/monitoring")
        if resp.status_code == 404:
            pytest.skip("Assessment stage not configured for this group")
        body = resp.json()
        for c in body.get("candidates", []):
            assert c.get("integrity_verdict") in VALID_VERDICTS, c

    def test_summary_sums_to_total(self, client):
        gid = _first_group_id(client)
        if not gid:
            pytest.skip("No groups available")
        resp = client.get(f"/recruiter/groups/{gid}/stages/assessment/monitoring")
        if resp.status_code == 404:
            pytest.skip("Assessment stage not configured for this group")
        body = resp.json()
        s = body["integrity_summary"]
        bucket_total = s["clean"] + s["monitoring"] + s["suspicious_review"] + s["confirmed_cheating"]
        assert bucket_total == body["total_candidates"], f"{bucket_total} != {body['total_candidates']}"


class TestAIInterviewMonitoringSignals:
    def test_ai_interview_monitoring_has_ai_recommendation_field(self, client):
        """ai_recommendation field must be present on candidates (may be None)."""
        gid = _first_group_id(client)
        if not gid:
            pytest.skip("No groups available")
        resp = client.get(f"/recruiter/groups/{gid}/stages/ai-interview/monitoring")
        if resp.status_code == 404:
            pytest.skip("AI interview stage not configured for this group")
        body = resp.json()
        for c in body.get("candidates", []):
            assert "ai_recommendation" in c, f"missing ai_recommendation key: {c.keys()}"

    def test_ai_interview_monitoring_has_retakes_used_field(self, client):
        gid = _first_group_id(client)
        if not gid:
            pytest.skip("No groups available")
        resp = client.get(f"/recruiter/groups/{gid}/stages/ai-interview/monitoring")
        if resp.status_code == 404:
            pytest.skip("AI interview stage not configured for this group")
        for c in resp.json().get("candidates", []):
            assert "retakes_used" in c, f"missing retakes_used: {c.keys()}"


class TestLiveInterviewMonitoringSignals:
    def test_live_interview_monitoring_has_auto_verdict_field(self, client):
        gid = _first_group_id(client)
        if not gid:
            pytest.skip("No groups available")
        resp = client.get(f"/recruiter/groups/{gid}/stages/live-interview/monitoring")
        if resp.status_code == 404:
            pytest.skip("Live interview stage not configured for this group")
        for c in resp.json().get("candidates", []):
            assert "auto_verdict" in c, f"missing auto_verdict: {c.keys()}"

    def test_live_interview_monitoring_has_overall_score_pct_field(self, client):
        gid = _first_group_id(client)
        if not gid:
            pytest.skip("No groups available")
        resp = client.get(f"/recruiter/groups/{gid}/stages/live-interview/monitoring")
        if resp.status_code == 404:
            pytest.skip("Live interview stage not configured for this group")
        for c in resp.json().get("candidates", []):
            assert "overall_score_pct" in c, f"missing overall_score_pct: {c.keys()}"
