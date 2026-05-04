"""
seed_liv2.py — Live Interview V2 Seeding Script
================================================
Creates a complete, realistic data slice for demo/testing the LiV2 feature:

  Organization (reuses existing: admin_1@eramatch.com)
  └─ Project: "AI Hiring Demo"
       └─ Position: "Senior React Developer" (open, assigned to hr + tech)
            └─ CandidateGroup: "Batch A — Frontend"
                 └─ group_pipeline_stages (3 stages — live_interview active)
                 └─ li_v2_rubrics (frozen)
                 └─ li_v2_banks (frozen)
                 └─ 3 Candidates with applications + CV analysis
                      └─ candidate_pipeline_progress (live_interview stage)
                      └─ li_v2_sessions (2 completed, 1 in_progress)
                           └─ li_v2_evaluations (for completed sessions)

Usage:
    cd EraMatch/backend
    source .venv/bin/activate
    python -m app.utils.seed_liv2

Credentials after seeding:
    Recruiter (HR):       hr@eramatch.com       / admin12345
    Tech Recruiter:       tech@eramatch.com     / admin12345
    Admin:                admin_1@eramatch.com  / admin12345
    Candidate 1 (Sara):   sara.alharthi@example.com  / admin12345
    Candidate 2 (Omar):   omar.khaled@example.com    / admin12345
    Candidate 3 (Lina):   lina.farouk@example.com    / admin12345
"""

import os
import json
import asyncio
import sys
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import uuid4, UUID
from pathlib import Path

# ── Load .env from backend root ────────────────────────────────────────────────
try:
    from dotenv import load_dotenv
    env_path = Path(__file__).resolve().parents[3] / ".env"
    if env_path.exists():
        load_dotenv(dotenv_path=env_path)
    else:
        load_dotenv()  # fall back to CWD .env
except ImportError:
    # python-dotenv not installed — try manual parse
    env_path = Path(__file__).resolve().parents[3] / ".env"
    if env_path.exists():
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip())

import asyncpg
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

# ── DB URL — strip +asyncpg prefix for raw asyncpg driver ─────────────────────
RAW_DB_URL = os.environ.get("DATABASE_URL", "")
if RAW_DB_URL.startswith("postgresql+asyncpg://"):
    RAW_DB_URL = RAW_DB_URL.replace("postgresql+asyncpg://", "postgresql://")
elif RAW_DB_URL.startswith("postgres+asyncpg://"):
    RAW_DB_URL = RAW_DB_URL.replace("postgres+asyncpg://", "postgresql://")

# ── Fixed UUIDs so the script is idempotent (re-runnable) ─────────────────────
ORG_EMAIL         = "admin_1@eramatch.com"
HR_EMAIL          = "hr@eramatch.com"
TECH_EMAIL        = "tech@eramatch.com"
DEFAULT_HASH      = pwd_context.hash("admin12345")

# Dimension IDs (stable across runs)
DIM_TECH   = "11111111-1111-1111-1111-111111111101"
DIM_PROB   = "11111111-1111-1111-1111-111111111102"
DIM_COMM   = "11111111-1111-1111-1111-111111111103"

# Bank item IDs
ITEM_1 = "22222222-2222-2222-2222-222222222201"
ITEM_2 = "22222222-2222-2222-2222-222222222202"
ITEM_3 = "22222222-2222-2222-2222-222222222203"

# Candidate IDs
CAND_1_ID = "33333333-3333-3333-3333-333333333301"
CAND_2_ID = "33333333-3333-3333-3333-333333333302"
CAND_3_ID = "33333333-3333-3333-3333-333333333303"

# Application IDs
APP_1_ID = "44444444-4444-4444-4444-444444444401"
APP_2_ID = "44444444-4444-4444-4444-444444444402"
APP_3_ID = "44444444-4444-4444-4444-444444444403"

# Session IDs
SES_1_ID = "55555555-5555-5555-5555-555555555501"
SES_2_ID = "55555555-5555-5555-5555-555555555502"
SES_3_ID = "55555555-5555-5555-5555-555555555503"

# Evaluation IDs
EVAL_1_ID = "66666666-6666-6666-6666-666666666601"
EVAL_2_ID = "66666666-6666-6666-6666-666666666602"

NOW = datetime.now(timezone.utc)


async def fetch_user_id(conn, email: str) -> str | None:
    row = await conn.fetchrow(
        "SELECT user_id FROM organization_users WHERE email = $1 LIMIT 1", email
    )
    return str(row["user_id"]) if row else None


async def fetch_org_id(conn, admin_email: str) -> str | None:
    row = await conn.fetchrow(
        "SELECT organization_id FROM organizations WHERE admin_email = $1 LIMIT 1", admin_email
    )
    return str(row["organization_id"]) if row else None


# ── Helpers ───────────────────────────────────────────────────────────────────

