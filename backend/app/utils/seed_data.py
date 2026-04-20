import os
import random
import json
import time
import requests
import psycopg2
import bcrypt
from faker import Faker
from uuid import uuid4
from datetime import datetime, timedelta

# Initialize Faker
fake = Faker()


def _hash_password(password: str) -> str:
    """Hash a password using bcrypt, matching app.core.security.hash_password."""
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


# Configuration
OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL_NAME = "llama3.2"


# Database Connection
def get_db_url():
    try:
        with open(r"c:\Users\ot\Desktop\EraMatch\backend\.env", "r") as f:
            for line in f:
                if line.startswith("DATABASE_URL="):
                    url = line.strip().split("=", 1)[1].strip("\"'")
                    return url.replace("+asyncpg", "")
    except Exception as e:
        print(f"Error reading .env: {e}")
        return None


DB_URL = get_db_url()


# -----------------------------------------------------------------------------
# LLM HELPER
# -----------------------------------------------------------------------------
def generate_with_llama(prompt, context=""):
    """
    Generates text using local Ollama instance.
    Falls back to Faker if Ollama is unreachable.
    """
    full_prompt = f"{context}\n\nTask: {prompt}\n\nResponse (JSON or Text):"

    payload = {
        "model": MODEL_NAME,
        "prompt": full_prompt,
        "stream": False,
        "options": {"temperature": 0.7, "top_p": 0.9},
    }

    try:
        response = requests.post(OLLAMA_URL, json=payload, timeout=10)
        if response.status_code == 200:
            text = response.json().get("response", "").strip()
            # Remove common conversational preambles
            prefixes = [
                "Here is a",
                "Sure, here is",
                "Certainly, here is",
                "Here's a",
                "Sure thing",
                "Okay, here",
            ]
            for prefix in prefixes:
                if text.lower().startswith(prefix.lower()):
                    # Find the first colon and take everything after it
                    if ":" in text:
                        text = text.split(":", 1)[1].strip()
                    else:
                        # Or just try to strip the first sentence/line if it looks like a preamble
                        lines = text.split("\n")
                        if len(lines) > 1:
                            text = "\n".join(lines[1:]).strip()

            # Remove quotes if the entire string is quoted
            if text.startswith('"') and text.endswith('"'):
                text = text[1:-1].strip()
            return text
    except requests.exceptions.RequestException:
        pass

    # Fallback if AI fails or is slow
    return fake.paragraph()


# -----------------------------------------------------------------------------
# DATABASE UTILS
# -----------------------------------------------------------------------------
def get_conn():
    return psycopg2.connect(DB_URL)


def clean_database():
    """
    Truncates tables to start fresh.
    DOES NOT DROP CONSTRAINTS (Schema is respected).
    """
    conn = get_conn()
    cur = conn.cursor()

    print("Cleaning database (Truncating tables)...")

    # Truncate all tables (cascade)
    try:
        cur.execute("""
            TRUNCATE TABLE
            ai_interview_configs,
            ai_interview_turns,
            assessments,
            candidate_answers,
            candidate_applications,
            candidate_groups,
            candidate_profiles,
            candidate_stage_progress,
            cv_analysis,
            email_logs,
            github_analysis,
            group_stage_config,
            hires,
            interview_responses,
            live_interview_configs,
            live_interview_sessions,
            notifications,
            offers,
            ongoing_assessments,
            ongoing_interviews,
            organization_departments,
            organization_users,
            organizations,
            payment_methods,
            pipeline_transitions,
            positions,
            proctoring_flags,
            project_access,
            projects,
            question_bank,
            question_bank_favorites,
            recruiter_assignment_logs,
            recruiter_notes,
            stage_onboarding,
            subscription_plans,
            system_logs,
            user_permissions
            CASCADE;
        """)
        conn.commit()
    except Exception as e:
        print(f"  Truncate warning: {e}")
        conn.rollback()

    cur.close()
    conn.close()
    print("Database cleaned.")


