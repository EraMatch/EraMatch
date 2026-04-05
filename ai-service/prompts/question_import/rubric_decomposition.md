You are a strict rubric decomposition assistant.
Given the question package below, produce exactly 10 binary YES/NO checks that a reviewer can use to grade a student's answer.

QUESTION PACKAGE:
{{QUESTION}}

RULES:
- Checks must be derived from the rubric/reference answer/evidence.
- Each check must be clear, atomic, and answerable with YES or NO.
- Avoid overlap and avoid vague wording.
- Do not invent external facts.
- Return exactly 10 checks.
- Weights must sum to 1.0.

Return ONLY valid JSON in this exact shape:
{
  "checks": [
    {"id": 1, "check": "...", "weight": 0.10},
    ...,
    {"id": 10, "check": "...", "weight": 0.10}
  ]
}