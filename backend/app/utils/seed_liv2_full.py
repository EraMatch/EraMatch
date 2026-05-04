"""
seed_liv2_full.py — Complete Full-Journey Seeding for Live Interview V2
=======================================================================

Simulates the ENTIRE recruiter-to-candidate pipeline:

   Organization (existing: admin_1@eramatch.com)
  └─ Project:          "AI Hiring Demo"                  [FIXED UUID: proj-...]
     └─ Position:      "Senior React Developer"           [FIXED UUID: pos-...]
        ├─ QuestionBank × 13 (10 MCQ + 3 essay)          [FIXED UUIDs: qst-...]
        ├─ CandidateProfile × 3                           [FIXED UUIDs: cnd-...]
        │   └─ CandidateApplication × 3                  [FIXED UUIDs: app-...]
        │       └─ CVAnalysis (rich: work, edu, projects) [FIXED UUIDs: cva-...]
        ├─ CandidateProfile × 5 (new)                     [FIXED UUIDs: b0001...]
        │   └─ CandidateApplication × 5                  [FIXED UUIDs: b0002...]
        │       └─ CVAnalysis                            [FIXED UUIDs: b0003...]
        └─ CandidateGroup: "Batch A — Frontend"           [FIXED UUID: grp-...]
            ├─ LiveInterviewConfig (trigger)              [FIXED UUID: lic-...]
            ├─ GroupPipelineStages × 3                    [FIXED UUIDs: stg-...]
            ├─ Assessment (config)                        [FIXED UUID: asm-...]
            │   ├─ AssessmentSection × 2 (MCQ, Essay)    [FIXED UUIDs: sec-...]
            │   │   └─ SectionQuestionPool → questions   [FIXED UUIDs: poo-...]
            │   └─ per candidate:
            │       ├─ OngoingAssessment (submitted)      [FIXED UUIDs: oas-...]
            │       │   ├─ CandidateAssignedQuestion × 3 [FIXED UUIDs: caq-...]
            │       │   └─ CandidateAnswer × 3           [FIXED UUIDs: ans-...]
            │       └─ ProctoringFlag × 1                [FIXED UUIDs: flg-...]
            ├─ AIInterviewConfig                          [FIXED UUID: aic-...]
            │   └─ per candidate:
            │       ├─ OngoingInterview (completed)       [FIXED UUIDs: oint-...]
            │       │   ├─ AIInterviewTurn × 6           [FIXED UUIDs: turn-...]
            │       │   └─ InterviewResponse × 3         [FIXED UUIDs: resp-...]
            ├─ CandidatePipelineProgress × 3 per cand.  [FIXED UUIDs: prg-...]
            ├─ LiV2Rubric (frozen)                       [FIXED UUID: rub-...]
            ├─ LiV2Bank (frozen, 3 questions)            [FIXED UUID: bnk-...]
            └─ LiV2Session × 3                           [FIXED UUIDs: ses-...]
                └─ LiV2Evaluation × 2 (for completed)   [FIXED UUIDs: ev-...]

ALL UUIDs are deterministic — re-running is fully idempotent (ON CONFLICT DO UPDATE).

Usage:
    cd EraMatch/backend
    source .venv/bin/activate
    python -m app.utils.seed_liv2_full

Credentials after seeding (password: admin12345 for all):
    HR Recruiter:   hr@eramatch.com
    Tech Recruiter: tech@eramatch.com
    Candidate 1:    sara.alharthi@example.com   → completed, strong_pass (84%)
    Candidate 2:    omar.khaled@example.com     → completed, borderline  (68%)
    Candidate 3:    lina.farouk@example.com     → completed, pass        (75%)
    Candidate 4:    khalid.mansour@example.com  → unlocked, asm:85 ai:88
    Candidate 5:    nour.eldin@example.com      → unlocked, asm:55 ai:52
    Candidate 6:    fatima.rashid@example.com    → unlocked, asm:68 ai:65
    Candidate 7:    youssef.bekhit@example.com  → unlocked, asm:80 ai:74
    Candidate 8:    amira.tawfik@example.com    → unlocked, asm:62 ai:66
"""

# ─────────────────────────────────────────────────────────────────────────────
# IMPORTS
# ─────────────────────────────────────────────────────────────────────────────
import os
import json
import asyncio
import sys
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID
from pathlib import Path

# Load .env
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
import bcrypt

# Use the same bcrypt scheme as backend/app/core/security.py
_pw = b"admin12345"
DEFAULT_HASH = bcrypt.hashpw(_pw, bcrypt.gensalt(rounds=12)).decode()

# ─────────────────────────────────────────────────────────────────────────────
# DB CONNECTION
# ─────────────────────────────────────────────────────────────────────────────
RAW_DB_URL = os.environ.get("DATABASE_URL", "")
for prefix in ("postgresql+asyncpg://", "postgres+asyncpg://"):
    if RAW_DB_URL.startswith(prefix):
        RAW_DB_URL = "postgresql://" + RAW_DB_URL[len(prefix) :]

# ─────────────────────────────────────────────────────────────────────────────
# DETERMINISTIC FIXED UUIDs  (namespace: eramatch-liv2-seed-v2)
# ─────────────────────────────────────────────────────────────────────────────
ORG_EMAIL = "admin_1@eramatch.com"
HR_EMAIL = "hr@eramatch.com"
TECH_EMAIL = "tech@eramatch.com"

# Project / Position / Group
PROJ_ID = "a0000001-0000-0000-0000-000000000001"
POS_ID = "a0000002-0000-0000-0000-000000000002"
GRP_ID = "a0000003-0000-0000-0000-000000000003"

# Live Interview Config (satisfies DB trigger)
LIC_ID = "a0000004-0000-0000-0000-000000000004"

# Pipeline Stages
STG_ASM_ID = "a0000010-0000-0000-0000-000000000010"
STG_AI_ID = "a0000011-0000-0000-0000-000000000011"
STG_LIV_ID = "a0000012-0000-0000-0000-000000000012"

# Assessment
ASM_ID = "a0000020-0000-0000-0000-000000000020"
SEC_MCQ_ID = "a0000021-0000-0000-0000-000000000021"
SEC_ESSAY_ID = "a0000022-0000-0000-0000-000000000022"

# AI Interview Config
AIC_ID = "a0000030-0000-0000-0000-000000000030"

# LiV2 Rubric + Bank
RUB_ID = "a0000040-0000-0000-0000-000000000040"
BNK_ID = "a0000041-0000-0000-0000-000000000041"

# Dimension IDs (stable)
DIM_TECH = "b0000001-0000-0000-0000-000000000001"
DIM_PROB = "b0000002-0000-0000-0000-000000000002"
DIM_COMM = "b0000003-0000-0000-0000-000000000003"

# Bank item IDs
ITEM_1 = "b0000010-0000-0000-0000-000000000010"
ITEM_2 = "b0000011-0000-0000-0000-000000000011"
ITEM_3 = "b0000012-0000-0000-0000-000000000012"

# Question Bank IDs (MCQ: 10, Essay: 3)
Q_MCQ = [f"c{i:07d}-0000-0000-0000-{i:012d}" for i in range(1, 11)]
Q_ESSAY = [f"c{i:07d}-0000-0000-0000-{i:012d}" for i in range(11, 14)]

# Pool entry IDs
POOL_MCQ = [f"d{i:07d}-0000-0000-0000-{i:012d}" for i in range(1, 11)]
POOL_ESSAY = [f"d{i:07d}-0000-0000-0000-{i:012d}" for i in range(11, 14)]

# Candidates  (3 fixed)
CANDS = [
    {
        "id": "e0000001-0000-0000-0000-000000000001",
        "app_id": "f0000001-0000-0000-0000-000000000001",
        "cva_id": "f0000011-0000-0000-0000-000000000011",
        "oas_id": "f0000021-0000-0000-0000-000000000021",  # OngoingAssessment
        "oint_id": "f0000031-0000-0000-0000-000000000031",  # OngoingInterview
        "ses_id": "f0000041-0000-0000-0000-000000000041",  # LiV2Session
        "eval_id": "f0000051-0000-0000-0000-000000000051",  # LiV2Evaluation
        "prg_asm": "f0000061-0000-0000-0000-000000000061",  # Progress (assessment)
        "prg_ai": "f0000062-0000-0000-0000-000000000062",  # Progress (ai_interview)
        "prg_liv": "f0000063-0000-0000-0000-000000000063",  # Progress (live_interview)
        "name": "Sara Al-Harthi",
        "email": "sara.alharthi@example.com",
        "phone": "+971-50-123-4567",
        "location": "Dubai, UAE",
        "github": "https://github.com/saraalh",
        "linkedin": "https://linkedin.com/in/saraalh",
        "skills": ["React", "TypeScript", "Redux", "Jest", "Node.js", "GraphQL"],
        "exp_years": Decimal("5.0"),
        "match_score": Decimal("91.0"),
        "asm_score": Decimal("78"),  # out of 100
        "ai_score": Decimal("82"),
        "li_state": "completed",
        "li_score_pct": 84,
        "li_overall": Decimal("0.8400"),
        "li_verdict": "strong_pass",
        "li_meets": True,
        "li_dim": {DIM_TECH: 0.90, DIM_PROB: 0.82, DIM_COMM: 0.80},
        "li_variant": 1,
        "weak_topics": ["CSS Grid advanced layouts", "Webpack bundle optimization"],
        "exp_summary": "5+ years as Senior Frontend Engineer at Acme Corp; built internal SaaS recruitment dashboards",
    },
    {
        "id": "e0000002-0000-0000-0000-000000000002",
        "app_id": "f0000002-0000-0000-0000-000000000002",
        "cva_id": "f0000012-0000-0000-0000-000000000012",
        "oas_id": "f0000022-0000-0000-0000-000000000022",
        "oint_id": "f0000032-0000-0000-0000-000000000032",
        "ses_id": "f0000042-0000-0000-0000-000000000042",
        "eval_id": "f0000052-0000-0000-0000-000000000052",
        "prg_asm": "f0000064-0000-0000-0000-000000000064",
        "prg_ai": "f0000065-0000-0000-0000-000000000065",
        "prg_liv": "f0000066-0000-0000-0000-000000000066",
        "name": "Omar Khaled",
        "email": "omar.khaled@example.com",
        "phone": "+20-100-234-5678",
        "location": "Cairo, Egypt",
        "github": "https://github.com/omarkh",
        "linkedin": "https://linkedin.com/in/omarkh",
        "skills": ["React", "JavaScript", "CSS", "REST APIs", "Git"],
        "exp_years": Decimal("3.0"),
        "match_score": Decimal("71.0"),
        "asm_score": Decimal("64"),
        "ai_score": Decimal("70"),
        "li_state": "completed",
        "li_score_pct": 68,
        "li_overall": Decimal("0.6800"),
        "li_verdict": "borderline",
        "li_meets": False,
        "li_dim": {DIM_TECH: 0.72, DIM_PROB: 0.65, DIM_COMM: 0.67},
        "li_variant": 2,
        "weak_topics": ["TypeScript generics", "React Server Components"],
        "exp_summary": "3 years as React Developer at Startup X; e-commerce and fintech UIs",
    },
    {
        "id": "e0000003-0000-0000-0000-000000000003",
        "app_id": "f0000003-0000-0000-0000-000000000003",
        "cva_id": "f0000013-0000-0000-0000-000000000013",
        "oas_id": "f0000023-0000-0000-0000-000000000023",
        "oint_id": "f0000033-0000-0000-0000-000000000033",
        "ses_id": "f0000043-0000-0000-0000-000000000043",
        "eval_id": "f0000053-0000-0000-0000-000000000053",
        "prg_asm": "f0000067-0000-0000-0000-000000000067",
        "prg_ai": "f0000068-0000-0000-0000-000000000068",
        "prg_liv": "f0000069-0000-0000-0000-000000000069",
        "name": "Lina Farouk",
        "email": "lina.farouk@example.com",
        "phone": "+966-55-345-6789",
        "location": "Riyadh, Saudi Arabia",
        "github": "https://github.com/linaf",
        "linkedin": "https://linkedin.com/in/linaf",
        "skills": ["React", "TypeScript", "Vue.js", "TailwindCSS", "Firebase"],
        "exp_years": Decimal("4.0"),
        "match_score": Decimal("83.0"),
        "asm_score": Decimal("72"),
        "ai_score": Decimal("76"),
        "li_state": "completed",
        "li_score_pct": 75,
        "li_overall": Decimal("0.7500"),
        "li_verdict": "pass",
        "li_meets": True,
        "li_dim": {DIM_TECH: 0.78, DIM_PROB: 0.74, DIM_COMM: 0.73},
        "li_variant": 3,
        "weak_topics": ["Performance profiling", "WebSockets"],
        "exp_summary": "4 years as Frontend Developer at TechVision; dashboards and design systems",
    },
]

