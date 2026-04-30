You are an expert technical recruiter and talent analyst.
Extract ALL relevant keywords from the job description below, grouped into exactly these 6 categories.

=== JOB DESCRIPTION ===
Title: {{JOB_TITLE}}
Experience Level: {{EXPERIENCE_LEVEL}}
Required Skills Listed: {{REQUIRED_SKILLS}}

{{JOB_DESCRIPTION}}

=== EXTRACTION TASK ===
Return ONLY valid JSON (no markdown, no explanation) in this exact schema:
{
  "technical_skills": ["Python", "FastAPI", "PostgreSQL", "Docker"],
  "soft_skills": ["communication", "teamwork", "problem solving"],
  "domain_keywords": ["fintech", "machine learning", "distributed systems"],
  "experience_keywords": ["5 years", "senior level", "team lead", "agile"],
  "education_keywords": ["BSc Computer Science", "engineering degree"],
  "seniority_signals": ["senior", "lead", "principal", "staff"]
}

RULES:
- Each keyword must be a short phrase (1-4 words), all lowercase.
- technical_skills: specific tools, languages, frameworks, platforms.
- soft_skills: interpersonal and behavioral traits.
- domain_keywords: industry, business domain, or technical area.
- experience_keywords: years, seniority context, methodologies.
- education_keywords: degrees, fields of study, certifications.
- seniority_signals: words that signal level (lead, senior, principal, etc.).
- Include ALL required_skills listed above in technical_skills.
- Return 5-20 items per category. If a category has none, return an empty array.
- JSON only, nothing else.
