"""
validate_liv2_seed.py — Comprehensive DB validation for LiV2 full-journey seed.
Run: cd EraMatch/backend && python -m app.utils.validate_liv2_seed
"""
import asyncio
import json
import os
import sys
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv(dotenv_path=Path(__file__).resolve().parents[3] / ".env")
    load_dotenv()
except ImportError:
    pass

import asyncpg

RAW_DB_URL = os.environ.get("DATABASE_URL", "")
for _p in ("postgresql+asyncpg://", "postgres+asyncpg://"):
    if RAW_DB_URL.startswith(_p):
        RAW_DB_URL = "postgresql://" + RAW_DB_URL[len(_p):]

# ── Seed constants ────────────────────────────────────────────────────────────
GRP_ID     = "a0000003-0000-0000-0000-000000000003"
ASM_ID     = "a0000020-0000-0000-0000-000000000020"
RUB_ID     = "a0000040-0000-0000-0000-000000000040"
BNK_ID     = "a0000041-0000-0000-0000-000000000041"

CANDS = [
    {
        "id":      "e0000001-0000-0000-0000-000000000001",
        "name":    "Sara Al-Harthi",
        "email":   "sara.alharthi@example.com",
        "app_id":  "f0000001-0000-0000-0000-000000000001",
        "oas_id":  "f0000021-0000-0000-0000-000000000021",
        "oint_id": "f0000031-0000-0000-0000-000000000031",
        "ses_id":  "f0000041-0000-0000-0000-000000000041",
        "eval_id": "f0000051-0000-0000-0000-000000000051",
        "prg_liv": "f0000063-0000-0000-0000-000000000063",
        "exp_pct": 84,
        "exp_verdict": "strong_pass",
    },
    {
        "id":      "e0000002-0000-0000-0000-000000000002",
        "name":    "Omar Khaled",
        "email":   "omar.khaled@example.com",
        "app_id":  "f0000002-0000-0000-0000-000000000002",
        "oas_id":  "f0000022-0000-0000-0000-000000000022",
        "oint_id": "f0000032-0000-0000-0000-000000000032",
        "ses_id":  "f0000042-0000-0000-0000-000000000042",
        "eval_id": "f0000052-0000-0000-0000-000000000052",
        "prg_liv": "f0000066-0000-0000-0000-000000000066",
        "exp_pct": 68,
        "exp_verdict": "borderline",
    },
    {
        "id":      "e0000003-0000-0000-0000-000000000003",
        "name":    "Lina Farouk",
        "email":   "lina.farouk@example.com",
        "app_id":  "f0000003-0000-0000-0000-000000000003",
        "oas_id":  "f0000023-0000-0000-0000-000000000023",
        "oint_id": "f0000033-0000-0000-0000-000000000033",
        "ses_id":  "f0000043-0000-0000-0000-000000000043",
        "eval_id": "f0000053-0000-0000-0000-000000000053",
        "prg_liv": "f0000069-0000-0000-0000-000000000069",
        "exp_pct": 75,
        "exp_verdict": "pass",
    },
]

ok_count  = 0
err_count = 0
fix_sqls  = []


def P(icon, msg):
    print(f"  {icon}  {msg}")


def record(passed: bool, msg: str, fix_sql: str = None):
    global ok_count, err_count
    if passed:
        ok_count += 1
        P("✅", msg)
    else:
        err_count += 1
        P("❌", msg)
        if fix_sql:
            fix_sqls.append(fix_sql)


