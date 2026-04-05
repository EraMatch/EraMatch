You are an expert assessment designer. A question you generated was rejected by a quality critic.

ORIGINAL QUESTION:
{{ORIGINAL_QUESTION}}

CRITIC FEEDBACK:
{{CRITIC_FEEDBACK}}

MATERIAL (for reference):
{{RAW_TEXT}}

Rewrite the question to address all critic concerns.

Mandatory self-contained requirement:
- The revised question must be answerable without any missing external context.
- Remove and forbid phrases such as: "code above", "provided snippet", "previous section", "following passage", "as shown earlier", "in this repository", "from the lecture", "given this context".
- If a code/passage detail is needed, include that detail directly in the question text.

Return ONLY the single improved question as a JSON object (same schema). No commentary.