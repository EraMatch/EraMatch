"""
seed_mock_liv2_results.py — Insert mock LiV2 session + evaluation for Maya Hassan
=================================================================================

Finds Maya Hassan's candidate record in the DB, locates her group's frozen
rubric + bank, then inserts a completed session with a realistic 15-turn
transcript and a full evaluation (78%, pass, high confidence).

Also updates candidate_pipeline_progress to status='completed', score=78.

Usage:
    cd EraMatch/backend
    .venv/bin/python -m app.utils.seed_mock_liv2_results
"""

import os
import json
import asyncio
import sys
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

# ── Load .env ──────────────────────────────────────────────────────────────────
try:
    from dotenv import load_dotenv

    env_path = Path(__file__).resolve().parents[3] / ".env"
    if env_path.exists():
        load_dotenv(dotenv_path=env_path)
    else:
        load_dotenv()
except ImportError:
    env_path = Path(__file__).resolve().parents[3] / ".env"
    if env_path.exists():
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip())

import asyncpg

# ── DB URL ─────────────────────────────────────────────────────────────────────
RAW_DB_URL = os.environ.get("DATABASE_URL", "")
for _prefix in ("postgresql+asyncpg://", "postgres+asyncpg://"):
    if RAW_DB_URL.startswith(_prefix):
        RAW_DB_URL = "postgresql://" + RAW_DB_URL[len(_prefix) :]

# ── Candidate to seed ─────────────────────────────────────────────────────────
CANDIDATE_EMAILS = [
    "maya.hassan@example.com",
    "maya.hassan@demo.local",
]

NOW = datetime.now(timezone.utc)


def ts(days_ago: int = 0, hours_ago: int = 0, minutes_ago: int = 0) -> datetime:
    return NOW - timedelta(days=days_ago, hours=hours_ago, minutes=minutes_ago)


async def fetch_one(conn, sql: str, *args):
    row = await conn.fetchrow(sql, *args)
    return str(row[0]) if row and row[0] else None


async def fetch_row(conn, sql: str, *args):
    return await conn.fetchrow(sql, *args)


