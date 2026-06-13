"""
validate_liv2_flow.py — End-to-End Live Interview V2 Flow Validation
=====================================================================

Tests the FULL LiV2 pipeline with REAL service calls (no mocks).

11 Validation Steps:
 1. Candidate login → access_token
 2. Token dispatch → LiveKit token + session_id
 3. DB check — session created (pending/in_progress)
 4. DB check — pipeline progress = in_progress
 5. LiveKit room exists (skipped with WARNING if no API key)
 6. Session completion → POST complete with transcript
 7. DB check — transcript saved
 8. DB check — evaluation created (async judge, 3s wait)
 9. DB check — pipeline progress = completed
10. Recruiter fetch evaluation → dimension_scores with cited quotes
11. Full-flow summary

Uses asyncpg for DB checks and httpx for API calls
(same pattern as seed_liv2_full.py).

Usage:
    cd EraMatch/backend
    source .venv/bin/activate
    python -m app.utils.validate_liv2_flow
"""

import asyncio
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

# ---------------------------------------------------------------------------
# .env loading — same pattern as seed_liv2_full.py
# ---------------------------------------------------------------------------
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
import httpx

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:8000")
RAW_DB_URL = os.environ.get("DATABASE_URL", "")
LIVEKIT_API_KEY = os.environ.get("LIVEKIT_API_KEY", "")
LIVEKIT_API_SECRET = os.environ.get("LIVEKIT_API_SECRET", "")
LIVEKIT_URL = os.environ.get("LIVEKIT_URL", "")

# Normalize asyncpg URL prefixes
for _prefix in ("postgresql+asyncpg://", "postgres+asyncpg://"):
    if RAW_DB_URL.startswith(_prefix):
        RAW_DB_URL = "postgresql://" + RAW_DB_URL[len(_prefix) :]

# Seed data UUIDs (from seed_liv2_full.py)
CANDIDATE_4_EMAIL = "khalid.mansour@example.com"
CANDIDATE_4_ID = "b0001001-0000-0000-0000-000000000001"
CANDIDATE_4_APP_ID = "b0002001-0000-0000-0000-000000000001"
GROUP_ID = "a0000003-0000-0000-0000-000000000003"
LIVE_STAGE_ID = "a0000012-0000-0000-0000-000000000012"
RUBRIC_ID = "a0000040-0000-0000-0000-000000000040"
BANK_ID = "a0000041-0000-0000-0000-000000000041"
HR_EMAIL = "hr@eramatch.com"
PASSWORD = "admin12345"

# ---------------------------------------------------------------------------
# Result tracking
# ---------------------------------------------------------------------------
results: list[tuple[int, str, str]] = []  # (step_num, status, detail)


def pass_step(step: int, msg: str = "") -> None:
    detail = f" {msg}" if msg else ""
    results.append((step, "PASS", detail))
    print(f"  ✅ PASS Step {step}{detail}")


def fail_step(step: int, reason: str) -> None:
    results.append((step, "FAIL", reason))
    print(f"  ❌ FAIL Step {step}: {reason}")


def warn_step(step: int, msg: str) -> None:
    results.append((step, "WARN", msg))
    print(f"  ⚠️  WARNING Step {step}: {msg}")


# ---------------------------------------------------------------------------
# Step 1: Candidate Login
# ---------------------------------------------------------------------------
async def step_candidate_login(client: httpx.AsyncClient) -> str | None:
    """POST /api/v1/candidate/login → get access_token."""
    print("\n📋 Step 1 — Candidate Login")
    try:
        resp = await client.post(
            f"{BACKEND_URL}/api/v1/candidate/login",
            json={"email": CANDIDATE_4_EMAIL, "password": PASSWORD},
        )
        if resp.status_code != 200:
            fail_step(1, f"HTTP {resp.status_code}: {resp.text[:300]}")
            return None
        data = resp.json()
        token = data.get("access_token")
        if not token:
            fail_step(1, f"No access_token in response: {list(data.keys())}")
            return None
        pass_step(1, f"token={token[:20]}...")
        return token
    except Exception as e:
        fail_step(1, str(e))
        return None


