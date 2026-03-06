"""
Shared utilities for EraMatch candidate view assurance log scripts.
Provides: HTTP client with candidate auth, timestamped logging, HTML/JSON report generation.
"""
import httpx
import json
import os
import sys
from datetime import datetime, timezone

BASE_URL = "http://localhost:8000/api/v1"
CANDIDATE_EMAIL = "candidate2@eramatch.com"
CANDIDATE_PASSWORD = "test123"
REPORTS_DIR = os.path.join(os.path.dirname(__file__), "reports")

# Ensure reports directory exists
os.makedirs(REPORTS_DIR, exist_ok=True)


def get_candidate_token() -> str:
    """Obtain candidate JWT token. Exits with error message if login fails."""
    with httpx.Client(base_url=BASE_URL, timeout=30.0) as client:
        resp = client.post("/candidate/login", json={
            "email": CANDIDATE_EMAIL,
            "password": CANDIDATE_PASSWORD
        })
    if resp.status_code != 200:
        print(f"  ❌  FATAL: Candidate login failed ({resp.status_code}): {resp.text[:200]}")
        sys.exit(1)
    data = resp.json()
    token = data.get("access_token") or data.get("token")
    if not token:
        print(f"  ❌  FATAL: No token in login response: {data}")
        sys.exit(1)
    return token


def make_client(token: str) -> httpx.Client:
    """Create an authenticated httpx.Client."""
    return httpx.Client(
        base_url=BASE_URL,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        },
        timeout=30.0
    )