# ─────────────────────────────────────────────────────────────────────────────
# ADDITIONAL 5 CANDIDATES — diverse profiles for rubric differentiation testing
# ─────────────────────────────────────────────────────────────────────────────
NEW_CANDS = [
    {
        # 1. Confident Senior Dev — strong technical, articulate
        "id": "b0001001-0000-0000-0000-000000000001",
        "app_id": "b0002001-0000-0000-0000-000000000001",
        "cva_id": "b0003001-0000-0000-0000-000000000001",
        "oas_id": "b0004001-0000-0000-0000-000000000001",  # OngoingAssessment
        "oint_id": "b0005001-0000-0000-0000-000000000001",  # OngoingInterview
        "prg_asm": "b0006001-0000-0000-0000-000000000001",  # Progress (assessment)
        "prg_ai": "b0006002-0000-0000-0000-000000000002",  # Progress (ai_interview)
        "prg_liv": "b0006003-0000-0000-0000-000000000003",  # Progress (live_interview)
        "name": "Khalid Mansour",
        "email": "khalid.mansour@example.com",
        "phone": "+971-55-987-6543",
        "location": "Abu Dhabi, UAE",
        "github": "https://github.com/khalidm",
        "linkedin": "https://linkedin.com/in/khalidm",
        "skills": [
            "React",
            "TypeScript",
            "Next.js",
            "Node.js",
            "AWS",
            "Docker",
            "GraphQL",
        ],
        "exp_years": Decimal("7.0"),
        "match_score": Decimal("94.0"),
        "asm_score": Decimal("85"),  # high score
        "ai_score": Decimal("88"),
        "weak_topics": ["WebAssembly integration", "CSS-in-JS migration strategies"],
        "exp_summary": "7+ years as Lead Frontend Engineer at GulfTech; architected micro-frontends platform serving 500K+ users",
    },
    {
        # 2. Junior Developer — limited experience, basic answers
        "id": "b0001002-0000-0000-0000-000000000002",
        "app_id": "b0002002-0000-0000-0000-000000000002",
        "cva_id": "b0003002-0000-0000-0000-000000000002",
        "oas_id": "b0004002-0000-0000-0000-000000000002",
        "oint_id": "b0005002-0000-0000-0000-000000000002",
        "prg_asm": "b0006004-0000-0000-0000-000000000004",
        "prg_ai": "b0006005-0000-0000-0000-000000000005",
        "prg_liv": "b0006006-0000-0000-0000-000000000006",
        "name": "Nour El-Din Hassan",
        "email": "nour.eldin@example.com",
        "phone": "+20-101-234-5678",
        "location": "Alexandria, Egypt",
        "github": "https://github.com/nourh",
        "linkedin": "https://linkedin.com/in/nourh",
        "skills": ["React", "JavaScript", "HTML", "CSS", "Bootstrap"],
        "exp_years": Decimal("1.5"),
        "match_score": Decimal("58.0"),
        "asm_score": Decimal("55"),  # low score
        "ai_score": Decimal("52"),
        "weak_topics": [
            "TypeScript advanced patterns",
            "State management beyond useState",
            "Testing frameworks",
        ],
        "exp_summary": "1.5 years as Junior Frontend Developer at WebCraft; built landing pages and simple CRUD interfaces",
    },
    {
        # 3. Over-explainer — talks a lot, may miss key criteria
        "id": "b0001003-0000-0000-0000-000000000003",
        "app_id": "b0002003-0000-0000-0000-000000000003",
        "cva_id": "b0003003-0000-0000-0000-000000000003",
        "oas_id": "b0004003-0000-0000-0000-000000000003",
        "oint_id": "b0005003-0000-0000-0000-000000000003",
        "prg_asm": "b0006007-0000-0000-0000-000000000007",
        "prg_ai": "b0006008-0000-0000-0000-000000000008",
        "prg_liv": "b0006009-0000-0000-0000-000000000009",
        "name": "Fatima Al-Rashid",
        "email": "fatima.rashid@example.com",
        "phone": "+966-50-567-8901",
        "location": "Jeddah, Saudi Arabia",
        "github": "https://github.com/fatimar",
        "linkedin": "https://linkedin.com/in/fatimar",
        "skills": ["React", "JavaScript", "Python", "CSS", "Figma", "Agile", "Scrum"],
        "exp_years": Decimal("3.5"),
        "match_score": Decimal("72.0"),
        "asm_score": Decimal("68"),
        "ai_score": Decimal("65"),
        "weak_topics": [
            "Focus and conciseness in answers",
            "Prioritization of key points",
        ],
        "exp_summary": "3.5 years as Frontend Developer at CreativeHub; known for thorough documentation and extensive code comments",
    },
    {
        # 4. Under-explainer — brief answers, knowledgeable but terse
        "id": "b0001004-0000-0000-0000-000000000004",
        "app_id": "b0002004-0000-0000-0000-000000000004",
        "cva_id": "b0003004-0000-0000-0000-000000000004",
        "oas_id": "b0004004-0000-0000-0000-000000000004",
        "oint_id": "b0005004-0000-0000-0000-000000000004",
        "prg_asm": "b0006010-0000-0000-0000-000000000010",
        "prg_ai": "b0006011-0000-0000-0000-000000000011",
        "prg_liv": "b0006012-0000-0000-0000-000000000012",
        "name": "Youssef Bekhit",
        "email": "youssef.bekhit@example.com",
        "phone": "+20-111-678-9012",
        "location": "Giza, Egypt",
        "github": "https://github.com/youssefb",
        "linkedin": "https://linkedin.com/in/youssefb",
        "skills": ["React", "TypeScript", "Redux", "Node.js", "PostgreSQL", "Redis"],
        "exp_years": Decimal("5.0"),
        "match_score": Decimal("86.0"),
        "asm_score": Decimal("80"),
        "ai_score": Decimal("74"),
        "weak_topics": ["Verbal communication depth", "Articulating design decisions"],
        "exp_summary": "5 years as Full-Stack Developer at DataFlow; prefers code over meetings, strong technical skills but minimal verbal elaboration",
    },
    {
        # 5. Career Changer — diverse background, transferable skills, non-traditional
        "id": "b0001005-0000-0000-0000-000000000005",
        "app_id": "b0002005-0000-0000-0000-000000000005",
        "cva_id": "b0003005-0000-0000-0000-000000000005",
        "oas_id": "b0004005-0000-0000-0000-000000000005",
        "oint_id": "b0005005-0000-0000-0000-000000000005",
        "prg_asm": "b0006013-0000-0000-0000-000000000013",
        "prg_ai": "b0006014-0000-0000-0000-000000000014",
        "prg_liv": "b0006015-0000-0000-0000-000000000015",
        "name": "Amira Tawfik",
        "email": "amira.tawfik@example.com",
        "phone": "+20-100-789-0123",
        "location": "Cairo, Egypt",
        "github": "https://github.com/amirat",
        "linkedin": "https://linkedin.com/in/amirat",
        "skills": [
            "React",
            "JavaScript",
            "Python",
            "Data Analysis",
            "UX Research",
            "Figma",
        ],
        "exp_years": Decimal("2.0"),
        "match_score": Decimal("65.0"),
        "asm_score": Decimal("62"),
        "ai_score": Decimal("66"),
        "weak_topics": [
            "Advanced React patterns",
            "System design at scale",
            "Backend integration",
        ],
        "exp_summary": "Former UX Researcher (3 years) transitioning to frontend development; 2 years as React Developer at PivotTech, brings strong user empathy and design thinking to engineering",
    },
]

# New candidate MCQ answers
NEW_CAND_MCQ_ANSWERS = [
    # Khalid (Confident Senior): 9/10 correct
    [1, 2, 1, 2, 1, 1, 1, 2, 0, 2],  # wrong on Q9 only
    # Nour (Junior): 5/10 correct
    [1, 0, 0, 2, 1, 0, 0, 1, 0, 1],
    # Fatima (Over-explainer): 7/10 correct
    [1, 2, 1, 2, 1, 0, 1, 2, 0, 2],
    # Youssef (Under-explainer): 8/10 correct
    [1, 2, 1, 2, 1, 1, 1, 2, 1, 2],
    # Amira (Career Changer): 6/10 correct
    [1, 2, 0, 2, 1, 0, 1, 1, 0, 2],
]