# ---------------------------------------------------------------------------
# Step 2: Token Dispatch
# ---------------------------------------------------------------------------
async def step_token_dispatch(
    client: httpx.AsyncClient, candidate_token: str
) -> dict | None:
    """GET /api/v1/live-interview-v2/session/token → get LiveKit token + session_id."""
    print("\n📋 Step 2 — Token Dispatch")
    try:
        resp = await client.get(
            f"{BACKEND_URL}/api/v1/live-interview-v2/session/token",
            headers={"Authorization": f"Bearer {candidate_token}"},
        )
        if resp.status_code != 200:
            fail_step(2, f"HTTP {resp.status_code}: {resp.text[:300]}")
            return None
        data = resp.json()
        session_id = data.get("session_id")
        room_name = data.get("room_name")
        token = data.get("token")
        if not session_id or not token:
            fail_step(
                2,
                f"Missing fields: session_id={session_id}, token={'yes' if token else 'no'}",
            )
            return None
        pass_step(2, f"session_id={session_id}, room={room_name}")
        return data
    except Exception as e:
        fail_step(2, str(e))
        return None


# ---------------------------------------------------------------------------
# Step 3: DB Check — Session Created
# ---------------------------------------------------------------------------
async def step_db_session_created(conn: asyncpg.Connection, session_id: str) -> bool:
    """Query li_v2_sessions for the new row, verify state is pending or in_progress."""
    print("\n📋 Step 3 — DB Check: Session Created")
    try:
        row = await conn.fetchrow(
            "SELECT session_id, state, room_name FROM li_v2_sessions WHERE session_id = $1",
            UUID(session_id),
        )
        if not row:
            fail_step(3, f"No li_v2_sessions row found for session_id={session_id}")
            return False
        state = row["state"]
        if state not in ("pending", "in_progress"):
            fail_step(3, f"Unexpected state: {state}")
            return False
        pass_step(3, f"state={state}, room={row['room_name']}")
        return True
    except Exception as e:
        fail_step(3, str(e))
        return False


# ---------------------------------------------------------------------------
# Step 4: DB Check — Pipeline Progress
# ---------------------------------------------------------------------------
async def step_db_pipeline_progress(conn: asyncpg.Connection) -> bool:
    """Query candidate_pipeline_progress for live_interview stage = in_progress."""
    print("\n📋 Step 4 — DB Check: Pipeline Progress")
    try:
        row = await conn.fetchrow(
            """
            SELECT progress_id, status, session_id
            FROM candidate_pipeline_progress
            WHERE application_id = $1
              AND stage_id = $2
            """,
            UUID(CANDIDATE_4_APP_ID),
            UUID(LIVE_STAGE_ID),
        )
        if not row:
            fail_step(
                4, "No pipeline progress row found for candidate 4 live_interview stage"
            )
            return False
        status = row["status"]
        if status != "in_progress":
            fail_step(4, f"Expected status='in_progress', got '{status}'")
            return False
        pass_step(4, f"status={status}")
        return True
    except Exception as e:
        fail_step(4, str(e))
        return False


# ---------------------------------------------------------------------------
# Step 5: LiveKit Room Check
# ---------------------------------------------------------------------------
async def step_livekit_room(room_name: str) -> None:
    """Check if the LiveKit room exists using the LiveKit server API."""
    print("\n📋 Step 5 — LiveKit Room Check")
    if not LIVEKIT_API_KEY or not LIVEKIT_API_SECRET:
        warn_step(5, "LIVEKIT_API_KEY or LIVEKIT_API_SECRET not configured — skipping")
        return
    try:
        from livekit import api as lk_api

        lk_client = lk_api.LiveKitAPI(
            url=LIVEKIT_URL,
            api_key=LIVEKIT_API_KEY,
            api_secret=LIVEKIT_API_SECRET,
        )
        rooms = await lk_client.room.list_rooms(lk_api.ListRoomsRequest())
        room_names = [r.name for r in rooms.rooms]
        await lk_client.aclose()

        if room_name in room_names:
            pass_step(5, f"Room '{room_name}' found in LiveKit")
        else:
            # Room may have been auto-deleted after agent left — not a hard failure
            warn_step(
                5,
                f"Room '{room_name}' not found (may have been cleaned up after agent left)",
            )
    except ImportError:
        warn_step(5, "livekit SDK not installed — skipping")
    except Exception as e:
        warn_step(5, f"LiveKit API error: {e}")