class AssuranceLogger:
    """
    Lightweight test runner that records results and generates
    timestamped JSON + HTML reports.
    """

    def __init__(self, module_name: str):
        self.module_name = module_name
        self.results: list[dict] = []
        self.start_time = datetime.now(timezone.utc)
        print(f"\n{'='*60}")
        print(f"  EraMatch Candidate Assurance Log")
        print(f"  Module : {module_name}")
        print(f"  Started: {self.start_time.strftime('%Y-%m-%d %H:%M:%S UTC')}")
        print(f"{'='*60}")

    def run(self, label: str, fn):
        """
        Run a single test function, record timing and result.
        fn should return (bool_pass, detail_string).
        """
        t_start = datetime.now(timezone.utc)
        try:
            passed, detail = fn()
        except Exception as exc:
            passed = False
            detail = f"Exception: {exc}"
        elapsed_ms = int((datetime.now(timezone.utc) - t_start).total_seconds() * 1000)

        icon = "✅" if passed else "❌"
        status = "PASS" if passed else "FAIL"
        print(f"  {icon}  [{elapsed_ms:>5}ms]  {label}")
        if not passed:
            print(f"          └─ {detail}")

        self.results.append({
            "label": label,
            "status": status,
            "elapsed_ms": elapsed_ms,
            "detail": detail,
            "timestamp": t_start.isoformat()
        })

    def finish(self) -> dict:
        """Summarize, write reports, return summary dict."""
        end_time = datetime.now(timezone.utc)
        total_ms = int((end_time - self.start_time).total_seconds() * 1000)
        passed = sum(1 for r in self.results if r["status"] == "PASS")
        failed = len(self.results) - passed

        print(f"{'='*60}")
        print(f"  Results: {passed} passed / {failed} failed  ({total_ms}ms total)")
        print(f"{'='*60}\n")

        summary = {
            "module": self.module_name,
            "started_at": self.start_time.isoformat(),
            "ended_at": end_time.isoformat(),
            "total_ms": total_ms,
            "passed": passed,
            "failed": failed,
            "tests": self.results
        }

        # Write JSON report
        ts = self.start_time.strftime("%Y%m%d_%H%M%S")
        safe_name = self.module_name.lower().replace(" ", "_")
        json_path = os.path.join(REPORTS_DIR, f"log_{safe_name}_{ts}.json")
        html_path = os.path.join(REPORTS_DIR, f"log_{safe_name}_{ts}.html")

        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(summary, f, indent=2)
        print(f"  📄 JSON report: {json_path}")

        self._write_html(summary, html_path)
        print(f"  🌐 HTML report: {html_path}\n")

        return summary

    def _write_html(self, summary: dict, html_path: str):
        """Write a clean, styled HTML report."""
        passed = summary["passed"]
        failed = summary["failed"]
        total = passed + failed
        rate = f"{int(passed/total*100)}%" if total > 0 else "N/A"
        status_color = "#22c55e" if failed == 0 else "#ef4444"

        rows = ""
        for r in summary["tests"]:
            icon = "✅" if r["status"] == "PASS" else "❌"
            bg = "#f0fdf4" if r["status"] == "PASS" else "#fef2f2"
            detail = r.get("detail", "")
            detail_html = (
                f'<div style="font-size:11px;color:#6b7280;margin-top:2px">{detail}</div>'
                if r["status"] == "FAIL" and detail
                else ""
            )
            rows += f"""
            <tr style="background:{bg};border-bottom:1px solid #e5e7eb">
                <td style="padding:8px 12px">{icon} {r['label']}</td>
                <td style="padding:8px 12px;text-align:center;font-weight:600;color:{'#16a34a' if r['status']=='PASS' else '#dc2626'}">{r['status']}</td>
                <td style="padding:8px 12px;text-align:right;color:#6b7280">{r['elapsed_ms']}ms</td>
                <td style="padding:8px 12px">{detail_html}</td>
            </tr>"""

        html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>EraMatch Candidate Assurance — {summary['module']}</title>
    <style>
        body {{ font-family: system-ui, -apple-system, sans-serif; background: #f8fafc; color: #1e293b; margin: 0; padding: 24px; }}
        .card {{ background: white; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,.1); padding: 24px; max-width: 960px; margin: 0 auto; }}
        h1 {{ font-size: 24px; margin: 0 0 4px; color: #0f172a; }}
        .meta {{ color: #64748b; font-size: 13px; margin-bottom: 20px; }}
        .stats {{ display: flex; gap: 16px; margin-bottom: 24px; }}
        .stat {{ background: #f1f5f9; border-radius: 8px; padding: 12px 20px; text-align: center; }}
        .stat-value {{ font-size: 28px; font-weight: 700; color: {status_color}; }}
        .stat-label {{ font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: .05em; }}
        table {{ width: 100%; border-collapse: collapse; font-size: 13px; }}
        th {{ background: #f1f5f9; padding: 10px 12px; text-align: left; font-weight: 600; color: #475569; }}
    </style>
</head>
<body>
<div class="card">
    <h1>🎯 EraMatch Candidate Assurance Report</h1>
    <div class="meta">
        Module: <strong>{summary['module']}</strong> &nbsp;|&nbsp;
        Started: {summary['started_at'][:19].replace('T', ' ')} UTC &nbsp;|&nbsp;
        Duration: {summary['total_ms']}ms
    </div>
    <div class="stats">
        <div class="stat"><div class="stat-value">{total}</div><div class="stat-label">Total Tests</div></div>
        <div class="stat"><div class="stat-value" style="color:#22c55e">{passed}</div><div class="stat-label">Passed</div></div>
        <div class="stat"><div class="stat-value" style="color:#ef4444">{failed}</div><div class="stat-label">Failed</div></div>
        <div class="stat"><div class="stat-value">{rate}</div><div class="stat-label">Pass Rate</div></div>
    </div>
    <table>
        <thead><tr>
            <th>Test</th><th style="text-align:center">Status</th>
            <th style="text-align:right">Time</th><th>Detail</th>
        </tr></thead>
        <tbody>{rows}</tbody>
    </table>
</div>
</body>
</html>"""
        with open(html_path, "w", encoding="utf-8") as f:
            f.write(html)