def ts(days_ago: int = 0, hours_ago: int = 0) -> datetime:
    return NOW - timedelta(days=days_ago, hours=hours_ago)


def build_context_pool(cand_name: str, skills: list[str], exp_summary: str, weak_topics: list[str]) -> dict:
    return {
        "position_title": "Senior React Developer",
        "jd_excerpt": (
            "We are looking for a passionate Senior React Developer to lead our frontend team. "
            "You will build scalable, high-performance web applications using React, TypeScript, "
            "and GraphQL. You'll collaborate with design, backend, and product teams."
        ),
        "top_skills": skills,
        "experience_summary": exp_summary,
        "weak_assessment_topics": weak_topics,
        "candidate_name": cand_name,
    }


def build_transcript(cand_name: str, variant: int = 1) -> list[dict]:
    """Returns a realistic 12-turn interview transcript."""
    first = cand_name.split()[0]
    transcripts = {
        1: [
            {"role": "agent",     "text": f"Hello {first}! Welcome to your Live Interview for the Senior React Developer position. Ready to begin?", "phase": "opening", "timestamp": 0},
            {"role": "candidate", "text": "Yes, absolutely! Happy to be here.", "phase": "opening", "timestamp": 8},
            {"role": "agent",     "text": "Great. Let's start with Technical Depth. Can you explain how React's reconciliation algorithm and virtual DOM diffing work under the hood?", "phase": "pillar_1", "timestamp": 18},
            {"role": "candidate", "text": "Sure. React maintains a virtual DOM — a lightweight JS representation of the real DOM. When state changes, it re-renders the virtual tree and diffs it against the previous snapshot. It uses a heuristic O(n) algorithm — if root element types differ, it tears down and rebuilds. For same-type elements it updates only changed props. Keys on lists are critical to prevent unnecessary re-mounts.", "phase": "pillar_1", "timestamp": 42},
            {"role": "agent",     "text": "Excellent. Now for Problem Solving — your API response times degrade under load. Walk me through your debugging and resolution approach.", "phase": "pillar_2", "timestamp": 110},
            {"role": "candidate", "text": "First I'd profile — Chrome DevTools for the network layer, checking TTFB and payload sizes. Then I'd look at server-side metrics: Datadog or CloudWatch for p95 latency spikes. Common culprits are N+1 queries, missing indexes, or heavy synchronous work on the main thread. I'd add pagination, caching with Redis for hot reads, and consider moving compute-heavy work to background tasks.", "phase": "pillar_2", "timestamp": 145},
            {"role": "agent",     "text": "Good. Let's shift to Communication. Tell me about a time you had to push back on a design decision. What was the situation and outcome?", "phase": "pillar_3", "timestamp": 230},
            {"role": "candidate", "text": "At Acme Corp, the PM wanted to remove all loading skeletons to save dev time. I felt that would hurt perceived performance significantly. I built a quick A/B prototype with and without them and shared it in a design review. The skeleton version scored 30% higher on perceived speed in our user survey. We kept them.", "phase": "pillar_3", "timestamp": 262},
            {"role": "agent",     "text": "That's a great example of using data to influence decisions. One last question — how do you stay current with the React ecosystem given how fast it evolves?", "phase": "pillar_3", "timestamp": 335},
            {"role": "candidate", "text": "I follow the React RFC repo on GitHub, subscribe to This Week In React newsletter, and participate in the Reactiflux Discord. I try to build small experiments with new features like React 19's use() hook and server components before adopting them in production.", "phase": "pillar_3", "timestamp": 358},
            {"role": "agent",     "text": f"Fantastic {first}. We've covered all our areas. Thanks for your thoughtful answers — we'll be in touch soon!", "phase": "closing", "timestamp": 440},
            {"role": "candidate", "text": "Thank you! This was a great conversation.", "phase": "closing", "timestamp": 448},
        ],
        2: [
            {"role": "agent",     "text": f"Hello {first}! Let's dive right in. This interview covers Technical Depth, Problem Solving, and Communication. Are you ready?", "phase": "opening", "timestamp": 0},
            {"role": "candidate", "text": "Ready, let's go.", "phase": "opening", "timestamp": 6},
            {"role": "agent",     "text": "Walk me through how React handles re-renders and what optimizations you use to avoid unnecessary ones.", "phase": "pillar_1", "timestamp": 15},
            {"role": "candidate", "text": "React re-renders a component when state or props change. To avoid unnecessary re-renders I use React.memo for pure components, useMemo for expensive derived values, and useCallback for stable function references passed to children. I also use code splitting and lazy loading for large trees.", "phase": "pillar_1", "timestamp": 45},
            {"role": "agent",     "text": "Good. A junior dev on your team pushed code that caused a memory leak in a production React app. How do you approach debugging and fixing it?", "phase": "pillar_2", "timestamp": 100},
            {"role": "candidate", "text": "I'd look at Chrome's Memory panel — take heap snapshots over time and identify detached DOM nodes or closure references that aren't being collected. Common culprits are useEffect with subscriptions missing cleanup functions, or global event listeners not removed on unmount. I'd add eslint-plugin-react-hooks to catch missing deps.", "phase": "pillar_2", "timestamp": 135},
            {"role": "agent",     "text": "Describe a situation where you had to balance technical quality with a tight deadline.", "phase": "pillar_3", "timestamp": 210},
            {"role": "candidate", "text": "We had a two-week sprint before a product launch. I negotiated with the PM to ship with a feature flag behind a toggle — core functionality tested thoroughly, edge cases deferred to the next sprint with logged tech debt tickets. This shipped on time while keeping quality bar intact.", "phase": "pillar_3", "timestamp": 242},
            {"role": "agent",     "text": "How do you approach mentoring junior developers on your team?", "phase": "pillar_3", "timestamp": 310},
            {"role": "candidate", "text": "I do pair programming sessions when they're stuck, but I try to ask Socratic questions rather than giving answers directly. I also do async code review with detailed comments explaining the 'why', and share articles or resources tied to the specific issue they hit.", "phase": "pillar_3", "timestamp": 345},
            {"role": "agent",     "text": f"Thank you {first}. You've done well. We'll be reviewing all candidates and following up.", "phase": "closing", "timestamp": 420},
            {"role": "candidate", "text": "Appreciate it, thank you!", "phase": "closing", "timestamp": 426},
        ],
        3: [  # in-progress — only first 4 turns
            {"role": "agent",     "text": f"Hi {first}! Welcome to the live AI interview. This will take about 10 minutes covering a few key areas.", "phase": "opening", "timestamp": 0},
            {"role": "candidate", "text": "Hi, thanks! I'm ready.", "phase": "opening", "timestamp": 7},
            {"role": "agent",     "text": "Perfect. Starting with Technical Depth — explain the difference between controlled and uncontrolled components in React.", "phase": "pillar_1", "timestamp": 16},
            {"role": "candidate", "text": "Controlled components have their state managed by React via useState — the input value is always in sync with component state. Uncontrolled components store their own state in the DOM and you access it via a ref. Controlled is preferred for form validation and dynamic behavior, uncontrolled for simple file inputs or performance-sensitive forms.", "phase": "pillar_1", "timestamp": 48},
        ],
    }
    return transcripts.get(variant, transcripts[1])