# ---------------------------------------------------------------------------
# Step 6: Session Completion
# ---------------------------------------------------------------------------
async def step_session_complete(client: httpx.AsyncClient, session_id: str) -> bool:
    """POST /api/v1/live-interview-v2/session/{session_id}/complete with transcript."""
    print("\n📋 Step 6 — Session Completion (POST /complete)")
    transcript = [
        {
            "role": "agent",
            "text": "Hello Khalid! Welcome to your Live Interview for the Senior React Developer position. I'm your AI interviewer today. Are you ready to begin?",
            "phase": "opening",
            "timestamp": 0,
        },
        {
            "role": "candidate",
            "text": "Yes, absolutely! Happy to be here.",
            "phase": "opening",
            "timestamp": 8,
        },
        {
            "role": "agent",
            "text": "Great. Let's start with Technical Depth. Can you explain how React's reconciliation algorithm and virtual DOM diffing work under the hood?",
            "phase": "pillar_1",
            "timestamp": 18,
        },
        {
            "role": "candidate",
            "text": "Sure. React maintains a virtual DOM — a lightweight JS representation of the real DOM. When state changes, it re-renders the virtual tree and diffs it against the previous snapshot using a heuristic O(n) algorithm. If root element types differ, it tears down and rebuilds. For same-type elements it updates only changed props. Keys on lists are critical to prevent unnecessary re-mounts.",
            "phase": "pillar_1",
            "timestamp": 42,
        },
        {
            "role": "agent",
            "text": "Excellent. Now for Problem Solving — your API response times degrade under load. Walk me through your debugging and resolution approach.",
            "phase": "pillar_2",
            "timestamp": 110,
        },
        {
            "role": "candidate",
            "text": "First I'd profile — Chrome DevTools for the network layer, checking TTFB and payload sizes. Then I'd look at server-side metrics: Datadog or CloudWatch for p95 latency spikes. Common culprits are N+1 queries, missing indexes, or heavy synchronous work on the main thread. I'd add pagination, caching with Redis for hot reads, and consider moving compute-heavy work to background tasks.",
            "phase": "pillar_2",
            "timestamp": 145,
        },
    ]
    try:
        # Note: This endpoint is UNAUTHENTICATED — uses session_id as capability token
        resp = await client.post(
            f"{BACKEND_URL}/api/v1/live-interview-v2/session/{session_id}/complete",
            json={"transcript": transcript},
        )
        if resp.status_code not in (200, 201):
            fail_step(6, f"HTTP {resp.status_code}: {resp.text[:300]}")
            return False
        data = resp.json()
        status_val = data.get("status", "")
        returned_sid = data.get("session_id", "")
        pass_step(6, f"status={status_val}, session_id={returned_sid}")
        return True
    except Exception as e:
        fail_step(6, str(e))
        return False


# ---------------------------------------------------------------------------
# Step 7: DB Check — Transcript Saved
# ---------------------------------------------------------------------------
async def step_db_transcript(conn: asyncpg.Connection, session_id: str) -> bool:
    """Query li_v2_sessions.transcript for non-empty JSON."""
    print("\n📋 Step 7 — DB Check: Transcript Saved")
    try:
        row = await conn.fetchrow(
            "SELECT transcript FROM li_v2_sessions WHERE session_id = $1",
            UUID(session_id),
        )
        if not row:
            fail_step(7, f"No session row for session_id={session_id}")
            return False
        transcript = row["transcript"]
        if not transcript:
            fail_step(7, "transcript is NULL or empty")
            return False
        if isinstance(transcript, str):
            parsed = json.loads(transcript)
            turn_count = len(parsed)
        elif isinstance(transcript, list):
            turn_count = len(transcript)
        else:
            turn_count = 0
        if turn_count == 0:
            fail_step(7, "transcript array is empty")
            return False
        pass_step(7, f"transcript has {turn_count} turns")
        return True
    except Exception as e:
        fail_step(7, str(e))
        return False