# -----------------------------------------------------------------------------
# DATA GENERATORS
# -----------------------------------------------------------------------------
def seed_core_data():
    conn = get_conn()
    cur = conn.cursor()
    print("Seeding Core Data (Plans, Orgs, Users)...")

    # 1. PLANS
    plans = {
        "Free": {"price": 0, "features": {"limit": 1}},
        "Pro": {"price": 49.99, "features": {"limit": 10}},
        "Enterprise": {"price": 299.99, "features": {"limit": 100}},
    }

    plan_ids = {}

    for name, data in plans.items():
        pid = str(uuid4())
        cur.execute(
            "INSERT INTO subscription_plans (plan_id, name, monthly_price, features_json) VALUES (%s, %s, %s, %s)",
            (pid, name, data["price"], json.dumps(data["features"])),
        )
        plan_ids[name] = pid

    # 2. ORGANIZATION
    org_id = str(uuid4())
    # User Request: Email: admin_1@eramatch.com, Password: admin12345
    admin_email = "admin_1@eramatch.com"
    org_password_hash = _hash_password("admin12345")

    cur.execute(
        """
        INSERT INTO organizations (organization_id, plan_id, organization_name, admin_email, admin_password_hash)
        VALUES (%s, %s, %s, %s, %s)
        """,
        (
            org_id,
            plan_ids["Enterprise"],
            "EraMatch Demo Corp",
            admin_email,
            org_password_hash,
        ),
    )

    # 3. USERS
    # Passwords hashed with admin12345 for simplicity or robust hash
    default_pw_hash = _hash_password("admin12345")

    users = [
        (admin_email, "Admin", "User", "admin"),
        ("hr@eramatch.com", "Helen", "Recruiter", "hr"),
        ("tech@eramatch.com", "Tom", "Tech", "technical"),
        ("dev@eramatch.com", "Dave", "Developer", "technical"),
    ]

    user_ids = {}

    for email, first, last, role in users:
        uid = str(uuid4())
        cur.execute(
            """
            INSERT INTO organization_users (user_id, organization_id, email, password_hash, first_name, last_name, role, status)
            VALUES (%s, %s, %s, %s, %s, %s, %s, 'active')
            """,
            (uid, org_id, email, default_pw_hash, first, last, role),
        )
        user_ids[email] = uid

    # 4. PROJECTS (Multiple for Diversity)
    print("Generating Projects...")
    project_ids = []
    project_configs = [
        ("Q1 Core Platform Expansion", "active"),
        ("Legacy System Migration", "active"),
        ("Mobile App V2", "active"),
        ("Internal Tools Overhaul", "active"),
        ("AI Feature Integration", "active"),
    ]

    for p_name, p_status in project_configs:
        pid = str(uuid4())
        cur.execute(
            """
            INSERT INTO projects (project_id, organization_id, created_by_user_id, name, status, created_at)
            VALUES (%s, %s, %s, %s, %s, NOW() - INTERVAL '%s days')
            """,
            (
                pid,
                org_id,
                user_ids[admin_email],
                p_name,
                p_status,
                random.randint(10, 100),
            ),
        )

        # Admin is OWNER, others are COLLABORATOR
        cur.execute(
            "INSERT INTO project_access (access_id, project_id, user_id, access_level) VALUES (%s, %s, %s, 'owner')",
            (str(uuid4()), pid, user_ids[admin_email]),
        )
        cur.execute(
            "INSERT INTO project_access (access_id, project_id, user_id, access_level) VALUES (%s, %s, %s, 'collaborator')",
            (str(uuid4()), pid, user_ids["hr@eramatch.com"]),
        )
        project_ids.append(pid)

    conn.commit()
    cur.close()
    conn.close()
    print(f"Core Data Seeded. {len(project_ids)} Projects Created.")
    return org_id, user_ids, project_ids


