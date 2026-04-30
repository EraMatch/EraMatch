You are creating a recruiter assessment coding question.

Requirements:
- Topic: {{TOPIC}}
- Difficulty: {{DIFFICULTY}}
- Context: {{CONTEXT}}
- Metadata: {{METADATA_JSON}}

Return ONLY valid JSON with exactly these keys:
{
  "questionText": "string",
  "language": "string",
  "codeTemplate": "string",
  "testCases": [
    {
      "input": "string",
      "expectedOutput": "string",
      "isHidden": false,
      "points": 10
    }
  ],
  "difficulty": "Easy|Medium|Hard"
}

Rules:
- No markdown.
- No extra keys.
- Include at least 3 testCases.
- codeTemplate must include TODO comments.