# ── Main Seed Logic ───────────────────────────────────────────────────────────

async def run_seed():
    print("=" * 60)
    print("  EraMatch — Live Interview V2 Seed Script")
    print("=" * 60)

    print(f"\n{'='*60}")
    print(f"""  ⚠️  NOTE: If seeding fails with 'column language does not exist',
  run this SQL in your Supabase SQL editor:

  ALTER TABLE li_v2_rubrics
    ADD COLUMN IF NOT EXISTS language VARCHAR(5) NOT NULL DEFAULT 'en',
    ADD COLUMN IF NOT EXISTS include_weak_topics BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS frozen_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES organization_users(user_id);
  ALTER TABLE li_v2_banks
    ADD COLUMN IF NOT EXISTS frozen_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES organization_users(user_id);
""")
    print(f"{'='*60}\n")

    if not RAW_DB_URL:
        print("❌ DATABASE_URL not found. Check your .env file.")
        sys.exit(1)

    print(f"✅ Connecting to database...")
    conn = await asyncpg.connect(RAW_DB_URL, statement_cache_size=0)

    try:
        # ── 0. Fetch existing org + users ─────────────────────────────────────
        org_id = await fetch_org_id(conn, ORG_EMAIL)
        if not org_id:
            print(f"❌ Organization with admin_email={ORG_EMAIL} not found. Run seed_data.py first.")
            return

        hr_id    = await fetch_user_id(conn, HR_EMAIL)
        tech_id  = await fetch_user_id(conn, TECH_EMAIL)

        if not hr_id or not tech_id:
            print(f"❌ HR or Tech user not found. Run seed_data.py first.")
            return

        print(f"✅ Org: {org_id}")
        print(f"✅ HR:  {hr_id}")
        print(f"✅ Tech:{tech_id}")

        # ── 1. Candidate profiles + portal accounts ────────────────────────────
        candidates = [
            {
                "id":        CAND_1_ID,
                "app_id":    APP_1_ID,
                "ses_id":    SES_1_ID,
                "eval_id":   EVAL_1_ID,
                "name":      "Sara Al-Harthi",
                "email":     "sara.alharthi@example.com",
                "phone":     "+971-50-123-4567",
                "location":  "Dubai, UAE",
                "github":    "https://github.com/saraalh",
                "linkedin":  "https://linkedin.com/in/saraalh",
                "skills":    ["React", "TypeScript", "Redux", "Jest", "Node.js", "GraphQL"],
                "exp_years": 5.0,
                "exp_summary": "5+ years as Senior Frontend Engineer at Acme Corp; built internal SaaS recruitment dashboards",
                "weak_topics": ["CSS Grid advanced layouts", "Webpack bundle optimization"],
                "match_score": 91.0,
                "ses_state":  "completed",
                "prog_status": "completed",
                "variant": 1,
                "score_pct": 84,
                "overall_score": 0.84,
                "verdict": "strong_pass",
                "meets_criteria": True,
                "dim_scores": {DIM_TECH: 0.90, DIM_PROB: 0.82, DIM_COMM: 0.80},
            },
            {
                "id":        CAND_2_ID,
                "app_id":    APP_2_ID,
                "ses_id":    SES_2_ID,
                "eval_id":   EVAL_2_ID,
                "name":      "Omar Khaled",
                "email":     "omar.khaled@example.com",
                "phone":     "+20-100-234-5678",
                "location":  "Cairo, Egypt",
                "github":    "https://github.com/omarkh",
                "linkedin":  "https://linkedin.com/in/omarkh",
                "skills":    ["React", "JavaScript", "CSS", "REST APIs", "Git"],
                "exp_years": 3.0,
                "exp_summary": "3 years as React Developer at Startup X; e-commerce and fintech UIs",
                "weak_topics": ["TypeScript generics", "React Server Components"],
                "match_score": 71.0,
                "ses_state":  "completed",
                "prog_status": "completed",
                "variant": 2,
                "score_pct": 68,
                "overall_score": 0.68,
                "verdict": "borderline",
                "meets_criteria": False,
                "dim_scores": {DIM_TECH: 0.72, DIM_PROB: 0.65, DIM_COMM: 0.67},
            },
            {
                "id":        CAND_3_ID,
                "app_id":    APP_3_ID,
                "ses_id":    SES_3_ID,
                "eval_id":   None,   # no evaluation yet — in_progress
                "name":      "Lina Farouk",
                "email":     "lina.farouk@example.com",
                "phone":     "+966-55-345-6789",
                "location":  "Riyadh, Saudi Arabia",
                "github":    "https://github.com/linaf",
                "linkedin":  "https://linkedin.com/in/linaf",
                "skills":    ["React", "TypeScript", "Vue.js", "TailwindCSS", "Firebase"],
                "exp_years": 4.0,
                "exp_summary": "4 years as Frontend Developer at TechVision; dashboards and design systems",
                "weak_topics": ["Performance profiling", "WebSockets"],
                "match_score": 83.0,
                "ses_state":  "in_progress",
                "prog_status": "in_progress",
                "variant": 3,
                "score_pct": None,
                "overall_score": None,
                "verdict": None,
                "meets_criteria": None,
                "dim_scores": None,
            },
        ]

        print("\n📁 Step 1 — Candidate profiles + portal accounts")
        for c in candidates:
            # Candidate profile (recruiting side)
            await conn.execute("""
                INSERT INTO candidate_profiles
                    (candidate_id, organization_id, full_name, email, phone, location, linkedin_url, github_url, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT (candidate_id) DO NOTHING
            """, c["id"], org_id, c["name"], c["email"], c["phone"], c["location"], c["linkedin"], c["github"], ts(10))
            print(f"  ✅ Profile: {c['name']} ({c['email']})")

        # ── 2. Project ─────────────────────────────────────────────────────────
        print("\n📁 Step 2 — Project")
        project_id = str(uuid4())
        await conn.execute("""
            INSERT INTO projects
                (project_id, organization_id, created_by_user_id, name, description, status, priority, created_at)
            VALUES ($1, $2, $3, $4, $5, 'active', 'high', $6)
        """, project_id, org_id, hr_id,
            "AI Hiring Demo",
            "Demo project for Live Interview V2 feature showcasing the full recruiter pipeline.",
            ts(30))
        await conn.execute("""
            INSERT INTO project_access (access_id, project_id, user_id, access_level)
            VALUES ($1, $2, $3, 'owner'), ($4, $2, $5, 'collaborator'), ($6, $2, $7, 'collaborator')
        """, str(uuid4()), project_id, hr_id,
             str(uuid4()), tech_id,
             str(uuid4()), await fetch_user_id(conn, ORG_EMAIL) or hr_id)
        print(f"  ✅ Project: AI Hiring Demo  [{project_id}]")

        # ── 3. Position ────────────────────────────────────────────────────────
        print("\n📁 Step 3 — Position")
        position_id = str(uuid4())
        jd = (
            "We are looking for a passionate and experienced Senior React Developer to join our growing product team. "
            "You will be responsible for building and maintaining high-performance, scalable frontend applications "
            "using React 18, TypeScript, GraphQL, and modern tooling. You will collaborate closely with product "
            "managers, UX designers, and backend engineers to deliver outstanding user experiences.\n\n"
            "Key responsibilities include: leading frontend architecture decisions, mentoring junior developers, "
            "conducting code reviews, optimizing performance, and contributing to our design system. "
            "You should be comfortable with CI/CD pipelines, testing (Jest, Cypress), and Agile workflows."
        )
        await conn.execute("""
            INSERT INTO positions
                (position_id, organization_id, project_id, job_title, job_description,
                 required_skills, experience_level, work_type, employment_type, location_type,
                 years_of_experience, salary_min, salary_max, status,
                 assigned_hr_id, assigned_tech_id, created_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'open',$14,$15,$16)
        """, position_id, org_id, project_id,
            "Senior React Developer", jd,
            json.dumps(["React", "TypeScript", "Node.js", "GraphQL", "AWS", "Jest"]),
            "Senior Level", "Remote", "full-time", "remote",
            4, 110000, 155000,
            hr_id, tech_id, ts(25))
        print(f"  ✅ Position: Senior React Developer  [{position_id}]")

        # ── 4. Candidate Group ─────────────────────────────────────────────────
        print("\n📁 Step 4 — Candidate Group")
        group_id = str(uuid4())
        await conn.execute("""
            INSERT INTO candidate_groups
                (group_id, organization_id, position_id, group_name,
                 assigned_hr_id, assigned_tech_id, status, created_at)
            VALUES ($1,$2,$3,'Batch A — Frontend',$4,$5,'active',$6)
        """, group_id, org_id, position_id, hr_id, tech_id, ts(20))
        print(f"  ✅ Group: Batch A — Frontend  [{group_id}]")

        # ── 5. Live Interview Config (required by trigger for active stage) ────
        print("\n📁 Step 5a — LiveInterviewConfig (trigger requirement)")
        liv_config_id = str(uuid4())
        await conn.execute("""
            INSERT INTO live_interview_configs
                (config_id, organization_id, position_id, title, duration_minutes,
                 instructions, created_at)
            VALUES ($1,$2,$3,$4,10,$5,$6)
        """, liv_config_id, org_id, position_id,
            "Senior React Developer — Live AI Interview",
            "AI-powered live interview covering Technical Depth, Problem Solving, and Communication.",
            ts(18))
        print(f"  ✅ LiveInterviewConfig  [{liv_config_id}]")

        # ── 5b. Pipeline Stages ─────────────────────────────────────────────────
        print("\n📁 Step 5b — Pipeline stages")
        stage_asm_id  = str(uuid4())
        stage_ai_id   = str(uuid4())
        stage_live_id = str(uuid4())

        for sid, stype, order, state, cfg_id in [
            (stage_asm_id,  "assessment",     1, "closed", None),
            (stage_ai_id,   "ai_interview",   2, "closed", None),
            (stage_live_id, "live_interview",  3, "active", liv_config_id),
        ]:
            await conn.execute("""
                INSERT INTO group_pipeline_stages
                    (stage_id, group_id, organization_id, stage_type, stage_order,
                     stage_name, state, config_id, started_at, started_by_user_id, created_at, updated_at)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
            """, sid, group_id, org_id, stype, order,
                {"assessment": "Technical Assessment", "ai_interview": "AI Video Interview", "live_interview": "Live AI Interview"}[stype],
                state, cfg_id,
                ts(15) if state in ("active", "closed") else None,
                hr_id,
                ts(20), ts(15))
        print(f"  ✅ Stages: assessment(closed) → ai_interview(closed) → live_interview(active)")

        # ── 6. LiV2 Rubric (frozen) ────────────────────────────────────────────
        print("\n📁 Step 6 — LiV2 Rubric (frozen)")
        rubric_id = str(uuid4())
        dimensions = [
            {
                "dimension_id": DIM_TECH,
                "name": "Technical Depth",
                "weight": 0.40,
                "anchors": {
                    "substandard": "Candidate shows surface-level knowledge only; struggles with follow-up probes.",
                    "proficient":  "Candidate demonstrates solid understanding and can explain trade-offs clearly.",
                    "excellent":   "Candidate exhibits expert-level mastery, citing internal implementation details and real-world application."
                }
            },
            {
                "dimension_id": DIM_PROB,
                "name": "Problem Solving",
                "weight": 0.30,
                "anchors": {
                    "substandard": "Candidate cannot articulate a structured approach; gives vague answers.",
                    "proficient":  "Candidate follows a logical debugging process with reasonable coverage.",
                    "excellent":   "Candidate demonstrates systematic methodology, considers edge cases and preemptively identifies risks."
                }
            },
            {
                "dimension_id": DIM_COMM,
                "name": "Communication",
                "weight": 0.30,
                "anchors": {
                    "substandard": "Candidate gives disjointed, hard-to-follow responses with no structure.",
                    "proficient":  "Candidate communicates clearly with a beginning, middle, and end.",
                    "excellent":   "Candidate uses storytelling with concrete data/outcomes and adapts to interviewer probes naturally."
                }
            }
        ]
        # Try with language column; fall back without it if migration hasn't run yet
        try:
            await conn.execute("""
                INSERT INTO li_v2_rubrics
                    (rubric_id, group_id, organization_id, version, dimensions,
                     state, time_budget_minutes, language, include_weak_topics,
                     created_at, frozen_at, created_by_user_id)
                VALUES ($1,$2,$3,1,$4,'frozen',10,'en',true,$5,$6,$7)
            """, rubric_id, group_id, org_id,
                json.dumps(dimensions),
                ts(18), ts(16), tech_id)
        except Exception as e:
            if 'language' in str(e) or 'include_weak_topics' in str(e):
                print("  ⚠️  language/include_weak_topics columns missing — inserting without them")
                print("       Run the migration SQL printed above, then re-run this script.")
                await conn.execute("""
                    INSERT INTO li_v2_rubrics
                        (rubric_id, group_id, organization_id, version, dimensions,
                         state, time_budget_minutes, created_at)
                    VALUES ($1,$2,$3,1,$4,'frozen',10,$5)
                """, rubric_id, group_id, org_id,
                    json.dumps(dimensions), ts(18))
            else:
                raise
        print(f"  ✅ Rubric: 3 dimensions (frozen)  [{rubric_id}]")

        # ── 7. LiV2 Bank (frozen) ──────────────────────────────────────────────
        print("\n📁 Step 7 — LiV2 Bank (frozen)")
        bank_id = str(uuid4())
        bank_items = [
            {
                "bank_item_id": ITEM_1,
                "text": "Explain how React's reconciliation algorithm and virtual DOM diffing work. What are the key heuristics it uses?",
                "primary_dimension_id": DIM_TECH,
                "secondary_dimension_ids": [],
                "difficulty": 3,
                "is_mandatory": True,
                "is_approved": True,
                "estimated_duration_seconds": 90,
                "question_rubric": {
                    "sub_criteria": [
                        {"name": "Virtual DOM concept", "weight": 0.3},
                        {"name": "Diffing heuristics (element type, keys)", "weight": 0.4},
                        {"name": "Practical implications (performance)", "weight": 0.3}
                    ]
                }
            },
            {
                "bank_item_id": ITEM_2,
                "text": "Your production API response times degrade under heavy load. Walk me through your debugging process and what fixes you'd apply.",
                "primary_dimension_id": DIM_PROB,
                "secondary_dimension_ids": [DIM_TECH],
                "difficulty": 4,
                "is_mandatory": True,
                "is_approved": True,
                "estimated_duration_seconds": 120,
                "question_rubric": {
                    "sub_criteria": [
                        {"name": "Problem identification approach", "weight": 0.35},
                        {"name": "Tooling knowledge (profiling, monitoring)", "weight": 0.30},
                        {"name": "Solution breadth (caching, indexing, queuing)", "weight": 0.35}
                    ]
                }
            },
            {
                "bank_item_id": ITEM_3,
                "text": "Tell me about a time you had to push back on a product or design decision. What was the situation and how did it resolve?",
                "primary_dimension_id": DIM_COMM,
                "secondary_dimension_ids": [],
                "difficulty": 2,
                "is_mandatory": True,
                "is_approved": True,
                "estimated_duration_seconds": 90,
                "question_rubric": {
                    "sub_criteria": [
                        {"name": "Situation clarity (STAR structure)", "weight": 0.3},
                        {"name": "Reasoning & evidence used", "weight": 0.4},
                        {"name": "Outcome & reflection", "weight": 0.3}
                    ]
                }
            }
        ]
        try:
            await conn.execute("""
                INSERT INTO li_v2_banks
                    (bank_id, rubric_id, group_id, organization_id, version, items,
                     state, created_at, frozen_at, created_by_user_id)
                VALUES ($1,$2,$3,$4,1,$5,'frozen',$6,$7,$8)
            """, bank_id, rubric_id, group_id, org_id,
                json.dumps(bank_items),
                ts(17), ts(16), tech_id)
        except Exception as e:
            if 'frozen_at' in str(e) or 'created_by' in str(e):
                print("  ⚠️  frozen_at/created_by missing — inserting without them")
                await conn.execute("""
                    INSERT INTO li_v2_banks
                        (bank_id, rubric_id, group_id, organization_id, version, items,
                         state, created_at)
                    VALUES ($1,$2,$3,$4,1,$5,'frozen',$6)
                """, bank_id, rubric_id, group_id, org_id,
                    json.dumps(bank_items), ts(17))
            else:
                raise
        print(f"  ✅ Bank: 3 questions (frozen)  [{bank_id}]")

        # ── 8. Applications + CV Analysis + Pipeline Progress ─────────────────
        print("\n📁 Step 8 — Applications, CV Analysis, Pipeline Progress")
        for c in candidates:
            # Application
            await conn.execute("""
                INSERT INTO candidate_applications
                    (application_id, candidate_id, position_id, group_id, organization_id,
                     status, applied_at)
                VALUES ($1,$2,$3,$4,$5,'applied',$6)
                ON CONFLICT (application_id) DO NOTHING
            """, c["app_id"], c["id"], position_id, group_id, org_id, ts(12))

            # CV Analysis
            parsed_data = {
                "name": c["name"],
                "email": c["email"],
                "phone": c["phone"],
                "location": c["location"],
                "summary": c["exp_summary"],
                "skills": c["skills"],
                "work_experience": [
                    {
                        "company": "Acme Technologies",
                        "job_title": "Senior Frontend Engineer",
                        "start_date": "2021-03",
                        "end_date": "Present",
                        "years": round(c["exp_years"] * 0.6, 1),
                        "description": "Led React migration from class components to hooks. Built design system used by 5 product teams."
                    },
                    {
                        "company": "Digital Startup",
                        "job_title": "React Developer",
                        "start_date": "2019-06",
                        "end_date": "2021-02",
                        "years": round(c["exp_years"] * 0.4, 1),
                        "description": "Developed e-commerce frontend using React, Redux, and REST APIs."
                    }
                ],
                "education": [
                    {
                        "institution": "American University of Technology",
                        "degree": "BSc Computer Science",
                        "year": 2019
                    }
                ],
                "projects": [
                    {
                        "name": "RecruitBoard",
                        "description": "Open-source hiring dashboard built with React + FastAPI",
                        "tech_stack": ["React", "TypeScript", "FastAPI", "PostgreSQL"],
                        "github_url": f"{c['github']}/recruitboard"
                    }
                ],
                "certifications": ["AWS Certified Developer – Associate"],
                "languages": ["English (Fluent)", "Arabic (Native)"]
            }

            await conn.execute("""
                INSERT INTO cv_analysis
                    (analysis_id, application_id, organization_id,
                     cv_file_url, parsed_data, skills, experience_years, match_score, analyzed_at)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
                ON CONFLICT (application_id) DO UPDATE SET
                    parsed_data = EXCLUDED.parsed_data,
                    skills = EXCLUDED.skills,
                    experience_years = EXCLUDED.experience_years,
                    match_score = EXCLUDED.match_score
            """, str(uuid4()), c["app_id"], org_id,
                f"s3://eramatch-cvs/{c['name'].replace(' ', '_')}.pdf",
                json.dumps(parsed_data),
                c["skills"],
                Decimal(str(c["exp_years"])),
                Decimal(str(c["match_score"])),
                ts(11))

            # Pipeline progress — asm stage (completed)
            await conn.execute("""
                INSERT INTO candidate_pipeline_progress
                    (progress_id, application_id, stage_id, status,
                     score, max_score, passed, unlocked_at, started_at, completed_at)
                VALUES ($1,$2,$3,'completed',$4,100,true,$5,$6,$7)
                ON CONFLICT DO NOTHING
            """, str(uuid4()), c["app_id"], stage_asm_id,
                Decimal("78"), ts(11), ts(10, 2), ts(10))

            # Pipeline progress — ai_interview stage (completed)
            await conn.execute("""
                INSERT INTO candidate_pipeline_progress
                    (progress_id, application_id, stage_id, status,
                     score, max_score, passed, unlocked_at, started_at, completed_at)
                VALUES ($1,$2,$3,'completed',$4,100,true,$5,$6,$7)
                ON CONFLICT DO NOTHING
            """, str(uuid4()), c["app_id"], stage_ai_id,
                Decimal("72"), ts(8), ts(7, 3), ts(7))

            # Pipeline progress — live_interview stage
            await conn.execute("""
                INSERT INTO candidate_pipeline_progress
                    (progress_id, application_id, stage_id, status,
                     session_id, session_type, unlocked_at, started_at, completed_at)
                VALUES ($1,$2,$3,$4,$5,'live_interview',$6,$7,$8)
                ON CONFLICT DO NOTHING
            """, str(uuid4()), c["app_id"], stage_live_id,
                c["prog_status"],
                c["ses_id"],    # session_id pointing to li_v2_sessions
                ts(2), ts(1, 3),
                ts(1) if c["prog_status"] == "completed" else None)

            print(f"  ✅ Application + CV + Progress: {c['name']}")

        # ── 9. LiV2 Sessions ──────────────────────────────────────────────────
        print("\n📁 Step 9 — LiV2 Sessions")
        for c in candidates:
            ctx = build_context_pool(c["name"], c["skills"], c["exp_summary"], c["weak_topics"])
            transcript = build_transcript(c["name"], c["variant"])
            duration = 540 if c["ses_state"] == "completed" else None
            ended = ts(1) if c["ses_state"] == "completed" else None

            room_name = f"li-v2-{group_id[:8]}-{c['id'][:8]}"

            await conn.execute("""
                INSERT INTO li_v2_sessions
                    (session_id, candidate_id, application_id, group_id, organization_id,
                     rubric_id, bank_id, room_name, state, started_at, ended_at,
                     duration_seconds, context_pool, transcript, created_at)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
                ON CONFLICT (session_id) DO UPDATE SET
                    state = EXCLUDED.state,
                    context_pool = EXCLUDED.context_pool,
                    transcript = EXCLUDED.transcript,
                    ended_at = EXCLUDED.ended_at,
                    duration_seconds = EXCLUDED.duration_seconds
            """, c["ses_id"], c["id"], c["app_id"], group_id, org_id,
                rubric_id, bank_id, room_name,
                c["ses_state"],
                ts(1, 3), ended, duration,
                json.dumps(ctx), json.dumps(transcript),
                ts(2))
            print(f"  ✅ Session [{c['ses_state']}]: {c['name']}  [{c['ses_id']}]")

        # ── 10. LiV2 Evaluations (only for completed sessions) ───────────────
        print("\n📁 Step 10 — LiV2 Evaluations")
        for c in candidates:
            if not c["eval_id"]:
                continue

            per_question = [
                {
                    "bank_item_id": ITEM_1,
                    "question_text": "Explain how React's reconciliation algorithm and virtual DOM diffing work.",
                    "dimension_id": DIM_TECH,
                    "score": c["dim_scores"][DIM_TECH] * 0.9 + 0.05,
                    "feedback": "Strong conceptual knowledge of React internals. Good mention of key heuristics.",
                    "evidence_snippets": ["React maintains a virtual DOM...", "Keys on lists are critical..."]
                },
                {
                    "bank_item_id": ITEM_2,
                    "question_text": "Your production API response times degrade under heavy load...",
                    "dimension_id": DIM_PROB,
                    "score": c["dim_scores"][DIM_PROB],
                    "feedback": "Systematic debugging approach. Could have mentioned async job queues for compute tasks.",
                    "evidence_snippets": ["First I'd profile...", "Common culprits are N+1 queries..."]
                },
                {
                    "bank_item_id": ITEM_3,
                    "question_text": "Tell me about a time you had to push back on a product or design decision.",
                    "dimension_id": DIM_COMM,
                    "score": c["dim_scores"][DIM_COMM],
                    "feedback": "Clear STAR structure with concrete data. Outcome well articulated.",
                    "evidence_snippets": ["I built a quick A/B prototype...", "scored 30% higher..."]
                }
            ]

            dim_scores_with_names = {
                "Technical Depth":  c["dim_scores"][DIM_TECH],
                "Problem Solving":  c["dim_scores"][DIM_PROB],
                "Communication":    c["dim_scores"][DIM_COMM],
            }

            auto_tags = {
                "strong_on": ["Technical Depth"] if c["dim_scores"][DIM_TECH] >= 0.80 else [],
                "weak_on": ["Problem Solving"] if c["dim_scores"][DIM_PROB] < 0.70 else [],
                "cv_verified": True,
                "consistent_with_cv": True
            }

            await conn.execute("""
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
            """, c["eval_id"], c["ses_id"], org_id,
                Decimal(str(round(c["overall_score"], 4))),
                c["score_pct"],
                c["verdict"],
                c["meets_criteria"],
                Decimal("1.00"),
                json.dumps(per_question),
                json.dumps(dim_scores_with_names),
                json.dumps(auto_tags),
                json.dumps({"injection_attempts": 0, "anomalies": []}),
                "high" if c["score_pct"] and c["score_pct"] >= 75 else "medium",
                ts(0, 2))
            print(f"  ✅ Evaluation [{c['verdict']}]: {c['name']}  [{c['eval_id']}]")

        print("\n" + "=" * 60)
        print("  ✅ Seed Complete! Summary:")
        print("=" * 60)
        print(f"  Group ID:    {group_id}")
        print(f"  Rubric ID:   {rubric_id}")
        print(f"  Bank ID:     {bank_id}")
        print()
        print("  Candidate Sessions:")
        for c in candidates:
            verdict_str = f"→ {c['verdict']}" if c["verdict"] else "→ in_progress"
            print(f"    {c['name']:<20}  [{c['ses_state']:<11}]  SES:{c['ses_id']}  {verdict_str}")
        print()
        print("  Login Credentials (password: admin12345):")
        print("    HR:           hr@eramatch.com")
        print("    Tech:         tech@eramatch.com")
        print("    Admin:        admin_1@eramatch.com")
        print("    Candidate 1:  sara.alharthi@example.com")
        print("    Candidate 2:  omar.khaled@example.com")
        print("    Candidate 3:  lina.farouk@example.com")
        print("=" * 60)

    finally:
        await conn.close()


def main():
    asyncio.run(run_seed())


if __name__ == "__main__":
    main()
