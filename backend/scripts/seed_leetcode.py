#!/usr/bin/env python3
"""
seed_leetcode.py — Import problems from newfacade/LeetCodeDataset into EraMatch QuestionBank.

Usage:
    cd backend
    python scripts/seed_leetcode.py --org-id <UUID> [--limit 50] [--difficulty easy]

Downloads LeetCodeDataset.json from GitHub, normalizes each problem to our
question_config schema, and bulk-inserts with source='leetcode'.
Idempotent — skips if question_text[:100] already exists for the org.
"""

import argparse
import json
import re
import sys
import urllib.request
from uuid import UUID, uuid4
from datetime import datetime

DATASET_URL = (
    "https://raw.githubusercontent.com/newfacade/LeetCodeDataset/main/data/LeetCodeDataset-v0.3.1-train.jsonl.gz"
)

DIFF_MAP = {"Easy": 1, "Medium": 2, "Hard": 3}


def fetch_dataset(url: str) -> list[dict]:
    import gzip
    import os
    import tempfile

    # Cache the raw .gz file to avoid repeated large downloads.
    # We stream-parse with gzip.open so embedded newlines inside JSON strings
    # don't corrupt the line-splitting logic.
    cache_gz = os.path.join(tempfile.gettempdir(), "leetcode_dataset_cache.jsonl.gz")

    if not os.path.exists(cache_gz):
        print(f"Downloading dataset from {url} ...")
        with urllib.request.urlopen(url, timeout=300) as resp:
            raw_gz = resp.read()
        with open(cache_gz, "wb") as f:
            f.write(raw_gz)
        print(f"  Cached to {cache_gz}")
    else:
        print(f"Loading from cache: {cache_gz}")

    data = []
    with gzip.open(cache_gz, "rt", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                data.append(json.loads(line))
            except json.JSONDecodeError:
                pass  # skip malformed lines

    print(f"  {len(data)} problems loaded.")
    return data


def extract_function_name(starter: str) -> str | None:
    """Extract the main function/method name from a Python starter snippet."""
    m = re.search(r'def\s+(\w+)\s*\(self', starter)
    if m:
        return m.group(1)
    m = re.search(r'def\s+(\w+)\s*\(', starter)
    return m.group(1) if m else None


def clean_starter_code(raw: str | None) -> str | None:
    """Strip class Solution wrapper; keep only the def block."""
    if not raw:
        return None
    lines = raw.splitlines()
    inner = []
    in_class = False
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("class Solution"):
            in_class = True
            continue
        if in_class and line.startswith("    "):
            inner.append(line[4:])
        elif not in_class:
            inner.append(line)
    result = "\n".join(inner).strip()
    return result or raw


def parse_examples(problem: dict) -> list[dict]:
    """Extract examples from the problem dict."""
    raw = problem.get("examples") or problem.get("example") or []
    if isinstance(raw, list) and raw:
        out = []
        for ex in raw:
            if isinstance(ex, dict):
                out.append({
                    "input": str(ex.get("input", "")),
                    "output": str(ex.get("output", "")),
                    "explanation": str(ex.get("explanation", "")),
                })
            else:
                out.append({"input": str(ex), "output": "", "explanation": ""})
        if out:
            return out

    # v0.3.1 JSONL: extract visible test cases from the "test" field (Python unittest code).
    # We parse assert statements: assert func(args) == expected
    test_code = problem.get("test") or ""
    if test_code:
        out = []
        for line in test_code.splitlines():
            line = line.strip()
            m = re.match(r'assert\s+.+\((.+)\)\s*==\s*(.+)', line)
            if m and len(out) < 3:
                out.append({
                    "input": m.group(1).strip(),
                    "output": m.group(2).strip(),
                    "explanation": "",
                })
        if out:
            return out

    return []


def examples_to_visible_test_cases(examples: list[dict]) -> list[dict]:
    """Convert examples into visible test cases (is_hidden=False)."""
    tcs = []
    for ex in examples:
        inp = ex.get("input", "").strip()
        out = ex.get("output", "").strip()
        if inp and out:
            tcs.append({"input": inp, "expected": out, "is_hidden": False})
    return tcs


def normalize(problem: dict, org_id: UUID) -> dict | None:
    """Normalize a LeetCode problem dict to a QuestionBank insert dict."""
    # Support both original schema and newfacade/LeetCodeDataset v0.3 JSONL schema
    title = (
        problem.get("title")
        or problem.get("name")
        # v0.3 JSONL uses task_id as slug (e.g. "two-sum"); humanize it
        or (problem.get("task_id") or "").replace("-", " ").title()
        or ""
    )
    description = (
        problem.get("description")
        or problem.get("content")
        or problem.get("problem_description")
        or ""
    )
    difficulty_str = problem.get("difficulty") or "Medium"
    difficulty_int = DIFF_MAP.get(difficulty_str, 2)

    raw_starter = (
        problem.get("python_starter_code")
        or problem.get("python3_starter_code")
        or problem.get("starter_code")
        or problem.get("python_starter")
        or ""
    )
    starter = clean_starter_code(raw_starter) if raw_starter else None
    # v0.3 JSONL provides entry_point directly; prefer it over regex extraction.
    # Strip "Solution()." or "Solution." prefix (dataset stores "Solution().twoSum").
    function_name = (
        problem.get("entry_point")
        or (extract_function_name(starter) if starter else None)
    )
    if function_name and "." in function_name:
        function_name = function_name.rsplit(".", 1)[-1]

    constraints_raw = problem.get("constraints") or []
    if isinstance(constraints_raw, str):
        constraints = [c.strip() for c in constraints_raw.split("\n") if c.strip()]
    else:
        constraints = [str(c) for c in constraints_raw]

    tags = problem.get("tags") or problem.get("topics") or problem.get("topic_tags") or []
    if isinstance(tags, list):
        tag_names = [t.get("name", t) if isinstance(t, dict) else str(t) for t in tags]
    else:
        tag_names = [str(tags)]

    examples = parse_examples(problem)
    visible_tcs = examples_to_visible_test_cases(examples)

    question_config = {
        "starter_code": starter,
        "function_name": function_name,
        "supported_languages": ["python"],
        "input_format": problem.get("input_format") or problem.get("inputFormat") or "",
        "output_format": problem.get("output_format") or problem.get("outputFormat") or "",
        "examples": examples,
        "constraints": constraints,
        "topics": tag_names,
        "test_cases": visible_tcs,
        "time_limit": 10,
        "max_attempts": 5,
    }

    return {
        "id": str(uuid4()),
        "organization_id": str(org_id),
        "question_type": "coding",
        "question_text": f"{title}\n\n{description}".strip(),
        "question_config": question_config,
        "correct_answer": None,
        "category": tag_names[0] if tag_names else "Algorithms",
        "difficulty": difficulty_int,
        "tags": tag_names,
        "points": 10,
        "is_base_question": True,
        "is_deleted": False,
        "source": "leetcode",
        "created_at": datetime.utcnow().isoformat(),
    }


def seed(org_id: UUID, limit: int | None, difficulty: str | None):
    import asyncio
    import os

    try:
        import asyncpg
    except ImportError:
        print("Installing asyncpg...")
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", "asyncpg"])
        import asyncpg

    DATABASE_URL = os.environ.get("DATABASE_URL", "")
    if not DATABASE_URL:
        env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
        if os.path.exists(env_path):
            for line in open(env_path):
                line = line.strip()
                if line.startswith("DATABASE_URL="):
                    DATABASE_URL = line.split("=", 1)[1].strip()
                    break
    if not DATABASE_URL:
        print("ERROR: DATABASE_URL not set.")
        sys.exit(1)

    pg_url = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")

    problems = fetch_dataset(DATASET_URL)

    if difficulty:
        diff_filter = difficulty.capitalize()
        problems = [p for p in problems if (p.get("difficulty") or "").capitalize() == diff_filter]
        print(f"  Filtered to {len(problems)} '{diff_filter}' problems.")

    if limit:
        problems = problems[:limit]
        print(f"  Limited to {len(problems)} problems.")

    rows = []
    for p in problems:
        row = normalize(p, org_id)
        if row:
            rows.append(row)

    print(f"Normalized {len(rows)} problems. Inserting...")

    async def _insert():
        conn = await asyncpg.connect(pg_url, statement_cache_size=0)
        try:
            inserted = 0
            skipped = 0
            for row in rows:
                title_prefix = row["question_text"][:100]
                existing = await conn.fetchval(
                    """
                    SELECT question_id FROM question_bank
                    WHERE organization_id = $1
                      AND left(question_text, 100) = $2
                      AND source = 'leetcode'
                    """,
                    UUID(row["organization_id"]),
                    title_prefix,
                )
                if existing:
                    skipped += 1
                    continue

                await conn.execute(
                    """
                    INSERT INTO question_bank (
                        question_id, organization_id, question_type, question_text,
                        question_config, correct_answer, category, difficulty, tags,
                        points, is_base_question, is_deleted, source, created_at
                    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
                    """,
                    UUID(row["id"]),
                    UUID(row["organization_id"]),
                    row["question_type"],
                    row["question_text"],
                    json.dumps(row["question_config"]),
                    json.dumps(row["correct_answer"]) if row["correct_answer"] else None,
                    row["category"],
                    row["difficulty"],
                    row["tags"],
                    row["points"],
                    row["is_base_question"],
                    row["is_deleted"],
                    row["source"],
                    datetime.utcnow(),
                )
                inserted += 1

            print(f"Done: {inserted} inserted, {skipped} skipped (duplicates).")
        finally:
            await conn.close()

    asyncio.run(_insert())


def main():
    parser = argparse.ArgumentParser(description="Seed LeetCode problems into EraMatch QuestionBank")
    parser.add_argument("--org-id", required=True, help="Organization UUID")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--difficulty", choices=["easy", "medium", "hard"], default=None)
    args = parser.parse_args()

    try:
        org_id = UUID(args.org_id)
    except ValueError:
        print(f"ERROR: Invalid UUID: {args.org_id}")
        sys.exit(1)

    seed(org_id, args.limit, args.difficulty)


if __name__ == "__main__":
    main()
