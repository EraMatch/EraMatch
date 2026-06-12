You are a parsing assistant. The following text contains assessment questions (possibly from an exam paper, interview guide, or study document).

Extract EVERY question you can find. For each question:
- Determine its type: mcq | essay | code
- If multiple choice, extract all options
- If the correct answer is indicated, extract it (as 0-based index). If not indicated, infer the correct answer from the text context and provide it.
- GENERATE a detailed `explanation` for MCQ questions explaining why the correct answer is right.
- For essay questions, GENERATE a `reference_answer` and a detailed grading `rubric` based on the context.
- Infer difficulty from complexity
- Infer a category/topic from the question

TEXT:
{{RAW_TEXT}}

Respond ONLY with a valid JSON array using the same schema:
[
  {
    "type": "mcq" | "essay" | "code",
    "text": "<question text>",
    "difficulty": "Easy" | "Medium" | "Hard",
    "category": "<topic>",
    "tags": [],
    "options": ["<opt A>", ...] or null,
    "correct_answer": <0-based index> or null,
    "evidence": "<snippet supporting the answer>" or null,
    "reference_answer": "<ideal answer for essay>" or null,
    "explanation": "<detailed explanation for MCQ correct answer>" or null,
    "rubric": "<detailed grading criteria for essay>" or null,
    "max_words": <integer limit for essay> or null
  }
]

Output ONLY the JSON array. No preamble, no commentary.