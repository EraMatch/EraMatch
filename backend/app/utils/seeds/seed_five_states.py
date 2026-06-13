"""
seed_five_states.py — Multi-State Pipeline Seeder
==================================================

Creates a fully self-contained test fixture: 1 org + 3 users + 3 candidate
personas × 5 groups, each group frozen at a different pipeline stage.

    G-A: awaiting Level-2 config  (filtration_flow set, config_id=NULL)
    G-B: configured, nothing started
    G-C: assessment stage active (C1 in-progress, C2/C3 unlocked)
    G-D: assessment closed, decision pending (scores set, passed=NULL)
    G-E: all 3 stages complete (transitions, evaluations, offers TBD)

Realism contract:
  • Timestamps strictly ordered per group (applied < group < start < session < answers < close < transition)
  • JSONB shapes come from writer-code (candidate_assessment.py, judge.py, etc.)
  • li_v2_evaluations.dimension_scores = dict-of-dicts keyed by dimension_id
  • All datetimes tz-naive (utcnow) for TIMESTAMP WITHOUT TIME ZONE columns
  • ON CONFLICT DO UPDATE — fully idempotent; --reset flag wipes ab-prefixed rows

Usage:
    cd EraMatch/backend
    source .venv/bin/activate
    python -m app.utils.seed_five_states          # create/update
    python -m app.utils.seed_five_states --reset  # wipe all ab-prefix rows then re-seed

Credentials after seeding (password: admin12345 for all):
    Admin:  admin_1@eramatch.com
    HR:     hr@eramatch.com
    Tech:   tech@eramatch.com
    C1 (strong): c1.strong@example.com
    C2 (mid):    c2.mid@example.com
    C3 (weak):   c3.weak@example.com   (qag_score intentionally null)
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from datetime import datetime, timedelta
from decimal import Decimal
from pathlib import Path

try:
    from dotenv import load_dotenv
    env_path = Path(__file__).resolve().parents[3] / ".env"
    load_dotenv(dotenv_path=env_path if env_path.exists() else None)
except ImportError:
    env_path = Path(__file__).resolve().parents[3] / ".env"
    if env_path.exists():
        with open(env_path) as _f:
            for _line in _f:
                _line = _line.strip()
                if _line and not _line.startswith("#") and "=" in _line:
                    _k, _v = _line.split("=", 1)
                    os.environ.setdefault(_k.strip(), _v.strip())

import asyncpg
import bcrypt

# ─────────────────────────────────────────────────────────────────────────────
# CONNECTION
# ─────────────────────────────────────────────────────────────────────────────
_RAW_DB_URL = os.environ.get("DATABASE_URL", "")
for _pfx in ("postgresql+asyncpg://", "postgres+asyncpg://"):
    if _RAW_DB_URL.startswith(_pfx):
        _RAW_DB_URL = "postgresql://" + _RAW_DB_URL[len(_pfx):]
RAW_DB_URL = _RAW_DB_URL

_pw = b"admin12345"
DEFAULT_HASH = bcrypt.hashpw(_pw, bcrypt.gensalt(rounds=12)).decode()

NOW = datetime.utcnow()


def ts(days: int = 0, hours: int = 0, minutes: int = 0) -> datetime:
    return NOW - timedelta(days=days, hours=hours, minutes=minutes)


# ─────────────────────────────────────────────────────────────────────────────
# FIXED UUIDs — namespace: ab (eramatch-five-states)
# ─────────────────────────────────────────────────────────────────────────────

# Org + auth
PLAN_ID  = "ab100001-0000-0000-0000-000000000001"
ORG_ID   = "ab100001-0000-0000-0000-000000000002"
ADMIN_ID = "ab100001-0000-0000-0000-000000000010"
HR_ID    = "ab100001-0000-0000-0000-000000000011"
TECH_ID  = "ab100001-0000-0000-0000-000000000012"

# Project + Position
PROJ_ID  = "ab200001-0000-0000-0000-000000000001"
POS_ID   = "ab200001-0000-0000-0000-000000000002"

# Candidate personas (reused across all groups via separate application rows)
C1_ID = "ab300001-0000-0000-0000-000000000001"   # strong: sem=84, qag=78
C2_ID = "ab300001-0000-0000-0000-000000000002"   # mid:    sem=67, qag=61
C3_ID = "ab300001-0000-0000-0000-000000000003"   # weak:   sem=52, qag=None
CAND_IDS = [C1_ID, C2_ID, C3_ID]

# Question Bank: 10 MCQ + 3 Essay + 3 Coding = 16
QB_MCQ    = [f"ab400001-0000-0000-0000-{i:012d}" for i in range(1, 11)]
QB_ESSAY  = [f"ab400001-0000-0000-0000-{i:012d}" for i in range(11, 14)]
QB_CODING = [f"ab400001-0000-0000-0000-{i:012d}" for i in range(14, 17)]

# Shared configs (G-B through G-E all reference these)
ASM_ID       = "ab500001-0000-0000-0000-000000000001"
ASM_SEC_MCQ  = "ab500001-0000-0000-0000-000000000002"
ASM_SEC_ESS  = "ab500001-0000-0000-0000-000000000003"
ASM_SEC_COD  = "ab500001-0000-0000-0000-000000000004"
POOL_MCQ     = [f"ab500001-0000-0000-0001-{i:012d}" for i in range(1, 11)]
POOL_ESS     = [f"ab500001-0000-0000-0001-{i:012d}" for i in range(11, 14)]
POOL_COD     = [f"ab500001-0000-0000-0001-{i:012d}" for i in range(14, 17)]
AIC_ID       = "ab500001-0000-0000-0000-000000000010"
# LiV2 rubric/bank are per-group (group_id NOT NULL) — IDs generated via _grp(g,9,1/2)
DIM_TECH_ID  = "ab500001-0000-0000-0000-000000000030"
DIM_PROB_ID  = "ab500001-0000-0000-0000-000000000031"
DIM_COMM_ID  = "ab500001-0000-0000-0000-000000000032"
BNK_ITEM_1   = "ab500001-0000-0000-0000-000000000040"
BNK_ITEM_2   = "ab500001-0000-0000-0000-000000000041"
BNK_ITEM_3   = "ab500001-0000-0000-0000-000000000042"

# Per-group IDs helper
# Group letters: a=1, b=2, c=3, d=4, e=5
_GRP_MAP = {"a": 1, "b": 2, "c": 3, "d": 4, "e": 5}

def _grp(g: str, kind: int, n: int = 1) -> str:
    """Deterministic UUID for a per-group entity.
    g: a-e (group letter)
    kind: 0=group, 1=stages(1-3), 2=apps(1-3), 3=cva(1-3),
          9=liv2_rubric/bank(1=rubric, 2=bank),
          10=oas(1-3), 11=interview session(1-3), 12=liv2 session(1-3),
          13=liv2 evaluation(1-3), 14=progress(1-9), 15=assigned_q(1-15),
          16=answers(1-15), 17=interview_resp(1-9), 18=interview_turns(1-30),
          19=proctoring_flags(1-3), 20=email_logs(1-10), 21=system_logs(1-5),
          22=pipeline_transitions(1-6)
    n: sequence number
    """
    gi = _GRP_MAP[g]
    return f"ab6{gi}{kind:04d}-0000-0000-0000-{n:012d}"


GRP_IDS = {g: _grp(g, 0) for g in "abcde"}

# ─────────────────────────────────────────────────────────────────────────────
# CANDIDATE PERSONAS DATA
# ─────────────────────────────────────────────────────────────────────────────
CANDS = [
    {
        "id": C1_ID,
        "name": "Aisha Karimi",
        "email": "c1.strong@example.com",
        "phone": "+971-50-111-0001",
        "location": "Dubai, UAE",
        "github": "https://github.com/aishakarimi",
        "linkedin": "https://linkedin.com/in/aishakarimi",
        "skills": ["React", "TypeScript", "Next.js", "Node.js", "GraphQL", "AWS"],
        "exp_years": Decimal("5.5"),
        "sem_score": Decimal("84.0"),
        "qag_score": Decimal("78.0"),   # not None
        "match_score": Decimal("84.0"),
        "ai_score": Decimal("82.0"),
        "li_score_pct": 86,
        "li_overall": Decimal("0.8600"),
        "li_verdict": "strong_pass",
        "li_dim": {DIM_TECH_ID: 0.90, DIM_PROB_ID: 0.85, DIM_COMM_ID: 0.82},
    },
    {
        "id": C2_ID,
        "name": "Bilal Mansour",
        "email": "c2.mid@example.com",
        "phone": "+20-100-222-0002",
        "location": "Cairo, Egypt",
        "github": "https://github.com/bilalm",
        "linkedin": "https://linkedin.com/in/bilalm",
        "skills": ["React", "JavaScript", "CSS", "REST APIs", "Git", "Docker"],
        "exp_years": Decimal("3.0"),
        "sem_score": Decimal("67.0"),
        "qag_score": Decimal("61.0"),
        "match_score": Decimal("67.0"),
        "ai_score": Decimal("70.0"),
        "li_score_pct": 74,
        "li_overall": Decimal("0.7400"),
        "li_verdict": "pass",
        "li_dim": {DIM_TECH_ID: 0.76, DIM_PROB_ID: 0.72, DIM_COMM_ID: 0.74},
    },
    {
        "id": C3_ID,
        "name": "Chadene Okwu",
        "email": "c3.weak@example.com",
        "phone": "+234-80-333-0003",
        "location": "Lagos, Nigeria",
        "github": None,
        "linkedin": "https://linkedin.com/in/chadeneokwu",
        "skills": ["React", "JavaScript", "HTML", "CSS", "Bootstrap"],
        "exp_years": Decimal("1.5"),
        "sem_score": Decimal("52.0"),
        "qag_score": None,              # exercises the null-badge path
        "match_score": Decimal("52.0"),
        "ai_score": Decimal("48.0"),
        "li_score_pct": 48,
        "li_overall": Decimal("0.4800"),
        "li_verdict": "fail",
        "li_dim": {DIM_TECH_ID: 0.50, DIM_PROB_ID: 0.48, DIM_COMM_ID: 0.46},
    },
]

# Per-candidate MCQ answers (3 questions selected: indices 0,3,6 from MCQ pool)
SELECTED_MCQ_IDX = [0, 3, 6]
# Correct answers for those questions (from MCQ_QUESTIONS below: correct[0]=1, [3]=2, [6]=1)
MCQ_CORRECT = [1, 2, 1]
CAND_MCQ_ANSWERS = [
    [1, 2, 1],   # C1: all 3 correct → 30pts
    [1, 2, 0],   # C2: 2 correct → 20pts
    [0, 1, 0],   # C3: 1 correct → 10pts
]
# Essay points (out of 30)
ESSAY_PTS_D = [27, 20, 14]    # G-D scenario
ESSAY_PTS_E = [28, 26, 22]    # G-E scenario
# Coding points (out of 40)
CODING_PTS_D = [26, 24, 22]   # G-D scenario
CODING_PTS_E = [30, 30, 30]   # G-E scenario

# ─────────────────────────────────────────────────────────────────────────────
# MCQ QUESTIONS
# ─────────────────────────────────────────────────────────────────────────────
MCQ_QUESTIONS = [
    {"id": QB_MCQ[0], "text": "Which React hook is used for side effects in function components?",
     "options": ["useState", "useEffect", "useContext", "useRef"], "correct": 1,
     "category": "React Fundamentals", "difficulty": 2},
    {"id": QB_MCQ[1], "text": "What does the 'key' prop in React lists primarily help with?",
     "options": ["CSS styling", "Component re-use", "Efficient reconciliation", "Event binding"],
     "correct": 2, "category": "React Fundamentals", "difficulty": 2},
    {"id": QB_MCQ[2], "text": "In TypeScript, what does the 'keyof' operator return?",
     "options": ["A value type", "A union of property names", "An array of values", "A mapped type"],
     "correct": 1, "category": "TypeScript", "difficulty": 3},
    {"id": QB_MCQ[3], "text": "Which of the following is NOT a built-in React state management approach?",
     "options": ["useState", "useReducer", "useStore (built-in)", "Context API"],
     "correct": 2, "category": "State Management", "difficulty": 2},
    {"id": QB_MCQ[4], "text": "Output of: const [a, ...b] = [1,2,3,4]; console.log(b)?",
     "options": ["[1,2,3,4]", "[2,3,4]", "[1]", "Error"], "correct": 1,
     "category": "JavaScript", "difficulty": 2},
    {"id": QB_MCQ[5], "text": "In CSS, which property combination creates a new stacking context?",
     "options": ["display: block", "position: relative + z-index", "color: red", "margin: auto"],
     "correct": 1, "category": "CSS", "difficulty": 3},
    {"id": QB_MCQ[6], "text": "What does React.memo do?",
     "options": ["Memoizes function return values", "Prevents re-render if props unchanged",
                 "Creates a memoized selector", "Caches API responses"],
     "correct": 1, "category": "React Performance", "difficulty": 3},
    {"id": QB_MCQ[7], "text": "Which HTTP method is idempotent AND safe?",
     "options": ["POST", "PUT", "GET", "PATCH"], "correct": 2,
     "category": "Web Fundamentals", "difficulty": 2},
    {"id": QB_MCQ[8], "text": "In GraphQL, what is a resolver?",
     "options": ["A function that returns a field value", "A schema keyword",
                 "An HTTP method", "A caching layer"], "correct": 0,
     "category": "GraphQL", "difficulty": 3},
    {"id": QB_MCQ[9], "text": "What is the worst-case time complexity of array.find()?",
     "options": ["O(1)", "O(log n)", "O(n)", "O(n²)"], "correct": 2,
     "category": "Algorithms", "difficulty": 2},
]

ESSAY_QUESTIONS = [
    {"id": QB_ESSAY[0], "text": "Describe how you would architect a large-scale React app. Cover state management, code splitting, and testing strategies.",
     "category": "System Design", "difficulty": 4},
    {"id": QB_ESSAY[1], "text": "Explain SSR, SSG, and CSR. When would you choose each?",
     "category": "Web Architecture", "difficulty": 4},
    {"id": QB_ESSAY[2], "text": "The main bundle of a React app has grown to 4MB. Walk through your diagnosis and fix approach.",
     "category": "Performance", "difficulty": 4},
]

CODING_QUESTIONS = [
    {"id": QB_CODING[0], "text": "Implement a function `dedupe(arr)` that removes duplicate values from an array while preserving order.",
     "language": "javascript", "category": "Algorithms", "difficulty": 3},
    {"id": QB_CODING[1], "text": "Write a custom React hook `useDebounce(value, delay)` that debounces the value.",
     "language": "javascript", "category": "React Patterns", "difficulty": 3},
    {"id": QB_CODING[2], "text": "Implement a memoization wrapper `memoize(fn)` that caches results by argument.",
     "language": "javascript", "category": "JavaScript", "difficulty": 3},
]

CAND_ESSAY_ANSWERS = [
    "I structure large React apps around feature-based modules with clear domain boundaries. For state: Redux Toolkit for global, React Query for server state, Zustand for local feature state. Code splitting with dynamic imports per route. Testing pyramid: Vitest unit, React Testing Library integration, Playwright E2E.",
    "For state management I'd use Context API for global state and useState/useEffect for local state. React.lazy for code splitting. Jest and React Testing Library for tests. The key is keeping components small and focused.",
    "I usually use useState for state and split code when files get too big. For testing I write basic unit tests with Jest.",
]
CAND_CODING_ANSWERS = [
    "function dedupe(arr) {\n  return [...new Set(arr)];\n}",
    "function dedupe(arr) {\n  const seen = {};\n  return arr.filter(x => seen[x] ? false : (seen[x] = true));\n}",
    "function dedupe(arr) {\n  const result = [];\n  for (const x of arr) if (!result.includes(x)) result.push(x);\n  return result;\n}",
]

# AI interview questions with 10 rubric checks each
AIC_QUESTIONS = [
    {
        "question_id": f"ab500001-0000-0000-0002-{i+1:012d}",
        "text": q,
        "think_time_seconds": 60,
        "answer_time_seconds": 180,
        "rubric_checks": [
            {"id": j+1, "check": chk, "weight": 0.1}
            for j, chk in enumerate([
                "Does the answer describe a specific situation?",
                "Is there a clear problem or challenge stated?",
                "Does the candidate explain their specific action?",
                "Is the result or outcome mentioned?",
                "Does the answer show technical depth?",
                "Is the communication clear and structured?",
                "Does the candidate reflect on what they learned?",
                "Are technical details accurate?",
                "Does the answer address the question directly?",
                "Is the response within an appropriate scope?",
            ])
        ]
    }
    for i, q in enumerate([
        "Walk me through a challenging frontend architecture decision you made and why.",
        "Describe a time you had to debug a complex performance issue in a React application.",
        "Tell me about a time you collaborated with designers to resolve a UX-vs-performance tradeoff.",
        "How do you approach code reviews? Describe a situation where you gave difficult feedback.",
    ])
]

# Per-candidate AI interview responses (brief transcripts)
CAND_AI_TRANSCRIPTS = [
    [  # C1 strong
        "At Acme Corp we needed to migrate a legacy jQuery dashboard to React. I proposed a strangler-fig pattern — gradually replacing sections without a big-bang rewrite. The key was defining clear component contracts at each seam. We migrated 80% of the codebase in 4 months with zero downtime.",
        "We had a React Native app where list scroll FPS dropped to 12 on Android. I profiled with Flipper, found a cascade of unnecessary re-renders in the FlatList. The fix was memoizing item components with React.memo and moving the data selector outside the render cycle. FPS recovered to 58.",
        "The designer wanted a glassmorphism card with 60% opacity but that caused CLS on mobile. I ran Lighthouse before and after various approaches. We agreed on a CSS variable approach that preserved the visual at 95% fidelity while keeping CLS under 0.1.",
        "A junior dev submitted a PR with N+1 query patterns in the backend mock. I structured the feedback as questions rather than corrections — asked 'what happens if this list has 10k items?' which let them discover the issue themselves. Much better reception.",
    ],
    [  # C2 mid
        "I worked on migrating a CRA app to Vite. It was challenging because of differences in how env variables are handled. I read the docs, updated the imports, and it mostly worked. Build time went from 40s to 8s.",
        "We had slow rendering on a large table. I used React DevTools to find which components re-rendered. Added useCallback on event handlers which helped. Performance improved noticeably.",
        "The design had gradients that were very heavy on mobile. I suggested we use a simpler background on mobile. We compromised on a reduced gradient that still looked good.",
        "I've given feedback by commenting directly on the code. I try to be constructive and explain why I'm suggesting changes.",
    ],
    [  # C3 weak
        "I moved a project from one setup to another one. It was hard because some things were different. I figured it out by looking at examples online.",
        "I found a bug by looking at the console errors. I fixed it by checking the code. It took a few hours.",
        "I usually just do what the designer says. Sometimes if it's too slow I tell them.",
        "I leave comments on the PR. I try to be nice.",
    ],
]

# LiV2 transcript items per candidate
def _build_liv2_transcript(c: dict) -> list:
    name = c["name"].split()[0]
    return [
        {"role": "ai", "text": "Welcome! Let's start with a technical question about React.", "phase": "opening"},
        {"role": "candidate", "text": f"Thanks, I'm ready.", "phase": "opening"},
        {"role": "ai", "text": "Explain React's reconciliation algorithm and how keys help.", "phase": "tech_question"},
        {"role": "candidate", "text": CAND_AI_TRANSCRIPTS[CANDS.index(c)][0][:200], "phase": "tech_question"},
        {"role": "ai", "text": "Good. Now a problem-solving question: your production API degrades under load.", "phase": "prob_question"},
        {"role": "candidate", "text": CAND_AI_TRANSCRIPTS[CANDS.index(c)][1][:200], "phase": "prob_question"},
        {"role": "ai", "text": "Finally — communication: how do you give difficult feedback?", "phase": "comm_question"},
        {"role": "candidate", "text": CAND_AI_TRANSCRIPTS[CANDS.index(c)][3][:200], "phase": "comm_question"},
        {"role": "ai", "text": "Thank you, that wraps up our session.", "phase": "closing"},
    ]

# ─────────────────────────────────────────────────────────────────────────────
# JSONB BUILDERS
# ─────────────────────────────────────────────────────────────────────────────

def build_cv_parsed_data(c: dict) -> dict:
    sem = float(c["sem_score"])
    qag = float(c["qag_score"]) if c["qag_score"] is not None else None
    final = sem if qag is None else round((sem * 0.55 + qag * 0.45), 1)
    return {
        "name": c["name"],
        "email": c["email"],
        "phone": c["phone"],
        "location": c["location"],
        "experience_years": float(c["exp_years"]),
        "skills": c["skills"],
        "education": [{"degree": "Bachelor of Computer Science", "institution": "State University", "year": 2020}],
        "work_history": [
            {
                "title": "Frontend Developer",
                "company": "TechCorp",
                "duration": f"{float(c['exp_years']):.0f} years",
                "description": f"Built React applications. {len(c['skills'])} core skills."
            }
        ],
        "prescore_v2": {
            "pre_score_final": final,
            "semantic_score": sem,
            "qag_score": qag,
            "skill_alignment": round(sem / 100 + 0.02, 3),
            "experience_alignment": round(min(float(c["exp_years"]) / 5, 1.0), 3),
            "keyword_coverage": round(sem / 100 - 0.04, 3),
            "seniority_score": round(sem / 100 - 0.06, 3),
            "education_score": 0.75,
            "optional_profile_boost": 3.0 if c["github"] else 0.0,
            "score_explanation": [
                f"Skill alignment: {sem:.0f}% match with required skills",
                f"Experience: {float(c['exp_years']):.1f} years ({'+' if float(c['exp_years'])>=4 else '-'} threshold)",
                "QAG evaluation: " + (f"{qag:.0f}% match" if qag is not None else "pending (no QAG approved)"),
            ],
            "jd_quality_status": "good",
            "jd_quality_cap": None,
        }
    }


def build_question_snapshot(q: dict, with_correct: bool = True) -> dict:
    """Build candidate_assigned_questions.question_snapshot."""
    if q in MCQ_QUESTIONS:
        qtype = "mcq"
        pts = 10
        config = {"options": q["options"]}
        if with_correct:
            config["correct_answer"] = {"correct_index": q["correct"]}
        correct = {"option_index": q["correct"], "option_text": q["options"][q["correct"]]} if with_correct else {}
    elif q in ESSAY_QUESTIONS:
        qtype = "essay"
        pts = 30
        config = {
            "max_words": 500,
            "rubric_yes_no_checks": [{"id": i+1, "check": f"Check {i+1}", "weight": 0.1} for i in range(10)],
        }
        correct = {}
    else:
        qtype = "coding"
        pts = 40
        config = {
            "language": q["language"],
            "starter_code": "// Write your solution here",
            "test_cases": [{"input": "[1,2,2,3]", "expected": "[1,2,3]"}],
            "constraints": "Time: O(n), Space: O(n)",
        }
        correct = {}
    return {
        "question_id": q["id"],
        "question_type": qtype,
        "question_text": q["text"],
        "question_config": config,
        "correct_answer": correct,
        "points": pts,
        "assignment_context": {
            "selection_strategy": "random",
            "candidate_keywords": [],
            "matched_keywords": [],
        }
    }


def build_assigned_questions_map(session_id: str, assigned: list[dict], assignments: list[str]) -> dict:
    """Build ongoing_assessments.assigned_questions JSONB."""
    section_map = {ASM_SEC_MCQ: "Technical MCQ", ASM_SEC_ESS: "System Design Essay", ASM_SEC_COD: "Coding Challenge"}
    questions = []
    for i, q in enumerate(assigned):
        if q in MCQ_QUESTIONS:
            sec = ASM_SEC_MCQ
            pts = 10
            qtype = "mcq"
        elif q in ESSAY_QUESTIONS:
            sec = ASM_SEC_ESS
            pts = 30
            qtype = "essay"
        else:
            sec = ASM_SEC_COD
            pts = 40
            qtype = "coding"
        snap = build_question_snapshot(q, with_correct=False)
        questions.append({
            "question_id": q["id"],
            "assignment_id": assignments[i],
            "section_title": section_map[sec],
            "question_type": qtype,
            "question_text": q["text"],
            "question_config": snap["question_config"],
            "points": pts,
            "order": i + 1,
        })
    return {"questions": questions}


def build_ai_feedback(ci: int, q_idx: int) -> dict:
    transcript_text = CAND_AI_TRANSCRIPTS[ci][q_idx] if q_idx < len(CAND_AI_TRANSCRIPTS[ci]) else "No answer provided."
    score_map = [4, 3, 2]  # C1 strong, C2 mid, C3 weak
    base_score = score_map[ci]
    checks = AIC_QUESTIONS[q_idx]["rubric_checks"]
    return {
        "feedback": ["Strong structured answer.", "Adequate response.", "Needs more depth."][ci],
        "criteria_scores": [
            {
                "check": chk["check"],
                "weight": chk.get("weight", 0.1),
                "score_1_5": max(1, base_score - (1 if j > 5 else 0)),
                "cited_quote": transcript_text[:60] if j == 0 else None,
                "reasoning": f"{'Clear evidence' if base_score >= 4 else 'Partial evidence'} for this criterion.",
            }
            for j, chk in enumerate(checks)
        ]
    }


def build_liv2_evaluation(c: dict, ci: int) -> dict:
    dim_scores = {
        DIM_TECH_ID: {"score": c["li_dim"][DIM_TECH_ID], "name": "Technical Depth", "weight": 0.40},
        DIM_PROB_ID: {"score": c["li_dim"][DIM_PROB_ID], "name": "Problem Solving", "weight": 0.35},
        DIM_COMM_ID: {"score": c["li_dim"][DIM_COMM_ID], "name": "Communication", "weight": 0.25},
    }
    per_q = [
        {
            "bank_item_id": item_id,
            "question_text": qtext,
            "dimension_id": dim_id,
            "score": round(c["li_dim"][dim_id], 3),
            "feedback": f"{'Strong' if c['li_dim'][dim_id] >= 0.80 else 'Adequate' if c['li_dim'][dim_id] >= 0.65 else 'Weak'} performance on this dimension.",
            "evidence_snippets": [CAND_AI_TRANSCRIPTS[ci][i][:80] + "..."],
            "sub_criteria_scores": [
                {"id": "sc1", "check": "Demonstrates clear understanding", "weight": 0.5,
                 "score": int(c["li_dim"][dim_id] * 5), "quote": CAND_AI_TRANSCRIPTS[ci][i][:50]},
                {"id": "sc2", "check": "Provides concrete examples", "weight": 0.5,
                 "score": int(c["li_dim"][dim_id] * 4), "quote": "..."},
            ]
        }
        for (item_id, dim_id, qtext, i) in [
            (BNK_ITEM_1, DIM_TECH_ID, "Explain React's reconciliation algorithm and key usage.", 0),
            (BNK_ITEM_2, DIM_PROB_ID, "Production API response times degrade under heavy load. Diagnose.", 1),
            (BNK_ITEM_3, DIM_COMM_ID, "Describe a time you gave difficult feedback to a peer.", 3),
        ]
    ]
    return {
        "dim_scores": dim_scores,
        "per_q": per_q,
        "auto_tags": {
            "strong_on": ["Technical Depth"] if c["li_dim"][DIM_TECH_ID] >= 0.80 else [],
            "weak_on": ["Communication"] if c["li_dim"][DIM_COMM_ID] < 0.60 else [],
            "cv_verified": True,
            "consistent_with_cv": c["li_verdict"] != "fail",
        },
        "integrity_flags": {"injection_attempts": 0, "anomalies": []},
        "confidence": "high" if c["li_score_pct"] >= 75 else "medium" if c["li_score_pct"] >= 60 else "low",
    }

# ─────────────────────────────────────────────────────────────────────────────
# SEED FUNCTIONS
# ─────────────────────────────────────────────────────────────────────────────

async def seed_baseline(conn):
    print("── [1] Subscription plan + org + users")

    # Subscription plan
    await conn.execute("""
        INSERT INTO subscription_plans
            (plan_id, name, monthly_price, features_json, limits_json, created_at)
        VALUES ($1,'Enterprise',299.00,
            '{"ai_interviews":true,"liv2":true,"github_analysis":true,"unlimited_candidates":true}'::jsonb,
            '{"max_positions":100,"max_candidates_per_position":5000}'::jsonb,
            $2)
        ON CONFLICT (plan_id) DO UPDATE SET name=EXCLUDED.name
    """, PLAN_ID, ts(60))

    # Organization
    org_hash = bcrypt.hashpw(b"admin12345", bcrypt.gensalt(rounds=10)).decode()
    await conn.execute("""
        INSERT INTO organizations
            (organization_id, plan_id, organization_name, organization_size,
             business_domain, admin_email, admin_password_hash,
             subscription_status, settings, created_at, is_deleted)
        VALUES ($1,$2,'EraMatch','50-200','Technology','admin_1@eramatch.com',$3,
            'active','{"timezone":"UTC","language":"en"}'::jsonb,$4,false)
        ON CONFLICT (organization_id) DO UPDATE SET
            organization_name=EXCLUDED.organization_name
    """, ORG_ID, PLAN_ID, org_hash, ts(60))

    # Users
    for uid, email, fname, lname, role, bypass in [
        (ADMIN_ID, "admin_1@eramatch.com", "Admin", "EraMatch", "admin", True),
        (HR_ID,    "hr@eramatch.com",       "HR",    "Recruiter", "hr",    False),
        (TECH_ID,  "tech@eramatch.com",     "Tech",  "Recruiter", "technical", False),
    ]:
        await conn.execute("""
            INSERT INTO organization_users
                (user_id, organization_id, email, password_hash,
                 first_name, last_name, role, status, created_at, is_deleted)
            VALUES ($1,$2,$3,$4,$5,$6,$7,'active',$8,false)
            ON CONFLICT (user_id) DO UPDATE SET
                email=EXCLUDED.email, role=EXCLUDED.role
        """, uid, ORG_ID, email, DEFAULT_HASH, fname, lname, role, ts(60))

        perm_id = f"ab100001-0000-0000-0010-{hash(uid) % 10**12 % (10**12):012d}"
        await conn.execute("""
            INSERT INTO user_permissions
                (permission_id, user_id, can_manage_positions, can_manage_candidates,
                 can_view_analytics, can_export_data, can_manage_users, custom_permissions)
            VALUES ($1,$2,true,true,true,true,$3,'{}')
            ON CONFLICT (user_id) DO UPDATE SET can_manage_users=EXCLUDED.can_manage_users
        """, perm_id, uid, role == "admin")

        sett_id = f"ab100001-0000-0000-0020-{hash(uid) % 10**12 % (10**12):012d}"
        await conn.execute("""
            INSERT INTO organization_user_settings
                (settings_id, user_id, email_notifications, new_member_requests,
                 project_updates, weekly_summary, two_factor_auth, session_timeout,
                 ai_pipeline_config, updated_at, bypass_admin_approval)
            VALUES ($1,$2,true,true,true,true,false,false,'{}',NOW(),$3)
            ON CONFLICT (user_id) DO UPDATE SET bypass_admin_approval=EXCLUDED.bypass_admin_approval
        """, sett_id, uid, bypass)

    print("   ✓ plan + org + 3 users")


async def seed_candidates(conn):
    print("── [2] Candidate profiles")
    for c in CANDS:
        await conn.execute("""
            INSERT INTO candidate_profiles
                (candidate_id, organization_id, full_name, email, phone,
                 location, linkedin_url, github_url, password_hash, created_at, is_deleted)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false)
            ON CONFLICT (candidate_id) DO UPDATE SET
                full_name=EXCLUDED.full_name, email=EXCLUDED.email
        """, c["id"], ORG_ID, c["name"], c["email"], c["phone"],
             c["location"], c["linkedin"], c["github"], DEFAULT_HASH, ts(45))
        print(f"   ✓ {c['name']} ({c['email']})")


async def seed_project_position(conn):
    print("── [3] Project + Position")
    await conn.execute("""
        INSERT INTO projects
            (project_id, organization_id, created_by_user_id, name, description,
             status, target_hire_count, created_at, is_deleted, priority)
        VALUES ($1,$2,$3,'QA Pipeline Project','Multi-state test fixture project',
            'active',3,$4,false,'high')
        ON CONFLICT (project_id) DO UPDATE SET name=EXCLUDED.name
    """, PROJ_ID, ORG_ID, HR_ID, ts(50))

    jd = """Senior Frontend Engineer — EraMatch Platform

