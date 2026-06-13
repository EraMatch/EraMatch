"""
seed_demo_candidates.py — Create 15 demo candidates across 3 stages.
Run: cd EraMatch/backend && .venv/bin/python -m app.utils.seed_demo_candidates
"""

import os, json, asyncio
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from pathlib import Path
from uuid import uuid4
import bcrypt

try:
    from dotenv import load_dotenv

    env = Path(__file__).resolve().parents[3] / "backend" / ".env"
    if env.exists():
        load_dotenv(env)
except ImportError:
    pass

import asyncpg

RAW_DB_URL = os.getenv("DATABASE_URL", "").replace(
    "postgresql+asyncpg://", "postgresql://"
)
if not RAW_DB_URL:
    raise SystemExit("DATABASE_URL not set")

DEFAULT_HASH = bcrypt.hashpw(b"admin12345", bcrypt.gensalt(rounds=12)).decode()
NOW = datetime.now(timezone.utc)


def ts(days=0, hours=0):
    return NOW - timedelta(days=days, hours=hours)


async def fetch_one(conn, sql, *args):
    row = await conn.fetchrow(sql, *args)
    return str(row[0]) if row else None


def make_cands(stage_type, names, emails, **extra):
    return [
        {"name": n, "email": e, "stage": stage_type, **extra}
        for n, e in zip(names, emails)
    ]


LIVE_CANDS = make_cands(
    "live_interview",
    ["Maya Hassan", "Omar Farid", "Sara Nasser", "Ali Mahmoud", "Nour Youssef"],
    [
        "maya.hassan@demo.local",
        "omar.farid@demo.local",
        "sara.nasser@demo.local",
        "ali.mahmoud@demo.local",
        "nour.youssef@demo.local",
    ],
)

AI_CANDS = make_cands(
    "ai_interview",
    ["Rami Khaled", "Lina Tariq", "Khaled Samir", "Amina Salah", "Hassan Adel"],
    [
        "rami.khaled@demo.local",
        "lina.tariq@demo.local",
        "khaled.samir@demo.local",
        "amina.salah@demo.local",
        "hassan.adel@demo.local",
    ],
)

ASM_CANDS = make_cands(
    "assessment",
    ["Youssef Tamer", "Dina Karim", "Fadi Amr", "Hana Rashid", "Tarek Hossam"],
    [
        "youssef.tamer@demo.local",
        "dina.karim@demo.local",
        "fadi.amr@demo.local",
        "hana.rashid@demo.local",
        "tarek.hossam@demo.local",
    ],
)

ALL_CANDS = LIVE_CANDS + AI_CANDS + ASM_CANDS


async def create_candidate(conn, org_id, pos_id, group_id, stage_id, c):
    cid = str(uuid4())
    app_id = str(uuid4())

    await conn.execute(
        """INSERT INTO candidate_profiles (candidate_id, organization_id, full_name, email, location, password_hash, created_at)
            VALUES ($1,$2,$3,$4,'Dubai, UAE',$5,$6)
            ON CONFLICT (candidate_id) DO UPDATE SET full_name=EXCLUDED.full_name, email=EXCLUDED.email, password_hash=EXCLUDED.password_hash""",
        cid,
        org_id,
        c["name"],
        c["email"],
        DEFAULT_HASH,
        ts(5),
    )
    await conn.execute(
        """INSERT INTO candidate_applications (application_id, candidate_id, position_id, group_id, organization_id, status, applied_at)
            VALUES ($1,$2,$3,$4,$5,'applied',$6)
            ON CONFLICT (application_id) DO UPDATE SET group_id=EXCLUDED.group_id""",
        app_id,
        cid,
        pos_id,
        group_id,
        org_id,
        ts(4),
    )
    await conn.execute(
        """INSERT INTO candidate_pipeline_progress (progress_id, application_id, stage_id, status, score, max_score, passed, unlocked_at, started_at, completed_at)
            VALUES ($1,$2,$3,'unlocked',NULL,100,NULL,$4,NULL,NULL)
            ON CONFLICT (application_id, stage_id) DO UPDATE SET status='unlocked', unlocked_at=EXCLUDED.unlocked_at""",
        str(uuid4()),
        app_id,
        stage_id,
        ts(2),
    )
    return cid, app_id


