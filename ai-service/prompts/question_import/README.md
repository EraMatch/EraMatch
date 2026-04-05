# Question Import Prompt Templates

This folder contains all LLM prompt templates used by the question import pipeline.

## Location

- Directory: `ai-service/prompts/question_import`
- Loaded by: `ai-service/routers/question_import.py`

## How templates are rendered

Templates are plain Markdown files with token placeholders in this form:

- `{{TOKEN_NAME}}`

At runtime, the router replaces each token with generated content.

## Templates and placeholders

1. `generate.md`
- Purpose: build generation prompt for new questions from source material.
- Placeholders:
  - `{{NUM_QUESTIONS}}`
  - `{{CONTEXT_HINT}}`
  - `{{PLAN_LINES}}`
  - `{{RECRUITER_INSTRUCTIONS_BLOCK}}`
  - `{{RAW_TEXT}}`

2. `extract.md`
- Purpose: build extraction prompt for existing questions inside provided text.
- Placeholders:
  - `{{RAW_TEXT}}`

3. `regen.md`
- Purpose: regenerate one rejected question based on critic feedback.
- Placeholders:
  - `{{ORIGINAL_QUESTION}}`
  - `{{CRITIC_FEEDBACK}}`
  - `{{RAW_TEXT}}`

4. `refine_question.md`
- Purpose: refine full question payload for all types (mcq, essay, code).
- Placeholders:
  - `{{QUESTION}}`
  - `{{CRITIC_FEEDBACK}}`
  - `{{FAILED_CRITERIA}}`
  - `{{RAW_TEXT}}`

5. `critic.md`
- Purpose: run YES/NO quality checks and score the question.
- Placeholders:
  - `{{QUESTION}}`
  - `{{CRITERIA_LINES}}`

6. `repair_json.md`
- Purpose: repair malformed model output into valid top-level JSON array.
- Placeholders:
  - `{{CONTENT}}`

7. `rubric_decomposition.md`
- Purpose: generate exactly 10 rubric yes/no checks with weights.
- Placeholders:
  - `{{QUESTION}}`

## Editing rules

- Keep placeholders exactly as documented (same spelling and braces).
- Do not add markdown code fences around final JSON requirements unless intentional.
- Preserve strict output constraints, especially:
  - JSON-only responses when required
  - self-contained question wording rules
  - exact shape requirements used by parser logic

## Common mistakes to avoid

- Renaming placeholders without updating router replacement keys.
- Removing instructions that enforce standalone/self-contained question text.
- Changing response format instructions in ways that break JSON parsing.

## Quick validation after edits

Run syntax check for router:

- `python -m py_compile c:/Users/ot/Desktop/EraMatch/ai-service/routers/question_import.py`

Optional runtime check:

- trigger a small import job and verify prompt-based generation, critic, and refinement still return parseable JSON.
