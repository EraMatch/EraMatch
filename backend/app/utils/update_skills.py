
import os
import random
import json
import psycopg2
import requests
from uuid import uuid4

# Configuration
OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL_NAME = "llama3.2"

def get_db_url():
    try:
        env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), '.env')
        if not os.path.exists(env_path):
             env_path = r'c:\Users\ot\Desktop\EraMatch\backend\.env'
        
        with open(env_path, 'r') as f:
            for line in f:
                if line.startswith('DATABASE_URL='):
                    url = line.strip().split('=', 1)[1].strip('"\'')
                    return url.replace('+asyncpg', '')
    except Exception as e:
        print(f"Error reading .env: {e}")
        return None

DB_URL = get_db_url()

def get_conn():
    return psycopg2.connect(DB_URL)

def generate_with_llama(prompt):
    payload = {
        "model": MODEL_NAME,
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": 0.9} # High temp for diversity
    }
    try:
        response = requests.post(OLLAMA_URL, json=payload, timeout=5) # Short timeout
        if response.status_code == 200:
            text = response.json().get("response", "").strip()
            return text
    except:
        pass
    return None

def get_random_fallback_skills():
    tech_stacks = [
        ["Python", "Django", "PostgreSQL", "Docker", "Redis", "Celery"],
        ["JavaScript", "React", "Node.js", "Express", "MongoDB", "TypeScript"],
        ["Java", "Spring Boot", "Hibernate", "MySQL", "Kafka", "Microservices"],
        ["C#", ".NET Core", "Azure", "SQL Server", "Angular", "Entity Framework"],
        ["Go", "Kubernetes", "gRPC", "Prometheus", "Terraform", "AWS"],
        ["Swift", "iOS", "UIKit", "SwiftUI", "CoreData", "CocoaPods"],
        ["Kotlin", "Android", "Jetpack Compose", "Firebase", "Retrofit", "RxJava"],
        ["Ruby", "Rails", "Sidekiq", "RSpec", "Heroku", "PostgreSQL"],
        ["PHP", "Laravel", "Vue.js", "MySQL", "Redis", "Nginx"],
        ["Python", "FastAPI", "Pandas", "NumPy", "Scikit-learn", "TensorFlow"],
        ["Rust", "Actix", "Tokio", "WebAssembly", "PostgreSQL", "Docker"]
    ]
    # Pick a stack and maybe remove 1-2 items to vary it
    stack = random.choice(tech_stacks).copy()
    if len(stack) > 3:
        to_remove = random.randint(0, 2)
        for _ in range(to_remove):
            stack.pop(random.randint(0, len(stack)-1))
    return stack

def update_skills():
    if not DB_URL:
        print("Database URL not found.")
        return

    conn = get_conn()
    cur = conn.cursor()

    print("Fetching CV Analysis records...")
    cur.execute("SELECT analysis_id, application_id FROM cv_analysis")
    rows = cur.fetchall()
    
    print(f"Found {len(rows)} records. Updating skills...")

    updated_count = 0
    
    for analysis_id, app_id in rows:
        # Get Candidate Name/Job Title for better context if possible, but for now just randomize
        # Querying job title via application -> position
        cur.execute("""
            SELECT p.job_title 
            FROM candidate_applications ca 
            JOIN positions p ON ca.position_id = p.position_id 
            WHERE ca.application_id = %s
        """, (app_id,))
        res = cur.fetchone()
        job_title = res[0] if res else "Software Engineer"

        # Try LLM first
        skills = []
        prompt = f"List 5 to 8 technical skills for a {job_title} role as a JSON array of strings. JUST the JSON array, no text."
        llm_response = generate_with_llama(prompt)
        
        if llm_response:
            try:
                # Clean up json
                clean_json = llm_response.replace("```json", "").replace("```", "").strip()
                if "[" in clean_json and "]" in clean_json:
                    start = clean_json.find("[")
                    end = clean_json.find("]", start) + 1
                    skills = json.loads(clean_json[start:end])
            except:
                pass
        
        # Fallback if LLM failed or returned bad data
        if not skills or not isinstance(skills, list):
            skills = get_random_fallback_skills()
            # If job title strongly implies a stack, we could map it, but random stack is better than "Python, FastAPI" for everyone
            if "Frontend" in job_title:
                 skills = ["React", "TypeScript", "Tailwind CSS", "Redux", "HTML5", "CSS3", "Next.js"]
            elif "Backend" in job_title:
                 skills = ["Python", "Django", "PostgreSQL", "Redis", "Docker", "AWS", "FastAPI"]
            elif "Data" in job_title:
                 skills = ["Python", "SQL", "Pandas", "Spark", "AWS", "Tableau", "Machine Learning"]
        
        # Update DB
        cur.execute(
            "UPDATE cv_analysis SET skills = %s WHERE analysis_id = %s",
            (skills, analysis_id)
        )
        updated_count += 1
        if updated_count % 10 == 0:
            print(f"Updated {updated_count} records...", end='\r')

    conn.commit()
    cur.close()
    conn.close()
    print(f"\nSuccessfully updated {updated_count} CV Analysis records with diverse skills.")

if __name__ == "__main__":
    update_skills()
