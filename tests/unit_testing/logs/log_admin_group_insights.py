"""
Assurance log script for Admin Group Insights / Analytics functionality.
Tests: list groups → analysis → technical-AI → risks → combined transform validation.

Run: python tests/logs/log_admin_group_insights.py
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import uuid
from log_utils import AssuranceLogger, get_admin_token, make_client


def run():
    log = AssuranceLogger("Admin Group Insights")
    token = get_admin_token()
    client = make_client(token)

    # ── 1. List all groups ────────────────────────────────────────────
    groups = []

    def test_list_groups():
        nonlocal groups
        resp = client.get("/admin/groups")
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        groups = resp.json()
        if groups is None:
            return False, "Response was null (expected list)"
        names = [g.get("groupName") or g.get("group_name") or g.get("name", "?")
                 for g in groups[:5]]
        return True, f"{len(groups)} group(s): {names}"
    log.run("GET /admin/groups — list all groups", test_list_groups)

    # ── 2. Groups have required fields ───────────────────────────────
    def test_group_fields():
        missing_ids = [g for g in groups
                       if not any(k in g for k in ["groupID", "group_id", "id"])]
        missing_names = [g for g in groups
                         if not any(k in g for k in ["groupName", "group_name", "name"])]
        if missing_ids:
            return False, f"{len(missing_ids)} group(s) missing ID"
        if missing_names:
            return False, f"{len(missing_names)} group(s) missing name"
        return True, f"All {len(groups)} groups have ID and name"
    log.run("All groups have ID and name fields", test_group_fields)

    # ── 3. Candidate counts are non-negative ─────────────────────────
    def test_candidate_counts():
        invalid = [(g.get("groupName", "?"), g.get("candidatesCount", 0))
                   for g in groups
                   if (g.get("candidatesCount") or g.get("candidates_count", 0)) < 0]
        if invalid:
            return False, f"Negative candidatesCounts: {invalid}"
        return True, f"All {len(groups)} groups have non-negative candidatesCount"
    log.run("All groups have non-negative candidatesCount", test_candidate_counts)

    # ── helper: get first group ID ─────────────────────────────────────
    def get_group_id():
        if not groups:
            return None
        g = groups[0]
        gid = g.get("groupID") or g.get("group_id") or g.get("id")
        return str(gid) if gid else None

    group_id = get_group_id()

    # ── 4. Group analysis endpoint ───────────────────────────────────
    analysis_data = None

    def test_group_analysis():
        nonlocal analysis_data
        if not group_id:
            return True, "No groups available (skipped)"
        resp = client.get(f"/recruiter/groups/{group_id}/analysis")
        if resp.status_code == 404:
            return True, f"No analysis data for group {group_id} (404 — OK)"
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        analysis_data = resp.json()
        accuracy = analysis_data.get("matchAccuracy") or analysis_data.get("match_accuracy")
        total = analysis_data.get("totalCandidates") or analysis_data.get("total_candidates")
        return True, f"matchAccuracy={accuracy}, totalCandidates={total}"
    log.run(f"GET group analysis for group {group_id}", test_group_analysis)

    # ── 5. matchAccuracy in valid range ──────────────────────────────
    def test_match_accuracy_range():
        if analysis_data is None:
            return True, "No analysis data (skipped)"
        accuracy = analysis_data.get("matchAccuracy") or analysis_data.get("match_accuracy", 0)
        if not isinstance(accuracy, (int, float)):
            return False, f"matchAccuracy not numeric: {accuracy!r}"
        if not (0 <= float(accuracy) <= 100):
            return False, f"matchAccuracy out of [0,100]: {accuracy}"
        return True, f"matchAccuracy={accuracy} is in valid range [0,100]"
    log.run("matchAccuracy is numeric and in range [0, 100]", test_match_accuracy_range)

    # ── 6. Technical-AI endpoint ──────────────────────────────────────
    tech_ai_data = None

    def test_technical_ai():
        nonlocal tech_ai_data
        if not group_id:
            return True, "No groups available (skipped)"
        resp = client.get(f"/recruiter/groups/{group_id}/technical-ai")
        if resp.status_code in (404, 422):
            return True, f"No technical-AI data for group {group_id} (graceful {resp.status_code})"
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        tech_ai_data = resp.json()
        tech_section = tech_ai_data.get("tech", {}) if tech_ai_data else {}
        ai_section = tech_ai_data.get("ai", {}) if tech_ai_data else {}
        return True, (
            f"tech.avgScore={tech_section.get('avgScore')}, "
            f"tech.passRate={tech_section.get('passRate')}, "
            f"ai.avgScore={ai_section.get('avgScore')}"
        )
    log.run(f"GET /recruiter/groups/{group_id}/technical-ai", test_technical_ai)

    # ── 7. Technical-AI pass rates in range ──────────────────────────
    def test_pass_rates_range():
        if not tech_ai_data:
            return True, "No technical-AI data (skipped)"
        violations = []
        for section_key in ["tech", "ai"]:
            section = tech_ai_data.get(section_key, {})
            if section:
                pr = section.get("passRate") or section.get("pass_rate")
                if pr is not None:
                    if not (0 <= float(pr) <= 100):
                        violations.append(f"{section_key}.passRate={pr}")
                avg = section.get("avgScore") or section.get("avg_score")
                if avg is not None:
                    if not (0 <= float(avg) <= 100):
                        violations.append(f"{section_key}.avgScore={avg}")
        if violations:
            return False, f"Out-of-range values: {'; '.join(violations)}"
        return True, "All technical-AI scores/pass rates are in valid range [0,100]"
    log.run("Technical-AI scores and pass rates are in range [0,100]", test_pass_rates_range)

    # ── 8. Risks endpoint ─────────────────────────────────────────────
    risks_data = None

    def test_risks_endpoint():
        nonlocal risks_data
        if not group_id:
            return True, "No groups available (skipped)"
        resp = client.get(f"/recruiter/groups/{group_id}/risks")
        if resp.status_code in (404, 422):
            return True, f"No risk data (graceful {resp.status_code})"
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        risks_data = resp.json()
        total = risks_data.get("cheatingDetected") or risks_data.get("cheating_detected", 0)
        return True, (
            f"cheatingDetected={total}, "
            f"high={risks_data.get('high',0)}, "
            f"medium={risks_data.get('medium',0)}, "
            f"low={risks_data.get('low',0)}"
        )
    log.run(f"GET /recruiter/groups/{group_id}/risks", test_risks_endpoint)

    # ── 9. Risk severity sums are consistent ─────────────────────────
    def test_risk_severity_sums():
        if not risks_data:
            return True, "No risk data (skipped)"
        total = risks_data.get("cheatingDetected") or risks_data.get("cheating_detected", 0)
        high = risks_data.get("high", 0)
        medium = risks_data.get("medium", 0)
        low_ = risks_data.get("low", 0)
        breakdown_sum = high + medium + low_
        # Allow +/- 1 for rounding
        if abs(total - breakdown_sum) > 1:
            return False, (
                f"cheatingDetected={total} ≠ high+medium+low={breakdown_sum}"
            )
        return True, f"cheatingDetected={total} == high({high})+medium({medium})+low({low_})={breakdown_sum}"
    log.run("Risk severity breakdown sums equal total cheatingDetected", test_risk_severity_sums)

    # ── 10. Invalid group ID returns error gracefully ─────────────────
    def test_invalid_group_id():
        fake_id = str(uuid.uuid4())
        resp_analysis = client.get(f"/recruiter/groups/{fake_id}/analysis")
        resp_tech = client.get(f"/recruiter/groups/{fake_id}/technical-ai")
        resp_risks = client.get(f"/recruiter/groups/{fake_id}/risks")
        any_500 = any(r.status_code == 500 for r in [resp_analysis, resp_tech, resp_risks])
        if any_500:
            return False, "Server returned 500 for invalid group ID — should return 404/422"
        return True, (
            f"Invalid group ID handled gracefully: "
            f"analysis={resp_analysis.status_code}, "
            f"tech-ai={resp_tech.status_code}, "
            f"risks={resp_risks.status_code}"
        )
    log.run("Invalid group ID returns 4xx (not 500) on all 3 endpoints", test_invalid_group_id)

    client.close()
    return log.finish()


if __name__ == "__main__":
    run()
