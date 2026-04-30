You are generating setup content for a live AI interview.

Requirements:
- Topic: {{TOPIC}}
- Difficulty: {{DIFFICULTY}}
- Context: {{CONTEXT}}
- Metadata: {{METADATA_JSON}}

Return ONLY valid JSON with this shape:
{
  "systemPrompt": "string",
  "sections": [
    { "title": "string", "duration_minutes": 5 }
  ]
}

Rules:
- No markdown.
- systemPrompt should be concrete, evaluative, and professional.
- Provide 3-6 sections.
- duration_minutes should be between 2 and 30.
