"""
Run ALL candidate assurance log scripts and produce a combined summary.
Generates individual HTML+JSON reports per module, plus a combined HTML summary.

Run: python tests/candidate-view/unit_testing/logs/run_all_logs.py
"""
import os
import sys
import json
from datetime import datetime, timezone

# Ensure imports work
sys.path.insert(0, os.path.dirname(__file__))

REPORTS_DIR = os.path.join(os.path.dirname(__file__), "reports")
os.makedirs(REPORTS_DIR, exist_ok=True)

# Import all log modules
import log_candidate_login
import log_candidate_dashboard
import log_candidate_assessment
import log_candidate_interview


MODULES = [
    ("Candidate Login", log_candidate_login),
    ("Candidate Dashboard", log_candidate_dashboard),
    ("Candidate Assessment", log_candidate_assessment),
    ("Candidate Interview", log_candidate_interview),
]


def run_all():
    overall_start = datetime.now(timezone.utc)
    summaries = []

    print("\n" + "█" * 60)
    print("  EraMatch — Candidate View Full Assurance Run")
    print(f"  Started: {overall_start.strftime('%Y-%m-%d %H:%M:%S UTC')}")
    print("█" * 60)

    for name, module in MODULES:
        try:
            summary = module.run()
            summaries.append(summary)
        except Exception as exc:
            print(f"\n  ❌  MODULE FAILED: {name} — {exc}")
            summaries.append({
                "module": name,
                "passed": 0,
                "failed": 1,
                "total_ms": 0,
                "tests": [{"label": "Module execution", "status": "FAIL", "detail": str(exc)}]
            })

    overall_end = datetime.now(timezone.utc)
    total_ms = int((overall_end - overall_start).total_seconds() * 1000)
    total_passed = sum(s["passed"] for s in summaries)
    total_failed = sum(s["failed"] for s in summaries)
    total_tests = total_passed + total_failed

    print("\n" + "█" * 60)
    print(f"  COMBINED RESULTS")
    print(f"  Modules: {len(summaries)}")
    print(f"  Tests  : {total_passed} passed / {total_failed} failed / {total_tests} total")
    print(f"  Time   : {total_ms}ms")
    print("█" * 60 + "\n")

    # Write combined JSON
    ts = overall_start.strftime("%Y%m%d_%H%M%S")
    combined = {
        "title": "Candidate View Full Assurance",
        "started_at": overall_start.isoformat(),
        "ended_at": overall_end.isoformat(),
        "total_ms": total_ms,
        "total_passed": total_passed,
        "total_failed": total_failed,
        "modules": summaries
    }
    json_path = os.path.join(REPORTS_DIR, f"combined_candidate_{ts}.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(combined, f, indent=2)
    print(f"  📄 Combined JSON: {json_path}")

    # Write combined HTML
    html_path = os.path.join(REPORTS_DIR, f"combined_candidate_{ts}.html")
    _write_combined_html(combined, html_path)
    print(f"  🌐 Combined HTML: {html_path}\n")

    return combined


def _write_combined_html(combined: dict, html_path: str):
    """Write a combined HTML report across all modules."""
    total_passed = combined["total_passed"]
    total_failed = combined["total_failed"]
    total_tests = total_passed + total_failed
    rate = f"{int(total_passed/total_tests*100)}%" if total_tests > 0 else "N/A"
    status_color = "#22c55e" if total_failed == 0 else "#ef4444"

    module_cards = ""
    for mod in combined["modules"]:
        mod_passed = mod["passed"]
        mod_failed = mod["failed"]
        mod_total = mod_passed + mod_failed
        mod_rate = f"{int(mod_passed/mod_total*100)}%" if mod_total > 0 else "N/A"
        mod_color = "#22c55e" if mod_failed == 0 else "#ef4444"

        rows = ""
        for t in mod.get("tests", []):
            icon = "✅" if t["status"] == "PASS" else "❌"
            bg = "#f0fdf4" if t["status"] == "PASS" else "#fef2f2"
            detail = t.get("detail", "")
            detail_html = (
                f'<div style="font-size:11px;color:#6b7280;margin-top:2px">{detail}</div>'
                if t["status"] == "FAIL" and detail else ""
            )
            ms = t.get("elapsed_ms", "—")
            rows += f"""
            <tr style="background:{bg};border-bottom:1px solid #e5e7eb">
                <td style="padding:6px 10px">{icon} {t['label']}</td>
                <td style="padding:6px 10px;text-align:center;font-weight:600;color:{'#16a34a' if t['status']=='PASS' else '#dc2626'}">{t['status']}</td>
                <td style="padding:6px 10px;text-align:right;color:#6b7280">{ms}ms</td>
                <td style="padding:6px 10px">{detail_html}</td>
            </tr>"""

        module_cards += f"""
        <div style="border:1px solid #e5e7eb;border-radius:8px;margin-bottom:20px;overflow:hidden">
            <div style="background:#f1f5f9;padding:12px 16px;display:flex;justify-content:space-between;align-items:center">
                <strong>{mod['module']}</strong>
                <span style="color:{mod_color};font-weight:700">{mod_passed}/{mod_total} ({mod_rate})</span>
            </div>
            <table style="width:100%;border-collapse:collapse;font-size:12px">
                <thead><tr style="background:#f8fafc">
                    <th style="padding:6px 10px;text-align:left">Test</th>
                    <th style="padding:6px 10px;text-align:center">Status</th>
                    <th style="padding:6px 10px;text-align:right">Time</th>
                    <th style="padding:6px 10px">Detail</th>
                </tr></thead>
                <tbody>{rows}</tbody>
            </table>
        </div>"""

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>EraMatch Candidate — Combined Assurance Report</title>
    <style>
        body {{ font-family: system-ui, -apple-system, sans-serif; background: #f8fafc; color: #1e293b; margin: 0; padding: 24px; }}
        .card {{ background: white; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,.1); padding: 24px; max-width: 1024px; margin: 0 auto; }}
        h1 {{ font-size: 24px; margin: 0 0 4px; color: #0f172a; }}
        .meta {{ color: #64748b; font-size: 13px; margin-bottom: 20px; }}
        .stats {{ display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }}
        .stat {{ background: #f1f5f9; border-radius: 8px; padding: 12px 20px; text-align: center; min-width: 80px; }}
        .stat-value {{ font-size: 28px; font-weight: 700; }}
        .stat-label {{ font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: .05em; }}
    </style>
</head>
<body>
<div class="card">
    <h1>🎯 EraMatch Candidate — Combined Assurance Report</h1>
    <div class="meta">
        Started: {combined['started_at'][:19].replace('T', ' ')} UTC &nbsp;|&nbsp;
        Duration: {combined['total_ms']}ms &nbsp;|&nbsp;
        Modules: {len(combined['modules'])}
    </div>
    <div class="stats">
        <div class="stat"><div class="stat-value" style="color:{status_color}">{total_tests}</div><div class="stat-label">Total Tests</div></div>
        <div class="stat"><div class="stat-value" style="color:#22c55e">{total_passed}</div><div class="stat-label">Passed</div></div>
        <div class="stat"><div class="stat-value" style="color:#ef4444">{total_failed}</div><div class="stat-label">Failed</div></div>
        <div class="stat"><div class="stat-value">{rate}</div><div class="stat-label">Pass Rate</div></div>
        <div class="stat"><div class="stat-value">{combined['total_ms']}</div><div class="stat-label">Total ms</div></div>
    </div>
    {module_cards}
</div>
</body>
</html>"""
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(html)


if __name__ == "__main__":
    run_all()
