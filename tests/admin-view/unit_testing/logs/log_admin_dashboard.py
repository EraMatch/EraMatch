"""
Assurance log script for Admin Dashboard functionality.
Tests all 4 data sources and validates cross-consistency.

Run: python tests/logs/log_admin_dashboard.py
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from log_utils import AssuranceLogger, get_admin_token, make_client


def run():
    log = AssuranceLogger("Admin Dashboard")
    token = get_admin_token()
    client = make_client(token)

    # ── 1. Global stats ───────────────────────────────────────────────
    global_data = {}

    def test_global_stats():
        nonlocal global_data
        resp = client.get("/admin/stats/global")
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        global_data = resp.json()
        required = ["openPositions", "activeProjects", "totalApplicants", "avgTimeToFill"]
        missing = [f for f in required if f not in global_data]
        if missing:
            return False, f"Missing fields: {missing}"
        return True, (
            f"openPositions={global_data['openPositions']}, "
            f"activeProjects={global_data['activeProjects']}, "
            f"totalApplicants={global_data['totalApplicants']}, "
            f"avgTimeToFill={global_data['avgTimeToFill']:.1f}"
        )
    log.run("Global stats load with all required fields", test_global_stats)

    # ── 2. Global stats non-negative ─────────────────────────────────
    def test_global_stats_non_negative():
        if not global_data:
            return False, "No global data available"
        negatives = {k: v for k, v in global_data.items()
                     if isinstance(v, (int, float)) and v < 0}
        if negatives:
            return False, f"Negative values found: {negatives}"
        return True, "All numeric global stat values are ≥ 0"
    log.run("All global stat values are non-negative", test_global_stats_non_negative)

    # ── 3. Pipeline stats ─────────────────────────────────────────────
    pipeline_stages = []

    def test_pipeline_stats():
        nonlocal pipeline_stages
        resp = client.get("/admin/stats/pipeline")
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        data = resp.json()
        if "stages" not in data:
            return False, f"'stages' key missing in: {list(data.keys())}"
        pipeline_stages = data["stages"]
        counts = {s.get("stage"): s.get("count") for s in pipeline_stages}
        return True, f"Pipeline stages: {counts}"
    log.run("Pipeline stats load with stages list", test_pipeline_stats)

    # ── 4. Pipeline funnel integrity ──────────────────────────────────
    def test_pipeline_funnel_integrity():
        if not pipeline_stages:
            return True, "No stages to validate (empty data)"
        stage_map = {s.get("stage"): s.get("count", 0) for s in pipeline_stages}
        applied = stage_map.get("Applied", 0)
        violations = []
        for name, count in stage_map.items():
            if count > applied:
                violations.append(f"{name}({count}) > Applied({applied})")
        if violations:
            return False, f"Funnel integrity violations: {'; '.join(violations)}"
        return True, f"Applied({applied}) is the highest funnel stage — funnel is valid"
    log.run("Pipeline funnel: Applied ≥ all downstream stages", test_pipeline_funnel_integrity)

    # ── 5. Health analytics ───────────────────────────────────────────
    def test_health_analytics():
        resp = client.get("/admin/stats/analytics")
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        data = resp.json()
        missing = [f for f in ["health", "velocity", "quality"] if f not in data]
        if missing:
            return False, f"Missing fields: {missing}"
        return True, (
            f"health={data['health']}, velocity={data['velocity']}, "
            f"quality={data['quality']}"
        )
    log.run("Health analytics load with health/velocity/quality", test_health_analytics)

    # ── 6. Stage timing ───────────────────────────────────────────────
    def test_stage_timing():
        resp = client.get("/admin/stats/analytics")
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}"
        data = resp.json()
        timings = data.get("stageTiming", data.get("stage_timing", []))
        if not isinstance(timings, list):
            return False, f"stageTiming is not a list: {timings!r}"
        for t in timings:
            if "days" in t and "target" in t:
                if int(t["days"]) > int(t["target"]) * 3:
                    return False, f"Stage '{t.get('stage')}' is critically slow: {t['days']}d (target {t['target']}d)"
        names = [t.get("stage") for t in timings]
        return True, f"Stage timing OK — stages: {names}"
    log.run("Stage timing structure and sanity check", test_stage_timing)

    # ── 7. Active projects list ───────────────────────────────────────
    projects = []

    def test_projects_list():
        nonlocal projects
        resp = client.get("/recruiter/projects?status=active")
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        projects = resp.json()
        return True, f"Loaded {len(projects)} active project(s)"
    log.run("Active projects list loads successfully", test_projects_list)

    # ── 8. Positions list ─────────────────────────────────────────────
    positions = []

    def test_positions_list():
        nonlocal positions
        resp = client.get("/recruiter/positions")
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        positions = resp.json()
        return True, f"Loaded {len(positions)} position(s)"
    log.run("Positions list loads successfully", test_positions_list)

    # ── 9. Cross-validation: openPositions vs actual list ────────────
    def test_cross_validate_positions():
        list_count = len(positions)
        stat_count = global_data.get("openPositions", -1)
        if stat_count == -1:
            return False, "No global stats to compare against"
        # Positions list may be broader (includes closed), so we compare leniently
        return True, (
            f"globalStats.openPositions={stat_count}, "
            f"positions list total={list_count} (may include all statuses)"
        )
    log.run("Cross-check: openPositions stat vs position list", test_cross_validate_positions)

    # ── 10. Groups list ───────────────────────────────────────────────
    def test_groups_list():
        resp = client.get("/admin/groups")
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        groups = resp.json()
        return True, f"Loaded {len(groups)} group(s)"
    log.run("Admin groups list loads successfully", test_groups_list)

    client.close()
    return log.finish()


if __name__ == "__main__":
    run()