# ── Transcript (15 turns) ─────────────────────────────────────────────────────
def build_maya_transcript() -> list[dict]:
    """Realistic 15-turn interview: welcome → Q1 (bug) → Q2 (decision) → Q3 (useEffect) → closing"""
    return [
        {
            "role": "agent",
            "text": "Hello Maya! Welcome to your Live Interview for the Senior React Developer position. I'm your AI interviewer today. This session will cover Technical Depth, Problem Solving, and Communication. Are you ready to begin?",
            "phase": "opening",
            "timestamp": 0,
        },
        {
            "role": "candidate",
            "text": "Yes, I'm ready. Looking forward to it!",
            "phase": "opening",
            "timestamp": 8,
        },
        {
            "role": "agent",
            "text": "Great. Let's start with Technical Depth. You're investigating a production React component that causes the page to freeze intermittently. Users report the UI becomes unresponsive for 2-3 seconds. How would you diagnose and fix this performance issue?",
            "phase": "pillar_1",
            "timestamp": 18,
        },
        {
            "role": "candidate",
            "text": "I'd start by profiling the component with React DevTools and Chrome Performance tab. A freezing UI usually points to expensive re-renders or synchronous work blocking the main thread. I'd check for unnecessary re-renders using the 'Highlight updates' option, and look at the flame chart for long tasks.",
            "phase": "pillar_1",
            "timestamp": 45,
        },
        {
            "role": "agent",
            "text": "Good initial approach. Now, suppose you find the component is re-rendering on every keystroke due to a parent state change. What patterns would you use to optimize this?",
            "phase": "pillar_1",
            "timestamp": 75,
        },
        {
            "role": "candidate",
            "text": "I changed the cleanup to use AbortController instead of just clearing intervals, which fixed the memory leak pattern. But more broadly, I'd use React.memo for the component if props are shallow-comparable, extract the expensive computation into a useMemo, and debounce the parent state update if it's driven by user input like search. If the component manages complex local state, I'd consider useReducer to batch updates.",
            "phase": "pillar_1",
            "timestamp": 110,
        },
        {
            "role": "agent",
            "text": "Solid answer. Let's move to Problem Solving. Your team needs to choose between tRPC and GraphQL for a new microservice that serves both a React SPA and a mobile app. Walk me through your decision process.",
            "phase": "pillar_2",
            "timestamp": 140,
        },
        {
            "role": "candidate",
            "text": "I'd start by mapping the requirements. If the SPA is the primary consumer and we're using TypeScript end-to-end, tRPC gives excellent DX with type safety and minimal boilerplate. But since we have a mobile app too, I need a more flexible contract.",
            "phase": "pillar_2",
            "timestamp": 170,
        },
        {
            "role": "candidate",
            "text": "We chose tRPC over GraphQL initially because our team was small and the SPA was the only client. It gave us end-to-end type safety with zero effort. But looking back, GraphQL would have been better for multi-client scenarios — the schema acts as a contract and mobile teams can query exactly what they need without over-fetching.",
            "phase": "pillar_2",
            "timestamp": 210,
        },
        {
            "role": "agent",
            "text": "Interesting — so you'd make a different choice now. What factors would tip the scales toward GraphQL in the future?",
            "phase": "pillar_2",
            "timestamp": 245,
        },
        {
            "role": "candidate",
            "text": "Definitely. If we have multiple clients, if the API needs to be public or documented, or if different teams need different data shapes from the same endpoint — those are all strong signals for GraphQL. tRPC is fantastic for co-located TypeScript monorepos but its coupling becomes a liability at scale.",
            "phase": "pillar_2",
            "timestamp": 275,
        },
        {
            "role": "agent",
            "text": "Good reasoning with trade-off awareness. Now for Communication — can you explain useEffect's cleanup behavior and how it differs from useLayoutEffect in terms of timing?",
            "phase": "pillar_3",
            "timestamp": 320,
        },
        {
            "role": "candidate",
            "text": "useEffect runs asynchronously after paint. So if you set up a subscription or timer in useEffect, the cleanup function runs before the next effect fires or when the component unmounts. useLayoutEffect runs synchronously before paint — it's for DOM mutations where you need to avoid visual flicker. You almost always want useEffect. I only use useLayoutEffect when I'm measuring layout or adjusting scroll position.",
            "phase": "pillar_3",
            "timestamp": 355,
        },
        {
            "role": "agent",
            "text": "That's clear and precise. Can you give a real example where using useEffect cleanup incorrectly caused a bug?",
            "phase": "pillar_3",
            "timestamp": 395,
        },
        {
            "role": "candidate",
            "text": "Yes — we had a WebSocket connection that wasn't being closed properly on unmount. The effect set up a new connection each time, but the cleanup only cleared a React state variable instead of calling ws.close(). The result was orphaned connections piling up. Switching to AbortController-based cleanup fixed it completely.",
            "phase": "pillar_3",
            "timestamp": 430,
        },
        {
            "role": "agent",
            "text": "Thank you Maya. We've covered all our evaluation areas. You demonstrated solid technical knowledge and good self-reflection on past decisions. We'll be in touch soon!",
            "phase": "closing",
            "timestamp": 470,
        },
    ]


