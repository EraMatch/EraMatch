"""
Runtime synthesis verification script (equivalent to standalone verify_synthesis.py).

Usage:
  python scripts/verify_synthesis_runtime.py --github-url https://github.com/karpathy

Optional env:
  AI_SERVICE_URL=http://127.0.0.1:8001
  GITHUB_TOKEN=<token>
"""
from __future__ import annotations

import argparse
import os

import requests


def verify_synthesis(ai_service_url: str, github_url: str, jd_text: str, github_token: str = "") -> dict:
    resp = requests.post(
        f"{ai_service_url.rstrip('/')}/github-analysis/analyze",
        json={
            "github_url": github_url,
            "jd_text": jd_text,
            "github_token": github_token,
        },
        timeout=420,
    )
    resp.raise_for_status()
    payload = resp.json()

    analysis = payload.get("analysis_data") or {}
    synthesis = analysis.get("synthesis") or {}
    assessment = synthesis.get("assessment") or {}
    questions = synthesis.get("questions") or []

    required_scores = ["correctness", "sustainability", "speed", "knowledge"]
    missing_scores = [key for key in required_scores if key not in assessment]
    if missing_scores:
        raise RuntimeError(f"Missing synthesis assessment scores: {missing_scores}")

    if not isinstance(questions, list):
        raise RuntimeError("Synthesis questions is not a list")

    return {
        "executive_summary": synthesis.get("executive_summary", ""),
        "scores": assessment,
        "question_count": len(questions),
        "models": (analysis.get("models") or {}),
        "contributions": (payload.get("stats") or {}).get("contributions_last_year"),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify GitHub synthesis runtime output")
    parser.add_argument("--ai-service-url", default=os.getenv("AI_SERVICE_URL", "http://127.0.0.1:8001"))
    parser.add_argument("--github-url", default="https://github.com/karpathy")
    parser.add_argument("--jd", default="Build scalable backend services with Python and distributed systems")
    parser.add_argument("--token", default=os.getenv("GITHUB_TOKEN", ""), help="Optional GitHub token")
    args = parser.parse_args()

    result = verify_synthesis(args.ai_service_url, args.github_url, args.jd, args.token)

    print("Synthesis verification passed")
    print(f"Question count: {result['question_count']}")
    print(f"Scores: {result['scores']}")
    print(f"Models: {result['models']}")
    print(f"Contributions (last year): {result['contributions']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
