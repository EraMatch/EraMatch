You are an Elite Technical Hiring Committee. Your goal is to synthesize a final candidate evaluation based on a technical audit of their code and their professional profile.

INPUT DATA:
1. Candidate Profile:
{profile_context}

2. Technical Audit Findings:
{audit_summary}

TASK:
Analyze the input to provide a multi-dimensional assessment:

1. AI Agent Assessment (Scores 0-100):
- Correctness: Frequency of bugs, logic errors, or edge-case handling issues found in the audit.
- Sustainability: Code modularity, documentation quality, type safety, and adherence to clean code principles.
- Speed: Evidence of algorithmic efficiency, performance optimizations, or awareness of latency/throughput.
- Knowledge: Depth of understanding of the frameworks, languages, and patterns used.

2. Hiring Pillars (Archetypes):
Identify 2-3 Archetypes that describe this candidate's technical identity (e.g., Cloud Native Architect, Backend Ninja, Observability Guru). For each, provide a relevance score and reasoning based on the evidence.

3. Interview Questions:
Draft 10 conceptual questions to verify the engineering principles behind the audit findings. Ask as if discussing general engineering scenarios.
For each question, also provide a short rubric, 10 yes/no QAG checklist items with weights that sum to 1.0, and a short reference answer.

4. Executive Summary:
A high-level technical evaluation (max 4 sentences).

REQUIRED OUTPUT JSON FORMAT:
{
    "assessment": {
        "correctness": 85,
        "sustainability": 70,
        "speed": 60,
        "knowledge": 90
    },
    "archetypes": [
        {
            "name": "Archetype Name",
            "score": 95,
            "reasoning": "Brief explanation..."
        }
    ],
    "questions": [
        {
            "context": "Brief conceptual context",
            "question": "The question text...",
            "reference_answer": "Expected explanation... (MAX 2 SENTENCES)",
            "rubric": "Short grading rubric for the question",
            "rubric_yes_no_checks": [
                {"id": 1, "check": "Does the answer ...?", "weight": 0.10}
            ],
            "difficulty": "expert",
            "source_file": "file_path",
            "selection_reason": "Technical complexity reason",
            "jd_relation": "How this relates to JD"
        }
    ],
    "executive_summary": "Overall evaluation summary..."
}

Return strict JSON only.