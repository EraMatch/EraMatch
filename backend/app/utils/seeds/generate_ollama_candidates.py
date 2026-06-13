from __future__ import annotations

import argparse
import json
import os
import random
import re
from datetime import datetime, timedelta
from pathlib import Path
from uuid import uuid4

import psycopg2
import requests
from faker import Faker
from psycopg2.extras import Json, execute_batch


fake = Faker()

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434/api/generate")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2")
BATCH_SIZE = 25


def load_database_url() -> str:
    env_path = Path(__file__).resolve().parents[2] / ".env"
    if not env_path.exists():
        raise RuntimeError("backend/.env not found. Please create it with DATABASE_URL.")

    for line in env_path.read_text(encoding="utf-8").splitlines():
        if line.startswith("DATABASE_URL="):
            url = line.split("=", 1)[1].strip().strip('"').strip("'")
            return url.replace("+asyncpg", "")

    raise RuntimeError("DATABASE_URL is missing in backend/.env")


def ollama_generate(prompt: str, timeout: int = 45) -> str:
    payload = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": 0.85,
            "top_p": 0.9,
        },
    }
    response = requests.post(OLLAMA_URL, json=payload, timeout=timeout)
    response.raise_for_status()
    return response.json().get("response", "").strip()


def parse_json_array(text: str) -> list[dict]:
    cleaned = text.strip().replace("```json", "").replace("```", "")
    start = cleaned.find("[")
    end = cleaned.rfind("]")
    if start == -1 or end == -1:
        return []
    candidate_json = cleaned[start : end + 1]
    try:
        data = json.loads(candidate_json)
        if isinstance(data, list):
            return [x for x in data if isinstance(x, dict)]
        return []
    except json.JSONDecodeError:
        # Simple repair for trailing commas and invalid escapes
        candidate_json = re.sub(r",\s*([}\]])", r"\1", candidate_json)
        candidate_json = re.sub(r"\\(?![\"\\/bfnrtu])", r"\\\\", candidate_json)
        try:
            data = json.loads(candidate_json)
            if isinstance(data, list):
                return [x for x in data if isinstance(x, dict)]
            return []
        except Exception:
            return []


def fallback_profiles(count: int, title: str, required_skills: list[str], location_hint: str | None = None) -> list[dict]:
    base_skills = required_skills[:] if required_skills else ["Communication", "Problem Solving", "Teamwork"]
    generic_skills = [
        "Python", "SQL", "Git", "Docker", "Kubernetes", "AWS", "TypeScript", "React", "Node.js", "FastAPI",
        "PostgreSQL", "Redis", "CI/CD", "Linux", "REST APIs", "Kafka", "Pandas", "TensorFlow", "Scikit-Learn",
    ]
    profiles = []
    for _ in range(count):
        random.shuffle(generic_skills)
        skills = list(dict.fromkeys((base_skills + generic_skills[:6])))[:10]
        full_name = fake.name()
        summary = f"{title} with hands-on experience delivering production features, collaborating cross-functionally, and improving system reliability."
        profiles.append(
            {
                "full_name": full_name,
                "title": title,
                "location": location_hint or fake.city(),
                "years_experience": round(random.uniform(1.0, 14.0), 1),
                "skills": skills,
                "summary": summary,
                "linkedin_slug": full_name.lower().replace(" ", "-").replace("'", ""),
                "github_username": full_name.lower().replace(" ", "").replace("'", "") + str(random.randint(10, 999)),
                "phone": fake.phone_number(),
            }
        )
    return profiles


def generate_profiles_with_ollama(count: int, title: str, required_skills: list[str], jd: str | None) -> list[dict]:
    required_skills_text = ", ".join(required_skills[:12]) if required_skills else "general engineering skills"
    jd_snippet = (jd or "")[:1000]

    prompt = f"""
Generate {count} realistic candidate profiles for the role: {title}.
Required skills context: {required_skills_text}
Job description context: {jd_snippet}

Return ONLY a valid JSON array, where each object has:
- full_name (string)
- location (string)
- years_experience (number, 0.5 to 18)
- skills (array of 6-12 strings)
- summary (1 sentence, realistic, professional)
- linkedin_slug (string, URL slug format)
- github_username (string)
- phone (string)

No markdown. No extra text.
"""

    try:
        raw = ollama_generate(prompt)
        parsed = parse_json_array(raw)
        if len(parsed) >= count:
            return parsed[:count]
        # fill missing with fallback
        remainder = count - len(parsed)
        return parsed + fallback_profiles(remainder, title, required_skills)
    except Exception:
        return fallback_profiles(count, title, required_skills)


def get_org_and_positions(conn, org_id: str | None) -> tuple[str, list[dict]]:
    with conn.cursor() as cur:
        if org_id:
            cur.execute(
                "SELECT organization_id FROM organizations WHERE organization_id = %s LIMIT 1",
                (org_id,),
            )
            row = cur.fetchone()
            if not row:
                raise RuntimeError(f"Organization {org_id} not found")
            chosen_org = row[0]
        else:
            cur.execute("SELECT organization_id FROM organizations ORDER BY organization_id LIMIT 1")
            row = cur.fetchone()
            if not row:
                raise RuntimeError("No organizations found in DB")
            chosen_org = row[0]

        cur.execute(
            """
            SELECT position_id, job_title, required_skills, job_description
            FROM positions
            WHERE organization_id = %s AND is_deleted = false
            ORDER BY created_at DESC
            """,
            (chosen_org,),
        )
        positions = []
        for pid, title, skills, jd in cur.fetchall():
            skills_list = skills if isinstance(skills, list) else []
            positions.append(
                {
                    "position_id": str(pid),
                    "job_title": title or "Software Engineer",
                    "required_skills": skills_list,
                    "job_description": jd or "",
                }
            )
        if not positions:
            raise RuntimeError("No positions found for selected organization. Create at least one position first.")
        return str(chosen_org), positions