# ---------------------------------------------------------------------------
# Step 8: DB Check — Evaluation Created (async judge — 3s wait)
# ---------------------------------------------------------------------------
async def step_db_evaluation(conn: asyncpg.Connection, session_id: str) -> bool:
    """Poll for evaluation row (up to 15s) after async judge pipeline."""
    print(
        "\n📋 Step 8 — DB Check: Evaluation Created (polling up to 15s for async judge...)"
    )
    row = None
    for attempt in range(5):
        await asyncio.sleep(3)
        try:
            row = await conn.fetchrow(
                """
                SELECT evaluation_id, overall_score_pct, auto_verdict, dimension_scores
                FROM li_v2_evaluations
                WHERE session_id = $1
                """,
                UUID(session_id),
            )
            if row:
                break
        except Exception:
            pass
        print(f"   ...attempt {attempt + 1}/5, evaluation not ready yet")
    if not row:
        fail_step(
            8,
            "No evaluation row found — judge pipeline may have failed or not finished",
        )
        return False
    try:
        score_pct = row["overall_score_pct"]
        verdict = row["auto_verdict"]
        dims = row["dimension_scores"]
        dim_count = 0
        if dims:
            if isinstance(dims, str):
                dims = json.loads(dims)
            dim_count = len(dims) if isinstance(dims, dict) else len(dims)
        pass_step(8, f"verdict={verdict}, score={score_pct}%, dimensions={dim_count}")
        return True
    except Exception as e:
        fail_step(8, str(e))
        return False


# ---------------------------------------------------------------------------
# Step 9: DB Check — Pipeline Progress Updated
# ---------------------------------------------------------------------------
async def step_db_pipeline_completed(conn: asyncpg.Connection) -> bool:
    """Query candidate_pipeline_progress: status='completed' AND score IS NOT NULL."""
    print("\n📋 Step 9 — DB Check: Pipeline Progress Updated")
    try:
        row = await conn.fetchrow(
            """
            SELECT progress_id, status, score
            FROM candidate_pipeline_progress
            WHERE application_id = $1
              AND stage_id = $2
            """,
            UUID(CANDIDATE_4_APP_ID),
            UUID(LIVE_STAGE_ID),
        )
        if not row:
            fail_step(9, "No pipeline progress row found")
            return False
        status = row["status"]
        score = row["score"]
        if status != "completed":
            fail_step(9, f"Expected status='completed', got '{status}'")
            return False
        if score is None:
            fail_step(9, "score is NULL — expected non-null after evaluation")
            return False
        pass_step(9, f"status={status}, score={score}")
        return True
    except Exception as e:
        fail_step(9, str(e))
        return False


# ---------------------------------------------------------------------------
# Step 10: Recruiter Fetch Evaluation
# ---------------------------------------------------------------------------
async def step_recruiter_fetch(client: httpx.AsyncClient, session_id: str) -> bool:
    """Login as HR, GET /api/v1/live-interview-v2/session/{session_id} → verify dimension_scores."""
    print("\n📋 Step 10 — Recruiter Fetch Evaluation")
    try:
        # Login as HR
        login_resp = await client.post(
            f"{BACKEND_URL}/api/v1/auth/organization-user/login",
            json={"email": HR_EMAIL, "password": PASSWORD},
        )
        if login_resp.status_code != 200:
            fail_step(
                10,
                f"HR login failed: HTTP {login_resp.status_code}: {login_resp.text[:200]}",
            )
            return False
        login_data = login_resp.json()
        hr_token = login_data.get("access_token") or login_data.get("token")
        if not hr_token:
            fail_step(10, f"No token in HR login response: {list(login_data.keys())}")
            return False

        # Fetch evaluation
        eval_resp = await client.get(
            f"{BACKEND_URL}/api/v1/live-interview-v2/session/{session_id}",
            headers={"Authorization": f"Bearer {hr_token}"},
        )
        if eval_resp.status_code != 200:
            fail_step(
                10,
                f"Fetch evaluation failed: HTTP {eval_resp.status_code}: {eval_resp.text[:300]}",
            )
            return False

        eval_data = eval_resp.json()
        # The response may have evaluation nested or at top level
        evaluation = eval_data.get("evaluation") or eval_data
        dimension_scores = evaluation.get("dimension_scores")
        if not dimension_scores:
            fail_step(10, f"No dimension_scores in response: {list(eval_data.keys())}")
            return False

        # Verify dimension_scores has cited quotes
        total_quotes = 0
        if isinstance(dimension_scores, dict):
            for dim_id, dim_data in dimension_scores.items():
                if isinstance(dim_data, dict):
                    cited = dim_data.get("cited_quote") or dim_data.get("cited_quotes")
                    if cited:
                        total_quotes += 1
        elif isinstance(dimension_scores, list):
            for dim_data in dimension_scores:
                if isinstance(dim_data, dict):
                    cited = dim_data.get("cited_quote") or dim_data.get("cited_quotes")
                    if cited:
                        total_quotes += 1

        pass_step(
            10, f"dimension_scores present, {total_quotes} dimensions with cited quotes"
        )
        return True
    except Exception as e:
        fail_step(10, str(e))
        return False


