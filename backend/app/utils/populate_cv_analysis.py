import os
import json
import random
import psycopg2
from uuid import uuid4
from datetime import datetime

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

UNIVERSITIES = [
    "Massachusetts Institute of Technology (MIT)", "Stanford University", 
    "Carnegie Mellon University", "University of California, Berkeley",
    "Harvard University", "University of Cambridge", "University of Oxford",
    "ETH Zurich", "National University of Singapore (NUS)", "Imperial College London",
    "University of Toronto", "University of Washington", "Cornell University"
]

DEGREES = [
    "B.S. in Computer Science", "M.S. in Computer Science", 
    "Ph.D. in Computer Science", "B.S. in Software Engineering",
    "M.S. in Artificial Intelligence", "B.A. in Information Systems",
    "B.S. in Data Science", "M.S. in Data Science", "B.S. in Mathematics and Computer Science"
]

COMPANIES = [
    "Google", "Amazon", "Microsoft", "Meta", "Apple", "Netflix", 
    "Uber", "Airbnb", "Stripe", "Palantir", "Snowflake", "Databricks",
    "OpenAI", "Anthropic", "Tesla", "SpaceX", "LinkedIn", "Twitter",
    "Dropbox", "Slack", "Atlassian", "Spotify"
]

TITLES_FRONTEND = ["Frontend Engineer", "UI Engineer", "React Developer", "Web Developer"]
TITLES_BACKEND = ["Backend Engineer", "Systems Engineer", "API Developer", "Distributed Systems Engineer"]
TITLES_FULLSTACK = ["Full Stack Engineer", "Software Engineer", "Senior Software Developer"]
TITLES_DATA = ["Data Scientist", "Machine Learning Engineer", "AI Researcher", "Data Engineer"]

RESPONSIBILITIES = [
    "Architected and implemented highly scalable microservices architecture.",
    "Led a team of 5 engineers to deliver a critical product feature ahead of schedule.",
    "Optimized database queries, reducing latency by 40% and cutting costs by 20%.",
    "Developed an automated CI/CD pipeline reducing deployment times from hours to minutes.",
    "Designed and executed A/B tests to improve user conversion rate by 15%.",
    "Built and maintained core infrastructure supporting 1M+ daily active users.",
    "Spearheaded the migration from a monolith to a Kubernetes-based microservices architecture.",
    "Mentored junior engineers and conducted regular code reviews to maintain high quality standards."
]

def generate_rich_cv_data(name, title, req_skills):
    # Determine domain based on title
    title_lower = title.lower() if title else ""
    if "frontend" in title_lower or "react" in title_lower or "ui" in title_lower:
        base_titles = TITLES_FRONTEND
        domain_skills = ["React", "TypeScript", "Next.js", "CSS", "HTML", "Redux", "GraphQL"]
    elif "data" in title_lower or "machine" in title_lower or "ai" in title_lower:
        base_titles = TITLES_DATA
        domain_skills = ["Python", "PyTorch", "TensorFlow", "SQL", "Pandas", "Scikit-Learn"]
    elif "backend" in title_lower or "system" in title_lower:
        base_titles = TITLES_BACKEND
        domain_skills = ["Python", "Go", "Java", "PostgreSQL", "Redis", "Kafka", "Docker", "Kubernetes"]
    else:
        base_titles = TITLES_FULLSTACK
        domain_skills = ["JavaScript", "Python", "React", "Node.js", "PostgreSQL", "AWS"]

    # Incorporate required skills
    final_skills = set(domain_skills)
    if req_skills:
        for s in req_skills:
            final_skills.add(s)
            
    # Add some random other skills to make it look realistic
    extra_skills = ["Git", "Agile", "Linux", "REST APIs", "CI/CD", "Testing"]
    final_skills.update(random.sample(extra_skills, 3))
    
    final_skills_list = list(final_skills)
    random.shuffle(final_skills_list)
    final_skills_list = final_skills_list[:min(len(final_skills_list), 15)]

    exp_years = round(random.uniform(2.0, 15.0), 1)
    
    # Generate realistic work history
    num_jobs = random.randint(2, 4)
    work_history = []
    
    current_year = datetime.now().year
    start_year = current_year - int(exp_years)
    
    for i in range(num_jobs):
        job_end = "Present" if i == 0 else f"{current_year - i}"
        job_start = f"{current_year - i - random.randint(1, 4)}"
        
        job = {
            "title": random.choice(base_titles) if i == 0 else random.choice(TITLES_FULLSTACK),
            "company": random.choice(COMPANIES),
            "duration": f"{job_start} - {job_end}",
            "responsibilities": random.sample(RESPONSIBILITIES, k=random.randint(2, 4))
        }
        work_history.append(job)

    # Generate education
    education = [{
        "degree": random.choice(DEGREES),
        "institution": random.choice(UNIVERSITIES),
        "year": str(start_year - random.randint(0, 2))
    }]

    summary = f"Results-driven {title or 'Software Engineer'} with {int(exp_years)}+ years of experience in building scalable systems and leading technical initiatives. Proven track record at top tech companies. Passionate about leveraging {final_skills_list[0]} and {final_skills_list[1]} to solve complex problems."

    parsed_data = {
        "contact_info": {
            "email": f"{name.lower().replace(' ', '.')}@example.com",
            "phone": f"+1 ({random.randint(200,999)}) {random.randint(100,999)}-{random.randint(1000,9999)}",
            "location": random.choice(["San Francisco, CA", "New York, NY", "Seattle, WA", "Austin, TX", "London, UK", "Remote"])
        },
        "education": education,
        "work_history": work_history,
        "summary": summary
    }

    # Generate a realistic match score based on experience and random factor
    # Higher experience generally means slightly higher baseline, plus some random variance
    base_score = min(70 + (exp_years * 1.5), 90)
    match_score = round(random.uniform(base_score - 10, min(base_score + 10, 99.5)), 1)

    return parsed_data, final_skills_list, exp_years, match_score

def populate_cv_analysis(force=True):
    conn = get_conn()
    cur = conn.cursor()
    
    print("Fetching ALL CV Analysis records to populate with rich data...")
    
    # Query all records
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
        
        parsed_data, skills, exp_years, score = generate_rich_cv_data(name, title, req_skills)
        
        try:
            cur.execute("""
                UPDATE cv_analysis 
                SET parsed_data = %s, 
                    skills = %s, 
                    experience_years = %s, 
                    match_score = %s,
                    analyzed_at = NOW()
                WHERE analysis_id = %s
            """, (json.dumps(parsed_data), skills, exp_years, score, analysis_id))
            
            conn.commit()
            print(f"  Successfully populated {name} with match score {score}%.")
            
        except Exception as e:
            print(f"  Error updating record for {name}: {e}")
            conn.rollback()
            
    cur.close()
    conn.close()
    print("CV Analysis rich population complete.")

if __name__ == "__main__":
    populate_cv_analysis(force=True)
