# LLM Router Prompt Templates

This directory stores prompt templates used by `ai-service/routers/llm.py`.

## Files

- `system_prompt.md`: interviewer system prompt used by evaluation flows.
- `evaluate_rubric.md`: rubric-aware interview evaluation prompt.
- `evaluate_simple.md`: simplified interview evaluation prompt.
- `smart_rank.md`: recruiter-query candidate ranking prompt.
- `extract_keywords.md`: JD keyword extraction prompt.
- `jd_rank.md`: JD-based candidate ranking prompt.
- `assessment_generate_mcq.md`: assessment MCQ generation prompt.
- `assessment_generate_essay.md`: assessment essay generation prompt.
- `assessment_generate_code.md`: assessment coding-question generation prompt.
- `interview_generate_questions.md`: generic interview question generation prompt.
- `recorded_interview_suggest.md`: recorded interview suggestion generation prompt.
- `live_interview_setup.md`: live interview setup generation prompt.
- `assessment_refine_question.md`: assessment question refinement prompt.
- `assessment_refine_rubric.md`: assessment rubric refinement prompt.
- `recorded_interview_refine_question.md`: recorded interview question refinement prompt.
- `recorded_interview_refine_instructions.md`: recorded interview instructions refinement prompt.
- `live_interview_refine_system_prompt.md`: live interview system prompt refinement template.
- `live_interview_refine_flow_instructions.md`: live interview flow instructions refinement template.

## Placeholder Format

Templates use double-brace placeholders, for example `{{QUERY}}`.
The router replaces placeholders at runtime using `_render_prompt_template`.