NEW_CAND_ESSAY_ANSWERS = [
    # Khalid — thorough, confident
    [
        "I'd structure around domain-driven modules with clear boundaries. For state, Redux Toolkit for global, React Query for server state, and Zustand for feature-local state. Code splitting with dynamic imports per route. Testing pyramid: unit with Vitest, integration with Testing Library, E2E with Playwright.",
        "SSR via streaming for dynamic content with SEO needs — Next.js App Router is ideal. SSG for landing and marketing pages — pre-built at build time. CSR for highly interactive tools and dashboards. I've used hybrid approaches with route-level rendering strategies.",
        "First, webpack-bundle-analyzer or source-map-explorer for visualization. Then: 1) deduplicate packages, 2) tree-shake unused exports, 3) dynamic imports for non-critical routes, 4) move heavy libs to CDN. If still large, audit for polyfills and consider targeting modern browsers only.",
    ],
    # Nour — basic, limited depth
    [
        "I use useState for managing state in my components. For bigger apps, I'd use Context. I split code when it gets too big into separate files.",
        "SSR is when the server sends HTML. SSG is when pages are built before. CSR is when React does everything in the browser. I've mostly used CSR with create-react-app.",
        "I would check which files are biggest and try to make them smaller. Maybe use lazy loading for some pages.",
    ],
    # Fatima — very verbose, tangential
    [
        "So, when I think about architecting a large React app, there are so many things to consider! First, I'd start by understanding the team — who's going to be working on it, what their experience level is, because that really determines how complex we can make the architecture. Then I'd look at the product roadmap to understand scale needs. For state management, I've used Redux and Context API, and honestly both have their pros and cons — Redux has more boilerplate but is very structured, while Context is simpler but can cause re-renders. For code splitting, React.lazy is great but you need to think about loading states. Testing-wise, I believe Jest is the most popular option and works well with React Testing Library.",
        "Oh, this is a great question! So SSR, SSG, and CSR are three different rendering strategies. SSR renders on the server which is good for SEO because search engines can see the content. SSG pre-renders pages at build time, which is super fast because it's just static HTML being served. CSR renders everything in the browser, which is great for interactivity but not ideal for SEO. Next.js actually supports all three which is why it's become so popular in the React ecosystem. In my experience, I've used Next.js for a marketing site and it worked really well — we used SSG for the landing pages and SSR for the blog.",
        "A 4MB bundle is definitely concerning! The first thing I'd do is run the build analyzer to see what's taking up so much space. Often it's large third-party libraries that could be replaced with lighter alternatives. I remember once we had moment.js importing all locales — switching to date-fns saved almost 70KB! Code splitting with dynamic imports is another must. I'd also look at whether we're importing entire libraries when we only use a few functions — tree shaking should handle that, but sometimes the way we import prevents it. Gzip and Brotli compression on the server side can also help reduce the transfer size significantly.",
    ],
    # Youssef — terse but knowledgeable
    [
        "Feature modules. Redux Toolkit + RTK Query. Lazy route imports. Vitest unit tests.",
        "SSR for SEO. SSG for static. CSR for SPA apps. Next.js hybrid.",
        "Bundle analyzer first. Tree-shake, dedupe, dynamic imports, CDN for vendor libs.",
    ],
    # Amira — transferable skills perspective
    [
        "Coming from UX research, I think about architecture from the user's perspective first. Feature-based folders, React Query for data fetching (since it handles loading/error states that users see), and Zustand for local state. Testing with React Testing Library — I especially value accessibility testing since I've seen inclusivity issues firsthand. Code splitting where it reduces time-to-interactive.",
        "SSR for SEO-critical pages like product listings — I've seen user research show that load time directly impacts bounce rates. SSG for content sites. CSR for dashboards and tools. I'd choose based on user needs: what are they trying to accomplish, and what's the fastest way to show them meaningful content?",
        "I'd start with Lighthouse and real-user monitoring data. A 4MB bundle likely means users on slow connections are abandoning the site. I'd audit large dependencies, implement route-based splitting, and check if we can use lighter alternatives. From a UX perspective, skeleton screens and progressive loading keep users engaged while we optimize.",
    ],
]

NOW = datetime.now(timezone.utc)


def ts(days_ago: int = 0, hours_ago: int = 0) -> datetime:
    return NOW - timedelta(days=days_ago, hours=hours_ago)


def make_uid(prefix: int, a: int, b: int = 0) -> str:
    """Create a deterministic valid UUID from integer components.
    Returns: 'PPPPPPPP-00aa-0000-0000-0000000000bb'
    """
    return f"{prefix:08d}-{a:04d}-0000-0000-{b:012d}"


# ─────────────────────────────────────────────────────────────────────────────
# MCQ QUESTIONS DATA
# ─────────────────────────────────────────────────────────────────────────────
MCQ_QUESTIONS = [
    {
        "id": Q_MCQ[0],
        "text": "Which hook in React is used to perform side effects in function components?",
        "options": ["useState", "useEffect", "useContext", "useRef"],
        "correct": 1,
        "category": "React Fundamentals",
        "difficulty": 2,
    },
    {
        "id": Q_MCQ[1],
        "text": "What does the 'key' prop in React lists primarily help with?",
        "options": [
            "CSS styling",
            "Component re-use",
            "Efficient reconciliation",
            "Event binding",
        ],
        "correct": 2,
        "category": "React Fundamentals",
        "difficulty": 2,
    },
    {
        "id": Q_MCQ[2],
        "text": "In TypeScript, what does the 'keyof' operator return?",
        "options": [
            "A value type",
            "A union of property names",
            "An array of values",
            "A mapped type",
        ],
        "correct": 1,
        "category": "TypeScript",
        "difficulty": 3,
    },
    {
        "id": Q_MCQ[3],
        "text": "Which of the following is NOT a valid state management approach in React?",
        "options": ["useState", "useReducer", "useStore (built-in)", "Context API"],
        "correct": 2,
        "category": "State Management",
        "difficulty": 2,
    },
    {
        "id": Q_MCQ[4],
        "text": "What is the output of: const [a, ...b] = [1, 2, 3, 4]; console.log(b)?",
        "options": ["[1, 2, 3, 4]", "[2, 3, 4]", "[1]", "Error"],
        "correct": 1,
        "category": "JavaScript",
        "difficulty": 2,
    },
    {
        "id": Q_MCQ[5],
        "text": "In CSS, which property creates a new stacking context?",
        "options": [
            "display: block",
            "position: relative + z-index",
            "color: red",
            "margin: auto",
        ],
        "correct": 1,
        "category": "CSS",
        "difficulty": 3,
    },
    {
        "id": Q_MCQ[6],
        "text": "What does React.memo do?",
        "options": [
            "Memoizes function return values",
            "Prevents re-render if props haven't changed",
            "Creates a memoized selector",
            "Caches API responses",
        ],
        "correct": 1,
        "category": "React Performance",
        "difficulty": 3,
    },
    {
        "id": Q_MCQ[7],
        "text": "Which HTTP method is idempotent AND safe?",
        "options": ["POST", "PUT", "GET", "PATCH"],
        "correct": 2,
        "category": "Web Fundamentals",
        "difficulty": 2,
    },
    {
        "id": Q_MCQ[8],
        "text": "In GraphQL, what is a resolver?",
        "options": [
            "A function that returns a type's field value",
            "A schema definition language keyword",
            "An HTTP method for queries",
            "A client-side caching layer",
        ],
        "correct": 0,
        "category": "GraphQL",
        "difficulty": 3,
    },
    {
        "id": Q_MCQ[9],
        "text": "What is the time complexity of array.find() in the worst case?",
        "options": ["O(1)", "O(log n)", "O(n)", "O(n²)"],
        "correct": 2,
        "category": "Algorithms",
        "difficulty": 2,
    },
]

ESSAY_QUESTIONS = [
    {
        "id": Q_ESSAY[0],
        "text": "Describe how you would architect a large-scale React application. What patterns would you use for state management, code splitting, and testing?",
        "category": "System Design",
        "difficulty": 4,
    },
    {
        "id": Q_ESSAY[1],
        "text": "Explain the differences between server-side rendering (SSR), static site generation (SSG), and client-side rendering (CSR). When would you choose each?",
        "category": "Web Architecture",
        "difficulty": 4,
    },
    {
        "id": Q_ESSAY[2],
        "text": "You notice the main bundle of a React app has grown to 4MB. Walk us through your approach to diagnosing and fixing the performance issue.",
        "category": "Performance",
        "difficulty": 4,
    },
]

# Simulated MCQ answers per candidate (indices 0-9, correct = index from MCQ_QUESTIONS[i]["correct"])
CAND_MCQ_ANSWERS = [
    # Sara: 8/10 correct
    [1, 2, 1, 2, 1, 1, 1, 2, 0, 2],  # wrong on Q[3] (picks 2 instead of 2?), Q[5], Q[7]
    # Omar: 6/10 correct
    [1, 0, 0, 2, 1, 0, 1, 2, 0, 2],
    # Lina: 7/10 correct
    [1, 2, 1, 2, 1, 0, 1, 2, 0, 2],
]

# Essay answers (simulated)
CAND_ESSAY_ANSWERS = [
    # Sara
    [
        "I would use a feature-based folder structure with Redux Toolkit for global state, React Query for server state, and lazy-loaded route segments via React.lazy(). For testing, I rely on Jest + React Testing Library for component tests and Cypress for E2E.",
        "SSR is best for SEO-sensitive pages like product listings. SSG for content that rarely changes like documentation. CSR for highly interactive dashboards where SEO isn't critical.",
        "First I'd run webpack-bundle-analyzer to identify the largest modules. Then tree-shake unused imports, code-split vendor libraries, and lazy-load non-critical routes. I'd also check for duplicate packages using npm dedupe.",
    ],
    # Omar
    [
        "I'd separate concerns into feature modules, use Context API for light state, and useState for local component state. I'd use React.lazy for route-based splitting.",
        "SSR improves initial load time. SSG is for static content. CSR for SPAs. I typically use Next.js which supports all three.",
        "I'd look at which libraries are imported and remove unused ones. Minification and compression also help.",
    ],
    # Lina
    [
        "I prefer Zustand for state management due to its simplicity. I structure by domain features, use React Query for data fetching, and write unit tests with Vitest.",
        "SSR sends pre-rendered HTML for better SEO. SSG pre-builds pages at compile time for speed. CSR handles everything in the browser, good for apps where SEO doesn't matter.",
        "I'd start with Lighthouse to identify opportunities. Then analyze the bundle, eliminate unused dependencies, and apply dynamic imports for heavy components.",
    ],
]


def build_cv_parsed_data(c: dict) -> dict:
    name_to_company = {
        "Sara Al-Harthi": ("Acme Technologies", "Senior Frontend Engineer", "2021-03"),
        "Omar Khaled": ("Startup X", "React Developer", "2022-01"),
        "Lina Farouk": ("TechVision", "Frontend Developer", "2021-06"),
        "Khalid Mansour": ("GulfTech", "Lead Frontend Engineer", "2018-06"),
        "Nour El-Din Hassan": ("WebCraft", "Junior Frontend Developer", "2024-01"),
        "Fatima Al-Rashid": ("CreativeHub", "Frontend Developer", "2021-09"),
        "Youssef Bekhit": ("DataFlow", "Full-Stack Developer", "2020-03"),
        "Amira Tawfik": ("PivotTech", "React Developer", "2023-06"),
    }
    company, job_title, start_date = name_to_company.get(
        c["name"], ("TechCorp", "Developer", "2022-01")
    )
    return {
        "name": c["name"],
        "email": c["email"],
        "phone": c["phone"],
        "location": c["location"],
        "summary": c["exp_summary"],
        "skills": c["skills"],
        "experience_years": float(c["exp_years"]),
        "work_experience": [
            {
                "company": company,
                "job_title": job_title,
                "start_date": start_date,
                "end_date": "Present",
                "years": float(c["exp_years"]) * 0.65,
                "description": c["exp_summary"],
            },
            {
                "company": "Digital Startup",
                "job_title": "React Developer",
                "start_date": "2019-06",
                "end_date": "2021-02",
                "years": float(c["exp_years"]) * 0.35,
                "description": "Developed e-commerce frontend using React, Redux, and REST APIs.",
            },
        ],
        "education": [
            {
                "institution": "American University of Technology",
                "degree": "BSc Computer Science",
                "year": 2019,
            }
        ],
        "projects": [
            {
                "name": "RecruitBoard",
                "description": "Open-source hiring dashboard built with React + FastAPI",
                "technologies": ["React", "TypeScript", "FastAPI", "PostgreSQL"],
                "github_url": f"{c['github']}/recruitboard",
            },
            {
                "name": "StyleKit",
                "description": "Component library with 40+ accessible UI components",
                "technologies": ["React", "Storybook", "Rollup"],
                "github_url": f"{c['github']}/stylekit",
            },
        ],
        "certifications": ["AWS Certified Developer – Associate"],
        "languages": ["English (Fluent)", "Arabic (Native)"],
    }


