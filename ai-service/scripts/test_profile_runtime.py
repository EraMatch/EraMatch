"""
Runtime profile verification script (equivalent to standalone test_profile.py).

Usage:
  python scripts/test_profile_runtime.py --user karpathy --user torvalds

Optional env:
  GITHUB_TOKEN=<token>
"""
from __future__ import annotations

import argparse
import os
from typing import Iterable

import requests

GITHUB_API = "https://api.github.com"


def fetch_profile(username: str, token: str = "") -> dict:
    headers = {"Accept": "application/vnd.github.v3+json"}
    if token:
        headers["Authorization"] = f"token {token}"

    resp = requests.get(f"{GITHUB_API}/users/{username}", headers=headers, timeout=30)
    resp.raise_for_status()
    return resp.json()


def run(users: Iterable[str], token: str = "") -> int:
    failures = 0
    for user in users:
        try:
            profile = fetch_profile(user, token)
            print(f"[OK] {user} -> name={profile.get('name') or ''}, followers={profile.get('followers') or 0}, repos={profile.get('public_repos') or 0}")
            print(f"     url={profile.get('html_url')}")
        except Exception as exc:
            failures += 1
            print(f"[FAIL] {user}: {exc}")
    return failures


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify GitHub profile fetch runtime path")
    parser.add_argument("--user", action="append", dest="users", help="GitHub username", required=False)
    parser.add_argument("--token", default=os.getenv("GITHUB_TOKEN", ""), help="Optional GitHub token")
    args = parser.parse_args()

    users = args.users or ["karpathy", "torvalds"]
    failures = run(users, args.token)
    if failures:
        print(f"Completed with {failures} failure(s)")
        return 1
    print("All profile checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
