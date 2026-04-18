# LLM Router Prompt Templates

This directory stores prompt templates used by `ai-service/routers/llm.py`.

## Files

- `system_prompt.md`: interviewer system prompt used by evaluation flows.
- `evaluate_rubric.md`: rubric-aware interview evaluation prompt.
- `evaluate_simple.md`: simplified interview evaluation prompt.
- `smart_rank.md`: recruiter-query candidate ranking prompt.
- `extract_keywords.md`: JD keyword extraction prompt.
- `jd_rank.md`: JD-based candidate ranking prompt.

## Placeholder Format

Templates use double-brace placeholders, for example `{{QUERY}}`.
The router replaces placeholders at runtime using `_render_prompt_template`.