def generate_positions(org_id, user_ids, project_ids):
    conn = get_conn()
    cur = conn.cursor()
    titles = [
        "Senior Backend Engineer",
        "Frontend React Developer",
        "DevOps Engineer",
        "Product Manager",
        "Data Scientist",
    ]
    # , "Mobile Developer (iOS)", "Mobile Developer (Android)", "Full Stack Developer",
    #     "Site Reliability Engineer (SRE)", "Cloud Architect", "Machine Learning Engineer", "AI Researcher",
    #     "UI Designer", "UX Researcher", "QA Automation Engineer", "Security Engineer", "Database Administrator",
    #     "Network Engineer", "Systems Analyst", "Game Developer (Unity)", "Embedded Systems Engineer",
    #     "Blockchain Developer", "Technical Writer", "Customer Support Engineer", "Sales Engineer",
    #     "Solutions Architect", "IT Manager", "Chief Technology Officer (CTO)", "VP of Engineering",
    #     "Human Resources Manager", "Talent Acquisition Specialist", "Marketing Manager", "SEO Specialist",
    #     "Content Strategist", "Data Analyst", "Business Analyst", "Project Manager", "Scrum Master",
    #     "Product Owner", "Release Engineer"

    position_ids = []

    for title in titles:
        pid = str(uuid4())
        # Randomly assign to one of the projects
        assigned_proj_id = random.choice(project_ids)

        # Determine likely level/skills based on title keywords (Basic Heuristic + LLM refinement)
        level = (
            "Senior Level"
            if "Senior" in title
            or "CTO" in title
            or "VP" in title
            or "Architect" in title
            else "Mid Level"
        )
        if "Entry" in title or "Junior" in title:
            level = "Entry Level"

        # Use LLM for Skills & Description
        print(f"  - Generating content for: {title}...")
        prompt_skills = f'List 5 key technical skills for a {title} as a JSON array of strings. Example: ["Python", "AWS"]'
        skills_json = generate_with_llama(prompt_skills)

        # Clean basic json markdown if present
        skills_json = skills_json.replace("```json", "").replace("```", "").strip()
        try:
            skills_list = json.loads(skills_json)
            if not isinstance(skills_list, list):
                raise ValueError
        except:
            # Fallback
            skills_list = ["General Tech", "Communication", "Problem Solving"]

        desc = generate_with_llama(
            f"Write a compelling 1-paragraph job description for a {title} position."
        )

        # [FIX] Assign BOTH HR and Tech Recruiters
        hr_id = user_ids["hr@eramatch.com"]
        tech_id = user_ids["tech@eramatch.com"]

        cur.execute(
            """
            INSERT INTO positions (position_id, organization_id, project_id, job_title, job_description, required_skills, salary_min, salary_max, status, assigned_hr_id, assigned_tech_id, created_at, experience_level, work_type)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'open', %s, %s, NOW(), %s, 'Remote')
            """,
            (
                pid,
                org_id,
                assigned_proj_id,
                title,
                desc,
                json.dumps(skills_list),
                random.randint(80000, 120000),
                random.randint(130000, 180000),
                hr_id,
                tech_id,
                level,
            ),
        )
        position_ids.append(pid)

    conn.commit()
    cur.close()
    conn.close()
    print(f"Created {len(position_ids)} Positions.")
    return position_ids


