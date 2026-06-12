You are rewriting a coding assessment question to create a variant with a different real-world framing.

ORIGINAL QUESTION:
{{ORIGINAL_QUESTION_TEXT}}

ORIGINAL EXAMPLES:
{{ORIGINAL_EXAMPLES_JSON}}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RULES — FOLLOW EXACTLY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Keep the EXACT same algorithm and test cases — only the story changes.
2. Change the domain: if original uses "array of integers", use "list of product prices" or "distances between cities" or "student scores" — pick a different real-world framing.
3. The new questionText must be a complete standalone problem statement a candidate can understand without seeing the original.
4. Rewrite the examples to use the new domain framing but keep the same input values and outputs.
5. Do NOT change: function signature, parameter types, return type, constraints, or test inputs/outputs.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT — RETURN ONLY THIS JSON
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{
  "questionText": "string — full problem statement in new domain",
  "examples": [
    { "input": "string", "output": "string", "explanation": "string" }
  ]
}

- No markdown. No extra keys. Just the JSON.