def build_transcript(c: dict) -> list[dict]:
    """Realistic interview transcript — 12 turns for completed, 4 for variant 3."""
    first = c["name"].split()[0]
    base = [
        {
            "role": "agent",
            "text": f"Hello {first}! Welcome to your Live Interview for the Senior React Developer position. I'm your AI interviewer today. Are you ready to begin?",
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
        {
            "role": "agent",
            "text": "Good. Let's shift to Communication. Tell me about a time you had to push back on a design decision. What was the situation and outcome?",
            "phase": "pillar_3",
            "timestamp": 230,
        },
        {
            "role": "candidate",
            "text": "At my last company, the PM wanted to remove all loading skeletons to save dev time. I felt that would hurt perceived performance significantly. I built a quick A/B prototype with and without them and shared it in a design review. The skeleton version scored 30% higher on perceived speed in our user survey. We kept them.",
            "phase": "pillar_3",
            "timestamp": 262,
        },
        {
            "role": "agent",
            "text": "That's a great example of using data to influence decisions. One last question — how do you stay current with the React ecosystem given how fast it evolves?",
            "phase": "pillar_3",
            "timestamp": 335,
        },
        {
            "role": "candidate",
            "text": "I follow the React RFC repo on GitHub, subscribe to This Week In React newsletter, and participate in the Reactiflux Discord. I try to build small experiments with new features like React 19's use() hook and server components before adopting them in production.",
            "phase": "pillar_3",
            "timestamp": 358,
        },
        {
            "role": "agent",
            "text": f"Fantastic {first}. We've covered all our areas today. Thanks for your thoughtful answers — we'll be in touch soon!",
            "phase": "closing",
            "timestamp": 440,
        },
        {
            "role": "candidate",
            "text": "Thank you! This was a great conversation.",
            "phase": "closing",
            "timestamp": 448,
        },
    ]
    if c["li_variant"] == 2:
        # Slightly different answers for Omar
        base[3]["text"] = (
            "React uses a virtual DOM to track UI state. When something changes, it diffs the new virtual tree with the old one. It uses a heuristic algorithm — same type elements update props, different types re-mount. List keys prevent unnecessary re-renders."
        )
        base[5]["text"] = (
            "I'd look at Chrome's Memory panel and take heap snapshots. Common culprits are subscriptions without cleanup in useEffect. I'd also check for N+1 queries server-side and add proper indexes. Redis caching for frequently hit endpoints also helps."
        )
        base[7]["text"] = (
            "We had a tight sprint before a product launch. I negotiated with the PM to ship with a feature flag — core functionality tested, edge cases deferred. This let us ship on time while maintaining quality."
        )
    return base


def build_context_pool(c: dict) -> dict:
    return {
        "position_title": "Senior React Developer",
        "job_description_excerpt": (
            "We are looking for a passionate Senior React Developer to lead our frontend team. "
            "You will build scalable, high-performance web applications using React, TypeScript, and GraphQL."
        ),
        "cv_skills": c["skills"][:6],
        "experience_summary": [c["exp_summary"]],
        "weak_topics": c["weak_topics"],
        "candidate_name": c["name"],
        "projects": [p["name"] for p in build_cv_parsed_data(c)["projects"][:3]],
    }


# ─────────────────────────────────────────────────────────────────────────────
# SEED LOGIC
# ─────────────────────────────────────────────────────────────────────────────
async def fetch_one(conn, sql: str, *args):
    row = await conn.fetchrow(sql, *args)
    return str(row[0]) if row and row[0] else None


async def run_seed():
    print("=" * 65)
    print("  EraMatch — Live Interview V2 Full-Journey Seed (v2)")
    print("=" * 65)
    print()
    print("  ⚠️  DB Migration required (run once in Supabase SQL editor):")
    print("  ALTER TABLE li_v2_rubrics")
    print("    ADD COLUMN IF NOT EXISTS language VARCHAR(5) NOT NULL DEFAULT 'en',")
    print(
        "    ADD COLUMN IF NOT EXISTS include_weak_topics BOOLEAN NOT NULL DEFAULT FALSE,"
    )
    print("    ADD COLUMN IF NOT EXISTS frozen_at TIMESTAMPTZ,")
    print(
        "    ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES organization_users(user_id);"
    )
    print("  ALTER TABLE li_v2_banks")
    print("    ADD COLUMN IF NOT EXISTS frozen_at TIMESTAMPTZ,")
    print(
        "    ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES organization_users(user_id);"
    )
    print()

    if not RAW_DB_URL:
        print("❌ DATABASE_URL not found. Check .env")
        sys.exit(1)

    print("✅ Connecting...")
    conn = await asyncpg.connect(RAW_DB_URL, statement_cache_size=0)
    print("✅ Connected\n")

    try:
        # ── 0. Fetch Org + Users ──────────────────────────────────────────────
        org_id = await fetch_one(
            conn,
            "SELECT organization_id FROM organizations WHERE admin_email = $1 LIMIT 1",
            ORG_EMAIL,
        )
        hr_id = await fetch_one(
            conn,
            "SELECT user_id FROM organization_users WHERE email = $1 LIMIT 1",
            HR_EMAIL,
        )
        tech_id = await fetch_one(
            conn,
            "SELECT user_id FROM organization_users WHERE email = $1 LIMIT 1",
            TECH_EMAIL,
        )

        if not org_id:
            print("❌ Organization not found — run seed_data.py first")
            return
        if not hr_id or not tech_id:
            print("❌ HR or Tech user missing — run seed_data.py first")
            return

        print(f"✅ Org:  {org_id}")
        print(f"✅ HR:   {hr_id}")
        print(f"✅ Tech: {tech_id}\n")

        # ── 1. Candidate Profiles + Portal Accounts ───────────────────────────
        print("📁 Step 1 — Candidate profiles + portal accounts")
        all_cands = CANDS + NEW_CANDS
        for c in all_cands:
            await conn.execute(
                """
                INSERT INTO candidate_profiles
                    (candidate_id, organization_id, full_name, email, phone,
                     location, linkedin_url, github_url, password_hash, created_at)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                ON CONFLICT (candidate_id) DO UPDATE SET
                    full_name = EXCLUDED.full_name,
                    email = EXCLUDED.email,
                    phone = EXCLUDED.phone,
                    password_hash = EXCLUDED.password_hash
            """,
                c["id"],
                org_id,
                c["name"],
                c["email"],
                c["phone"],
                c["location"],
                c["linkedin"],
                c["github"],
                DEFAULT_HASH,
                ts(20),
            )
            print(f"  ✅ {c['name']} ({c['email']})")
        print()

        # ── 2. Question Bank — 10 MCQ + 3 Essay ──────────────────────────────
        print("📁 Step 2 — Question bank (10 MCQ + 3 essay)")
        for i, q in enumerate(MCQ_QUESTIONS):
            config = {
                "options": q["options"],
                "correct_answer_index": q["correct"],
            }
            correct = {
                "option_index": q["correct"],
                "option_text": q["options"][q["correct"]],
            }
            await conn.execute(
                """
                INSERT INTO question_bank
                    (question_id, organization_id, question_type, question_text,
                     question_config, correct_answer, category, difficulty, tags, points,
                     created_by_user_id, created_at, is_deleted, is_base_question)
                VALUES ($1,$2,'mcq',$3,$4,$5,$6,$7,$8,10,$9,$10,false,true)
                ON CONFLICT (question_id) DO UPDATE SET
                    question_text = EXCLUDED.question_text,
                    question_config = EXCLUDED.question_config,
                    correct_answer = EXCLUDED.correct_answer
            """,
                q["id"],
                org_id,
                q["text"],
                json.dumps(config),
                json.dumps(correct),
                q["category"],
                q["difficulty"],
                ["react", "frontend"],
                tech_id,
                ts(25),
            )
            print(f"  ✅ MCQ [{i + 1}/10]: {q['text'][:55]}...")

        for i, q in enumerate(ESSAY_QUESTIONS):
            await conn.execute(
                """
                INSERT INTO question_bank
                    (question_id, organization_id, question_type, question_text,
                     question_config, correct_answer, category, difficulty, tags, points,
                     created_by_user_id, created_at, is_deleted, is_base_question)
                VALUES ($1,$2,'essay',$3,$4,NULL,$5,$6,$7,20,$8,$9,false,true)
                ON CONFLICT (question_id) DO UPDATE SET
                    question_text = EXCLUDED.question_text
            """,
                q["id"],
                org_id,
                q["text"],
                json.dumps({"type": "essay", "min_words": 50, "max_words": 400}),
                q["category"],
                q["difficulty"],
                ["react", "system-design"],
                tech_id,
                ts(25),
            )
            print(f"  ✅ Essay [{i + 1}/3]: {q['text'][:55]}...")
        print()

        # ── 3. Project ────────────────────────────────────────────────────────
        print("📁 Step 3 — Project")
        admin_id = await fetch_one(
            conn,
            "SELECT user_id FROM organization_users WHERE email = $1 LIMIT 1",
            ORG_EMAIL,
        )
        await conn.execute(
            """
            INSERT INTO projects
                (project_id, organization_id, created_by_user_id, name, description,
                 status, priority, created_at)
            VALUES ($1,$2,$3,$4,$5,'active','high',$6)
            ON CONFLICT (project_id) DO NOTHING
        """,
            PROJ_ID,
            org_id,
            hr_id,
            "AI Hiring Demo",
            "Full pipeline demonstration for Live Interview V2 — end-to-end AI-powered hiring.",
            ts(35),
        )

        for access_id, uid in [
            ("a0000090-0000-0000-0000-000000000090", hr_id),
            ("a0000091-0000-0000-0000-000000000091", tech_id),
            ("a0000092-0000-0000-0000-000000000092", admin_id or hr_id),
        ]:
            await conn.execute(
                """
                INSERT INTO project_access (access_id, project_id, user_id, access_level)
                VALUES ($1,$2,$3,$4)
                ON CONFLICT (access_id) DO NOTHING
            """,
                access_id,
                PROJ_ID,
                uid,
                "owner" if uid == hr_id else "collaborator",
            )
        print(f"  ✅ Project: AI Hiring Demo  [{PROJ_ID}]\n")

        # ── 4. Position ───────────────────────────────────────────────────────
        print("📁 Step 4 — Position")
        jd = (
            "We are looking for a passionate Senior React Developer to lead our frontend team. "
            "You will build scalable, high-performance web applications using React 18, TypeScript, "
            "GraphQL, and modern tooling. You will collaborate closely with product managers, UX designers, "
            "and backend engineers to deliver outstanding user experiences.\n\n"
            "Key responsibilities include: leading frontend architecture decisions, mentoring junior developers, "
            "conducting code reviews, optimizing performance, and contributing to our design system. "
            "You should be comfortable with CI/CD pipelines, testing (Jest, Cypress), and Agile workflows."
        )
        await conn.execute(
            """
            INSERT INTO positions
                (position_id, organization_id, project_id, job_title, job_description,
                 required_skills, experience_level, work_type, employment_type,
                 location_type, years_of_experience, salary_min, salary_max,
                 status, assigned_hr_id, assigned_tech_id, created_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'open',$14,$15,$16)
            ON CONFLICT (position_id) DO NOTHING
        """,
            POS_ID,
            org_id,
            PROJ_ID,
            "Senior React Developer",
            jd,
            json.dumps(["React", "TypeScript", "Node.js", "GraphQL", "AWS", "Jest"]),
            "Senior Level",
            "Remote",
            "full-time",
            "remote",
            4,
            110000,
            155000,
            hr_id,
            tech_id,
            ts(30),
        )
        print(f"  ✅ Position: Senior React Developer  [{POS_ID}]\n")

        # ── 5. Candidate Applications + CV Analysis ───────────────────────────
        print("📁 Step 5 — Applications + CV Analysis")
        for c in all_cands:
            await conn.execute(
                """
                INSERT INTO candidate_applications
                    (application_id, candidate_id, position_id, group_id,
                     organization_id, status, applied_at)
                VALUES ($1,$2,$3,NULL,$4,'applied',$5)
                ON CONFLICT (application_id) DO NOTHING
            """,
                c["app_id"],
                c["id"],
                POS_ID,
                org_id,
                ts(22),
            )

            parsed = build_cv_parsed_data(c)
            await conn.execute(
                """
                INSERT INTO cv_analysis
                    (analysis_id, application_id, organization_id,
                     cv_file_url, parsed_data, skills, experience_years,
                     match_score, analyzed_at)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
                ON CONFLICT (analysis_id) DO UPDATE SET
                    parsed_data = EXCLUDED.parsed_data,
                    skills = EXCLUDED.skills,
                    experience_years = EXCLUDED.experience_years,
                    match_score = EXCLUDED.match_score
            """,
                c["cva_id"],
                c["app_id"],
                org_id,
                f"s3://eramatch-cvs/{c['name'].replace(' ', '_')}.pdf",
                json.dumps(parsed),
                c["skills"],
                c["exp_years"],
                c["match_score"],
                ts(21),
            )
            print(f"  ✅ Application + CV: {c['name']}")
        print()

        # ── 6. Candidate Group ────────────────────────────────────────────────
        print("📁 Step 6 — Candidate group")
        await conn.execute(
            """
            INSERT INTO candidate_groups
                (group_id, organization_id, position_id, group_name,
                 assigned_hr_id, assigned_tech_id, status, created_at)
            VALUES ($1,$2,$3,'Batch A — Frontend',$4,$5,'active',$6)
            ON CONFLICT (group_id) DO NOTHING
        """,
            GRP_ID,
            org_id,
            POS_ID,
            hr_id,
            tech_id,
            ts(20),
        )

        # Assign candidates to group via application update
        for c in all_cands:
            await conn.execute(
                """
                UPDATE candidate_applications
                SET group_id = $1, status = 'applied'
                WHERE application_id = $2
            """,
                GRP_ID,
                c["app_id"],
            )
        print(f"  ✅ Group: Batch A — Frontend  [{GRP_ID}]\n")

        # ── 7. Live Interview Config (trigger requirement) ─────────────────────
        print("📁 Step 7 — LiveInterviewConfig (DB trigger requirement)")
        await conn.execute(
            """
            INSERT INTO live_interview_configs
                (config_id, organization_id, position_id, title,
                 duration_minutes, instructions, created_at)
            VALUES ($1,$2,$3,$4,10,$5,$6)
            ON CONFLICT (config_id) DO NOTHING
        """,
            LIC_ID,
            org_id,
            POS_ID,
            "Senior React Developer — Live AI Interview",
            "AI-powered live interview covering Technical Depth, Problem Solving, and Communication.",
            ts(18),
        )
        print(f"  ✅ LiveInterviewConfig  [{LIC_ID}]\n")

        # ── 8. Pipeline Stages ────────────────────────────────────────────────
        print("📁 Step 8 — Pipeline stages (3 stages)")
        for sid, stype, order, state, cfg_id in [
            (STG_ASM_ID, "assessment", 1, "closed", None),
            (STG_AI_ID, "ai_interview", 2, "closed", None),
            (STG_LIV_ID, "live_interview", 3, "active", LIC_ID),
        ]:
            label = {
                "assessment": "Technical Assessment",
                "ai_interview": "AI Video Interview",
                "live_interview": "Live AI Interview",
            }[stype]
            await conn.execute(
                """
                INSERT INTO group_pipeline_stages
                    (stage_id, group_id, organization_id, stage_type, stage_order,
                     stage_name, state, config_id, started_at, started_by_user_id,
                     created_at, updated_at)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
                ON CONFLICT (stage_id) DO UPDATE SET
                    state = EXCLUDED.state,
                    config_id = EXCLUDED.config_id
            """,
                sid,
                GRP_ID,
                org_id,
                stype,
                order,
                label,
                state,
                cfg_id,
                ts(15),
                hr_id,
                ts(20),
                ts(15),
            )
        print(
            f"  ✅ assessment(closed) → ai_interview(closed) → live_interview(active)\n"
        )

        # ── 9. Assessment Config ──────────────────────────────────────────────
        print("📁 Step 9 — Assessment config + sections + question pool")
        await conn.execute(
            """
            INSERT INTO assessments
                (assessment_id, organization_id, position_id, group_id,
                 title, description, instructions, duration_minutes,
                 passing_score, shuffle_sections, anti_cheating_enabled,
                 status, created_by_user_id, created_at, updated_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,45,70,false,true,'published',$8,$9,$10)
            ON CONFLICT (assessment_id) DO NOTHING
        """,
            ASM_ID,
            org_id,
            POS_ID,
            GRP_ID,
            "Senior React Developer — Technical Assessment",
            "Tests React, TypeScript, JavaScript, and system design fundamentals.",
            "You have 45 minutes. Answer all questions carefully. No external resources allowed.",
            tech_id,
            ts(18),
            ts(18),
        )

        # MCQ section (10 questions, pick 3 per session)
        await conn.execute(
            """
            INSERT INTO assessment_sections
                (section_id, assessment_id, section_order, section_title,
                 question_type, variants_to_select, points_per_question,
                 selection_strategy, created_at)
            VALUES ($1,$2,1,'Multiple Choice Questions','mcq',3,10,'random',$3)
            ON CONFLICT (section_id) DO NOTHING
        """,
            SEC_MCQ_ID,
            ASM_ID,
            ts(18),
        )

        # Essay section (3 questions, pick 1)
        await conn.execute(
            """
            INSERT INTO assessment_sections
                (section_id, assessment_id, section_order, section_title,
                 question_type, variants_to_select, points_per_question,
                 selection_strategy, created_at)
            VALUES ($1,$2,2,'Essay Questions','essay',1,20,'random',$3)
            ON CONFLICT (section_id) DO NOTHING
        """,
            SEC_ESSAY_ID,
            ASM_ID,
            ts(18),
        )

        # Add MCQ questions to pool
        for i, (pool_id, q) in enumerate(zip(POOL_MCQ, MCQ_QUESTIONS)):
            await conn.execute(
                """
                INSERT INTO section_question_pool
                    (pool_entry_id, section_id, question_id, variant_order,
                     is_active, difficulty_weight, created_at)
                VALUES ($1,$2,$3,$4,true,1.0,$5)
                ON CONFLICT (pool_entry_id) DO NOTHING
            """,
                pool_id,
                SEC_MCQ_ID,
                q["id"],
                i + 1,
                ts(18),
            )

        # Add essay questions to pool
        for i, (pool_id, q) in enumerate(zip(POOL_ESSAY, ESSAY_QUESTIONS)):
            await conn.execute(
                """
                INSERT INTO section_question_pool
                    (pool_entry_id, section_id, question_id, variant_order,
                     is_active, difficulty_weight, created_at)
                VALUES ($1,$2,$3,$4,true,1.0,$5)
                ON CONFLICT (pool_entry_id) DO NOTHING
            """,
                pool_id,
                SEC_ESSAY_ID,
                q["id"],
                i + 1,
                ts(18),
            )

        # Update stage config_id to point to assessment
        await conn.execute(
            """
            UPDATE group_pipeline_stages
            SET config_id = $1
            WHERE stage_id = $2
        """,
            ASM_ID,
            STG_ASM_ID,
        )
        print(f"  ✅ Assessment: 2 sections, 10 MCQ + 3 Essay in pool  [{ASM_ID}]\n")

        # ── 10. AI Interview Config ───────────────────────────────────────────
        print("📁 Step 10 — AI Interview config")
        ai_questions = {
            "questions": [
                {
                    "id": "aiq1",
                    "order": 1,
                    "text": "Walk me through your experience with React and how you've scaled large applications.",
                    "think_time": 30,
                    "answer_time": 120,
                },
                {
                    "id": "aiq2",
                    "order": 2,
                    "text": "Describe a challenging technical problem you solved recently. What was your approach?",
                    "think_time": 30,
                    "answer_time": 120,
                },
                {
                    "id": "aiq3",
                    "order": 3,
                    "text": "How do you approach code reviews? What do you look for and what feedback do you give?",
                    "think_time": 20,
                    "answer_time": 90,
                },
            ]
        }
        await conn.execute(
            """
            INSERT INTO ai_interview_configs
                (config_id, organization_id, position_id,
                 title, interview_type, instructions,
                 max_retakes, think_time_seconds, answer_time_seconds,
                 questions, difficulty, total_duration_minutes,
                 show_ai_feedback, recording_required,
                 created_by_user_id, created_at, updated_at)
            VALUES ($1,$2,$3,$4,'recorded',$5,1,30,120,$6,'Mid Level',30,true,true,$7,$8,$9)
            ON CONFLICT (config_id) DO NOTHING
        """,
            AIC_ID,
            org_id,
            POS_ID,
            "Senior React Developer — AI Video Interview",
            "Answer 3 questions. You have 30s to think and 2 minutes to record each answer.",
            json.dumps(ai_questions),
            tech_id,
            ts(17),
            ts(17),
        )

        # Update stage to link config
        await conn.execute(
            """
            UPDATE group_pipeline_stages
            SET config_id = $1
            WHERE stage_id = $2
        """,
            AIC_ID,
            STG_AI_ID,
        )
        print(f"  ✅ AI Interview config: 3 recorded questions  [{AIC_ID}]\n")

        # ── 11. LiV2 Rubric + Bank (frozen) ──────────────────────────────────
        print("📁 Step 11 — LiV2 Rubric + Bank (frozen)")
        dimensions = [
            {
                "dimension_id": DIM_TECH,
                "name": "Technical Depth",
                "weight": 0.40,
                "anchors": {
                    "substandard": "Candidate shows surface-level knowledge only; struggles with follow-up probes.",
                    "proficient": "Candidate demonstrates solid understanding and can explain trade-offs clearly.",
                    "excellent": "Candidate exhibits expert-level mastery, citing internal implementation details and real-world application.",
                },
            },
            {
                "dimension_id": DIM_PROB,
                "name": "Problem Solving",
                "weight": 0.30,
                "anchors": {
                    "substandard": "Candidate cannot articulate a structured approach; gives vague answers.",
                    "proficient": "Candidate follows a logical debugging process with reasonable coverage.",
                    "excellent": "Candidate demonstrates systematic methodology, considers edge cases and preemptively identifies risks.",
                },
            },
            {
                "dimension_id": DIM_COMM,
                "name": "Communication",
                "weight": 0.30,
                "anchors": {
                    "substandard": "Candidate gives disjointed, hard-to-follow responses with no structure.",
                    "proficient": "Candidate communicates clearly with a beginning, middle, and end.",
                    "excellent": "Candidate uses storytelling with concrete data/outcomes and adapts to interviewer probes naturally.",
                },
            },
        ]

        # Insert rubric (try with new columns, fall back gracefully)
        try:
            await conn.execute(
                """
                INSERT INTO li_v2_rubrics
                    (rubric_id, group_id, organization_id, version, dimensions,
                     state, time_budget_minutes, language, include_weak_topics,
                     created_at, frozen_at, created_by_user_id)
                VALUES ($1,$2,$3,1,$4,'frozen',10,'en',true,$5,$6,$7)
                ON CONFLICT (rubric_id) DO UPDATE SET
                    state = 'frozen',
                    dimensions = EXCLUDED.dimensions,
                    frozen_at = EXCLUDED.frozen_at
            """,
                RUB_ID,
                GRP_ID,
                org_id,
                json.dumps(dimensions),
                ts(18),
                ts(16),
                tech_id,
            )
        except Exception as e:
            if "language" in str(e) or "include_weak_topics" in str(e):
                print(
                    "  ⚠️  language/include_weak_topics missing — inserting without them (apply migration!)"
                )
                await conn.execute(
                    """
                    INSERT INTO li_v2_rubrics
                        (rubric_id, group_id, organization_id, version, dimensions,
                         state, time_budget_minutes, created_at)
                    VALUES ($1,$2,$3,1,$4,'frozen',10,$5)
                    ON CONFLICT (rubric_id) DO UPDATE SET
                        state = 'frozen', dimensions = EXCLUDED.dimensions
                """,
                    RUB_ID,
                    GRP_ID,
                    org_id,
                    json.dumps(dimensions),
                    ts(18),
                )
            else:
                raise

        bank_items = [
            {
                "bank_item_id": ITEM_1,
                "text": "Explain React's reconciliation algorithm and virtual DOM diffing. What are the key heuristics it uses?",
                "primary_dimension_id": DIM_TECH,
                "secondary_dimension_ids": [],
                "difficulty": 3,
                "is_mandatory": True,
                "is_approved": True,
                "estimated_duration_seconds": 90,
                "question_rubric": {
                    "sub_criteria": [
                        {"name": "Virtual DOM concept", "weight": 0.3},
                        {
                            "name": "Diffing heuristics (element type, keys)",
                            "weight": 0.4,
                        },
                        {"name": "Practical implications", "weight": 0.3},
                    ]
                },
            },
            {
                "bank_item_id": ITEM_2,
                "text": "Your production API response times degrade under heavy load. Walk me through your debugging process and fixes.",
                "primary_dimension_id": DIM_PROB,
                "secondary_dimension_ids": [DIM_TECH],
                "difficulty": 4,
                "is_mandatory": True,
                "is_approved": True,
                "estimated_duration_seconds": 120,
                "question_rubric": {
                    "sub_criteria": [
                        {"name": "Problem identification approach", "weight": 0.35},
                        {"name": "Tooling knowledge", "weight": 0.30},
                        {"name": "Solution breadth", "weight": 0.35},
                    ]
                },
            },
            {
                "bank_item_id": ITEM_3,
                "text": "Tell me about a time you had to push back on a product or design decision. How did it resolve?",
                "primary_dimension_id": DIM_COMM,
                "secondary_dimension_ids": [],
                "difficulty": 2,
                "is_mandatory": True,
                "is_approved": True,
                "estimated_duration_seconds": 90,
                "question_rubric": {
                    "sub_criteria": [
                        {"name": "STAR structure", "weight": 0.3},
                        {"name": "Reasoning & evidence", "weight": 0.4},
                        {"name": "Outcome & reflection", "weight": 0.3},
                    ]
                },
            },
        ]
        try:
            await conn.execute(
                """
                INSERT INTO li_v2_banks
                    (bank_id, rubric_id, group_id, organization_id, version, items,
                     state, created_at, frozen_at, created_by_user_id)
                VALUES ($1,$2,$3,$4,1,$5,'frozen',$6,$7,$8)
                ON CONFLICT (bank_id) DO UPDATE SET
                    state = 'frozen',
                    items = EXCLUDED.items,
                    frozen_at = EXCLUDED.frozen_at
            """,
                BNK_ID,
                RUB_ID,
                GRP_ID,
                org_id,
                json.dumps(bank_items),
                ts(17),
                ts(16),
                tech_id,
            )
        except Exception as e:
            if "frozen_at" in str(e) or "created_by" in str(e):
                print("  ⚠️  frozen_at/created_by missing — inserting without them")
                await conn.execute(
                    """
                    INSERT INTO li_v2_banks
                        (bank_id, rubric_id, group_id, organization_id, version, items, state, created_at)
                    VALUES ($1,$2,$3,$4,1,$5,'frozen',$6)
                    ON CONFLICT (bank_id) DO UPDATE SET state = 'frozen', items = EXCLUDED.items
                """,
                    BNK_ID,
                    RUB_ID,
                    GRP_ID,
                    org_id,
                    json.dumps(bank_items),
                    ts(17),
                )
            else:
                raise
        print(f"  ✅ Rubric (frozen): 3 dimensions  [{RUB_ID}]")
        print(f"  ✅ Bank (frozen): 3 questions     [{BNK_ID}]\n")

        # ── 12. Assessment Sessions + Answers ─────────────────────────────────
        print("📁 Step 12 — OngoingAssessment + Assigned questions + Answers")
        for ci, c in enumerate(CANDS):
            # Pick 3 MCQ + 1 essay (deterministic selection)
            selected_mcq_idx = [0, 3, 6]  # same 3 for all (deterministic)
            selected_essay_idx = [ci % 3]  # different essay per candidate

            assigned_q_map = {}  # question_id: {snapshot}
            selected_q = [MCQ_QUESTIONS[i] for i in selected_mcq_idx] + [
                ESSAY_QUESTIONS[i] for i in selected_essay_idx
            ]
            for q in selected_q:
                assigned_q_map[q["id"]] = {
                    "question_id": q["id"],
                    "text": q["text"],
                    "type": "mcq" if q in MCQ_QUESTIONS else "essay",
                }

            # Score: MCQ correct * 10 + essay partial
            mcq_answers = [CAND_MCQ_ANSWERS[ci][i] for i in selected_mcq_idx]
            mcq_correct = [MCQ_QUESTIONS[i]["correct"] for i in selected_mcq_idx]
            mcq_points = sum(
                10 for a, c_ans in zip(mcq_answers, mcq_correct) if a == c_ans
            )
            essay_points = {0: 16, 1: 13, 2: 14}[ci]  # Sara=16, Omar=13, Lina=14
            total_pts = mcq_points + essay_points
            max_pts = 3 * 10 + 1 * 20

            await conn.execute(
                """
                INSERT INTO ongoing_assessments
                    (session_id, assessment_id, application_id, organization_id,
                     assigned_questions, status, started_at, submitted_at,
                     time_spent_seconds, total_score, total_points, max_points, flag_count)
                VALUES ($1,$2,$3,$4,$5,'submitted',$6,$7,2340,$8,$9,$10,0)
                ON CONFLICT (session_id) DO UPDATE SET
                    status = 'submitted',
                    total_score = EXCLUDED.total_score,
                    total_points = EXCLUDED.total_points,
                    max_points = EXCLUDED.max_points
            """,
                c["oas_id"],
                ASM_ID,
                c["app_id"],
                org_id,
                json.dumps(assigned_q_map),
                ts(10, 2),
                ts(10),
                Decimal(str(total_pts)),
                total_pts,
                max_pts,
            )

            # CandidateAssignedQuestions — deterministic UUIDs via sid()
            caqs = [(make_uid(10, ci + 1, j + 1), j) for j in range(len(selected_q))]
            pool_ids_used = [POOL_MCQ[i] for i in selected_mcq_idx] + [
                POOL_ESSAY[selected_essay_idx[0]]
            ]
            for (caq_id, disp_order), q, pool_id in zip(
                caqs, selected_q, pool_ids_used
            ):
                await conn.execute(
                    """
                    INSERT INTO candidate_assigned_questions
                        (assignment_id, session_id, section_id, pool_entry_id,
                         question_snapshot, display_order, assigned_at)
                    VALUES ($1,$2,$3,$4,$5,$6,$7)
                    ON CONFLICT (assignment_id) DO NOTHING
                """,
                    caq_id,
                    c["oas_id"],
                    SEC_MCQ_ID if q in MCQ_QUESTIONS else SEC_ESSAY_ID,
                    pool_id,
                    json.dumps({"question_id": q["id"], "text": q["text"]}),
                    disp_order + 1,
                    ts(10, 2),
                )

            # CandidateAnswers
            for j, (q, caq_id_tup, pool_id) in enumerate(
                zip(selected_q, caqs, pool_ids_used)
            ):
                caq_id = caq_id_tup[0]
                ans_id = make_uid(11, ci + 1, j + 1)
                is_mcq = q in MCQ_QUESTIONS

                if is_mcq:
                    mcq_list_idx = selected_mcq_idx[j]
                    chosen_idx = CAND_MCQ_ANSWERS[ci][mcq_list_idx]
                    correct_idx = MCQ_QUESTIONS[mcq_list_idx]["correct"]
                    is_correct = chosen_idx == correct_idx
                    pts = Decimal("10") if is_correct else Decimal("0")
                    answer_data = {
                        "type": "mcq",
                        "selected_index": chosen_idx,
                        "selected_text": q["options"][chosen_idx],
                    }
                else:
                    is_correct = None
                    pts = Decimal(str(essay_points))
                    answer_data = {
                        "type": "essay",
                        "text": CAND_ESSAY_ANSWERS[ci][selected_essay_idx[0]],
                    }

                await conn.execute(
                    """
                    INSERT INTO candidate_answers
                        (answer_id, session_id, question_id, question_order,
                         answer_data, is_correct, points_earned, points_max,
                         time_spent_seconds, answered_at, assignment_id)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
                    ON CONFLICT (answer_id) DO UPDATE SET
                        answer_data = EXCLUDED.answer_data,
                        is_correct = EXCLUDED.is_correct,
                        points_earned = EXCLUDED.points_earned
                """,
                    ans_id,
                    c["oas_id"],
                    q["id"],
                    j + 1,
                    json.dumps(answer_data),
                    is_correct,
                    pts,
                    10 if is_mcq else 20,
                    180 + j * 60,
                    ts(10),
                    caq_id,
                )

            # Proctoring flag (1 per candidate in assessment)
            flag_id = make_uid(12, ci + 1, 1)
            await conn.execute(
                """
                INSERT INTO proctoring_flags
                    (flag_id, application_id, session_id, session_type,
                     organization_id, timestamp_seconds, event_type,
                     severity, evidence, detected_by, status, created_at)
                VALUES ($1,$2,$3,'assessment',$4,$5,$6,$7,$8,'face_detection','pending',$9)
                ON CONFLICT (flag_id) DO NOTHING
            """,
                flag_id,
                c["app_id"],
                c["oas_id"],
                org_id,
                45 + ci * 30,
                "face_not_detected",
                "low" if ci == 0 else "medium",
                f"Face not detected at {45 + ci * 30}s during assessment",
                ts(10),
            )

            print(f"  ✅ Assessment session [{total_pts}/{max_pts}]: {c['name']}")
        print()

        # ── 12b. Assessment Sessions + Answers (NEW candidates) ────────────
        print(
            "📁 Step 12b — OngoingAssessment + Assigned questions + Answers (NEW candidates)"
        )
        new_essay_points = {
            0: 18,  # Khalid — strong essays
            1: 8,  # Nour — weak essays
            2: 14,  # Fatima — decent but scattered
            3: 12,  # Youssef — brief but correct
            4: 11,  # Amira — decent, transferable
        }
        for nci, c in enumerate(NEW_CANDS):
            selected_mcq_idx = [0, 3, 6]
            selected_essay_idx = [nci % 3]

            assigned_q_map = {}
            selected_q = [MCQ_QUESTIONS[i] for i in selected_mcq_idx] + [
                ESSAY_QUESTIONS[i] for i in selected_essay_idx
            ]
            for q in selected_q:
                assigned_q_map[q["id"]] = {
                    "question_id": q["id"],
                    "text": q["text"],
                    "type": "mcq" if q in MCQ_QUESTIONS else "essay",
                }

            mcq_answers = [NEW_CAND_MCQ_ANSWERS[nci][i] for i in selected_mcq_idx]
            mcq_correct = [MCQ_QUESTIONS[i]["correct"] for i in selected_mcq_idx]
            mcq_points = sum(
                10 for a, c_ans in zip(mcq_answers, mcq_correct) if a == c_ans
            )
            essay_points = new_essay_points[nci]
            total_pts = mcq_points + essay_points
            max_pts = 3 * 10 + 1 * 20

            await conn.execute(
                """
                INSERT INTO ongoing_assessments
                    (session_id, assessment_id, application_id, organization_id,
                     assigned_questions, status, started_at, submitted_at,
                     time_spent_seconds, total_score, total_points, max_points, flag_count)
                VALUES ($1,$2,$3,$4,$5,'submitted',$6,$7,2340,$8,$9,$10,0)
                ON CONFLICT (session_id) DO UPDATE SET
                    status = 'submitted',
                    total_score = EXCLUDED.total_score,
                    total_points = EXCLUDED.total_points,
                    max_points = EXCLUDED.max_points
            """,
                c["oas_id"],
                ASM_ID,
                c["app_id"],
                org_id,
                json.dumps(assigned_q_map),
                ts(10, 2),
                ts(10),
                Decimal(str(total_pts)),
                total_pts,
                max_pts,
            )

            caqs = [(make_uid(15, nci + 1, j + 1), j) for j in range(len(selected_q))]
            pool_ids_used = [POOL_MCQ[i] for i in selected_mcq_idx] + [
                POOL_ESSAY[selected_essay_idx[0]]
            ]
            for (caq_id, disp_order), q, pool_id in zip(
                caqs, selected_q, pool_ids_used
            ):
                await conn.execute(
                    """
                    INSERT INTO candidate_assigned_questions
                        (assignment_id, session_id, section_id, pool_entry_id,
                         question_snapshot, display_order, assigned_at)
                    VALUES ($1,$2,$3,$4,$5,$6,$7)
                    ON CONFLICT (assignment_id) DO NOTHING
                """,
                    caq_id,
                    c["oas_id"],
                    SEC_MCQ_ID if q in MCQ_QUESTIONS else SEC_ESSAY_ID,
                    pool_id,
                    json.dumps({"question_id": q["id"], "text": q["text"]}),
                    disp_order + 1,
                    ts(10, 2),
                )

            for j, (q, caq_id_tup, pool_id) in enumerate(
                zip(selected_q, caqs, pool_ids_used)
            ):
                caq_id = caq_id_tup[0]
                ans_id = make_uid(16, nci + 1, j + 1)
                is_mcq = q in MCQ_QUESTIONS

                if is_mcq:
                    mcq_list_idx = selected_mcq_idx[j]
                    chosen_idx = NEW_CAND_MCQ_ANSWERS[nci][mcq_list_idx]
                    correct_idx = MCQ_QUESTIONS[mcq_list_idx]["correct"]
                    is_correct = chosen_idx == correct_idx
                    pts = Decimal("10") if is_correct else Decimal("0")
                    answer_data = {
                        "type": "mcq",
                        "selected_index": chosen_idx,
                        "selected_text": q["options"][chosen_idx],
                    }
                else:
                    is_correct = None
                    pts = Decimal(str(essay_points))
                    answer_data = {
                        "type": "essay",
                        "text": NEW_CAND_ESSAY_ANSWERS[nci][selected_essay_idx[0]],
                    }

                await conn.execute(
                    """
                    INSERT INTO candidate_answers
                        (answer_id, session_id, question_id, question_order,
                         answer_data, is_correct, points_earned, points_max,
                         time_spent_seconds, answered_at, assignment_id)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
                    ON CONFLICT (answer_id) DO UPDATE SET
                        answer_data = EXCLUDED.answer_data,
                        is_correct = EXCLUDED.is_correct,
                        points_earned = EXCLUDED.points_earned
                """,
                    ans_id,
                    c["oas_id"],
                    q["id"],
                    j + 1,
                    json.dumps(answer_data),
                    is_correct,
                    pts,
                    10 if is_mcq else 20,
                    180 + j * 60,
                    ts(10),
                    caq_id,
                )

            flag_id = make_uid(17, nci + 1, 1)
            await conn.execute(
                """
                INSERT INTO proctoring_flags
                    (flag_id, application_id, session_id, session_type,
                     organization_id, timestamp_seconds, event_type,
                     severity, evidence, detected_by, status, created_at)
                VALUES ($1,$2,$3,'assessment',$4,$5,$6,$7,$8,'face_detection','pending',$9)
                ON CONFLICT (flag_id) DO NOTHING
            """,
                flag_id,
                c["app_id"],
                c["oas_id"],
                org_id,
                60 + nci * 25,
                "face_not_detected",
                "low" if nci % 2 == 0 else "medium",
                f"Face not detected at {60 + nci * 25}s during assessment",
                ts(10),
            )

            print(f"  ✅ Assessment session [{total_pts}/{max_pts}]: {c['name']}")
        print()

        # ── 13. AI Interview Sessions + Turns + Responses ─────────────────────
        print("📁 Step 13 — OngoingInterview + Turns + Responses (AI interview stage)")
        for ci, c in enumerate(CANDS):
            ai_qs = ai_questions["questions"]
            ai_overall = c["ai_score"] / Decimal("100")
            await conn.execute(
                """
                INSERT INTO ongoing_interviews
                    (session_id, config_id, application_id, organization_id,
                     interview_type, status, started_at, completed_at,
                     overall_score, technical_score, communication_score,
                     confidence_score, flag_count)
                VALUES ($1,$2,$3,$4,'recorded','completed',$5,$6,$7,$8,$9,$10,0)
                ON CONFLICT (session_id) DO UPDATE SET
                    status = 'completed',
                    overall_score = EXCLUDED.overall_score
            """,
                c["oint_id"],
                AIC_ID,
                c["app_id"],
                org_id,
                ts(7, 3),
                ts(7),
                ai_overall,
                ai_overall * Decimal("1.05"),
                ai_overall * Decimal("0.95"),
                ai_overall * Decimal("1.00"),
            )

            # 6 turns (3 Q/A pairs — ai introduces, candidate responds, repeated 3x)
            turns = []
            for qi, q in enumerate(ai_qs):
                turns.append(
                    {
                        "turn_number": qi * 2 + 1,
                        "speaker": "ai",
                        "content": q["text"],
                        "duration_seconds": 8,
                    }
                )
                turns.append(
                    {
                        "turn_number": qi * 2 + 2,
                        "speaker": "candidate",
                        "content": CAND_ESSAY_ANSWERS[ci][qi % 3],
                        "duration_seconds": 90 + qi * 15,
                    }
                )
            for t in turns:
                turn_id = make_uid(13, ci + 1, t["turn_number"])
                await conn.execute(
                    """
                    INSERT INTO ai_interview_turns
                        (turn_id, session_id, turn_number, speaker, content,
                         duration_seconds, created_at)
                    VALUES ($1,$2,$3,$4,$5,$6,$7)
                    ON CONFLICT (turn_id) DO NOTHING
                """,
                    turn_id,
                    c["oint_id"],
                    t["turn_number"],
                    t["speaker"],
                    t["content"],
                    t["duration_seconds"],
                    ts(7),
                )

            # 3 interview responses (one per question)
            for qi, q in enumerate(ai_qs):
                resp_id = make_uid(14, ci + 1, qi + 1)
                await conn.execute(
                    """
                    INSERT INTO interview_responses
                        (response_id, session_id, question_id, question_order,
                         question_text, transcript, retake_number,
                         duration_seconds, ai_score, processing_status, answered_at)
                    VALUES ($1,$2,$3,$4,$5,$6,1,$7,$8,'completed',$9)
                    ON CONFLICT (response_id) DO NOTHING
                """,
                    resp_id,
                    c["oint_id"],
                    q["id"],
                    qi + 1,
                    q["text"],
                    CAND_ESSAY_ANSWERS[ci][qi % 3],
                    90 + qi * 10,
                    ai_overall * Decimal("0.9") + Decimal(str(qi * 0.03)),
                    ts(7),
                )

            print(f"  ✅ AI interview session (3 Q/A turns): {c['name']}")
        print()

        # ── 13b. AI Interview Sessions (NEW candidates) ────────────────────
        print("📁 Step 13b — OngoingInterview + Turns + Responses (NEW candidates)")
        for nci, c in enumerate(NEW_CANDS):
            ai_qs = ai_questions["questions"]
            ai_overall = c["ai_score"] / Decimal("100")
            await conn.execute(
                """
                INSERT INTO ongoing_interviews
                    (session_id, config_id, application_id, organization_id,
                     interview_type, status, started_at, completed_at,
                     overall_score, technical_score, communication_score,
                     confidence_score, flag_count)
                VALUES ($1,$2,$3,$4,'recorded','completed',$5,$6,$7,$8,$9,$10,0)
                ON CONFLICT (session_id) DO UPDATE SET
                    status = 'completed',
                    overall_score = EXCLUDED.overall_score
            """,
                c["oint_id"],
                AIC_ID,
                c["app_id"],
                org_id,
                ts(7, 3),
                ts(7),
                ai_overall,
                ai_overall * Decimal("1.05"),
                ai_overall * Decimal("0.95"),
                ai_overall * Decimal("1.00"),
            )

            turns = []
            for qi, q in enumerate(ai_qs):
                turns.append(
                    {
                        "turn_number": qi * 2 + 1,
                        "speaker": "ai",
                        "content": q["text"],
                        "duration_seconds": 8,
                    }
                )
                turns.append(
                    {
                        "turn_number": qi * 2 + 2,
                        "speaker": "candidate",
                        "content": NEW_CAND_ESSAY_ANSWERS[nci][qi % 3],
                        "duration_seconds": 90 + qi * 15,
                    }
                )
            for t in turns:
                turn_id = make_uid(18, nci + 1, t["turn_number"])
                await conn.execute(
                    """
                    INSERT INTO ai_interview_turns
                        (turn_id, session_id, turn_number, speaker, content,
                         duration_seconds, created_at)
                    VALUES ($1,$2,$3,$4,$5,$6,$7)
                    ON CONFLICT (turn_id) DO NOTHING
                """,
                    turn_id,
                    c["oint_id"],
                    t["turn_number"],
                    t["speaker"],
                    t["content"],
                    t["duration_seconds"],
                    ts(7),
                )

            for qi, q in enumerate(ai_qs):
                resp_id = make_uid(19, nci + 1, qi + 1)
                await conn.execute(
                    """
                    INSERT INTO interview_responses
                        (response_id, session_id, question_id, question_order,
                         question_text, transcript, retake_number,
                         duration_seconds, ai_score, processing_status, answered_at)
                    VALUES ($1,$2,$3,$4,$5,$6,1,$7,$8,'completed',$9)
                    ON CONFLICT (response_id) DO NOTHING
                """,
                    resp_id,
                    c["oint_id"],
                    q["id"],
                    qi + 1,
                    q["text"],
                    NEW_CAND_ESSAY_ANSWERS[nci][qi % 3],
                    90 + qi * 10,
                    ai_overall * Decimal("0.9") + Decimal(str(qi * 0.03)),
                    ts(7),
                )

            print(f"  ✅ AI interview session (3 Q/A turns): {c['name']}")
        print()

        # ── 14. Candidate Pipeline Progress (all 3 stages) ───────────────────
        print("📁 Step 14 — CandidatePipelineProgress (all 3 stages × 3 candidates)")
        for c in CANDS:
            asm_score = c["asm_score"]
            ai_score = c["ai_score"]

            # Assessment progress
            await conn.execute(
                """
                INSERT INTO candidate_pipeline_progress
                    (progress_id, application_id, stage_id, status,
                     session_id, session_type, score, max_score, passed,
                     unlocked_at, started_at, completed_at)
                VALUES ($1,$2,$3,'completed',$4,'assessment',$5,100,$6,$7,$8,$9)
                ON CONFLICT (progress_id) DO UPDATE SET
                    status = 'completed',
                    score = EXCLUDED.score,
                    session_id = EXCLUDED.session_id
            """,
                c["prg_asm"],
                c["app_id"],
                STG_ASM_ID,
                c["oas_id"],
                asm_score,
                asm_score >= Decimal("70"),
                ts(12),
                ts(10, 2),
                ts(10),
            )

            # AI interview progress
            await conn.execute(
                """
                INSERT INTO candidate_pipeline_progress
                    (progress_id, application_id, stage_id, status,
                     session_id, session_type, score, max_score, passed,
                     unlocked_at, started_at, completed_at)
                VALUES ($1,$2,$3,'completed',$4,'ai_interview',$5,100,$6,$7,$8,$9)
                ON CONFLICT (progress_id) DO UPDATE SET
                    status = 'completed',
                    score = EXCLUDED.score,
                    session_id = EXCLUDED.session_id
            """,
                c["prg_ai"],
                c["app_id"],
                STG_AI_ID,
                c["oint_id"],
                ai_score,
                ai_score >= Decimal("60"),
                ts(9),
                ts(7, 3),
                ts(7),
            )

            # Live interview progress
            await conn.execute(
                """
                INSERT INTO candidate_pipeline_progress
                    (progress_id, application_id, stage_id, status,
                     session_id, session_type, score, max_score, passed,
                     unlocked_at, started_at, completed_at)
                VALUES ($1,$2,$3,'completed',$4,'live_interview',$5,100,$6,$7,$8,$9)
                ON CONFLICT (progress_id) DO UPDATE SET
                    status = 'completed',
                    score = EXCLUDED.score,
                    session_id = EXCLUDED.session_id
            """,
                c["prg_liv"],
                c["app_id"],
                STG_LIV_ID,
                c["ses_id"],
                Decimal(str(c["li_score_pct"])),
                c["li_meets"],
                ts(3),
                ts(1, 3),
                ts(1),
            )

            print(f"  ✅ Pipeline progress (3 stages): {c['name']}")
        print()

        # ── 14b. Candidate Pipeline Progress (NEW candidates) ───────────────
        print(
            "📁 Step 14b — CandidatePipelineProgress (NEW candidates: assessment+ai completed, live_interview unlocked)"
        )
        for c in NEW_CANDS:
            asm_score = c["asm_score"]
            ai_score = c["ai_score"]

            await conn.execute(
                """
                INSERT INTO candidate_pipeline_progress
                    (progress_id, application_id, stage_id, status,
                     session_id, session_type, score, max_score, passed,
                     unlocked_at, started_at, completed_at)
                VALUES ($1,$2,$3,'completed',$4,'assessment',$5,100,$6,$7,$8,$9)
                ON CONFLICT (progress_id) DO UPDATE SET
                    status = 'completed',
                    score = EXCLUDED.score,
                    session_id = EXCLUDED.session_id
            """,
                c["prg_asm"],
                c["app_id"],
                STG_ASM_ID,
                c["oas_id"],
                asm_score,
                asm_score >= Decimal("70"),
                ts(12),
                ts(10, 2),
                ts(10),
            )

            await conn.execute(
                """
                INSERT INTO candidate_pipeline_progress
                    (progress_id, application_id, stage_id, status,
                     session_id, session_type, score, max_score, passed,
                     unlocked_at, started_at, completed_at)
                VALUES ($1,$2,$3,'completed',$4,'ai_interview',$5,100,$6,$7,$8,$9)
                ON CONFLICT (progress_id) DO UPDATE SET
                    status = 'completed',
                    score = EXCLUDED.score,
                    session_id = EXCLUDED.session_id
            """,
                c["prg_ai"],
                c["app_id"],
                STG_AI_ID,
                c["oint_id"],
                ai_score,
                ai_score >= Decimal("60"),
                ts(9),
                ts(7, 3),
                ts(7),
            )

            # Live interview: unlocked (not yet started)
            await conn.execute(
                """
                INSERT INTO candidate_pipeline_progress
                    (progress_id, application_id, stage_id, status,
                     session_id, session_type,
                     unlocked_at, started_at, completed_at)
                VALUES ($1,$2,$3,'unlocked',NULL,'live_interview',$4,NULL,NULL)
                ON CONFLICT (progress_id) DO UPDATE SET
                    status = 'unlocked'
            """,
                c["prg_liv"],
                c["app_id"],
                STG_LIV_ID,
                ts(3),
            )

            print(f"  ✅ Pipeline progress (asm+ai done, live unlocked): {c['name']}")
        print()

        # ── 15. LiV2 Sessions ─────────────────────────────────────────────────
        print("📁 Step 15 — LiV2 Sessions (all completed)")
        for c in CANDS:
            ctx = build_context_pool(c)
            transcript = build_transcript(c)
            room = f"li-v2-{GRP_ID[:8]}-{c['id'][:8]}"
            await conn.execute(
                """
                INSERT INTO li_v2_sessions
                    (session_id, candidate_id, application_id, group_id, organization_id,
                     rubric_id, bank_id, room_name, state,
                     started_at, ended_at, duration_seconds,
                     context_pool, transcript, created_at)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'completed',$9,$10,540,$11,$12,$13)
                ON CONFLICT (session_id) DO UPDATE SET
                    state = 'completed',
                    context_pool = EXCLUDED.context_pool,
                    transcript = EXCLUDED.transcript,
                    ended_at = EXCLUDED.ended_at
            """,
                c["ses_id"],
                c["id"],
                c["app_id"],
                GRP_ID,
                org_id,
                RUB_ID,
                BNK_ID,
                room,
                ts(1, 3),
                ts(1),
                json.dumps(ctx),
                json.dumps(transcript),
                ts(2),
            )
            print(f"  ✅ Session [completed]: {c['name']}  [{c['ses_id']}]")
        print()

        # ── 16. LiV2 Evaluations ──────────────────────────────────────────────
        print("📁 Step 16 — LiV2 Evaluations")
        for c in CANDS:
            per_q = [
                {
                    "bank_item_id": ITEM_1,
                    "question_text": "Explain React's reconciliation algorithm...",
                    "dimension_id": DIM_TECH,
                    "score": round(c["li_dim"][DIM_TECH], 3),
                    "feedback": "Strong conceptual knowledge of React internals.",
                    "evidence_snippets": [
                        "React maintains a virtual DOM...",
                        "Keys on lists are critical...",
                    ],
                },
                {
                    "bank_item_id": ITEM_2,
                    "question_text": "Your production API response times degrade under heavy load...",
                    "dimension_id": DIM_PROB,
                    "score": round(c["li_dim"][DIM_PROB], 3),
                    "feedback": "Systematic debugging approach outlined.",
                    "evidence_snippets": [
                        "First I'd profile...",
                        "Common culprits are N+1 queries...",
                    ],
                },
                {
                    "bank_item_id": ITEM_3,
                    "question_text": "Tell me about a time you had to push back on a design decision...",
                    "dimension_id": DIM_COMM,
                    "score": round(c["li_dim"][DIM_COMM], 3),
                    "feedback": "Clear STAR structure with concrete data.",
                    "evidence_snippets": [
                        "I built a quick A/B prototype...",
                        "scored 30% higher...",
                    ],
                },
            ]
            dim_scores = {
                "Technical Depth": c["li_dim"][DIM_TECH],
                "Problem Solving": c["li_dim"][DIM_PROB],
                "Communication": c["li_dim"][DIM_COMM],
            }
            auto_tags = {
                "strong_on": ["Technical Depth"]
                if c["li_dim"][DIM_TECH] >= 0.80
                else [],
                "weak_on": ["Problem Solving"] if c["li_dim"][DIM_PROB] < 0.70 else [],
                "cv_verified": True,
                "consistent_with_cv": True,
            }
            await conn.execute(
                """
                INSERT INTO li_v2_evaluations
                    (evaluation_id, session_id, organization_id,
                     overall_score, overall_score_pct, auto_verdict,
                     meets_criteria, coverage_ratio,
                     per_question_results, dimension_scores,
                     auto_tags, integrity_flags, evaluation_confidence, judged_at)
                VALUES ($1,$2,$3,$4,$5,$6,$7,1.00,$8,$9,$10,$11,$12,$13)
                ON CONFLICT (evaluation_id) DO UPDATE SET
                    overall_score = EXCLUDED.overall_score,
                    overall_score_pct = EXCLUDED.overall_score_pct,
                    auto_verdict = EXCLUDED.auto_verdict,
                    dimension_scores = EXCLUDED.dimension_scores
            """,
                c["eval_id"],
                c["ses_id"],
                org_id,
                c["li_overall"],
                c["li_score_pct"],
                c["li_verdict"],
                c["li_meets"],
                json.dumps(per_q),
                json.dumps(dim_scores),
                json.dumps(auto_tags),
                json.dumps({"injection_attempts": 0, "anomalies": []}),
                "high" if c["li_score_pct"] >= 75 else "medium",
                ts(0, 2),
            )
            print(
                f"  ✅ Evaluation [{c['li_verdict']:12s}] ({c['li_score_pct']}%): {c['name']}"
            )
        print()

        # ── SUMMARY ───────────────────────────────────────────────────────────
        print("=" * 65)
        print("  ✅ SEED COMPLETE — Full Journey Summary")
        print("=" * 65)
        print(f"""
  ORG:       {org_id}
  PROJECT:   {PROJ_ID}
  POSITION:  {POS_ID}
  GROUP:     {GRP_ID}
  RUBRIC:    {RUB_ID}
  BANK:      {BNK_ID}

  Questions: 10 MCQ + 3 Essay in question_bank
  Stages:    assessment(closed) → ai_interview(closed) → live_interview(active)

  Candidates (existing — completed live interview):
    Sara Al-Harthi     → completed  84%  strong_pass   SES: {CANDS[0]["ses_id"]}
    Omar Khaled        → completed  68%  borderline    SES: {CANDS[1]["ses_id"]}
    Lina Farouk        → completed  75%  pass          SES: {CANDS[2]["ses_id"]}

  Candidates (new — unlocked for live interview):
    Khalid Mansour     → unlocked   asm:85  ai:88
    Nour El-Din Hassan → unlocked   asm:55  ai:52
    Fatima Al-Rashid   → unlocked   asm:68  ai:65
    Youssef Bekhit     → unlocked   asm:80  ai:74
    Amira Tawfik       → unlocked   asm:62  ai:66

  Login Credentials (password: admin12345):
    HR:           hr@eramatch.com
    Tech:         tech@eramatch.com
    Admin:        admin_1@eramatch.com
    Candidate 1:  sara.alharthi@example.com
    Candidate 2:  omar.khaled@example.com
    Candidate 3:  lina.farouk@example.com
    Candidate 4:  khalid.mansour@example.com
    Candidate 5:  nour.eldin@example.com
    Candidate 6:  fatima.rashid@example.com
    Candidate 7:  youssef.bekhit@example.com
    Candidate 8:  amira.tawfik@example.com
""")

    finally:
        await conn.close()


def main():
    asyncio.run(run_seed())


if __name__ == "__main__":
    main()
