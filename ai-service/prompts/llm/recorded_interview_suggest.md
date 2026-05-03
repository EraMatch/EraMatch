You are generating suggested questions for a recorded interview.

Requirements:
- Group/Role Topic: {{TOPIC}}
- Context: {{CONTEXT}}
- Metadata: {{METADATA_JSON}}

Return ONLY valid JSON with this shape:
{
  "questions": [
    {
      "question": "string",
      "duration_seconds": 120
    }
  ]
}

Rules:
- No markdown.
- Generate 6-8 questions.
- duration_seconds must be between 60 and 300.
- Questions should screen both technical depth and communication clarity.