We are seeking a Senior Frontend Engineer to join our cross-functional product team.

Responsibilities:
- Lead React/TypeScript component architecture for recruiter and candidate portals
- Collaborate with designers on accessible, performant UI patterns
- Mentor junior engineers and drive code quality standards
- Contribute to API design decisions with backend teams

Requirements:
- 4+ years of React development experience
- TypeScript proficiency (generics, conditional types, utility types)
- Experience with state management: Redux Toolkit / Zustand / React Query
- Understanding of performance optimization: memoization, code splitting, virtualization
- Testing: Vitest/Jest, React Testing Library
- RESTful API integration experience

Nice to have:
- Next.js (SSR/SSG/ISR patterns)
- GraphQL (Apollo or URQL)
- Docker / CI/CD pipelines
- Design system contributions"""

    await conn.execute("""
        INSERT INTO positions
            (position_id, project_id, organization_id, job_title, job_description,
             required_skills, experience_level, years_of_experience, education_level,
             work_type, status, assigned_hr_id, assigned_tech_id, created_at, is_deleted,
             jd_keywords, jd_hdeval_qag)
        VALUES ($1,$2,$3,'Senior Frontend Engineer',$4,
            $5,'senior',4,'bachelor','full_time',
            'open',$6,$7,$8,false,
            $9,$10)
        ON CONFLICT (position_id) DO UPDATE SET
            job_title=EXCLUDED.job_title, job_description=EXCLUDED.job_description
    """, POS_ID, PROJ_ID, ORG_ID, jd,
         json.dumps(["React", "TypeScript", "JavaScript", "CSS", "REST APIs", "Testing"]),
         HR_ID, TECH_ID, ts(48),
         json.dumps({"keywords": ["React", "TypeScript", "Next.js", "Redux", "Jest", "GraphQL", "Node.js"],
                     "generated_at": ts(47).isoformat()}),
         json.dumps({"status": "approved", "qag": [
             {"id": i+1, "question": f"Does the candidate have {skill} experience?", "verdict": None}
             for i, skill in enumerate(["React", "TypeScript", "REST APIs", "Testing", "Performance"])
         ]}))
    print("   ✓ project + position (JD + keywords + QAG)")


async def seed_question_bank(conn):
    print("── [4] Question bank (10 MCQ + 3 essay + 3 coding)")
    for q in MCQ_QUESTIONS:
        cfg = {"options": q["options"], "correct_answer": {"correct_index": q["correct"]},
               "explanation": f"Correct: {q['options'][q['correct']]}"}
        correct = {"option_index": q["correct"], "option_text": q["options"][q["correct"]]}
        await conn.execute("""
            INSERT INTO question_bank
                (question_id, organization_id, question_type, question_text,
                 question_config, correct_answer, category, difficulty,
                 tags, points, created_by_user_id, created_at, usage_count,
                 is_deleted, is_base_question, source)
            VALUES ($1,$2,'mcq',$3,$4,$5,$6,$7,$8,10,$9,$10,0,false,true,'seed')
            ON CONFLICT (question_id) DO UPDATE SET question_text=EXCLUDED.question_text
        """, q["id"], ORG_ID, q["text"], json.dumps(cfg), json.dumps(correct),
             q["category"], q["difficulty"], [q["category"]], TECH_ID, ts(47))

    for q in ESSAY_QUESTIONS:
        cfg = {"max_words": 500, "rubric": "Evaluate technical depth and clarity.",
               "rubric_yes_no_checks": [{"id": i+1, "check": f"Criterion {i+1}", "weight": 0.1} for i in range(10)],
               "reference_answer": "A comprehensive answer covering architecture, state, and testing."}
        await conn.execute("""
            INSERT INTO question_bank
                (question_id, organization_id, question_type, question_text,
                 question_config, correct_answer, category, difficulty,
                 tags, points, created_by_user_id, created_at, usage_count,
                 is_deleted, is_base_question, source)
            VALUES ($1,$2,'essay',$3,$4,NULL,$5,$6,$7,30,$8,$9,0,false,true,'seed')
            ON CONFLICT (question_id) DO UPDATE SET question_text=EXCLUDED.question_text
        """, q["id"], ORG_ID, q["text"], json.dumps(cfg),
             q["category"], q["difficulty"], [q["category"]], TECH_ID, ts(47))

    for q in CODING_QUESTIONS:
        cfg = {"language": q["language"],
               "starter_code": "// Write your solution here\n",
               "test_cases": [{"input": "[1,2,2,3]", "expected": "[1,2,3]"}],
               "constraints": "Time: O(n), Space: O(n)"}
        await conn.execute("""
            INSERT INTO question_bank
                (question_id, organization_id, question_type, question_text,
                 question_config, correct_answer, category, difficulty,
                 tags, points, created_by_user_id, created_at, usage_count,
                 is_deleted, is_base_question, source)
            VALUES ($1,$2,'coding',$3,$4,NULL,$5,$6,$7,40,$8,$9,0,false,true,'seed')
            ON CONFLICT (question_id) DO UPDATE SET question_text=EXCLUDED.question_text
        """, q["id"], ORG_ID, q["text"], json.dumps(cfg),
             q["category"], q["difficulty"], [q["category"]], TECH_ID, ts(47))
    print("   ✓ 16 questions seeded")


async def seed_shared_configs(conn):
    print("── [5] Shared configs (assessment + AI interview + LiV2 rubric + bank)")

    # Assessment
    await conn.execute("""
        INSERT INTO assessments
            (assessment_id, organization_id, position_id, group_id, title, description,
             instructions, duration_minutes, passing_score, shuffle_sections,
             anti_cheating_enabled, status, created_by_user_id, created_at, updated_at, is_deleted)
        VALUES ($1,$2,$3,NULL,
            'Senior Frontend Engineer — Technical Assessment',
            'Tests React, TypeScript, and system design fundamentals.',
            'You have 60 minutes. Answer all questions carefully.',
            60,60,false,true,'published',$4,$5,$5,false)
        ON CONFLICT (assessment_id) DO NOTHING
    """, ASM_ID, ORG_ID, POS_ID, TECH_ID, ts(46))

    # Sections
    for sec_id, sec_title, qtype, variants, pts, order in [
        (ASM_SEC_MCQ, "Technical MCQ",           "mcq",    3, 10, 1),
        (ASM_SEC_ESS, "System Design Essay",      "essay",  1, 30, 2),
        (ASM_SEC_COD, "Coding Challenge",         "code",   1, 40, 3),
    ]:
        await conn.execute("""
            INSERT INTO assessment_sections
                (section_id, assessment_id, section_order, section_title,
                 question_type, variants_to_select, points_per_question,
                 selection_strategy, created_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,'random',$8)
            ON CONFLICT (section_id) DO NOTHING
        """, sec_id, ASM_ID, order, sec_title, qtype, variants, pts, ts(46))

    # Pool entries
    for i, (pool_id, q_id) in enumerate(
        [(POOL_MCQ[i], QB_MCQ[i]) for i in range(10)]
        + [(POOL_ESS[i], QB_ESSAY[i]) for i in range(3)]
        + [(POOL_COD[i], QB_CODING[i]) for i in range(3)]
    ):
        sec_id = ASM_SEC_MCQ if pool_id in POOL_MCQ else (ASM_SEC_ESS if pool_id in POOL_ESS else ASM_SEC_COD)
        await conn.execute("""
            INSERT INTO section_question_pool
                (pool_entry_id, section_id, question_id, variant_order,
                 is_active, difficulty_weight, created_at)
            VALUES ($1,$2,$3,$4,true,1.0,$5)
            ON CONFLICT (pool_entry_id) DO NOTHING
        """, pool_id, sec_id, q_id, i+1, ts(46))

    print("   ✓ assessment + 3 sections + 16 pool entries")

    # AI interview config
    await conn.execute("""
        INSERT INTO ai_interview_configs
            (config_id, organization_id, position_id, title, interview_type,
             instructions, max_retakes, think_time_seconds, answer_time_seconds,
             questions, difficulty, total_duration_minutes,
             show_ai_feedback, recording_required,
             created_by_user_id, created_at, updated_at, is_deleted)
        VALUES ($1,$2,$3,'Senior Frontend Engineer — Video Interview','recorded',
            'Answer each question clearly and concisely. You have think time before recording.',
            1,60,180,$4,'medium',20,true,true,$5,$6,$6,false)
        ON CONFLICT (config_id) DO NOTHING
    """, AIC_ID, ORG_ID, POS_ID, json.dumps(AIC_QUESTIONS), TECH_ID, ts(45))
    print("   ✓ AI interview config (4 questions w/ 10 rubric checks each)")
    # LiV2 rubric and bank are per-group (group_id NOT NULL) — seeded per group in seed_group_{b-e}


# ─────────────────────────────────────────────────────────────────────────────
# GROUP HELPERS
# ─────────────────────────────────────────────────────────────────────────────

FILTRATION_FLOW = json.dumps([
    {"order": 1, "stage": "assessment",    "status": "not_started"},
    {"order": 2, "stage": "ai_interview",  "status": "not_started"},
    {"order": 3, "stage": "live_interview","status": "not_started"},
])

LIV2_DIMENSIONS = [
    {"dimension_id": DIM_TECH_ID, "name": "Technical Depth", "weight": 0.40,
     "anchors": {"substandard": "Cannot articulate key React/TS concepts.",
                 "proficient": "Explains core concepts with reasonable depth.",
                 "excellent": "Deep mastery; references performance, edge cases, tradeoffs."}},
    {"dimension_id": DIM_PROB_ID, "name": "Problem Solving", "weight": 0.35,
     "anchors": {"substandard": "No systematic approach to problem diagnosis.",
                 "proficient": "Identifies root causes and proposes solutions.",
                 "excellent": "Systematic, data-driven; considers scalability and edge cases."}},
    {"dimension_id": DIM_COMM_ID, "name": "Communication", "weight": 0.25,
     "anchors": {"substandard": "Unclear, disorganized responses.",
                 "proficient": "Clear responses with some structure.",
                 "excellent": "Concise, structured (STAR/SBER), resonates with non-technical audience."}},
]
LIV2_ITEMS = [
    {"bank_item_id": BNK_ITEM_1,
     "text": "Explain React's reconciliation algorithm and how keys help optimize re-renders.",
     "primary_dimension_id": DIM_TECH_ID, "difficulty": 3, "is_mandatory": True, "is_approved": True,
     "question_rubric": {"sub_criteria": [
         {"id": "sc1", "check": "Describes virtual DOM diffing algorithm", "weight": 0.40},
         {"id": "sc2", "check": "Explains key prop importance for stable identity", "weight": 0.35},
         {"id": "sc3", "check": "Quantifies or estimates performance impact", "weight": 0.25},
     ]}},
    {"bank_item_id": BNK_ITEM_2,
     "text": "Your production API response times degrade from 200ms to 2s under load. Walk through your diagnosis process.",
     "primary_dimension_id": DIM_PROB_ID, "difficulty": 4, "is_mandatory": True, "is_approved": True,
     "question_rubric": {"sub_criteria": [
         {"id": "sc1", "check": "Starts with data-gathering before guessing", "weight": 0.35},
         {"id": "sc2", "check": "Names specific profiling or monitoring tools", "weight": 0.35},
         {"id": "sc3", "check": "Considers multiple root causes (N+1, lock contention, etc.)", "weight": 0.30},
     ]}},
    {"bank_item_id": BNK_ITEM_3,
     "text": "Describe a time you gave difficult technical feedback that was initially rejected but ultimately accepted.",
     "primary_dimension_id": DIM_COMM_ID, "difficulty": 3, "is_mandatory": False, "is_approved": True,
     "question_rubric": {"sub_criteria": [
         {"id": "sc1", "check": "Uses STAR or structured narrative", "weight": 0.40},
         {"id": "sc2", "check": "Describes specific communication technique used", "weight": 0.35},
         {"id": "sc3", "check": "Reflects on what they learned from the experience", "weight": 0.25},
     ]}},
]


async def _seed_liv2_rubric_bank(conn, g: str, ts_val):
    """Create frozen LiV2 rubric + bank for group g and wire acceptance_criteria."""
    grp_id = GRP_IDS[g]
    rub_id = _grp(g, 9, 1)
    bnk_id = _grp(g, 9, 2)
    await conn.execute("""
        INSERT INTO li_v2_rubrics
            (rubric_id, group_id, organization_id, version, dimensions, state,
             time_budget_minutes, created_at, frozen_at, created_by_user_id,
             language, include_weak_topics, updated_at)
        VALUES ($1,$2,$3,1,$4,'frozen',45,$5,$6,$7,'en',true,$8)
        ON CONFLICT (rubric_id) DO UPDATE SET state=EXCLUDED.state
    """, rub_id, grp_id, ORG_ID, json.dumps(LIV2_DIMENSIONS),
         ts_val, ts_val, TECH_ID, ts_val)
    await conn.execute("""
        INSERT INTO li_v2_banks
            (bank_id, rubric_id, group_id, organization_id, version, items, state,
             created_at, frozen_at, created_by_user_id, updated_at)
        VALUES ($1,$2,$3,$4,1,$5,'frozen',$6,$7,$8,$9)
        ON CONFLICT (bank_id) DO UPDATE SET state=EXCLUDED.state
    """, bnk_id, rub_id, grp_id, ORG_ID, json.dumps(LIV2_ITEMS),
         ts_val, ts_val, TECH_ID, ts_val)
    # Wire rubric_id into live_interview stage acceptance_criteria
    stg_id = _grp(g, 1, 3)
    await conn.execute("""
        UPDATE group_pipeline_stages
        SET acceptance_criteria = jsonb_set(
            COALESCE(acceptance_criteria, '{}'),
            '{liv2_rubric_id}',
            to_jsonb($2::text)
        )
        WHERE stage_id = $1
    """, stg_id, rub_id)
    return rub_id, bnk_id

async def _insert_group(conn, g: str, name: str, created_at: datetime):
    grp_id = GRP_IDS[g]
    await conn.execute("""
        INSERT INTO candidate_groups
            (group_id, position_id, organization_id, group_name,
             assigned_hr_id, assigned_tech_id, status, created_at, created_by_user_id,
             filtration_flow)
        VALUES ($1,$2,$3,$4,$5,$6,'active',$7,$8,$9)
        ON CONFLICT (group_id) DO UPDATE SET group_name=EXCLUDED.group_name, filtration_flow=EXCLUDED.filtration_flow
    """, grp_id, POS_ID, ORG_ID, name, HR_ID, TECH_ID, created_at, HR_ID, FILTRATION_FLOW)
    return grp_id


async def _insert_stages(conn, g: str, stages: list[tuple], group_created_at: datetime):
    """stages: list of (stage_type, state, config_id, started_at, closed_at)"""
    grp_id = GRP_IDS[g]
    labels = {"assessment": "Technical Assessment",
              "ai_interview": "AI Video Interview",
              "live_interview": "Live AI Interview"}
    for i, (stype, state, cfg_id, started_at, closed_at) in enumerate(stages):
        stg_id = _grp(g, 1, i+1)
        await conn.execute("""
            INSERT INTO group_pipeline_stages
                (stage_id, group_id, organization_id, stage_type, stage_order,
                 stage_name, config_id, state, started_at, closed_at,
                 started_by_user_id, created_at, updated_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)
            ON CONFLICT (stage_id) DO UPDATE SET
                state=EXCLUDED.state, config_id=EXCLUDED.config_id,
                started_at=EXCLUDED.started_at, closed_at=EXCLUDED.closed_at
        """, stg_id, grp_id, ORG_ID, stype, i+1, labels[stype],
             cfg_id, state, started_at, closed_at,
             TECH_ID if started_at else None, group_created_at)


async def _insert_apps_and_cva(conn, g: str, applied_at: datetime):
    """Insert 3 applications + cv_analysis rows for this group."""
    grp_id = GRP_IDS[g]
    for ci, c in enumerate(CANDS):
        app_id = _grp(g, 2, ci+1)
        cva_id = _grp(g, 3, ci+1)
        await conn.execute("""
            INSERT INTO candidate_applications
                (application_id, candidate_id, position_id, group_id, organization_id,
                 resume_url, status, applied_at, is_deleted)
            VALUES ($1,$2,$3,$4,$5,$6,'applied',$7,false)
            ON CONFLICT (application_id) DO UPDATE SET group_id=EXCLUDED.group_id
        """, app_id, c["id"], POS_ID, grp_id, ORG_ID,
             f"https://storage.eramatch.app/cvs/group_{g}_{c['email'].split('@')[0]}.pdf",
             applied_at)

        parsed = build_cv_parsed_data(c)
        await conn.execute("""
            INSERT INTO cv_analysis
                (analysis_id, application_id, organization_id, cv_file_url,
                 parsed_data, skills, experience_years, match_score,
                 keyword_match_score, analyzed_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
            ON CONFLICT (analysis_id) DO UPDATE SET
                parsed_data=EXCLUDED.parsed_data, match_score=EXCLUDED.match_score
        """, cva_id, app_id, ORG_ID,
             f"https://storage.eramatch.app/cvs/group_{g}_{c['email'].split('@')[0]}.pdf",
             json.dumps(parsed), c["skills"],
             c["exp_years"], c["match_score"],
             Decimal(str(round(float(c["sem_score"]) * 0.85 / 100, 3))),
             applied_at + timedelta(hours=1))


async def _email_log(conn, log_id: str, email: str, name: str, ttype: str, subject: str, log_ts: datetime):
    await conn.execute("""
        INSERT INTO email_logs
            (email_id, organization_id, recipient_email, recipient_name,
             subject, template_type, template_data, status, sent_at, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,'{}'::jsonb,'sent',$7,$7)
        ON CONFLICT (email_id) DO NOTHING
    """, log_id, ORG_ID, email, name, subject, ttype, log_ts)


async def _sys_log(conn, log_id: str, action: str, entity_type: str, entity_id: str,
                   details: dict, log_ts: datetime):
    await conn.execute("""
        INSERT INTO system_logs
            (log_id, organization_id, user_id, action, entity_type,
             entity_id, details, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (log_id) DO NOTHING
    """, log_id, ORG_ID, TECH_ID, action, entity_type, entity_id, json.dumps(details), log_ts)


# ─────────────────────────────────────────────────────────────────────────────
# G-A: awaiting config (config_id=NULL for all 3 stages)
# ─────────────────────────────────────────────────────────────────────────────
async def seed_group_a(conn):
    g = "a"
    print("── [G-A] awaiting Level-2 config")
    grp_id = await _insert_group(conn, g, "QA Group A — Config Pending", ts(7))
    await _insert_stages(conn, g, [
        ("assessment",    "not_started", None, None, None),
        ("ai_interview",  "not_started", None, None, None),
        ("live_interview","not_started", None, None, None),
    ], ts(7))
    await _insert_apps_and_cva(conn, g, ts(7))

    # Email logs: group credentials sent at creation
    for ci, c in enumerate(CANDS):
        app_id = _grp(g, 2, ci+1)
        await _email_log(conn, _grp(g, 20, ci+1), c["email"], c["name"],
                         "group_credentials", f"Your EraMatch account for '{grp_id[:8]}...'", ts(7))
    print(f"   ✓ Group A [{grp_id}] — 3 stages (no config), 3 apps, 3 emails")


# ─────────────────────────────────────────────────────────────────────────────
# G-B: configured, nothing started
# ─────────────────────────────────────────────────────────────────────────────
async def seed_group_b(conn):
    g = "b"
    print("── [G-B] configured, not started")
    grp_id = await _insert_group(conn, g, "QA Group B — Configured", ts(12))
    await _insert_stages(conn, g, [
        ("assessment",    "not_started", ASM_ID, None, None),
        ("ai_interview",  "not_started", AIC_ID, None, None),
        ("live_interview","not_started", None,   None, None),
    ], ts(12))
    await _insert_apps_and_cva(conn, g, ts(12))
    # Add acceptance criteria to assessment stage
    stg_id = _grp(g, 1, 1)
    await conn.execute("""
        UPDATE group_pipeline_stages
        SET acceptance_criteria = '{"min_technical_score":60,"allowed_integrity_risk":"Low"}'::jsonb
        WHERE stage_id = $1
    """, stg_id)
    await _seed_liv2_rubric_bank(conn, g, ts(11))
    for ci, c in enumerate(CANDS):
        await _email_log(conn, _grp(g, 20, ci+1), c["email"], c["name"],
                         "group_credentials", f"Your EraMatch account credentials", ts(12))
    print(f"   ✓ Group B [{grp_id}] — all configs set, no progress rows")


# ─────────────────────────────────────────────────────────────────────────────
# G-C: assessment active (C1 in-progress, C2/C3 unlocked)
# ─────────────────────────────────────────────────────────────────────────────
async def seed_group_c(conn):
    g = "c"
    print("── [G-C] assessment active")
    grp_id = await _insert_group(conn, g, "QA Group C — Assessment Running", ts(15))
    asm_started = ts(0, 2)   # 2 hours ago
    await _insert_stages(conn, g, [
        ("assessment",    "active",      ASM_ID, asm_started, None),
        ("ai_interview",  "not_started", AIC_ID, None, None),
        ("live_interview","not_started", None,   None, None),
    ], ts(15))
    await _insert_apps_and_cva(conn, g, ts(15))
    await _seed_liv2_rubric_bank(conn, g, ts(14))

    # Stage-start side effects
    await _sys_log(conn, _grp(g, 21, 1), "stage_started", "group_pipeline_stages",
                   _grp(g, 1, 1),
                   {"stage_type": "assessment", "group_id": grp_id}, asm_started)

    # Invitation emails
    for ci, c in enumerate(CANDS):
        await _email_log(conn, _grp(g, 20, ci+1), c["email"], c["name"],
                         "group_credentials", "Your EraMatch account credentials", ts(15))
        await _email_log(conn, _grp(g, 20, ci+4), c["email"], c["name"],
                         "stage_invitation", f"Technical Assessment is now live — please complete by tomorrow", asm_started)

    # C1: in_progress with OngoingAssessment + 5 assigned questions + 2 answers
    c = CANDS[0]
    app_id_c1 = _grp(g, 2, 1)
    oas_c1 = _grp(g, 10, 1)
    session_start = ts(0, 1, 45)  # started 1h45m ago

    selected = [MCQ_QUESTIONS[0], MCQ_QUESTIONS[3], MCQ_QUESTIONS[6], ESSAY_QUESTIONS[0], CODING_QUESTIONS[0]]
    assignments_c1 = [_grp(g, 15, i+1) for i in range(5)]
    aq_map = build_assigned_questions_map(oas_c1, selected, assignments_c1)

    await conn.execute("""
        INSERT INTO ongoing_assessments
            (session_id, assessment_id, application_id, organization_id,
             assigned_questions, status, started_at, total_score,
             total_points, max_points, flag_count)
        VALUES ($1,$2,$3,$4,$5,'in_progress',$6,10,10,100,0)
        ON CONFLICT (session_id) DO UPDATE SET
            status=EXCLUDED.status, assigned_questions=EXCLUDED.assigned_questions
    """, oas_c1, ASM_ID, app_id_c1, ORG_ID, json.dumps(aq_map), session_start)

    # 5 CandidateAssignedQuestions (all assigned, only 2 answered)
    for i, q in enumerate(selected):
        pool_id = POOL_MCQ[0] if q == MCQ_QUESTIONS[0] else (
                  POOL_MCQ[3] if q == MCQ_QUESTIONS[3] else (
                  POOL_MCQ[6] if q == MCQ_QUESTIONS[6] else (
                  POOL_ESS[0] if q == ESSAY_QUESTIONS[0] else POOL_COD[0])))
        sec_id = ASM_SEC_MCQ if q in MCQ_QUESTIONS else (ASM_SEC_ESS if q in ESSAY_QUESTIONS else ASM_SEC_COD)
        snap = build_question_snapshot(q, with_correct=True)
        await conn.execute("""
            INSERT INTO candidate_assigned_questions
                (assignment_id, session_id, section_id, pool_entry_id,
                 question_snapshot, display_order, assigned_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7)
            ON CONFLICT (assignment_id) DO NOTHING
        """, assignments_c1[i], oas_c1, sec_id, pool_id,
             json.dumps(snap), i+1, session_start)

    # 2 answers: Q1 (MCQ correct), Q2 (MCQ wrong)
    for j, (q, chosen) in enumerate([(MCQ_QUESTIONS[0], 1), (MCQ_QUESTIONS[3], 0)]):
        is_correct = chosen == q["correct"]
        pts = Decimal("10") if is_correct else Decimal("0")
        await conn.execute("""
            INSERT INTO candidate_answers
                (answer_id, session_id, question_id, question_order,
                 answer_data, is_correct, points_earned, points_max,
                 time_spent_seconds, answered_at, assignment_id)
            VALUES ($1,$2,$3,$4,$5,$6,$7,10,$8,$9,$10)
            ON CONFLICT (answer_id) DO UPDATE SET answer_data=EXCLUDED.answer_data
        """, _grp(g, 16, j+1), oas_c1, q["id"], j+1,
             json.dumps({"type": "mcq", "selected_index": chosen, "selected_text": q["options"][chosen]}),
             is_correct, pts, 120 + j*60,
             session_start + timedelta(minutes=5 + j*8), assignments_c1[j])

    # C1 progress: in_progress
    await conn.execute("""
        INSERT INTO candidate_pipeline_progress
            (progress_id, application_id, stage_id, status,
             session_id, session_type, score, max_score, passed,
             unlocked_at, started_at)
        VALUES ($1,$2,$3,'in_progress',$4,'assessment',10,100,NULL,$5,$6)
        ON CONFLICT (progress_id) DO UPDATE SET status=EXCLUDED.status, score=EXCLUDED.score
    """, _grp(g, 14, 1), app_id_c1, _grp(g, 1, 1), oas_c1, asm_started, session_start)

    # C2, C3 progress: unlocked
    for ci in range(1, 3):
        await conn.execute("""
            INSERT INTO candidate_pipeline_progress
                (progress_id, application_id, stage_id, status,
                 score, max_score, unlocked_at)
            VALUES ($1,$2,$3,'unlocked',NULL,100,$4)
            ON CONFLICT (progress_id) DO UPDATE SET status=EXCLUDED.status
        """, _grp(g, 14, ci+1), _grp(g, 2, ci+1), _grp(g, 1, 1), asm_started)

    print(f"   ✓ Group C [{grp_id}] — assessment active, C1 in-progress (2/5 answered), C2/C3 unlocked")


# ─────────────────────────────────────────────────────────────────────────────
# G-D: assessment closed, decision pending (scores set, passed=NULL)
# ─────────────────────────────────────────────────────────────────────────────
async def seed_group_d(conn):
    g = "d"
    print("── [G-D] assessment closed, decision pending")
    grp_id = await _insert_group(conn, g, "QA Group D — Decision Pending", ts(25))
    asm_started = ts(20)
    asm_closed  = ts(15)
    await _insert_stages(conn, g, [
        ("assessment",    "closed",     ASM_ID, asm_started, asm_closed),
        ("ai_interview",  "not_started", AIC_ID, None, None),
        ("live_interview","not_started", None,   None, None),
    ], ts(25))
    await _insert_apps_and_cva(conn, g, ts(25))
    await _seed_liv2_rubric_bank(conn, g, ts(24))

    # Side effect logs
    await _sys_log(conn, _grp(g, 21, 1), "stage_started", "group_pipeline_stages",
                   _grp(g, 1, 1), {"stage_type": "assessment"}, asm_started)
    await _sys_log(conn, _grp(g, 21, 2), "stage_closed", "group_pipeline_stages",
                   _grp(g, 1, 1), {"stage_type": "assessment", "reason": "manually_closed"}, asm_closed)

    # Emails
    for ci, c in enumerate(CANDS):
        await _email_log(conn, _grp(g, 20, ci+1), c["email"], c["name"],
                         "group_credentials", "Your EraMatch credentials", ts(25))
        await _email_log(conn, _grp(g, 20, ci+4), c["email"], c["name"],
                         "stage_invitation", "Technical Assessment is now live", asm_started)

    selected = [MCQ_QUESTIONS[0], MCQ_QUESTIONS[3], MCQ_QUESTIONS[6], ESSAY_QUESTIONS[0], CODING_QUESTIONS[0]]

    # All 3 candidates: submitted sessions + full answers
    scores_d = [83, 64, 46]
    for ci, c in enumerate(CANDS):
        app_id_ci = _grp(g, 2, ci+1)
        oas_id    = _grp(g, 10, ci+1)
        session_start = asm_started + timedelta(hours=ci*2 + 1)
        session_end   = session_start + timedelta(minutes=45)
        essay_pts  = ESSAY_PTS_D[ci]
        coding_pts = CODING_PTS_D[ci]
        mcq_correct_cnt = [3, 2, 1][ci]
        mcq_pts = mcq_correct_cnt * 10
        total_pts = mcq_pts + essay_pts + coding_pts

        assignments_ci = [_grp(g, 15, ci*5 + i + 1) for i in range(5)]
        aq_map = build_assigned_questions_map(oas_id, selected, assignments_ci)

        await conn.execute("""
            INSERT INTO ongoing_assessments
                (session_id, assessment_id, application_id, organization_id,
                 assigned_questions, status, started_at, submitted_at,
                 total_score, total_points, max_points, flag_count, time_spent_seconds)
            VALUES ($1,$2,$3,$4,$5,'submitted',$6,$7,$8,$9,100,$10,2700)
            ON CONFLICT (session_id) DO UPDATE SET
                status=EXCLUDED.status, total_score=EXCLUDED.total_score
        """, oas_id, ASM_ID, app_id_ci, ORG_ID, json.dumps(aq_map),
             session_start, session_end, total_pts, int(total_pts),
             1 if ci == 2 else 0)  # C3 has a flag

        # Assign + answer all 5 questions
        for i, q in enumerate(selected):
            pool_id = ([POOL_MCQ[0], POOL_MCQ[3], POOL_MCQ[6]] + POOL_ESS[:1] + POOL_COD[:1])[i]
            sec_id = ASM_SEC_MCQ if q in MCQ_QUESTIONS else (ASM_SEC_ESS if q in ESSAY_QUESTIONS else ASM_SEC_COD)
            snap = build_question_snapshot(q, with_correct=True)
            await conn.execute("""
                INSERT INTO candidate_assigned_questions
                    (assignment_id, session_id, section_id, pool_entry_id,
                     question_snapshot, display_order, assigned_at)
                VALUES ($1,$2,$3,$4,$5,$6,$7)
                ON CONFLICT (assignment_id) DO NOTHING
            """, assignments_ci[i], oas_id, sec_id, pool_id,
                 json.dumps(snap), i+1, session_start)

        # MCQ answers
        for j in range(3):
            q = selected[j]
            chosen = CAND_MCQ_ANSWERS[ci][j]
            is_correct = chosen == MCQ_CORRECT[j]
            pts = Decimal("10") if is_correct else Decimal("0")
            await conn.execute("""
                INSERT INTO candidate_answers
                    (answer_id, session_id, question_id, question_order,
                     answer_data, is_correct, points_earned, points_max,
                     time_spent_seconds, answered_at, assignment_id)
                VALUES ($1,$2,$3,$4,$5,$6,$7,10,$8,$9,$10)
                ON CONFLICT (answer_id) DO UPDATE SET points_earned=EXCLUDED.points_earned
            """, _grp(g, 16, ci*5+j+1), oas_id, q["id"], j+1,
                 json.dumps({"type": "mcq", "selected_index": chosen, "selected_text": q["options"][chosen]}),
                 is_correct, pts, 90+j*60,
                 session_start + timedelta(minutes=5+j*8), assignments_ci[j])

        # Essay answer
        await conn.execute("""
            INSERT INTO candidate_answers
                (answer_id, session_id, question_id, question_order,
                 answer_data, is_correct, points_earned, points_max,
                 time_spent_seconds, answered_at, assignment_id, graded_at, graded_by)
            VALUES ($1,$2,$3,4,$4,NULL,$5,30,600,$6,$7,$8,'ai_grader')
            ON CONFLICT (answer_id) DO UPDATE SET points_earned=EXCLUDED.points_earned
        """, _grp(g, 16, ci*5+4), oas_id, ESSAY_QUESTIONS[0]["id"],
             json.dumps({"type": "essay", "text": CAND_ESSAY_ANSWERS[ci]}),
             essay_pts, session_start + timedelta(minutes=25),
             assignments_ci[3], session_end)

        # Coding answer
        await conn.execute("""
            INSERT INTO candidate_answers
                (answer_id, session_id, question_id, question_order,
                 answer_data, is_correct, points_earned, points_max,
                 time_spent_seconds, answered_at, assignment_id, graded_at, graded_by)
            VALUES ($1,$2,$3,5,$4,NULL,$5,40,900,$6,$7,$8,'ai_grader')
            ON CONFLICT (answer_id) DO UPDATE SET points_earned=EXCLUDED.points_earned
        """, _grp(g, 16, ci*5+5), oas_id, CODING_QUESTIONS[0]["id"],
             json.dumps({"type": "coding", "code": CAND_CODING_ANSWERS[ci], "language": "javascript"}),
             coding_pts, session_start + timedelta(minutes=40),
             assignments_ci[4], session_end)

        # Progress: completed, score set, passed=NULL (recruiter decides)
        await conn.execute("""
            INSERT INTO candidate_pipeline_progress
                (progress_id, application_id, stage_id, status,
                 session_id, session_type, score, max_score, passed,
                 unlocked_at, started_at, completed_at)
            VALUES ($1,$2,$3,'completed',$4,'assessment',$5,100,NULL,$6,$7,$8)
            ON CONFLICT (progress_id) DO UPDATE SET
                status=EXCLUDED.status, score=EXCLUDED.score, passed=NULL
        """, _grp(g, 14, ci+1), app_id_ci, _grp(g, 1, 1), oas_id,
             total_pts, asm_started, session_start, session_end)

    # C3: proctoring flags (1 high + 2 medium)
    c3_oas = _grp(g, 10, 3)
    c3_app = _grp(g, 2, 3)
    c3_session_start = asm_started + timedelta(hours=5)
    for fi, (event, sev, desc) in enumerate([
        ("multiple_faces", "high",   "Two faces detected simultaneously at 45s"),
        ("tab_switch",     "medium", "Browser tab switched at 120s"),
        ("face_not_detected", "medium", "Face disappeared from frame at 210s"),
    ]):
        await conn.execute("""
            INSERT INTO proctoring_flags
                (flag_id, application_id, session_id, session_type,
                 organization_id, timestamp_seconds, time_display,
                 event_type, severity, evidence, detected_by,
                 confidence_score, status, created_at)
            VALUES ($1,$2,$3,'assessment',$4,$5,$6,$7,$8,$9,'ai_proctoring',0.92,'pending',$10)
            ON CONFLICT (flag_id) DO NOTHING
        """, _grp(g, 19, fi+1), c3_app, c3_oas, ORG_ID,
             [45, 120, 210][fi], [f"00:00:{s:02d}" for s in [45, 120, 210]][fi],
             event, sev, desc,
             c3_session_start + timedelta(seconds=[45, 120, 210][fi]))

    print(f"   ✓ Group D [{GRP_IDS[g]}] — scores {scores_d}, passed=NULL, C3 has 3 integrity flags")


# ─────────────────────────────────────────────────────────────────────────────
# G-E: all 3 stages complete
# ─────────────────────────────────────────────────────────────────────────────
async def seed_group_e(conn):
    g = "e"
    print("── [G-E] all stages complete")
    grp_id = await _insert_group(conn, g, "QA Group E — All Stages Done", ts(45))

    asm_started = ts(40)
    asm_closed  = ts(35)
    ai_started  = ts(30)
    ai_closed   = ts(25)
    liv_started = ts(20)
    liv_closed  = ts(15)

    await _insert_stages(conn, g, [
        ("assessment",    "closed", ASM_ID, asm_started, asm_closed),
        ("ai_interview",  "closed", AIC_ID, ai_started,  ai_closed),
        ("live_interview","closed", None,   liv_started, liv_closed),
    ], ts(45))
    await _insert_apps_and_cva(conn, g, ts(45))

    # System logs
    for i, (action, stg_n, log_ts) in enumerate([
        ("stage_started", 1, asm_started), ("stage_closed", 1, asm_closed),
        ("stage_started", 2, ai_started),  ("stage_closed", 2, ai_closed),
        ("stage_started", 3, liv_started), ("stage_closed", 3, liv_closed),
    ]):
        await _sys_log(conn, _grp(g, 21, i+1), action, "group_pipeline_stages",
                       _grp(g, 1, stg_n), {"stage_type": ["assessment","ai_interview","live_interview"][(stg_n-1)]}, log_ts)

    # Emails: credentials + 3 invitations per stage start
    for ci, c in enumerate(CANDS):
        await _email_log(conn, _grp(g, 20, ci+1), c["email"], c["name"],
                         "group_credentials", "Your EraMatch credentials", ts(45))
    for start_n, subj, log_ts in [(1, "Technical Assessment is live", asm_started),
                                   (2, "AI Video Interview is ready", ai_started),
                                   (3, "Live Interview session scheduled", liv_started)]:
        for ci, c in enumerate(CANDS):
            await _email_log(conn, _grp(g, 20, start_n*3 + ci + 1), c["email"], c["name"],
                             "stage_invitation", subj, log_ts)

    selected = [MCQ_QUESTIONS[0], MCQ_QUESTIONS[3], MCQ_QUESTIONS[6], ESSAY_QUESTIONS[0], CODING_QUESTIONS[0]]
    scores_e = [88, 76, 62]

    # ── Assessment sessions ──────────────────────────────────────────────────
    for ci, c in enumerate(CANDS):
        app_id_ci = _grp(g, 2, ci+1)
        oas_id = _grp(g, 10, ci+1)
        session_start = asm_started + timedelta(hours=ci+1)
        session_end   = session_start + timedelta(minutes=50)
        essay_pts  = ESSAY_PTS_E[ci]
        coding_pts = CODING_PTS_E[ci]
        mcq_pts = [3,2,1][ci] * 10
        total_pts = scores_e[ci]  # 88/76/62

        assignments_ci = [_grp(g, 15, ci*5+i+1) for i in range(5)]
        aq_map = build_assigned_questions_map(oas_id, selected, assignments_ci)
        await conn.execute("""
            INSERT INTO ongoing_assessments
                (session_id, assessment_id, application_id, organization_id,
                 assigned_questions, status, started_at, submitted_at,
                 total_score, total_points, max_points, flag_count, time_spent_seconds)
            VALUES ($1,$2,$3,$4,$5,'submitted',$6,$7,$8,$9,100,0,2800)
            ON CONFLICT (session_id) DO UPDATE SET
                status='submitted', total_score=EXCLUDED.total_score
        """, oas_id, ASM_ID, app_id_ci, ORG_ID, json.dumps(aq_map),
             session_start, session_end, total_pts, int(total_pts))

        for i, q in enumerate(selected):
            pool_id = ([POOL_MCQ[0], POOL_MCQ[3], POOL_MCQ[6]] + POOL_ESS[:1] + POOL_COD[:1])[i]
            sec_id = ASM_SEC_MCQ if q in MCQ_QUESTIONS else (ASM_SEC_ESS if q in ESSAY_QUESTIONS else ASM_SEC_COD)
            await conn.execute("""
                INSERT INTO candidate_assigned_questions
                    (assignment_id, session_id, section_id, pool_entry_id,
                     question_snapshot, display_order, assigned_at)
                VALUES ($1,$2,$3,$4,$5,$6,$7)
                ON CONFLICT (assignment_id) DO NOTHING
            """, assignments_ci[i], oas_id, sec_id, pool_id,
                 json.dumps(build_question_snapshot(q, with_correct=True)), i+1, session_start)

        for j in range(3):
            q = selected[j]; chosen = CAND_MCQ_ANSWERS[ci][j]
            is_correct = chosen == MCQ_CORRECT[j]; pts = Decimal("10") if is_correct else Decimal("0")
            await conn.execute("""
                INSERT INTO candidate_answers
                    (answer_id, session_id, question_id, question_order, answer_data,
                     is_correct, points_earned, points_max, time_spent_seconds, answered_at, assignment_id)
                VALUES ($1,$2,$3,$4,$5,$6,$7,10,90,$8,$9)
                ON CONFLICT (answer_id) DO UPDATE SET points_earned=EXCLUDED.points_earned
            """, _grp(g, 16, ci*5+j+1), oas_id, q["id"], j+1,
                 json.dumps({"type": "mcq", "selected_index": chosen, "selected_text": q["options"][chosen]}),
                 is_correct, pts, session_start + timedelta(minutes=5+j*7), assignments_ci[j])

        for ansn, (q_obj, pts, atype, adata) in enumerate([
            (ESSAY_QUESTIONS[0], essay_pts, "essay", {"type":"essay","text":CAND_ESSAY_ANSWERS[ci]}),
            (CODING_QUESTIONS[0], coding_pts, "coding", {"type":"coding","code":CAND_CODING_ANSWERS[ci],"language":"javascript"}),
        ]):
            await conn.execute("""
                INSERT INTO candidate_answers
                    (answer_id, session_id, question_id, question_order, answer_data,
                     is_correct, points_earned, points_max, time_spent_seconds, answered_at,
                     assignment_id, graded_at, graded_by)
                VALUES ($1,$2,$3,$4,$5,NULL,$6,$7,700,$8,$9,$10,'ai_grader')
                ON CONFLICT (answer_id) DO UPDATE SET points_earned=EXCLUDED.points_earned
            """, _grp(g, 16, ci*5+4+ansn), oas_id, q_obj["id"], 4+ansn, json.dumps(adata),
                 Decimal(str(pts)), [30,40][ansn],
                 session_start + timedelta(minutes=[28,42][ansn]),
                 assignments_ci[3+ansn], session_end)

        # Assessment progress: completed, passed=True (all above 60 threshold)
        await conn.execute("""
            INSERT INTO candidate_pipeline_progress
                (progress_id, application_id, stage_id, status,
                 session_id, session_type, score, max_score, passed,
                 unlocked_at, started_at, completed_at)
            VALUES ($1,$2,$3,'completed',$4,'assessment',$5,100,true,$6,$7,$8)
            ON CONFLICT (progress_id) DO UPDATE SET
                status='completed', score=EXCLUDED.score, passed=true
        """, _grp(g, 14, ci+1), app_id_ci, _grp(g, 1, 1), oas_id,
             total_pts, asm_started, session_start, session_end)

    # ── AI Interview sessions ────────────────────────────────────────────────
    ai_scores_e = [82, 70, 48]
    for ci, c in enumerate(CANDS):
        app_id_ci = _grp(g, 2, ci+1)
        oint_id = _grp(g, 11, ci+1)
        session_start = ai_started + timedelta(days=ci)
        session_end   = session_start + timedelta(minutes=20)
        ai_score = Decimal(str(ai_scores_e[ci]))

        await conn.execute("""
            INSERT INTO ongoing_interviews
                (session_id, config_id, application_id, organization_id,
                 interview_type, status, started_at, completed_at,
                 overall_score, technical_score, communication_score, confidence_score,
                 ai_recommendation, flag_count)
            VALUES ($1,$2,$3,$4,'recorded','completed',$5,$6,$7,$7,$7,$7,$8,0)
            ON CONFLICT (session_id) DO UPDATE SET
                status='completed', overall_score=EXCLUDED.overall_score
        """, oint_id, AIC_ID, app_id_ci, ORG_ID,
             session_start, session_end, ai_score / 100,
             ["Recommend for next stage.", "Adequate, borderline.", "Does not meet bar."][ci])

        # 3 interview responses (one per first 3 questions in AIC_QUESTIONS)
        for q_idx in range(3):
            resp_id = _grp(g, 17, ci*3+q_idx+1)
            transcript = CAND_AI_TRANSCRIPTS[ci][q_idx] if q_idx < len(CAND_AI_TRANSCRIPTS[ci]) else "No response."
            feedback = build_ai_feedback(ci, q_idx)
            resp_score = max(0, min(100, int(ai_scores_e[ci]) + (q_idx - 1) * 5))
            await conn.execute("""
                INSERT INTO interview_responses
                    (response_id, session_id, question_id, question_order,
                     question_text, transcript, transcript_confidence,
                     retake_number, ai_score, ai_feedback,
                     emotion_analysis, answered_at, processing_status)
                VALUES ($1,$2,$3,$4,$5,$6,0.92,0,$7,$8,$9,$10,'completed')
                ON CONFLICT (response_id) DO UPDATE SET
                    ai_score=EXCLUDED.ai_score, ai_feedback=EXCLUDED.ai_feedback
            """, resp_id, oint_id, AIC_QUESTIONS[q_idx]["question_id"], q_idx+1,
                 AIC_QUESTIONS[q_idx]["text"], transcript, resp_score,
                 json.dumps(feedback),
                 json.dumps({"dominant": ["confident","neutral","nervous"][ci],
                              "valence": [0.7, 0.5, 0.3][ci], "arousal": 0.5}),
                 session_start + timedelta(minutes=q_idx*5+3))

        # 6 AI interview turns (alternating ai/candidate)
        for turn_n in range(6):
            speaker = "ai" if turn_n % 2 == 0 else "candidate"
            content = AIC_QUESTIONS[turn_n // 2]["text"] if speaker == "ai" else CAND_AI_TRANSCRIPTS[ci][turn_n // 2]
            await conn.execute("""
                INSERT INTO ai_interview_turns
                    (turn_id, session_id, turn_number, speaker, content, created_at)
                VALUES ($1,$2,$3,$4,$5,$6)
                ON CONFLICT (turn_id) DO NOTHING
            """, _grp(g, 18, ci*6+turn_n+1), oint_id, turn_n+1, speaker,
                 content[:300], session_start + timedelta(seconds=turn_n*60))

        # AI interview progress
        await conn.execute("""
            INSERT INTO candidate_pipeline_progress
                (progress_id, application_id, stage_id, status,
                 session_id, session_type, score, max_score, passed,
                 unlocked_at, started_at, completed_at)
            VALUES ($1,$2,$3,'completed',$4,'ai_interview',$5,100,$6,$7,$8,$9)
            ON CONFLICT (progress_id) DO UPDATE SET
                status='completed', score=EXCLUDED.score, passed=EXCLUDED.passed
        """, _grp(g, 14, ci+4), app_id_ci, _grp(g, 1, 2), oint_id,
             ai_score, ai_score >= 60,
             ai_started, session_start, session_end)

    # Bulk-progress log: assessment → AI (all passed, C3 also moved — realistic decision)
    await _sys_log(conn, _grp(g, 21, 7), "bulk_progress", "candidate_groups", grp_id,
                   {"stage": "assessment", "action": "progress", "count": 3}, asm_closed + timedelta(hours=2))

    # ── LiV2 Rubric + Bank (per-group) ──────────────────────────────────────
    rub_id_e, bnk_id_e = await _seed_liv2_rubric_bank(conn, g, ts(44))

    # ── LiV2 Sessions + Evaluations ─────────────────────────────────────────
    for ci, c in enumerate(CANDS):
        app_id_ci = _grp(g, 2, ci+1)
        ses_id = _grp(g, 12, ci+1)
        eval_id = _grp(g, 13, ci+1)
        session_start = liv_started + timedelta(days=ci)
        session_end   = session_start + timedelta(minutes=45)
        transcript = _build_liv2_transcript(c)
        ctx = {"candidate_keywords": c["skills"][:5], "cv_summary": float(c["exp_years"])}

        await conn.execute("""
            INSERT INTO li_v2_sessions
                (session_id, candidate_id, application_id, group_id, organization_id,
                 rubric_id, bank_id, room_name, state, started_at, ended_at,
                 duration_seconds, context_pool, transcript, created_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'completed',$9,$10,2700,$11,$12,$9)
            ON CONFLICT (session_id) DO UPDATE SET state='completed'
        """, ses_id, c["id"], app_id_ci, GRP_IDS[g], ORG_ID,
             rub_id_e, bnk_id_e, f"eramatch-grp-e-c{ci+1}",
             session_start, session_end,
             json.dumps(ctx), json.dumps(transcript))

        ev_data = build_liv2_evaluation(c, ci)
        await conn.execute("""
            INSERT INTO li_v2_evaluations
                (evaluation_id, session_id, organization_id,
                 overall_score, overall_score_pct, auto_verdict,
                 meets_criteria, coverage_ratio,
                 per_question_results, dimension_scores,
                 auto_tags, integrity_flags, evaluation_confidence, judged_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,1.00,$8,$9,$10,$11,$12,$13)
            ON CONFLICT (evaluation_id) DO UPDATE SET
                overall_score=EXCLUDED.overall_score,
                dimension_scores=EXCLUDED.dimension_scores
        """, eval_id, ses_id, ORG_ID,
             c["li_overall"], c["li_score_pct"], c["li_verdict"],
             c["li_verdict"] in ("strong_pass", "pass"),
             json.dumps(ev_data["per_q"]),
             json.dumps(ev_data["dim_scores"]),
             json.dumps(ev_data["auto_tags"]),
             json.dumps(ev_data["integrity_flags"]),
             ev_data["confidence"],
             liv_closed - timedelta(hours=ci+1))

        # LiV2 progress
        await conn.execute("""
            INSERT INTO candidate_pipeline_progress
                (progress_id, application_id, stage_id, status,
                 session_id, session_type, score, max_score, passed,
                 unlocked_at, started_at, completed_at)
            VALUES ($1,$2,$3,'completed',$4,'live_interview',$5,100,$6,$7,$8,$9)
            ON CONFLICT (progress_id) DO UPDATE SET
                status='completed', score=EXCLUDED.score, passed=EXCLUDED.passed
        """, _grp(g, 14, ci+7), app_id_ci, _grp(g, 1, 3), ses_id,
             Decimal(str(c["li_score_pct"])),
             c["li_verdict"] in ("strong_pass", "pass"),
             ai_closed, session_start, session_end)

    # Bulk-progress log: AI → LiV2
    await _sys_log(conn, _grp(g, 21, 8), "bulk_progress", "candidate_groups", grp_id,
                   {"stage": "ai_interview", "action": "progress", "count": 3},
                   ai_closed + timedelta(hours=3))

    # Pipeline transitions (assessment→progress for all 3)
    for ci, c in enumerate(CANDS):
        app_id_ci = _grp(g, 2, ci+1)
        for t_idx, (from_s, to_s, from_stage, to_stage, t_ts) in enumerate([
            ("applied", "screening", "assessment",   "ai_interview",   asm_closed + timedelta(hours=2)),
            ("screening","screening","ai_interview",  "live_interview", ai_closed  + timedelta(hours=3)),
        ]):
            await conn.execute("""
                INSERT INTO pipeline_transitions
                    (transition_id, application_id, organization_id,
                     from_status, to_status, from_stage, to_stage,
                     triggered_by_user_id, trigger_type, reason, metadata, created_at)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'manual','bulk_progress','{}',  $9)
                ON CONFLICT (transition_id) DO NOTHING
            """, _grp(g, 22, ci*2+t_idx+1), app_id_ci, ORG_ID,
                 from_s, to_s, from_stage, to_stage, TECH_ID, t_ts)

    print(f"   ✓ Group E [{grp_id}] — all stages complete, scores [88,76,62] ASM / [82,70,48] AI / {[c['li_score_pct'] for c in CANDS]} LiV2")


# ─────────────────────────────────────────────────────────────────────────────
# RESET  (deletes all ab-prefixed rows in reverse FK order)
# ─────────────────────────────────────────────────────────────────────────────
async def reset_seed(conn):
    print("🗑  Resetting ab-prefixed seed data...")
    RESET_ORDER = [
        "li_v2_evaluations",
        "li_v2_sessions",
        "pipeline_transitions",
        "system_logs",
        "email_logs",
        "proctoring_flags",
        "candidate_answers",
        "candidate_assigned_questions",
        "ongoing_assessments",
        "ai_interview_turns",
        "interview_responses",
        "ongoing_interviews",
        "candidate_pipeline_progress",
        "li_v2_banks",
        "li_v2_rubrics",
        "ai_interview_configs",
        "section_question_pool",
        "assessment_sections",
        "assessments",
        "group_pipeline_stages",
        "candidate_applications",
        "cv_analysis",
        "candidate_groups",
        "question_bank",
        "positions",
        "projects",
        "candidate_profiles",
        "user_permissions",
        "organization_user_settings",
        "organization_users",
        "organizations",
        "subscription_plans",
    ]
    pk_cols = {
        "li_v2_evaluations": "evaluation_id",
        "li_v2_sessions": "session_id",
        "pipeline_transitions": "transition_id",
        "system_logs": "log_id",
        "email_logs": "email_id",
        "proctoring_flags": "flag_id",
        "candidate_answers": "answer_id",
        "candidate_assigned_questions": "assignment_id",
        "ongoing_assessments": "session_id",
        "ai_interview_turns": "turn_id",
        "interview_responses": "response_id",
        "ongoing_interviews": "session_id",
        "candidate_pipeline_progress": "progress_id",
        "li_v2_banks": "bank_id",
        "li_v2_rubrics": "rubric_id",
        "ai_interview_configs": "config_id",
        "section_question_pool": "pool_entry_id",
        "assessment_sections": "section_id",
        "assessments": "assessment_id",
        "group_pipeline_stages": "stage_id",
        "candidate_applications": "application_id",
        "cv_analysis": "analysis_id",
        "candidate_groups": "group_id",
        "question_bank": "question_id",
        "positions": "position_id",
        "projects": "project_id",
        "candidate_profiles": "candidate_id",
        "user_permissions": "user_id",
        "organization_user_settings": "user_id",
        "organization_users": "user_id",
        "organizations": "organization_id",
        "subscription_plans": "plan_id",
    }
    for table in RESET_ORDER:
        pk = pk_cols[table]
        try:
            result = await conn.execute(
                f"DELETE FROM {table} WHERE CAST({pk} AS TEXT) LIKE 'ab%'"
            )
            count = int(result.split()[-1])
            if count > 0:
                print(f"   ✓ {table}: deleted {count} rows")
        except Exception as e:
            print(f"   ⚠ {table}: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────
async def run():
    if not RAW_DB_URL:
        print("❌ DATABASE_URL not set")
        sys.exit(1)

    do_reset = "--reset" in sys.argv

    print("=" * 65)
    print("  EraMatch — Five-State Pipeline Seeder")
    print("=" * 65)
    print()

    conn = await asyncpg.connect(RAW_DB_URL, statement_cache_size=0)
    try:
        if do_reset:
            await reset_seed(conn)
            print()

        await seed_baseline(conn)
        await seed_candidates(conn)
        await seed_project_position(conn)
        await seed_question_bank(conn)
        await seed_shared_configs(conn)
        await seed_group_a(conn)
        await seed_group_b(conn)
        await seed_group_c(conn)
        await seed_group_d(conn)
        await seed_group_e(conn)

        print()
        print("=" * 65)
        print("  ✅ SEED COMPLETE")
        print("=" * 65)
        print(f"""
  Org:     {ORG_ID}
  Project: {PROJ_ID}
  Position:{POS_ID}

  Credentials (password: admin12345):
    admin_1@eramatch.com  (admin)
    hr@eramatch.com       (hr)
    tech@eramatch.com     (technical)
    c1.strong@example.com (candidate C1 — sem=84, qag=78)
    c2.mid@example.com    (candidate C2 — sem=67, qag=61)
    c3.weak@example.com   (candidate C3 — sem=52, qag=null)

  Groups:
    G-A {GRP_IDS['a']} — awaiting config (config_id=NULL)
    G-B {GRP_IDS['b']} — configured, not started
    G-C {GRP_IDS['c']} — assessment active (C1 in-progress, C2/C3 unlocked)
    G-D {GRP_IDS['d']} — assessment closed, passed=NULL (scores 83/64/46)
    G-E {GRP_IDS['e']} — all complete (ASM 88/76/62, AI 82/70/48, LiV2 86/74/48%)
""")
    finally:
        await conn.close()


def main():
    asyncio.run(run())


if __name__ == "__main__":
    main()