# ── Dimension scores ───────────────────────────────────────────────────────────
DIMENSION_SCORES = {
    "technical_depth": {
        "dimension_id": None,
        "dimension_name": "Technical Depth",
        "score": 3,
        "anchor_matched": "excellent",
        "cited_quote": "I changed the cleanup to use AbortController instead of just clearing intervals... I'd use React.memo for the component if props are shallow-comparable, extract the expensive computation into a useMemo, and debounce the parent state update.",
        "reasoning": "Candidate demonstrated deep understanding of React lifecycle debugging, memory profiling, and advanced cleanup patterns. Showed practical knowledge of AbortController and performance optimization techniques.",
        "weight": 0.4,
    },
    "problem_solving": {
        "dimension_id": None,
        "dimension_name": "Problem Solving",
        "score": 2,
        "anchor_matched": "proficient",
        "cited_quote": "We chose tRPC over GraphQL initially... But looking back, GraphQL would have been better for multi-client scenarios — the schema acts as a contract and mobile teams can query exactly what they need.",
        "reasoning": "Candidate showed systematic decision-making with clear trade-off analysis. Demonstrated a growth mindset by acknowledging the suboptimal past decision and articulating what would change.",
        "weight": 0.3,
    },
    "communication": {
        "dimension_id": None,
        "dimension_name": "Communication",
        "score": 2,
        "anchor_matched": "proficient",
        "cited_quote": "useEffect runs asynchronously after paint. useLayoutEffect runs synchronously before paint — it's for DOM mutations where you need to avoid visual flicker.",
        "reasoning": "Good logical structure with precise technical explanations. Less adaptive to follow-up probing — the WebSocket example was solid but could have explored edge cases more deeply.",
        "weight": 0.3,
    },
}

PER_QUESTION_RESULTS = [
    {
        "bank_item_id": None,
        "question_text": "You're investigating a production React component that causes the page to freeze intermittently...",
        "dimension_id": None,
        "sub_criteria_scores": [
            {"name": "Root cause identification", "weight": 0.35, "score": 3, "max": 3},
            {"name": "Tooling knowledge", "weight": 0.35, "score": 3, "max": 3},
            {"name": "Solution breadth", "weight": 0.30, "score": 3, "max": 3},
        ],
    },
    {
        "bank_item_id": None,
        "question_text": "Your team needs to choose between tRPC and GraphQL for a new microservice...",
        "dimension_id": None,
        "sub_criteria_scores": [
            {"name": "Decision framework", "weight": 0.30, "score": 2, "max": 3},
            {"name": "Trade-off analysis", "weight": 0.40, "score": 2, "max": 3},
            {"name": "Self-reflection", "weight": 0.30, "score": 2, "max": 3},
        ],
    },
    {
        "bank_item_id": None,
        "question_text": "Can you explain useEffect's cleanup behavior and how it differs from useLayoutEffect?",
        "dimension_id": None,
        "sub_criteria_scores": [
            {"name": "Clarity of explanation", "weight": 0.40, "score": 1, "max": 3},
            {"name": "Practical example", "weight": 0.30, "score": 2, "max": 3},
            {"name": "Precision", "weight": 0.30, "score": 2, "max": 3},
        ],
    },
]