def generate_candidates_and_applications(org_id, position_ids, group_map):
    conn = get_conn()
    cur = conn.cursor()
    print("Generating Candidates (High Volume & Diversity)...")

    candidates = []

    for pos_id in position_ids:
        # Non-uniform distribution: Some roles popular (8-12), others niche (3-5)
        count = random.randint(3, 5) if random.random() < 0.3 else random.randint(8, 12)

        for _ in range(count):
            cid = str(uuid4())
            name = fake.name()
            email = fake.email()

            # Generate Bio for realism (Store in memory to use in Notes/CV)
            bio_prompt = f"Write a 1-sentence professional summary for a candidate named {name} applying for a tech role."
            bio = generate_with_llama(bio_prompt)

            cur.execute(
                "INSERT INTO candidate_profiles (candidate_id, organization_id, full_name, email, phone, location, linkedin_url, github_url) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
                (
                    cid,
                    org_id,
                    name,
                    email,
                    fake.phone_number(),
                    fake.city(),
                    f"https://linkedin.com/in/{name.replace(' ', '')}",
                    f"https://github.com/{name.replace(' ', '')}",
                ),
            )

            # Application
            app_id = str(uuid4())
            group_id = group_map.get(pos_id)
            # More realistic funnel: Most in screening/rejected, fewer in later stages
            statuses = (
                ["applied"] * 10
                + ["screening"] * 8
                + ["in_pipeline"] * 5
                + ["rejected"] * 10
                + ["offered"] * 2
                + ["hired"] * 1
            )
            status = random.choice(statuses)

            cur.execute(
                "INSERT INTO candidate_applications (application_id, candidate_id, position_id, group_id, organization_id, status, applied_at) VALUES (%s, %s, %s, %s, %s, %s, NOW() - INTERVAL '%s days')",
                (app_id, cid, pos_id, group_id, org_id, status, random.randint(1, 60)),
            )
            # Pass bio downstream
            candidates.append(
                {
                    "id": cid,
                    "app_id": app_id,
                    "status": status,
                    "name": name,
                    "pos_id": pos_id,
                    "bio": bio,
                }
            )

    conn.commit()
    cur.close()
    conn.close()
    print(f"Generated {len(candidates)} candidates.")
    return candidates

    conn.commit()
    cur.close()
    conn.close()
    return position_ids


def generate_groups_and_stages(org_id, position_ids):
    conn = get_conn()
    cur = conn.cursor()
    print("Generating Groups & Stages (Pipeline)...")

    group_map = {}

    for pos_id in position_ids:
        # Create a default group for each position
        gid = str(uuid4())
        cur.execute(
            """
            INSERT INTO candidate_groups (group_id, organization_id, position_id, group_name, created_at)
            VALUES (%s, %s, %s, 'Main Pipeline', NOW())
            """,
            (gid, org_id, pos_id),
        )
        group_map[pos_id] = gid

        # Create Stages: Assessment -> AI Interview -> Live Interview
        # Mapped to valid stage_type values: assessment, ai_interview, live_interview
        stages = [("assessment", 1), ("ai_interview", 2), ("live_interview", 3)]

        for st_type, order in stages:
            sid = str(uuid4())
            cur.execute(
                """
                INSERT INTO group_stage_config (stage_config_id, group_id, organization_id, stage_type, stage_order, state)
                VALUES (%s, %s, %s, %s, %s, 'active')
                """,
                (sid, gid, org_id, st_type, order),
            )

    conn.commit()
    cur.close()
    conn.close()
    print("Groups & Stages Created.")
    return group_map