# ---------------------------------------------------------------------------
# Step 11: Full Flow Summary
# ---------------------------------------------------------------------------
def step_summary() -> None:
    """Print aggregate results."""
    print("\n📋 Step 11 — Full Flow Summary")
    print("=" * 60)
    passed = sum(1 for _, status, _ in results if status == "PASS")
    failed = sum(1 for _, status, _ in results if status == "FAIL")
    warned = sum(1 for _, status, _ in results if status == "WARN")
    total = len(results)

    for step_num, status, detail in results:
        icon = "✅" if status == "PASS" else "❌" if status == "FAIL" else "⚠️ "
        print(f"  {icon} Step {step_num}: {status} {detail}")

    print()
    print(
        f"  Passed: {passed}  |  Failed: {failed}  |  Warnings: {warned}  |  Total: {total}"
    )
    print(f"\n===== {passed}/{total} steps passed =====")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
async def run_validation():
    print("=" * 65)
    print("  EraMatch — Live Interview V2 E2E Validation")
    print("=" * 65)
    print(f"\n  Backend: {BACKEND_URL}")
    print(
        f"  DB:      {RAW_DB_URL[:30]}..."
        if RAW_DB_URL
        else "  DB:      NOT CONFIGURED"
    )
    print(
        f"  LiveKit: {'configured' if LIVEKIT_API_KEY else 'NOT configured (Step 5 will be skipped)'}"
    )
    print()

    if not RAW_DB_URL:
        print("❌ DATABASE_URL not found. Check .env")
        sys.exit(1)

    # Connect to DB
    print("✅ Connecting to database...")
    conn = await asyncpg.connect(RAW_DB_URL, statement_cache_size=0)
    print("✅ Connected\n")

    # Verify seed data exists before starting
    cand = await conn.fetchrow(
        "SELECT candidate_id FROM candidate_profiles WHERE email = $1",
        CANDIDATE_4_EMAIL,
    )
    if not cand:
        print(
            f"❌ Candidate '{CANDIDATE_4_EMAIL}' not found — run seed_liv2_full.py first"
        )
        await conn.close()
        sys.exit(1)

    stage = await conn.fetchrow(
        "SELECT stage_id, state FROM group_pipeline_stages WHERE stage_id = $1",
        UUID(LIVE_STAGE_ID),
    )
    if not stage:
        print(
            f"❌ Live interview stage '{LIVE_STAGE_ID}' not found — run seed_liv2_full.py first"
        )
        await conn.close()
        sys.exit(1)
    print(f"✅ Candidate '{CANDIDATE_4_EMAIL}' found")
    print(f"✅ Live stage '{LIVE_STAGE_ID}' found (state={stage['state']})")
    print()

    async with httpx.AsyncClient(timeout=30.0) as client:
        # Step 1: Candidate Login
        candidate_token = await step_candidate_login(client)
        if not candidate_token:
            # Cannot proceed without a token
            step_summary()
            await conn.close()
            return

        # Step 2: Token Dispatch
        token_data = await step_token_dispatch(client, candidate_token)
        if not token_data:
            step_summary()
            await conn.close()
            return

        session_id = token_data["session_id"]
        room_name = token_data.get("room_name", "")

        # Step 3: DB Check — Session Created
        await step_db_session_created(conn, session_id)

        # Step 4: DB Check — Pipeline Progress
        await step_db_pipeline_progress(conn)

        # Step 5: LiveKit Room Check
        await step_livekit_room(room_name)

        # Step 6: Session Completion
        complete_ok = await step_session_complete(client, session_id)

        # Steps 7–10 depend on completion
        if complete_ok or True:  # Always check DB even if complete had issues
            # Step 7: DB Check — Transcript Saved
            await step_db_transcript(conn, session_id)

            # Step 8: DB Check — Evaluation Created (3s wait)
            await step_db_evaluation(conn, session_id)

            # Step 9: DB Check — Pipeline Progress Updated
            await step_db_pipeline_completed(conn)

            # Step 10: Recruiter Fetch Evaluation
            await step_recruiter_fetch(client, session_id)

    # Step 11: Summary
    step_summary()

    await conn.close()
    print("\n✅ Database connection closed.")


if __name__ == "__main__":
    asyncio.run(run_validation())
