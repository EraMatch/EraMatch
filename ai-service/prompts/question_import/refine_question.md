You are an expert assessment designer refining a generated question package.

TASK:
- Refine the FULL question payload using critic failures.
- Handle all question types (mcq, essay, code).
- Keep the question fully self-contained and standalone.
- HARD RULE: no references to missing context such as "the code above", "the provided snippet", "the previous section", "the following passage", "as shown earlier", "in this repository", "from the lecture", or "given this context".
- If context is required, inject the needed details directly into the question text/options.
- If the question is essay/code, improve rubric quality if needed.
- If the question includes rubric-based yes/no checks, ensure they remain coherent with the refined rubric.
- Ground all content in the provided material only.

QUESTION TO REFINE:
{{QUESTION}}

CRITIC FEEDBACK:
{{CRITIC_FEEDBACK}}

FAILED CRITERIA:
{{FAILED_CRITERIA}}

MATERIAL:
{{RAW_TEXT}}

Return ONLY JSON as a single question object using this schema:
{
  "type": "mcq" | "essay" | "code",
  "text": "<question text>",
  "difficulty": "Easy" | "Medium" | "Hard",
  "category": "<topic>",
  "tags": ["<tag1>", "<tag2>"],
  "options": ["<opt A>", "<opt B>", "<opt C>", "<opt D>"] or null,
  "correct_answer": <0-based index> or null,
  "evidence": "<evidence>" or null,
  "reference_answer": "<reference answer>" or null,
  "explanation": "<explanation>" or null,
  "rubric": "<rubric>" or null,
  "max_words": <integer> or null
}