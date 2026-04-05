Job Description:
{jd}

Candidate's Repository List:
{repo_list}

Candidate Profile Context:
{profile_context}

Task: Conduct a JD-Driven Pillar Search to map the candidate's engineering work to specific technical pillars.

MANDATES AND CONSTRAINTS:
1. Engineering Pillars Only: Focus 100 percent on Technical Engineering Mandates (e.g., API Architecture, Real-time Data, UI Components).
   - STRICTLY IGNORE soft skills, agile, project management, or non-technical domains.
2. Evidence-First: Only list a repository under a Pillar if its name, language, or description provides unambiguous technical proof.
3. Handle Unrelated: Put any repository that does not fit a clear engineering mandate into the unrelated_repos list.

REQUIRED OUTPUT FORMAT:
{
    "hiring_rubric_summary": "Concise summary of the TECHNICAL requirements for this role.",
    "pillars": [
        {
            "pillar_name": "Specific Engineering Mandate",
            "description": "Why this technical skill matters for the JD",
            "evidence_found": "Justification based on candidate repos",
            "is_satisfied": true,
            "top_repos": ["repo_name_1", "repo_name_2"]
        }
    ],
    "unrelated_repos": ["names_of_non_technical_or_irrelevant_repos"]
}

EXAMPLE (Few-Shot):
Pillar example: Distributed Systems. Evidence: Found 3 repos using gRPC/Protobuf with Docker-compose setups.

Return strict JSON only.