# ── Main ────────────────────────────────────────────────────────────────────────
async def run_seed():
    print("=" * 65)
    print("  EraMatch — Mock LiV2 Session + Evaluation Seed for Maya Hassan")
    print("=" * 65)
    print()

    if not RAW_DB_URL:
        print("❌ DATABASE_URL not found. Check your .env file.")
        print("   Make sure the backend is configured and the .env file exists.")
        sys.exit(1)

    print("✅ Connecting to database...")
    try:
        conn = await asyncpg.connect(RAW_DB_URL, statement_cache_size=0)
    except Exception as e:
        print(f"❌ Cannot connect to database: {e}")
        print("   Ensure the database is accessible and DATABASE_URL is correct.")
        sys.exit(1)
    print("✅ Connected\n")

    try:
        # ── 1. Find Maya Hassan ─────────────────────────────────────────────
        print("📁 Step 1 — Finding Maya Hassan")
        candidate_id = None
        for email in CANDIDATE_EMAILS:
            candidate_id = await fetch_one(
                conn,
                "SELECT candidate_id FROM candidate_profiles WHERE email = $1 LIMIT 1",
                email,
            )
            if candidate_id:
                print(
                    f"  ✅ Found Maya Hassan: candidate_id={candidate_id} (email={email})"
                )
                break

        if not candidate_id:
            print("  ❌ Maya Hassan not found in candidate_profiles.")
            print("     Tried emails: " + ", ".join(CANDIDATE_EMAILS))
            print("     Run seed_demo_candidates.py or seed_liv2_full.py first.")
            return

        # ── 2. Find her application + group ──────────────────────────────────
        print("\n📁 Step 2 — Finding Maya's application and group")
        app_row = await fetch_row(
            conn,
            """SELECT application_id, group_id, organization_id
               FROM candidate_applications
               WHERE candidate_id = $1
               ORDER BY applied_at DESC LIMIT 1""",
            candidate_id,
        )
        if not app_row:
            print(
                "  ❌ Maya has no candidate_applications. Run seed_demo_candidates.py first."
            )
            return

        application_id = str(app_row["application_id"])
        group_id = str(app_row["group_id"]) if app_row["group_id"] else None
        organization_id = str(app_row["organization_id"])

        if not group_id:
            print("  ❌ Maya's application has no group_id. Cannot proceed.")
            return

        print(f"  ✅ application_id={application_id}")
        print(f"  ✅ group_id={group_id}")
        print(f"  ✅ organization_id={organization_id}")

        # ── 3. Find frozen rubric + bank ─────────────────────────────────────
        print("\n📁 Step 3 — Finding frozen rubric and bank")
        rubric_row = await fetch_row(
            conn,
            """SELECT rubric_id, dimensions FROM li_v2_rubrics
               WHERE group_id = $1 AND state = 'frozen'
               ORDER BY created_at DESC LIMIT 1""",
            group_id,
        )
        bank_row = await fetch_row(
            conn,
            """SELECT bank_id, items FROM li_v2_banks
               WHERE group_id = $1 AND state = 'frozen'
               ORDER BY created_at DESC LIMIT 1""",
            group_id,
        )

        if not rubric_row:
            print("  ❌ No frozen rubric found for group. Run seed_liv2_full.py first.")
            return
        if not bank_row:
            print("  ❌ No frozen bank found for group. Run seed_liv2_full.py first.")
            return

        rubric_id = str(rubric_row["rubric_id"])
        bank_id = str(bank_row["bank_id"])
        dimensions = (
            rubric_row["dimensions"]
            if isinstance(rubric_row["dimensions"], list)
            else json.loads(rubric_row["dimensions"])
        )
        bank_items = (
            bank_row["items"]
            if isinstance(bank_row["items"], list)
            else json.loads(bank_row["items"])
        )

        print(f"  ✅ rubric_id={rubric_id}")
        print(f"  ✅ bank_id={bank_id}")

        # Map dimension names to IDs from rubric
        dim_by_name = {d["name"]: d["dimension_id"] for d in dimensions}
        print(f"  ✅ Dimensions: {list(dim_by_name.keys())}")

        # ── 4. Find the live_interview pipeline stage ────────────────────────
        print("\n📁 Step 4 — Finding live_interview pipeline stage")
        stage_row = await fetch_row(
            conn,
            """SELECT stage_id FROM group_pipeline_stages
               WHERE group_id = $1 AND stage_type = 'live_interview'
               ORDER BY stage_order DESC LIMIT 1""",
            group_id,
        )
        if not stage_row:
            print("  ❌ No live_interview stage found for group.")
            return

        live_stage_id = str(stage_row["stage_id"])
        print(f"  ✅ live_stage_id={live_stage_id}")

        # ── 5. Insert li_v2_sessions row ────────────────────────────────────
        print("\n📁 Step 5 — Inserting li_v2_sessions row")
        import uuid

        session_id = str(uuid.uuid4())
        room_name = f"li-v2-maya-{session_id[:8]}"
        transcript = build_maya_transcript()
        context_pool = {
            "position_title": "Senior React Developer",
            "job_description_excerpt": "We are looking for a passionate Senior React Developer to lead our frontend team.",
            "cv_skills": ["React", "TypeScript", "Node.js", "GraphQL", "Jest"],
            "experience_summary": [
                "5+ years frontend experience, strong debugging skills"
            ],
            "weak_topics": [
                "React performance optimization",
                "tRPC vs GraphQL trade-offs",
            ],
            "candidate_name": "Maya Hassan",
        }

        # Duration: 14min 23sec = 863 seconds
        started_at = ts(days_ago=1, hours_ago=2)
        ended_at = started_at + timedelta(minutes=14, seconds=23)

        await conn.execute(
            """
            INSERT INTO li_v2_sessions
                (session_id, candidate_id, application_id, group_id, organization_id,
                 rubric_id, bank_id, room_name, state, started_at, ended_at,
                 duration_seconds, context_pool, transcript, created_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
            ON CONFLICT (session_id) DO UPDATE SET
                state = EXCLUDED.state,
                transcript = EXCLUDED.transcript,
                ended_at = EXCLUDED.ended_at,
                duration_seconds = EXCLUDED.duration_seconds
            """,
            session_id,
            candidate_id,
            application_id,
            group_id,
            organization_id,
            rubric_id,
            bank_id,
            room_name,
            "completed",
            started_at,
            ended_at,
            863,  # 14:23 duration
            json.dumps(context_pool),
            json.dumps(transcript),
            ts(days_ago=1, hours_ago=2, minutes_ago=10),
        )
        print(f"  ✅ Session created: {session_id}")
        print(f"     room_name={room_name}, duration=14:23")

        # ── 6. Insert li_v2_evaluations row ──────────────────────────────────
        print("\n📁 Step 6 — Inserting li_v2_evaluations row")

        dim_score_map = {}
        for key, ds in DIMENSION_SCORES.items():
            dim_id = dim_by_name.get(ds["dimension_name"])
            if dim_id:
                ds_resolved = {
                    "score": ds["score"],
                    "anchor_matched": ds["anchor_matched"],
                    "cited_quote": ds["cited_quote"],
                    "reasoning": ds["reasoning"],
                    "dimension_name": ds["dimension_name"],
                }
                dim_score_map[dim_id] = ds_resolved

        evaluation_id = str(uuid.uuid4())

        # per_question_results: resolve bank_item_ids and dimension_ids from DB
        bank_item_by_idx = {}
        for idx, item in enumerate(bank_items[:3]):
            bank_item_by_idx[idx] = item.get("bank_item_id", str(uuid.uuid4()))

        per_question = []
        dim_keys = list(dim_by_name.keys())
        for idx, pqr in enumerate(PER_QUESTION_RESULTS):
            dim_name = dim_keys[idx] if idx < len(dim_keys) else dim_keys[0]
            dim_id = dim_by_name.get(dim_name)
            item_id = bank_item_by_idx.get(idx)

            per_question.append(
                {
                    "bank_item_id": item_id,
                    "question_text": pqr["question_text"],
                    "dimension_id": dim_id,
                    "sub_criteria": pqr["sub_criteria_scores"],
                }
            )

        auto_tags = {
            "strong_on": ["Technical Depth"]
            if DIMENSION_SCORES["technical_depth"]["score"] >= 3
            else [],
            "weak_on": [],
            "cv_verified": True,
            "consistent_with_cv": True,
        }

        # overall_score_pct=78, weighted: Tech Depth 92%×0.4 + Problem Solving 70%×0.3 + Communication 82%×0.3 ≈ 83.4% → normalized to 78
        overall_score_pct = 78
        overall_score = Decimal("0.78")

        await conn.execute(
            """
            INSERT INTO li_v2_evaluations
                (evaluation_id, session_id, organization_id,
                 overall_score, overall_score_pct, auto_verdict, meets_criteria,
                 coverage_ratio, per_question_results, dimension_scores,
                 auto_tags, integrity_flags, evaluation_confidence, judged_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
            ON CONFLICT (evaluation_id) DO UPDATE SET
                overall_score = EXCLUDED.overall_score,
                overall_score_pct = EXCLUDED.overall_score_pct,
                auto_verdict = EXCLUDED.auto_verdict,
                dimension_scores = EXCLUDED.dimension_scores
            """,
            evaluation_id,
            session_id,
            organization_id,
            overall_score,
            overall_score_pct,
            "pass",
            True,
            Decimal("1.00"),
            json.dumps(per_question),
            json.dumps(dim_score_map),
            json.dumps(auto_tags),
            json.dumps({"injection_attempts": 0, "anomalies": []}),
            "high",
            ts(hours_ago=1, minutes_ago=30),
        )
        print(f"  ✅ Evaluation created: {evaluation_id}")
        print(f"     overall_score_pct=78, auto_verdict=pass, confidence=high")
        print(
            f"     dimensions: Technical Depth=92%(excellent), Problem Solving=70%(proficient), Communication=82%(proficient)"
        )

        # ── 7. Update candidate_pipeline_progress ────────────────────────────
        print("\n📁 Step 7 — Updating candidate_pipeline_progress")

        # Check if progress row exists
        existing_progress = await fetch_row(
            conn,
            """SELECT progress_id FROM candidate_pipeline_progress
               WHERE application_id = $1 AND stage_id = $2""",
            application_id,
            live_stage_id,
        )

        if existing_progress:
            await conn.execute(
                """
                UPDATE candidate_pipeline_progress
                SET status = 'completed',
                    score = 78,
                    max_score = 100,
                    passed = true,
                    session_id = $1,
                    session_type = 'live_interview',
                    completed_at = $2
                WHERE application_id = $3 AND stage_id = $4
                """,
                session_id,
                ts(hours_ago=1),
                application_id,
                live_stage_id,
            )
            print(f"  ✅ Updated existing progress row to completed (score=78)")
        else:
            progress_id = str(uuid.uuid4())
            await conn.execute(
                """
                INSERT INTO candidate_pipeline_progress
                    (progress_id, application_id, stage_id, status,
                     session_id, session_type, score, max_score, passed,
                     unlocked_at, started_at, completed_at)
                VALUES ($1,$2,$3,'completed',$4,'live_interview',78,100,true,$5,$6,$7)
                """,
                progress_id,
                application_id,
                live_stage_id,
                session_id,
                ts(days_ago=1, hours=2),
                ts(days_ago=1, hours=1, minutes=45),
                ts(hours_ago=1),
            )
            print(f"  ✅ Created new progress row: completed (score=78)")

        # ── Summary ──────────────────────────────────────────────────────────
        print("\n" + "=" * 65)
        print("  ✅ Seed Complete! Summary:")
        print("=" * 65)
        print(f"  Candidate:     Maya Hassan ({CANDIDATE_EMAILS[0]})")
        print(f"  Candidate ID:  {candidate_id}")
        print(f"  Application:   {application_id}")
        print(f"  Group:         {group_id}")
        print(f"  Rubric:        {rubric_id}")
        print(f"  Bank:          {bank_id}")
        print(f"  Session:       {session_id}")
        print(f"  Evaluation:    {evaluation_id}")
        print(f"  Stage:         {live_stage_id}")
        print()
        print("  Results:")
        print("    overall_score_pct: 78")
        print("    auto_verdict:     pass")
        print("    confidence:       high")
        print("    coverage_ratio:   1.0")
        print("    Technical Depth:  excellent (92%) — weight=0.4")
        print("    Problem Solving:  proficient (70%) — weight=0.3")
        print("    Communication:    proficient (82%) — weight=0.3")
        print()
        print("  Per-question sub-criteria:")
        print("    Q1 (bug):     3/3, 3/3, 3/3")
        print("    Q2 (decision): 2/3, 2/3, 2/3")
        print("    Q3 (useEffect): 1/3, 2/3, 2/3")
        print("=" * 65)

    finally:
        await conn.close()


def main():
    asyncio.run(run_seed())


if __name__ == "__main__":
    main()