def generate_detailed_assessments_and_interviews(org_id, candidates):
    conn = get_conn()
    cur = conn.cursor()
    print("Generating Assessments (Unique per Position via LLM)...")

    # Map pos_id -> assessment_id
    pos_assessment_map = {}

    # Identify unique positions from candidates
    unique_pos_ids = list(set([c["pos_id"] for c in candidates]))

    for pid in unique_pos_ids:
        # Get Position Title for context (Need a quick query or pass mapping, let's query for realism)
        cur.execute("SELECT job_title FROM positions WHERE position_id = %s", (pid,))
        row = cur.fetchone()
        title = row[0] if row else "General"

        print(f"  - Generating Assessment & AI Config for {title}...")

        # 1a. Create AI Interview Config
        ai_config_id = str(uuid4())
        cur.execute(
            """
            INSERT INTO ai_interview_configs (config_id, organization_id, position_id, title, interview_type, questions)
            VALUES (%s, %s, %s, %s, 'live_ai', '{"questions":["Tell me about yourself."]}')
            """,
            (ai_config_id, org_id, pid, f"{title} AI Screen"),
        )
        pos_assessment_map[pid] = {"asm_id": str(uuid4()), "ai_conf_id": ai_config_id}

        # Use LLM to generate assessment questions
        prompt = f"Generate 3 interview questions for a {title} role. 1 multiple choice (mcq), 1 coding, 1 essay. Return JSON: {{'sections': [{{'title': 'Theory', 'questions': [{{'id': 'q1', 'text': '...', 'type': 'mcq', 'options': ['A', 'B']}}]}}]}}"
        # We'll trust the LLM or fallback
        asm_structure_json = generate_with_llama(prompt)

        # Validate/Sanitize
        try:
            asm_structure_json = (
                asm_structure_json.replace("```json", "").replace("```", "").strip()
            )
            # Ensure it has 'sections'
            struct = json.loads(asm_structure_json)
            if "sections" not in struct:
                raise ValueError
        except:
            # Fallback Structure
            struct = {
                "sections": [
                    {
                        "title": "Theory",
                        "questions": [
                            {
                                "id": "q1",
                                "text": f"Explain key concepts of {title}",
                                "type": "mcq",
                                "options": ["Concept A", "Concept B", "Concept C"],
                            }
                        ],
                    },
                    {
                        "title": "Practice",
                        "questions": [
                            {
                                "id": "q2",
                                "text": "Solve a relevant problem",
                                "type": "coding",
                            }
                        ],
                    },
                ]
            }

        asm_id = pos_assessment_map[pid]["asm_id"]
        cur.execute(
            """
            INSERT INTO assessments (assessment_id, organization_id, title, structure, status, created_at)
            VALUES (%s, %s, %s, %s, 'published', NOW())
            """,
            (asm_id, org_id, f"{title} Assessment", json.dumps(struct)),
        )

    # 2. Process Candidates
    print("  - Assigning Assessments & Generating Interviews...")
    for cand in candidates:
        app_id = cand["app_id"]
        status = cand["status"]
        pos_id = cand.get("pos_id")

        # Determine IDs
        mapping = pos_assessment_map.get(pos_id)
        if not mapping:
            continue
        asm_id = mapping["asm_id"]
        ai_config_id = mapping["ai_conf_id"]

        if status in ["in_pipeline", "offered", "hired", "rejected"]:
            # Create Ongoing Assessment
            session_id = str(uuid4())
            score = round(random.uniform(60.0, 98.0), 2)
            cur.execute(
                """
                INSERT INTO ongoing_assessments (session_id, assessment_id, application_id, organization_id, status, total_score, submitted_at, assigned_questions)
                VALUES (%s, %s, %s, %s, 'submitted', %s, NOW() - INTERVAL '5 days', '[]')
                """,
                (session_id, asm_id, app_id, org_id, score),
            )

            # Interview Logic
            if score > 75:
                # Create Ongoing Interview (AI)
                interview_sess_id = str(uuid4())
                cur.execute(
                    """
                    INSERT INTO ongoing_interviews (session_id, config_id, application_id, organization_id, interview_type, status)
                    VALUES (%s, %s, %s, %s, 'live_ai', 'completed')
                    """,
                    (interview_sess_id, ai_config_id, app_id, org_id),
                )

    conn.commit()
    cur.close()
    conn.close()
    print("Assessments Generated.")


