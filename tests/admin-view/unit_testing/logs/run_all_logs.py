"""
Master runner for ALL EraMatch admin view assurance log scripts.
Executes every log module, collects results, and generates a single
consolidated HTML report.

Run: python tests/logs/run_all_logs.py
"""
import sys
import os
import json
import importlib.util

# Add tests/ to path so log_utils is importable from every log script
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from datetime import datetime, timezone
from log_utils import REPORTS_DIR

LOGS_DIR = os.path.dirname(__file__)

LOG_MODULES = [
    ("log_admin_login",                   "Admin Login"),
    ("log_admin_dashboard",               "Admin Dashboard"),
    ("log_admin_requests",                "Admin Requests"),
    ("log_admin_organization_members",    "Admin Organization Members"),
    ("log_admin_recruiter_delegation",    "Admin Recruiter Delegation"),
    ("log_admin_settings",               "Admin Settings"),
    ("log_admin_closed_positions",        "Admin Closed Positions Archive"),
    ("log_admin_group_insights",          "Admin Group Insights"),
]


def load_and_run(module_filename: str):
    """Dynamically import and run a log script's run() function."""
    path = os.path.join(LOGS_DIR, f"{module_filename}.py")
    spec = importlib.util.spec_from_file_location(module_filename, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.run()


def generate_combined_html(all_summaries: list, html_path: str, total_ms: int):
    """Generate a single combined HTML report covering all modules."""
    grand_passed = sum(s["passed"] for s in all_summaries)
    grand_failed = sum(s["failed"] for s in all_summaries)
    grand_total = grand_passed + grand_failed
    grand_rate = f"{int(grand_passed/grand_total*100)}%" if grand_total else "N/A"
    overall_color = "#22c55e" if grand_failed == 0 else "#ef4444"

    # Build module-level rows
    module_rows = ""
    for s in all_summaries:
        total = s["passed"] + s["failed"]
        rate = f"{int(s['passed']/total*100)}%" if total else "N/A"
        status_icon = "✅" if s["failed"] == 0 else "❌"
        bg = "#f0fdf4" if s["failed"] == 0 else "#fef2f2"
        module_rows += f"""
        <tr style="background:{bg};border-bottom:1px solid #e5e7eb">
            <td style="padding:10px 16px;font-weight:600">{status_icon} {s['module']}</td>
            <td style="padding:10px 16px;text-align:center">{total}</td>
            <td style="padding:10px 16px;text-align:center;color:#16a34a;font-weight:600">{s['passed']}</td>
            <td style="padding:10px 16px;text-align:center;color:#dc2626;font-weight:600">{s['failed']}</td>
            <td style="padding:10px 16px;text-align:center">{rate}</td>
            <td style="padding:10px 16px;text-align:right;color:#6b7280">{s['total_ms']}ms</td>
        </tr>"""

    # Build detailed test rows per module
    detail_sections = ""
    for s in all_summaries:
        rows = ""
        for r in s["tests"]:
            icon = "✅" if r["status"] == "PASS" else "❌"
            bg = "#f0fdf4" if r["status"] == "PASS" else "#fef2f2"
            detail_html = (
                f'<div style="font-size:11px;color:#6b7280;margin-top:2px">{r.get("detail","")}</div>'
                if r["status"] == "FAIL" and r.get("detail")
                else ""
            )
            rows += f"""
            <tr style="background:{bg};border-bottom:1px solid #e5e7eb;font-size:13px">
                <td style="padding:6px 12px">{icon} {r['label']}</td>
                <td style="padding:6px 12px;text-align:center;font-weight:600;color:{'#16a34a' if r['status']=='PASS' else '#dc2626'}">{r['status']}</td>
                <td style="padding:6px 12px;text-align:right;color:#6b7280">{r['elapsed_ms']}ms</td>
                <td style="padding:6px 12px">{detail_html}</td>
            </tr>"""

        section_pass = s["passed"]
        section_fail = s["failed"]
        section_color = "#22c55e" if section_fail == 0 else "#ef4444"
        detail_sections += f"""
        <div style="margin-bottom:32px">
            <h3 style="font-size:16px;margin:0 0 8px;color:#0f172a">
                {"✅" if section_fail==0 else "❌"} {s['module']}
                <span style="font-size:12px;color:{section_color};font-weight:400;margin-left:8px">
                    {section_pass} passed / {section_fail} failed
                </span>
            </h3>
            <table style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb">
                <thead><tr style="background:#f1f5f9">
                    <th style="padding:8px 12px;text-align:left;font-size:12px;color:#475569">Test</th>
                    <th style="padding:8px 12px;text-align:center;font-size:12px;color:#475569">Status</th>
                    <th style="padding:8px 12px;text-align:right;font-size:12px;color:#475569">Time</th>
                    <th style="padding:8px 12px;font-size:12px;color:#475569">Detail</th>
                </tr></thead>
                <tbody>{rows}</tbody>
            </table>
        </div>"""

    now = datetime.now(timezone.utc)
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>EraMatch Admin — Combined Assurance Report</title>
    <style>
        * {{ box-sizing: border-box; }}
        body {{ font-family: system-ui, -apple-system, sans-serif; background: #f1f5f9; color: #1e293b; margin: 0; padding: 24px; }}
        .card {{ background: white; border-radius: 16px; box-shadow: 0 2px 8px rgba(0,0,0,.08); padding: 32px; max-width: 1100px; margin: 0 auto 24px; }}
        h1 {{ font-size: 28px; margin: 0 0 4px; }}
        h2 {{ font-size: 20px; margin: 0 0 16px; color: #334155; }}
        .meta {{ color: #64748b; font-size: 13px; margin-bottom: 24px; }}
        .hero-stats {{ display: flex; gap: 16px; margin-bottom: 28px; flex-wrap: wrap; }}
        .stat {{ background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px 24px; text-align: center; flex: 1; min-width: 100px; }}
        .stat-value {{ font-size: 32px; font-weight: 800; }}
        .stat-label {{ font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: .06em; margin-top: 2px; }}
        table {{ width: 100%; border-collapse: collapse; }}
        th {{ background: #f1f5f9; padding: 10px 16px; text-align: left; font-weight: 600; color: #475569; font-size: 13px; }}
    </style>
</head>
<body>
<div class="card">
    <h1>🛡️ EraMatch Admin — Combined Assurance Report</h1>
    <div class="meta">
        Generated: {now.strftime('%Y-%m-%d %H:%M:%S')} UTC &nbsp;|&nbsp;
        Total Duration: {total_ms:,}ms &nbsp;|&nbsp;
        Modules: {len(all_summaries)}
    </div>
    <div class="hero-stats">
        <div class="stat"><div class="stat-value">{grand_total}</div><div class="stat-label">Total Tests</div></div>
        <div class="stat"><div class="stat-value" style="color:#22c55e">{grand_passed}</div><div class="stat-label">Passed</div></div>
        <div class="stat"><div class="stat-value" style="color:#ef4444">{grand_failed}</div><div class="stat-label">Failed</div></div>
        <div class="stat"><div class="stat-value" style="color:{overall_color}">{grand_rate}</div><div class="stat-label">Pass Rate</div></div>
        <div class="stat"><div class="stat-value">{len(all_summaries)}</div><div class="stat-label">Modules</div></div>
    </div>

    <h2>Module Summary</h2>
    <table style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
        <thead><tr>
            <th>Module</th><th style="text-align:center">Tests</th>
            <th style="text-align:center">Passed</th><th style="text-align:center">Failed</th>
            <th style="text-align:center">Pass Rate</th><th style="text-align:right">Duration</th>
        </tr></thead>
        <tbody>{module_rows}</tbody>
    </table>
</div>

<div class="card">
    <h2>Detailed Results by Module</h2>
    {detail_sections}
</div>
</body>
</html>"""

    with open(html_path, "w", encoding="utf-8") as f:
        f.write(html)


def main():
    print("\n" + "=" * 70)
    print("  🛡️  EraMatch Admin View — Full Assurance Suite")
    print(f"  Running {len(LOG_MODULES)} module(s)...")
    print("=" * 70)

    all_summaries = []
    grand_start = datetime.now(timezone.utc)

    for module_filename, display_name in LOG_MODULES:
        print(f"\n▶  Running: {display_name}")
        try:
            summary = load_and_run(module_filename)
            all_summaries.append(summary)
        except SystemExit as e:
            print(f"  ❌  Module {display_name} exited early (code {e.code})")
            all_summaries.append({
                "module": display_name,
                "started_at": datetime.now(timezone.utc).isoformat(),
                "ended_at": datetime.now(timezone.utc).isoformat(),
                "total_ms": 0,
                "passed": 0,
                "failed": 1,
                "tests": [{"label": "Module startup", "status": "FAIL",
                            "elapsed_ms": 0, "detail": f"Exited with code {e.code}",
                            "timestamp": datetime.now(timezone.utc).isoformat()}]
            })
        except Exception as exc:
            import traceback
            print(f"  ❌  Unexpected error in {display_name}: {exc}")
            traceback.print_exc()

    grand_end = datetime.now(timezone.utc)
    total_ms = int((grand_end - grand_start).total_seconds() * 1000)

    # Print final summary
    grand_passed = sum(s["passed"] for s in all_summaries)
    grand_failed = sum(s["failed"] for s in all_summaries)
    grand_total = grand_passed + grand_failed
    rate = f"{int(grand_passed/grand_total*100)}%" if grand_total else "N/A"

    print("\n" + "=" * 70)
    print(f"  FINAL RESULTS: {grand_passed}/{grand_total} tests passed ({rate})")
    print(f"  Failed : {grand_failed}")
    print(f"  Total  : {total_ms:,}ms")
    print("=" * 70)

    # Write combined JSON report
    ts = grand_start.strftime("%Y%m%d_%H%M%S")
    json_path = os.path.join(REPORTS_DIR, f"combined_report_{ts}.json")
    html_path = os.path.join(REPORTS_DIR, f"combined_report_{ts}.html")

    combined_data = {
        "generated_at": grand_start.isoformat(),
        "total_ms": total_ms,
        "grand_passed": grand_passed,
        "grand_failed": grand_failed,
        "modules": all_summaries
    }
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(combined_data, f, indent=2)

    generate_combined_html(all_summaries, html_path, total_ms)

    print(f"\n  📄 JSON : {json_path}")
    print(f"  🌐 HTML : {html_path}\n")

    return grand_failed == 0


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