async def run():
    if not RAW_DB_URL:
        print("❌ DATABASE_URL not set")
        sys.exit(1)

    conn = await asyncpg.connect(RAW_DB_URL, statement_cache_size=0)

    print()
    print("=" * 65)
    print("  EraMatch LiV2 Seed — Comprehensive DB Validation")
    print("=" * 65)

    # ── 1. Pipeline stages ────────────────────────────────────────────────────
    print("\n📋 1. Group Pipeline Stages")
    stages = await conn.fetch(
        "SELECT stage_type, state, stage_order FROM group_pipeline_stages "
        "WHERE group_id = $1 ORDER BY stage_order",
        GRP_ID,
    )
    record(len(stages) == 3, f"stage count = {len(stages)} (expected 3)")
    for s in stages:
        is_ok = (s["stage_type"] == "live_interview" and s["state"] == "active") or s["state"] == "closed"
        icon = "✅" if is_ok else "⚠️ "
        print(f"    {icon}  [{s['stage_order']}] {s['stage_type']} → {s['state']}")

    # ── 2. LiV2 Rubric + Bank ─────────────────────────────────────────────────
    print("\n📋 2. LiV2 Rubric + Bank")
    rub = await conn.fetchrow(
        "SELECT state, time_budget_minutes, dimensions FROM li_v2_rubrics WHERE rubric_id = $1", RUB_ID
    )
    if rub:
        dims = rub["dimensions"] if isinstance(rub["dimensions"], list) else json.loads(rub["dimensions"])
        record(rub["state"] == "frozen", f"Rubric: state={rub['state']} budget={rub['time_budget_minutes']}min dims={len(dims)}")
    else:
        record(False, "Rubric NOT FOUND")

    bnk = await conn.fetchrow(
        "SELECT state, items FROM li_v2_banks WHERE bank_id = $1", BNK_ID
    )
    if bnk:
        items = bnk["items"] if isinstance(bnk["items"], list) else json.loads(bnk["items"])
        record(bnk["state"] == "frozen" and len(items) == 3,
               f"Bank: state={bnk['state']} items={len(items)} (expected 3)")
    else:
        record(False, "Bank NOT FOUND")

    # ── 3. Assessment config ──────────────────────────────────────────────────
    print("\n📋 3. Assessment Config + Sections + Pool")
    asm = await conn.fetchrow(
        "SELECT title, status FROM assessments WHERE assessment_id = $1", ASM_ID
    )
    record(bool(asm), f"Assessment: {asm['title'][:40] if asm else 'NOT FOUND'}")
    sec_count = await conn.fetchval(
        "SELECT COUNT(*) FROM assessment_sections WHERE assessment_id = $1", ASM_ID
    )
    record(sec_count == 2, f"Sections count = {sec_count} (expected 2)")
    pool_count = await conn.fetchval(
        "SELECT COUNT(*) FROM section_question_pool WHERE section_id IN "
        "(SELECT section_id FROM assessment_sections WHERE assessment_id = $1)",
        ASM_ID,
    )
    record(pool_count == 13, f"Pool entries = {pool_count} (expected 13)")

    # ── 4. Per-candidate checks ───────────────────────────────────────────────
    print("\n📋 4. Per-Candidate Deep Check")
    for c in CANDS:
        print(f"\n  ─── {c['name']} ───")

        # Profile
        prof = await conn.fetchrow(
            "SELECT full_name, email, password_hash FROM candidate_profiles WHERE candidate_id = $1",
            c["id"],
        )
        record(
            bool(prof and prof["email"] == c["email"] and prof["password_hash"]),
            f"profile: email={prof['email'] if prof else 'MISSING'} hash={'OK' if (prof and prof['password_hash']) else '❌'}",
        )

        # Application
        app = await conn.fetchrow(
            "SELECT status, group_id FROM candidate_applications WHERE application_id = $1",
            c["app_id"],
        )
        record(
            bool(app and app["group_id"]),
            f"application: status={app['status'] if app else 'MISSING'} group={'assigned' if (app and app['group_id']) else '❌ NULL'}",
        )

        # CV Analysis
        cva = await conn.fetchrow(
            "SELECT experience_years, match_score FROM cv_analysis WHERE application_id = $1",
            c["app_id"],
        )
        record(
            bool(cva),
            f"cv_analysis: exp={cva['experience_years']}yr match={cva['match_score']}%" if cva else "cv_analysis: NOT FOUND",
        )

        # Ongoing Assessment
        oas = await conn.fetchrow(
            "SELECT status, total_score, max_points FROM ongoing_assessments WHERE session_id = $1",
            c["oas_id"],
        )
        record(
            bool(oas and oas["status"] == "submitted"),
            f"assessment_session: status={oas['status'] if oas else 'MISSING'} score={oas['total_score']}/{oas['max_points'] if oas else '?'}",
        )

        # AI Interview
        oint = await conn.fetchrow(
            "SELECT status, overall_score FROM ongoing_interviews WHERE session_id = $1",
            c["oint_id"],
        )
        turns = await conn.fetchval(
            "SELECT COUNT(*) FROM ai_interview_turns WHERE session_id = $1", c["oint_id"]
        )
        resps = await conn.fetchval(
            "SELECT COUNT(*) FROM interview_responses WHERE session_id = $1", c["oint_id"]
        )
        record(
            bool(oint and oint["status"] == "completed" and turns == 6 and resps == 3),
            f"ai_interview: status={oint['status'] if oint else 'MISSING'} turns={turns} responses={resps}",
        )

        # LiV2 Session
        ses = await conn.fetchrow(
            "SELECT state, duration_seconds, room_name, transcript, context_pool "
            "FROM li_v2_sessions WHERE session_id = $1",
            c["ses_id"],
        )
        if ses:
            tx = ses["transcript"]
            tx_list = tx if isinstance(tx, list) else (json.loads(tx) if tx else [])
            ctx = ses["context_pool"]
            ctx_exists = bool(ctx)
            record(
                ses["state"] == "completed" and len(tx_list) > 0 and ctx_exists,
                f"liv2_session: state={ses['state']} transcript_turns={len(tx_list)} ctx={'OK' if ctx_exists else '❌'}",
            )
        else:
            record(False, f"liv2_session {c['ses_id']}: NOT FOUND")

        # LiV2 Evaluation
        ev = await conn.fetchrow(
            "SELECT overall_score_pct, auto_verdict, meets_criteria, evaluation_confidence "
            "FROM li_v2_evaluations WHERE evaluation_id = $1",
            c["eval_id"],
        )
        if ev:
            pct_ok = ev["overall_score_pct"] == c["exp_pct"]
            v_ok   = ev["auto_verdict"] == c["exp_verdict"]
            record(
                pct_ok and v_ok,
                f"liv2_evaluation: {ev['overall_score_pct']}% {ev['auto_verdict']} meets={ev['meets_criteria']} conf={ev['evaluation_confidence']}",
            )
        else:
            record(False, f"liv2_evaluation {c['eval_id']}: NOT FOUND")

        # Pipeline Progress — live interview
        prg = await conn.fetchrow(
            "SELECT status, session_id FROM candidate_pipeline_progress WHERE progress_id = $1",
            c["prg_liv"],
        )
        if prg:
            ready = prg["status"] in ("unlocked", "in_progress")
            record(
                ready,
                f"live_interview_progress: status='{prg['status']}'"
                + ("  → 'Start Now' visible on portal ✓" if ready else "  ← NEEDS RESET (run fix SQL below)"),
                fix_sql=(
                    f"UPDATE candidate_pipeline_progress "
                    f"SET status='unlocked', started_at=NULL, completed_at=NULL, score=NULL, passed=NULL, session_id=NULL "
                    f"WHERE progress_id = '{c['prg_liv']}';"
                ) if not ready else None,
            )
        else:
            record(False, f"live_interview_progress {c['prg_liv']}: NOT FOUND")

    # ── SUMMARY ───────────────────────────────────────────────────────────────
    print()
    print("=" * 65)
    if err_count == 0:
        print(f"  🎉  ALL {ok_count} CHECKS PASSED — data is clean and ready!")
    else:
        print(f"  ✅  {ok_count} passed    ❌  {err_count} failed")
        if fix_sqls:
            print()
            print("  🔧  Run these SQL fixes in Supabase SQL editor:")
            for sql in fix_sqls:
                print(f"      {sql}")
    print("=" * 65)
    print()

    await conn.close()


def main():
    asyncio.run(run())


if __name__ == "__main__":
    main()
