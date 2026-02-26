import os
import json
import requests
import psycopg2
from uuid import uuid4
from datetime import datetime

# Configuration
OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL_NAME = "llama3.2"

def get_db_url():
    try:
        with open(r'c:\Users\ot\Desktop\EraMatch\backend\.env', 'r') as f:
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

import random

def generate_with_llama(prompt, context=""):
    full_prompt = f"{context}\n\nTask: {prompt}\n\nResponse (Strict JSON only):"
    
    # Randomize temperature slightly for each call to increase variety
    temp = random.uniform(0.7, 0.9)
    
    payload = {
        "model": MODEL_NAME,
        "prompt": full_prompt,
        "stream": False,
        "options": {
            "temperature": temp,
            "top_p": 0.9
        },
        "format": "json"
    }
    
    try:
        response = requests.post(OLLAMA_URL, json=payload, timeout=90)
        if response.status_code == 200:
            text = response.json().get("response", "").strip()
            return text
    except Exception as e:
        print(f"Ollama error: {e}")
    return None

def populate_cv_analysis(force=False):
    conn = get_conn()
    cur = conn.cursor()
    
    print("Fetching CV Analysis records to populate...")
    
    # Filter for unpopulated records unless force is True
    query = """
        SELECT 
            ca.analysis_id,
            cp.full_name,
            p.job_title,
            p.job_description,
            p.required_skills
        FROM cv_analysis ca
        JOIN candidate_applications capp ON ca.application_id = capp.application_id
        JOIN candidate_profiles cp ON capp.candidate_id = cp.candidate_id
        JOIN positions p ON capp.position_id = p.position_id
    """
    if not force:
        query += " WHERE ca.parsed_data IS NULL OR ca.parsed_data = '{}'::jsonb"
        
    cur.execute(query)
    
    records = cur.fetchall()
    print(f"Found {len(records)} records to process.")
    
    for analysis_id, name, title, job_desc, req_skills in records:
        print(f"Processing candidate: {name} for {title}...")
        
        prompt = f"""
        Generate a highly realistic, unique, and professional CV analysis for '{name}' 
        who is applying for '{title}'. 
        
        Job Context: {job_desc or 'General role'}
        Skills required: {json.dumps(req_skills) if req_skills else 'Standard tech skills'}
        
        Return a JSON object exactly like this (fill with REALISTIC, UNIQUE data):
        {{
            "parsed_data": {{
                "contact_info": {{ "email": "{name.lower().replace(' ', '.')}@example.com", "phone": "555-010-XXXX", "location": "City, State" }},
                "education": [ {{ "degree": "Degree Name", "institution": "University Name", "year": "YYYY" }} ],
                "work_history": [ 
                    {{ "title": "Previous Job Title", "company": "Company ABC", "duration": "2020 - Present", "responsibilities": ["Task 1", "Task 2"] }} 
                ],
                "summary": "A 2-3 sentence professional summary tailored to {title}."
            }},
            "skills": ["UniqueSkill1", "UniqueSkill2", "UniqueSkill3"],
            "experience_years": [float value between 1-15],
            "match_score": [float value between 50-98.5]
        }}
        
        Note: DO NOT use the example values. Be creative and professional. Ensure match_score is realistic for the job description.
        """
        
        response_text = generate_with_llama(prompt)
        if not response_text:
            print(f"  Skipping {name}: AI failed to respond.")
            continue
            
        try:
            data = json.loads(response_text)
            parsed_data = json.dumps(data.get("parsed_data", {}))
            skills = data.get("skills", [])
            exp_years = data.get("experience_years", 0)
            score = data.get("match_score", 0)
            
            cur.execute("""
                UPDATE cv_analysis 
                SET parsed_data = %s, 
                    skills = %s, 
                    experience_years = %s, 
                    match_score = %s,
                    analyzed_at = NOW()
                WHERE analysis_id = %s
            """, (parsed_data, skills, exp_years, score, analysis_id))
            
            conn.commit()
            print(f"  Successfully updated {name} with match score {score}%.")
            
        except Exception as e:
            print(f"  Error parsing response for {name}: {e}")
            conn.rollback()
            
    cur.close()
    conn.close()
    print("CV Analysis population complete.")

if __name__ == "__main__":
    populate_cv_analysis()