async def run_seed():
    conn = await asyncpg.connect(RAW_DB_URL, statement_cache_size=0)
    try:
        org_id = await fetch_one(
            conn,
            "SELECT organization_id FROM organizations WHERE admin_email = 'admin_1@eramatch.com' LIMIT 1",
        )
        hr_id = await fetch_one(
            conn,
            "SELECT user_id FROM organization_users WHERE email = 'hr@eramatch.com' LIMIT 1",
        )
        tech_id = await fetch_one(
            conn,
            "SELECT user_id FROM organization_users WHERE email = 'tech@eramatch.com' LIMIT 1",
        )
        if not org_id or not hr_id or not tech_id:
            raise SystemExit("run seed_data.py first")

        pos_id = await fetch_one(
            conn,
            "SELECT position_id FROM positions WHERE organization_id = $1 AND status = 'open' LIMIT 1",
            org_id,
        )
        if not pos_id:
            raise SystemExit("No open position")
        print(f"org={org_id}\nhr={hr_id}\ntech={tech_id}\npos={pos_id}\n")

        groups = [
            {"name": "Demo Assessment", "type": "assessment", "cands": ASM_CANDS},
            {"name": "Demo AI Interview", "type": "ai_interview", "cands": AI_CANDS},
            {
                "name": "Demo Live Interview",
                "type": "live_interview",
                "cands": LIVE_CANDS,
            },
        ]

        all_credentials = []
        for gi, g in enumerate(groups):
            gid = str(uuid4())
            print(f"\n{'=' * 50}\nGroup: {g['name']} [{gid[:8]}]\n{'=' * 50}")

            await conn.execute(
                """INSERT INTO candidate_groups (group_id, organization_id, position_id, group_name, assigned_hr_id, assigned_tech_id, status, created_at)
                    VALUES ($1,$2,$3,$4,$5,$6,'active',$7)
                    ON CONFLICT (group_id) DO UPDATE SET status='active'""",
                gid,
                org_id,
                pos_id,
                g["name"],
                hr_id,
                tech_id,
                ts(3),
            )

            # Create config for active stage
            config_ids = {}
            if g["type"] == "assessment":
                aid = str(uuid4())
                await conn.execute(
                    """INSERT INTO assessments (assessment_id, organization_id, position_id, group_id, title, description, instructions, duration_minutes, passing_score, shuffle_sections, anti_cheating_enabled, status, created_by_user_id, created_at, updated_at)
                        VALUES ($1,$2,$3,$4,$5,$6,$7,45,70,false,true,'published',$8,$9,$10)
                        ON CONFLICT (assessment_id) DO UPDATE SET status='published'""",
                    aid,
                    org_id,
                    pos_id,
                    gid,
                    "Demo Technical Assessment",
                    "React + TypeScript fundamentals",
                    "45 min, no external resources",
                    tech_id,
                    ts(5),
                    ts(5),
                )
                config_ids["assessment"] = aid
            elif g["type"] == "ai_interview":
                aic_id = str(uuid4())
                await conn.execute(
                    """INSERT INTO ai_interview_configs (config_id, organization_id, position_id, title, interview_type, instructions, max_retakes, think_time_seconds, answer_time_seconds, questions, difficulty, total_duration_minutes, show_ai_feedback, recording_required, created_by_user_id, created_at, updated_at)
                        VALUES ($1,$2,$3,$4,'recorded',$5,1,30,120,$6,'Mid Level',30,true,true,$7,$8,$9)
                        ON CONFLICT (config_id) DO UPDATE SET title=EXCLUDED.title""",
                    aic_id,
                    org_id,
                    pos_id,
                    "Demo AI Interview",
                    "3 video questions",
                    json.dumps(
                        {
                            "questions": [
                                {
                                    "id": "aiq1",
                                    "order": 1,
                                    "text": "Describe your React experience",
                                    "think_time": 30,
                                    "answer_time": 120,
                                }
                            ]
                        }
                    ),
                    tech_id,
                    ts(5),
                    ts(5),
                )
                config_ids["ai_interview"] = aic_id
            elif g["type"] == "live_interview":
                lic_id = str(uuid4())
                await conn.execute(
                    """INSERT INTO live_interview_configs (config_id, organization_id, position_id, title, duration_minutes, instructions, created_at)
                        VALUES ($1,$2,$3,$4,10,$5,$6)
                        ON CONFLICT (config_id) DO UPDATE SET title=EXCLUDED.title""",
                    lic_id,
                    org_id,
                    pos_id,
                    "Demo Live Interview",
                    "AI-powered live interview",
                    ts(5),
                )
                config_ids["live_interview"] = lic_id

            stage_ids = {}
            for order, (stype, sname) in enumerate(
                [
                    ("assessment", "Technical Assessment"),
                    ("ai_interview", "AI Video Interview"),
                    ("live_interview", "Live AI Interview"),
                ],
                1,
            ):
                sid = str(uuid4())
                is_active = stype == g["type"]
                cfg_id = config_ids.get(stype) if is_active else None
                await conn.execute(
                    """INSERT INTO group_pipeline_stages (stage_id, group_id, organization_id, stage_type, stage_order, stage_name, state, config_id, started_at, started_by_user_id, created_at, updated_at)
                        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
                        ON CONFLICT (stage_id) DO UPDATE SET state=EXCLUDED.state, config_id=EXCLUDED.config_id""",
                    sid,
                    gid,
                    org_id,
                    stype,
                    order,
                    sname,
                    "active" if is_active else "not_started",
                    cfg_id,
                    ts(2) if is_active else None,
                    hr_id if is_active else None,
                    ts(3),
                    ts(2) if is_active else ts(3),
                )
                stage_ids[stype] = sid

            # For AI group, mark assessment completed
            # For Live group, mark assessment + ai completed
            # For Assessment group, only assessment unlocked
            for ci, c in enumerate(g["cands"]):
                cid, app_id = await create_candidate(
                    conn, org_id, pos_id, gid, stage_ids[g["type"]], c
                )

                if g["type"] in ("ai_interview", "live_interview"):
                    asm_stage = stage_ids.get("assessment")
                    if asm_stage:
                        await conn.execute(
                            """INSERT INTO candidate_pipeline_progress (progress_id, application_id, stage_id, status, score, max_score, passed, unlocked_at, started_at, completed_at)
                                VALUES ($1,$2,$3,'completed',78,100,true,$4,$5,$6)
                                ON CONFLICT (application_id, stage_id) DO UPDATE SET status='completed', score=EXCLUDED.score""",
                            str(uuid4()),
                            app_id,
                            asm_stage,
                            ts(10, 2),
                            ts(10, 2),
                            ts(10),
                        )

                if g["type"] == "live_interview":
                    ai_stage = stage_ids.get("ai_interview")
                    if ai_stage:
                        await conn.execute(
                            """INSERT INTO candidate_pipeline_progress (progress_id, application_id, stage_id, status, score, max_score, passed, unlocked_at, started_at, completed_at)
                                VALUES ($1,$2,$3,'completed',72,100,true,$4,$5,$6)
                                ON CONFLICT (application_id, stage_id) DO UPDATE SET status='completed', score=EXCLUDED.score""",
                            str(uuid4()),
                            app_id,
                            ai_stage,
                            ts(8),
                            ts(7, 3),
                            ts(7),
                        )

                all_credentials.append(
                    {
                        "name": c["name"],
                        "email": c["email"],
                        "stage": g["type"],
                        "group": g["name"],
                    }
                )
                print(f"  {ci + 1}. {c['name']} <{c['email']}>")

        print("\n" + "=" * 50)
        print("SEED COMPLETE")
        print("=" * 50)
        print("\nLive Interview (ready to start live video):")
        for c in all_credentials:
            if c["stage"] == "live_interview":
                print(f"  {c['name']:<20} {c['email']}")
        print("\nAI Interview (ready for video questions):")
        for c in all_credentials:
            if c["stage"] == "ai_interview":
                print(f"  {c['name']:<20} {c['email']}")
        print("\nAssessment:")
        for c in all_credentials:
            if c["stage"] == "assessment":
                print(f"  {c['name']:<20} {c['email']}")
        print("\nAll passwords: admin12345")

        # Save to file
        creds_file = Path(__file__).resolve().parents[3] / "DEMO_CANDIDATES.md"
        with open(creds_file, "w") as f:
            f.write("# Demo Candidates (password: admin12345)\n\n")
            f.write(
                "## Live Interview (click 'Start Now' to begin live AI interview)\n"
            )
            for c in all_credentials:
                if c["stage"] == "live_interview":
                    f.write(f"- {c['name']}: `{c['email']}`\n")
            f.write("\n## AI Interview (ready for recorded video responses)\n")
            for c in all_credentials:
                if c["stage"] == "ai_interview":
                    f.write(f"- {c['name']}: `{c['email']}`\n")
            f.write("\n## Assessment (ready for technical test)\n")
            for c in all_credentials:
                if c["stage"] == "assessment":
                    f.write(f"- {c['name']}: `{c['email']}`\n")
        print(f"\nCredentials saved to: {creds_file}")

    finally:
        await conn.close()


def main():
    asyncio.run(run_seed())


if __name__ == "__main__":
    main()
