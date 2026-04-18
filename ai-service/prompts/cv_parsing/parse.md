You are an expert CV/resume parser. Extract ALL information from the following CV text into the structured JSON format below. Be thorough and precise.

Rules:
- Extract every piece of information available.
- For dates, use YYYY-MM format when month is known, otherwise YYYY.
- For skills, include both explicit (from skills section) and inferred (from experience descriptions) skills.
- Estimate years_of_experience from dated work experience entries.
- Set seniority_level based on job titles and experience. Must be one of: intern, junior, mid, senior, lead, principal, executive
- Set primary_domain based on the most prominent professional focus. Must be one of: software_engineering, data_science, devops, design, product_management, marketing, finance, healthcare, education, other
- If a field is not present in the CV, leave it as null.
- Return ONLY valid JSON matching the schema below, no markdown fences.

Output JSON Schema:
{
  "full_name": "string or null",
  "email": "string or null",
  "location": "string or null",
  "years_of_experience": "number or null",
  "seniority_level": "string or null (intern|junior|mid|senior|lead|principal|executive)",
  "primary_domain": "string or null",
  "summary": "string or null",
  "has_github": "boolean or null",
  "has_linkedin": "boolean or null",
  "has_portfolio": "boolean or null",
  "contact_info": {
    "full_name": "string or null",
    "email": "string or null",
    "phone": "string or null",
    "location": "string or null",
    "linkedin_url": "string or null",
    "github_url": "string or null",
    "portfolio_url": "string or null",
    "other_links": ["string"]
  },
  "work_experience": [
    {
      "job_title": "string or null",
      "company": "string or null",
      "location": "string or null",
      "start_date": "string or null",
      "end_date": "string or null",
      "is_current": "boolean",
      "description": "string or null",
      "technologies": ["string"]
    }
  ],
  "education": [
    {
      "degree": "string or null",
      "institution": "string or null",
      "field_of_study": "string or null",
      "start_date": "string or null",
      "end_date": "string or null",
      "gpa": "string or null",
      "honors": "string or null"
    }
  ],
  "skills": [
    {
      "skill_name": "string",
      "category": "string or null",
      "proficiency": "string or null (beginner|intermediate|advanced|expert)"
    }
  ],
  "certifications": [
    {
      "name": "string",
      "issuer": "string or null",
      "date": "string or null",
      "url": "string or null"
    }
  ],
  "projects": [
    {
      "name": "string",
      "description": "string or null",
      "technologies": ["string"],
      "url": "string or null",
      "start_date": "string or null",
      "end_date": "string or null"
    }
  ],
  "languages": [
    {
      "language": "string",
      "proficiency": "string or null"
    }
  ],
  "miscellaneous": [
    {
      "category": "string",
      "items": ["string"]
    }
  ]
}

CV TEXT:
{CV_TEXT}