def generate_extra_artifacts(org_id, candidates, user_ids):
    conn = get_conn()
    cur = conn.cursor()
    print("Generating Extra Artifacts (Notes, Flags, Live Sessions)...")

    recruiter_id = user_ids["hr@eramatch.com"]

    for cand in candidates:
        app_id = cand["app_id"]
        status = cand["status"]

        # 4. Recruiter Notes
        bio = cand.get("bio", "Experienced professional.")
        note_prompt = f"Candidate Bio: {bio}\nStatus: {status}\nTask: Write a short recruiter note about this candidate. Mention their communication style and fit for the role."
        note_content = generate_with_llama(note_prompt)

        cur.execute(
            "INSERT INTO recruiter_notes (note_id, application_id, author_id, content, created_at) VALUES (%s, %s, %s, %s, NOW())",
            (str(uuid4()), app_id, recruiter_id, note_content),
        )

        # 5. CV Analysis (Mock)
        cur.execute(
            """
            INSERT INTO cv_analysis (analysis_id, application_id, organization_id, cv_file_url, skills, match_score, analyzed_at)
            VALUES (%s, %s, %s, %s, %s, %s, NOW())
            """,
            (
                str(uuid4()),
                app_id,
                org_id,
                f"s3://cvs/{cand['name'].replace(' ', '_')}.pdf",
                ["Python", "FastAPI"],
                round(random.uniform(70, 99), 2),
            ),
        )

        # 6. Proctoring Flags (for a few candidates)
        if random.random() < 0.2 and status in ["rejected", "interview"]:
            # Valid Statuses: pending, resolved, dismissed
            flag_status = random.choice(["pending", "resolved"])
            cur.execute(
                """
                INSERT INTO proctoring_flags (flag_id, application_id, session_id, session_type, organization_id, timestamp_seconds, event_type, severity, evidence, status, created_at)
                VALUES (%s, %s, %s, 'assessment', %s, %s, 'tab_switch', 'medium', 'User switched tabs multiple times', %s, NOW())
                """,
                (
                    str(uuid4()),
                    app_id,
                    str(uuid4()),
                    org_id,
                    random.randint(100, 3000),
                    flag_status,
                ),
            )

        # 7. Live Interview Sessions (if hired/offer)
        if status in ["offered", "hired"]:
            # Create a CONFIG for this live interview first (FK Requirement)
            live_config_id = str(uuid4())
            cur.execute(
                """
                INSERT INTO live_interview_configs (config_id, organization_id, title, duration_minutes, created_at)
                VALUES (%s, %s, %s, 60, NOW())
                """,
                (live_config_id, org_id, "Final Technical Interview"),
            )

            # Valid Statuses: scheduled, started, completed, cancelled
            # Valid Ratings: 1-5
            rating = random.randint(3, 5)
            decision = random.choice(["hire", "strong_hire"])

            cur.execute(
                """
                INSERT INTO live_interview_sessions (session_id, config_id, application_id, organization_id, interviewer_id, status, interviewer_rating, interviewer_decision, started_at, ended_at)
                VALUES (%s, %s, %s, %s, %s, 'completed', %s, %s, NOW(), NOW() + INTERVAL '1 hour')
                """,
                (
                    str(uuid4()),
                    live_config_id,
                    app_id,
                    org_id,
                    user_ids["tech@eramatch.com"],
                    rating,
                    decision,
                ),
            )

    conn.commit()
    cur.close()
    conn.close()
    print("Extra Artifacts (Notes, Flags, CVs) Generated.")


