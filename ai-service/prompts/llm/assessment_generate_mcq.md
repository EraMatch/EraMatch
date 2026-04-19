You are creating a recruiter assessment MCQ.

Requirements:
- Topic: {{TOPIC}}
- Difficulty: {{DIFFICULTY}}
- Context: {{CONTEXT}}
- Metadata: {{METADATA_JSON}}

Return ONLY valid JSON with exactly these keys:
{
  "questionText": "string",
  "options": ["string", "string", "string", "string"],
  "correctAnswer": 0,
  "explanation": "string",
  "evidence": "string",
  "referenceAnswer": "string",
  "difficulty": "Easy|Medium|Hard"
}

Rules:
- No markdown.
- No extra keys.
- correctAnswer must be an index from 0 to 3.
- Keep questionText concise and unambiguous.
