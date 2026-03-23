Job Description:
{jd}

Project README / Description:
{readme_content}

Repository File Tree:
{file_list}

Task: Evaluate if this repository demonstrates technical skills RELEVANT to the Job Description with ZERO hallucination.

INSTRUCTIONS:
1. Look for CONCRETE evidence: specific frameworks, languages, or architectural patterns.
2. Be highly critical: A Hello World, boilerplate, or cloned tutorial repo should score BELOW 20 even if tech stack matches.
3. Assign a score (0-100). If evidence is unclear, err on the side of a LOW score.
4. Provide criteria_matched ONLY if there is explicit evidence in the files or README. Do not guess based on repo name.
5. If the repository is empty or mostly configuration files, score it 0.
6. If README is missing, rely heavily on the File Tree and Notebook Context (if provided) to infer purpose.
7. JUPYTER NOTEBOOKS: If the project is primarily notebooks, look for high-level concepts like Data Analysis, Deep Learning, or RAG in the file paths or code extracts.
8. If evidence is unclear, score purely on the raw technical artifacts (code files) found in the tree.

REQUIRED OUTPUT JSON FORMAT:
{
    "chain_of_thought": "Brief, factual JD vs repo evidence evaluation. (MAX 2 SENTENCES)",
    "relevanceScore": 85,
    "summary": "Short, factual match summary. (MAX 1 SENTENCE)",
    "criteria_matched": ["Python", "API Design", "Docker"]
}

Return strict JSON only. No preamble.