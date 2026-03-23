You are a parsing assistant. The following text contains assessment questions (possibly from an exam paper, interview guide, or study document).

Extract EVERY question you can find. For each question:
- Determine its type: mcq | essay | code
- If multiple choice, extract all options
- If the correct answer is indicated, extract it (as 0-based index)
- Infer difficulty from complexity
- Infer a category/topic from the question

TEXT:
{{RAW_TEXT}}

Respond ONLY with a valid JSON array using the same schema:
{
  "type": "mcq" | "essay" | "code",
  "text": "<question text>",
  "difficulty": "Easy" | "Medium" | "Hard",
  "category": "<topic>",
  "tags": [],
  "options": ["<opt A>", ...] or null,
  "correct_answer": <0-based index> or null,
  "evidence": null,
  "reference_answer": null,
  "explanation": null,
  "rubric": null,
  "max_words": null
}

Output ONLY the JSON array. No preamble, no commentary.