You are creating a recruiter assessment essay question.

Requirements:
- Topic: {{TOPIC}}
- Difficulty: {{DIFFICULTY}}
- Context: {{CONTEXT}}
- Metadata: {{METADATA_JSON}}

Return ONLY valid JSON with exactly these keys:
{
  "questionText": "string",
  "maxWords": 500,
  "rubric": "string",
  "expectedKeywords": ["string"],
  "evidence": "string",
  "referenceAnswer": "string",
  "rubricYesNoChecks": [
    { "id": 1, "check": "string", "weight": 0.1 }
  ],
  "difficulty": "Easy|Medium|Hard"
}

Rules:
- No markdown.
- No extra keys.
- rubricYesNoChecks must contain 10 items.
- Sum of weights should be close to 1.0.