def generate_full_db_coverage(org_id, candidates, user_ids, position_ids, group_map):
    conn = get_conn()
    cur = conn.cursor()

    recruiter_id = user_ids["hr@eramatch.com"]

    # 1. QUESTION BANK
    # Populate a shared bank of questions (Scaled with LLM)
    topics = [
        "Algorithms",
        "System Design",
        "Databases",
        "Networking",
        "Security",
        "DevOps",
        "Frontend",
        "Mobile",
        "AI/ML",
        "Soft Skills",
    ]

    for topic in topics:
        # Generate 2 questions per topic
        for _ in range(2):
            prompt = f"Write a single interview question about {topic}. Return JSON: {{'text': '...', 'type': 'mcq', 'tags': ['{topic}']}}"
            q_json = generate_with_llama(prompt)

            try:
                q_json = q_json.replace("```json", "").replace("```", "").strip()
                q_data = json.loads(q_json)
                q_text = q_data.get("text", f"Explain {topic}")
                q_type = q_data.get("type", "essay")
                q_tags = q_data.get("tags", [topic])
            except:
                q_text = f"Discuss advanced concepts in {topic}"
                q_type = "essay"
                q_tags = [topic]

            cur.execute(
                "INSERT INTO question_bank (question_id, organization_id, question_text, question_type, tags, difficulty, created_at) VALUES (%s, %s, %s, %s, %s, %s, NOW())",
                (str(uuid4()), org_id, q_text, q_type, q_tags, random.randint(1, 5)),
            )

    # 2. ORGANIZATION DEPARTMENTS & PAYMENT METHODS
    print("  - Populating Departments & Payments...")
    dept_id = str(uuid4())
    cur.execute(
        "INSERT INTO organization_departments (department_id, organization_id, name, created_at) VALUES (%s, %s, 'Engineering', NOW())",
        (dept_id, org_id),
    )

    cur.execute(
        "INSERT INTO payment_methods (payment_id, organization_id, card_brand, last4, expiry_date, is_default, stripe_payment_method_id, created_at) VALUES (%s, %s, 'Visa', '4242', '12/28', true, %s, NOW())",
        (str(uuid4()), org_id, f"pm_{uuid4()}"),
    )

    # 3. QUESTION BANK FAVORITES (Replacing Candidate Favorites)
    print("  - Adding Question Bank Favorites...")
    cur.execute("SELECT question_id FROM question_bank LIMIT 1")
    q_row = cur.fetchone()
    if q_row:
        cur.execute(
            "INSERT INTO question_bank_favorites (favorite_id, user_id, question_id, created_at) VALUES (%s, %s, %s, NOW())",
            (str(uuid4()), recruiter_id, q_row[0]),
        )

    # 4. OFFERS & HIRES
    print("  - Generating Offers & Hires...")
    for cand in candidates:
        if cand["status"] in ["offered", "hired"]:
            offer_id = str(uuid4())
            salary = random.randint(100000, 150000)
            cur.execute(
                """
                INSERT INTO offers (offer_id, application_id, organization_id, position_id, salary_offered, status, offered_at)
                VALUES (%s, %s, %s, (SELECT position_id FROM candidate_applications WHERE application_id = %s), %s, 'accepted', NOW())
                """,
                (offer_id, cand["app_id"], org_id, cand["app_id"], salary),
            )

            if cand["status"] == "hired":
                cur.execute(
                    """
                    INSERT INTO hires (hire_id, application_id, organization_id, position_id, offer_id, final_salary, start_date, hired_at)
                    VALUES (%s, %s, %s, (SELECT position_id FROM candidate_applications WHERE application_id = %s), %s, %s, NOW() + INTERVAL '2 weeks', NOW())
                    """,
                    (
                        str(uuid4()),
                        cand["app_id"],
                        org_id,
                        cand["app_id"],
                        offer_id,
                        salary,
                    ),
                )

    # 5. LOGS & NOTIFICATIONS
    print("  - Generating Logs (Email, System, Notifications, Recruiter Assignment)...")
    cur.execute(
        "INSERT INTO system_logs (log_id, organization_id, user_id, action, entity_type, created_at) VALUES (%s, %s, %s, 'login', 'auth', NOW())",
        (str(uuid4()), org_id, recruiter_id),
    )
    cur.execute(
        "INSERT INTO email_logs (email_id, organization_id, recipient_email, subject, status, sent_at) VALUES (%s, %s, 'candidate@example.com', 'Interview Invite', 'sent', NOW())",
        (str(uuid4()), org_id),
    )
    cur.execute(
        "INSERT INTO notifications (notification_id, organization_id, recipient_user_id, type, title, is_read, created_at) VALUES (%s, %s, %s, 'alert', 'New Application', false, NOW())",
        (str(uuid4()), org_id, recruiter_id),
    )
    cur.execute(
        "INSERT INTO recruiter_assignment_logs (log_id, organization_id, user_id, action, created_at) VALUES (%s, %s, %s, 'assigned', NOW())",
        (str(uuid4()), org_id, recruiter_id),
    )

    # 6. PIPELINE TRANSITIONS & STAGE PROGRESS & ONBOARDING
    print("  - Generating Pipeline/Stage Tracking...")
    for cand in candidates:
        # Transition Log
        cur.execute(
            "INSERT INTO pipeline_transitions (transition_id, application_id, organization_id, from_status, to_status, triggered_by_user_id, created_at) VALUES (%s, %s, %s, 'applied', %s, %s, NOW())",
            (str(uuid4()), cand["app_id"], org_id, cand["status"], recruiter_id),
        )

        # Stage Progress (Mock)
        if cand["status"] != "applied":
            cur.execute(
                "INSERT INTO candidate_stage_progress (progress_id, application_id, group_id, stage_type, stage_order, status) VALUES (%s, %s, (SELECT group_id FROM candidate_applications WHERE application_id = %s), 'assessment', 1, 'completed')",
                (str(uuid4()), cand["app_id"], cand["app_id"]),
            )

        # Onboarding (for hired)
        if cand["status"] == "hired":
            cur.execute(
                """
                INSERT INTO stage_onboarding (onboarding_id, application_id, stage_type, device_test_passed, camera_test_passed, microphone_test_passed, instructions_accepted, face_calibration_passed, voice_calibration_passed, created_at)
                VALUES (%s, %s, 'ai_interview', true, true, true, true, true, true, NOW())
                """,
                (str(uuid4()), cand["app_id"]),
            )

    # 7. GITHUB ANALYSIS
    print("  - Generating GitHub Analysis...")
    for cand in candidates:
        cur.execute(
            "INSERT INTO github_analysis (analysis_id, candidate_id, organization_id, repo_count) VALUES (%s, %s, %s, %s)",
            (str(uuid4()), cand["id"], org_id, random.randint(5, 50)),
        )

    # 8. DETAILED INTERVIEW/ASSESSMENT ARTIFACTS
    print("  - Generating Deep Interview Details (Turns, Answers)...")
    # Fetch ongoing interviews to attach details
    cur.execute("SELECT session_id FROM ongoing_interviews LIMIT 5")
    sessions = cur.fetchall()
    for (sid,) in sessions:
        # AI Interview Turn
        cur.execute(
            "INSERT INTO ai_interview_turns (turn_id, session_id, turn_number, speaker, content, created_at) VALUES (%s, %s, 1, 'ai', 'Tell me about yourself.', NOW())",
            (str(uuid4()), sid),
        )
        # Interview Response
        cur.execute(
            "INSERT INTO interview_responses (response_id, session_id, question_id, question_text, question_order, transcript) VALUES (%s, %s, 'q1', 'Tell me about yourself.', 1, 'I am a software engineer.')",
            (str(uuid4()), sid),
        )

    cur.execute("SELECT question_id FROM question_bank LIMIT 1")
    q_row = cur.fetchone()
    valid_qid = q_row[0] if q_row else str(uuid4())

    cur.execute("SELECT session_id FROM ongoing_assessments LIMIT 5")
    assessments_sessions = cur.fetchall()
    for (sid,) in assessments_sessions:
        cur.execute(
            "INSERT INTO candidate_answers (answer_id, session_id, question_id, question_order, answer_data, points_earned, points_max) VALUES (%s, %s, %s, 1, %s, 10.0, 10.0)",
            (
                str(uuid4()),
                sid,
                valid_qid,
                json.dumps("Dependency injection is a design pattern..."),
            ),
        )

    print("  - Generating User Permissions...")
    cur.execute(
        "INSERT INTO user_permissions (permission_id, user_id, can_manage_positions, can_manage_candidates, can_view_analytics, can_export_data, can_manage_users, custom_permissions) VALUES (%s, %s, true, true, true, true, false, '{}')",
        (str(uuid4()), recruiter_id),
    )

    conn.commit()
    cur.close()
    conn.close()


# -----------------------------------------------------------------------------
# MAIN EXECUTION
# -----------------------------------------------------------------------------
if __name__ == "__main__":
    if not DB_URL:
        print("Could not determine DATABASE_URL")
        exit(1)

    clean_database()
    org_id, user_ids, project_ids = seed_core_data()
    position_ids = generate_positions(org_id, user_ids, project_ids)
    # NEW: Generate Groups & Stages
    group_map = generate_groups_and_stages(org_id, position_ids)

    candidates = generate_candidates_and_applications(org_id, position_ids, group_map)
    generate_detailed_assessments_and_interviews(org_id, candidates)
    generate_extra_artifacts(org_id, candidates, user_ids)
    generate_full_db_coverage(org_id, candidates, user_ids, position_ids, group_map)