def insert_candidates(conn, org_id: str, positions: list[dict], total: int) -> int:
    generated = 0
    inserted = 0

    # Weighted round-robin by current position popularity
    position_cycle = []
    for p in positions:
        weight = max(1, min(6, len(p["required_skills"]) // 2 + 1))
        position_cycle.extend([p] * weight)

    with conn.cursor() as cur:
        while generated < total:
            take = min(BATCH_SIZE, total - generated)
            selected_position = random.choice(position_cycle)

            profiles = generate_profiles_with_ollama(
                count=take,
                title=selected_position["job_title"],
                required_skills=selected_position["required_skills"],
                jd=selected_position["job_description"],
            )

            profile_rows = []
            application_rows = []
            cvanalysis_rows = []

            for profile in profiles:
                candidate_id = str(uuid4())
                application_id = str(uuid4())
                analysis_id = str(uuid4())

                full_name = str(profile.get("full_name") or fake.name()).strip()
                if not full_name:
                    full_name = fake.name()

                local_part = re.sub(r"[^a-z0-9]", "", full_name.lower())[:20]
                email = f"{local_part}{str(uuid4())[:6]}@example.net"
                location = str(profile.get("location") or fake.city()).strip()
                years_exp = float(profile.get("years_experience") or round(random.uniform(1.0, 12.0), 1))

                raw_skills = profile.get("skills")
                if isinstance(raw_skills, list):
                    skills = [str(s).strip() for s in raw_skills if str(s).strip()]
                else:
                    skills = []
                if not skills:
                    skills = fallback_profiles(1, selected_position["job_title"], selected_position["required_skills"])[0]["skills"]

                summary = str(profile.get("summary") or "Experienced professional with strong delivery mindset.").strip()
                linkedin_slug = str(profile.get("linkedin_slug") or full_name.lower().replace(" ", "-")).strip()
                github_username = str(profile.get("github_username") or (local_part + str(random.randint(100, 999)))).strip()
                phone = str(profile.get("phone") or fake.phone_number()).strip()

                profile_rows.append(
                    (
                        candidate_id,
                        org_id,
                        full_name,
                        email,
                        phone,
                        location,
                        f"https://linkedin.com/in/{linkedin_slug}",
                        f"https://github.com/{github_username}",
                    )
                )

                applied_at = datetime.utcnow() - timedelta(days=random.randint(0, 90), hours=random.randint(0, 23))
                status = random.choices(
                    ["applied", "screening", "rejected", "offered", "hired"],
                    weights=[35, 30, 22, 9, 4],
                    k=1,
                )[0]

                application_rows.append(
                    (
                        application_id,
                        candidate_id,
                        selected_position["position_id"],
                        None,
                        org_id,
                        status,
                        applied_at,
                        "resume_import",
                    )
                )

                parsed_data = {
                    "summary": summary,
                    "education": [
                        {
                            "degree": random.choice([
                                "BSc Computer Science",
                                "BEng Software Engineering",
                                "MSc Data Science",
                                "MSc Information Systems",
                            ]),
                            "institution": random.choice([
                                "University of Manchester",
                                "Cairo University",
                                "King Saud University",
                                "University of Toronto",
                                "Technical University of Munich",
                            ]),
                        }
                    ],
                    "work_history": [
                        {
                            "title": selected_position["job_title"],
                            "company": random.choice([
                                "Globex",
                                "Innotech",
                                "Nexa Systems",
                                "CloudOrbit",
                                "Vertex Labs",
                            ]),
                            "responsibilities": [
                                "Built and maintained production features",
                                "Collaborated with product and design teams",
                                "Improved performance and reliability",
                            ],
                        }
                    ],
                }

                match_score = round(min(99.0, max(45.0, 55.0 + years_exp * 2.4 + random.uniform(-12, 12))), 1)

                cvanalysis_rows.append(
                    (
                        analysis_id,
                        application_id,
                        org_id,
                        None,
                        Json(parsed_data),
                        skills,
                        years_exp,
                        match_score,
                        datetime.utcnow(),
                    )
                )

            execute_batch(
                cur,
                """
                INSERT INTO candidate_profiles
                    (candidate_id, organization_id, full_name, email, phone, location, linkedin_url, github_url)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                profile_rows,
                page_size=200,
            )

            execute_batch(
                cur,
                """
                INSERT INTO candidate_applications
                    (application_id, candidate_id, position_id, group_id, organization_id, status, applied_at, source)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                application_rows,
                page_size=200,
            )

            execute_batch(
                cur,
                """
                INSERT INTO cv_analysis
                    (analysis_id, application_id, organization_id, cv_file_url, parsed_data, skills, experience_years, match_score, analyzed_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                cvanalysis_rows,
                page_size=200,
            )

            conn.commit()
            generated += take
            inserted += take
            print(f"Inserted {inserted}/{total} candidates...", flush=True)

    return inserted


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate realistic candidates with Ollama and insert into DB.")
    parser.add_argument("--count", type=int, default=1000, help="Number of candidates to insert (default: 1000)")
    parser.add_argument("--org-id", type=str, default=None, help="Target organization_id (optional)")
    args = parser.parse_args()

    db_url = load_database_url()
    conn = psycopg2.connect(db_url)

    try:
        org_id, positions = get_org_and_positions(conn, args.org_id)
        print(f"Using organization_id={org_id}, positions={len(positions)}, model={OLLAMA_MODEL}")
        inserted = insert_candidates(conn, org_id, positions, args.count)
        print(f"Done. Inserted {inserted} candidates with applications and CV analysis.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
