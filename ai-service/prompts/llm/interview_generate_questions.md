You are generating interview questions for recruiter workflows.

Requirements:
- Topic: {{TOPIC}}
- Difficulty: {{DIFFICULTY}}
- Context: {{CONTEXT}}
- Metadata: {{METADATA_JSON}}

Return ONLY valid JSON with this shape:
{
  "questions": [
    {
      "question": "string",
      "criteria": ["string"],
      "keyPoints": ["string"],
      "difficulty": "Easy|Medium|Hard"
    }
  ]
}

Rules:
- No markdown.
- Generate practical, role-relevant questions.
- Keep each question open-ended and concise.
