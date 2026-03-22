"""
Question Import Router — AI Service

Implements the Generator → Critic Agent pipeline for question generation and extraction.

Architecture:
  1. Generator LLM  → produces N draft questions + rubrics as structured JSON
  2. Critic Agent   → runs HD-Eval + QAG Boolean tests per question (max 3 retries)
  3. Returns approved + flagged questions with critic statistics

Two endpoints:
  POST /question-import/generate  — Generate questions from learning material (Path A)
  POST /question-import/extract   — Extract & structure questions from existing docs (Path B)
"""
import json
import re
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.ollama import chat_completion

router = APIRouter()

# ─── QAG Critic Tests (HD-Eval Boolean test cases) ───────────────────────────
CRITIC_TESTS = [
    "Is the question text unambiguous and clearly written?",
    "Can the correct answer be definitively verified from the provided options or rubric?",
    "Is the difficulty label appropriate for the complexity of the question?",
    "Are the wrong options (distractors) plausible but clearly distinguishable from the correct answer?",
    "Is the question free from cultural bias, trick phrasing, or double negatives?",
]

# Partial credit thresholds
CRITIC_PASS_THRESHOLD = 0.7    # Score >= 0.7 → approved
CRITIC_FLAG_THRESHOLD = 0.4    # 0.4 <= score < 0.7 → needs review (flagged)
MAX_RETRIES = 3                # Max regeneration attempts per question


# ─── Schemas ─────────────────────────────────────────────────────────────────

class GenerateRequest(BaseModel):
    """Generate questions from raw extracted text material."""
    raw_text: str                  # Extracted text from uploaded file
    num_questions: int = 10        # How many questions to attempt to generate
    context_hint: str = ""         # Optional: "Python programming" or "Data Structures"
    question_types: list[str] = ["mcq", "essay"]  # Types to include


class ExtractRequest(BaseModel):
    """Extract & structure already-existing questions from raw text."""
    raw_text: str


class DraftQuestion(BaseModel):
    """A single AI-generated draft question."""
    type: str                          # mcq | essay | code
    text: str                          # Question text
    difficulty: str = "Medium"         # Easy | Medium | Hard
    category: str = "General"
    tags: list[str] = []
    options: list[str] | None = None   # MCQ only
    correct_answer: int | None = None  # MCQ: index of correct option
    explanation: str | None = None
    rubric: str | None = None          # Essay/code only
    max_words: int | None = None       # Essay only
    # Critic metadata
    needs_review: bool = False
    critic_score: float = 1.0
    critic_feedback: str | None = None
    retry_count: int = 0


class CriticStats(BaseModel):
    approved: int
    flagged: int
    rejected: int
    total_retries: int


class ImportResponse(BaseModel):
    questions: list[DraftQuestion]
    critic_stats: CriticStats


# ─── Generator Prompts ───────────────────────────────────────────────────────

def build_generate_prompt(raw_text: str, num_questions: int, context_hint: str, question_types: list[str]) -> str:
    type_instruction = ""
    if "mcq" in question_types and "essay" in question_types:
        type_instruction = "Mix multiple choice (mcq) and essay questions."
    elif "mcq" in question_types:
        type_instruction = "Generate only multiple choice (mcq) questions."
    elif "essay" in question_types:
        type_instruction = "Generate only essay/open-ended questions."

    return f"""You are an expert assessment designer. Create {num_questions} high-quality assessment questions from the material below.
{f'Context: {context_hint}' if context_hint else ''}
{type_instruction}

MATERIAL:
{raw_text[:40000]}

INSTRUCTIONS:
- For MCQ: 4 options, exactly one correct, plausible distractors
- For Essay: include a rubric and optionally max_words
- Difficulty: Easy (recall), Medium (application), Hard (analysis/synthesis)
- Questions must be directly answerable from the material
- Never use "all of the above" or "none of the above"

Respond ONLY with a valid JSON array. Each element must exactly match this schema:
{{
  "type": "mcq" | "essay",
  "text": "<question text>",
  "difficulty": "Easy" | "Medium" | "Hard",
  "category": "<inferred topic category>",
  "tags": ["<tag1>", "<tag2>"],
  "options": ["<opt A>", "<opt B>", "<opt C>", "<opt D>"] or null,
  "correct_answer": <0-based index> or null,
  "explanation": "<why this is correct>",
  "rubric": "<grading rubric for essay>" or null,
  "max_words": <integer> or null
}}

Output ONLY the JSON array. No preamble, no commentary."""


def build_extract_prompt(raw_text: str) -> str:
    return f"""You are a parsing assistant. The following text contains assessment questions (possibly from an exam paper, interview guide, or study document).

Extract EVERY question you can find. For each question:
- Determine its type: mcq | essay | code
- If multiple choice, extract all options
- If the correct answer is indicated, extract it (as 0-based index)
- Infer difficulty from complexity
- Infer a category/topic from the question

TEXT:
{raw_text[:40000]}

Respond ONLY with a valid JSON array using the same schema:
{{
  "type": "mcq" | "essay" | "code",
  "text": "<question text>",
  "difficulty": "Easy" | "Medium" | "Hard",
  "category": "<topic>",
  "tags": [],
  "options": ["<opt A>", ...] or null,
  "correct_answer": <0-based index> or null,
  "explanation": null,
  "rubric": null,
  "max_words": null
}}

Output ONLY the JSON array. No preamble, no commentary."""


def build_regen_prompt(
    raw_text: str,
    original_question: dict,
    critic_feedback: str,
) -> str:
    return f"""You are an expert assessment designer. A question you generated was rejected by a quality critic.

ORIGINAL QUESTION:
{json.dumps(original_question, indent=2)}

CRITIC FEEDBACK:
{critic_feedback}

MATERIAL (for reference):
{raw_text[:20000]}

Rewrite the question to address all critic concerns. Return ONLY the single improved question as a JSON object (same schema). No commentary."""


# ─── Critic Agent ────────────────────────────────────────────────────────────

def build_critic_prompt(question: dict) -> str:
    return f"""You are an expert assessment quality auditor (HD-Eval + QAG framework).
Evaluate the following question against each criterion.

QUESTION:
{json.dumps(question, indent=2)}

CRITERIA (HD-Eval Boolean QAG Tests):
{chr(10).join(f'{i+1}. {test}' for i, test in enumerate(CRITIC_TESTS))}

For each criterion, assign:
  1.0 = Fully passes
  0.5 = Partially passes (needs minor edit)
  0.0 = Fails

Then compute: OVERALL_SCORE = average of all scores

Respond EXACTLY in this format (no extra text):
CRITERION_1: <score>
CRITERION_2: <score>
CRITERION_3: <score>
CRITERION_4: <score>
CRITERION_5: <score>
OVERALL_SCORE: <score>
FEEDBACK: <1-2 sentences explaining what to fix, or "Approved" if all passed>"""


async def run_critic(question: dict) -> tuple[float, str]:
    """Run the Critic Agent on a single question. Returns (score, feedback)."""
    prompt = build_critic_prompt(question)
    try:
        result = await chat_completion(messages=[{"role": "user", "content": prompt}])
        content = result["content"]

        score = 0.5  # Default uncertain
        feedback = "Unable to parse critic response"

        for line in content.strip().splitlines():
            line = line.strip()
            if line.startswith("OVERALL_SCORE:"):
                try:
                    score = float(line.split(":", 1)[1].strip())
                    score = max(0.0, min(1.0, score))
                except Exception:
                    pass
            elif line.startswith("FEEDBACK:"):
                feedback = line.split(":", 1)[1].strip()

        return score, feedback
    except Exception as e:
        return 0.5, f"Critic error: {str(e)}"


def parse_questions_json(content: str) -> list[dict]:
    """Extract and parse JSON array from LLM response, handling markdown fences."""
    # Strip markdown code fences if present
    content = content.strip()
    content = re.sub(r"^```(?:json)?\s*", "", content)
    content = re.sub(r"\s*```$", "", content)

    # Find the JSON array
    start = content.find("[")
    end = content.rfind("]") + 1
    if start == -1 or end == 0:
        raise ValueError("No JSON array found in LLM response")

    return json.loads(content[start:end])


# ─── Core pipeline ───────────────────────────────────────────────────────────

async def generator_critic_pipeline(
    raw_text: str,
    prompt: str,
    mode: str = "generate",
) -> tuple[list[DraftQuestion], CriticStats]:
    """
    Run the full Generator → Critic Agent pipeline.
    For regeneration, individual questions are re-prompted with critic feedback.
    """
    # Step 1: Generate all questions at once
    gen_result = await chat_completion(messages=[{"role": "user", "content": prompt}])
    raw_questions = parse_questions_json(gen_result["content"])

    approved: list[DraftQuestion] = []
    stats = CriticStats(approved=0, flagged=0, rejected=0, total_retries=0)

    for q in raw_questions:
        retry_count = 0
        current_q = q
        critic_score = 0.0
        critic_feedback = ""

        while retry_count <= MAX_RETRIES:
            critic_score, critic_feedback = await run_critic(current_q)

            if critic_score >= CRITIC_PASS_THRESHOLD:
                # Approved
                break
            elif retry_count < MAX_RETRIES:
                # Regenerate this specific question with critic feedback
                regen_prompt = build_regen_prompt(raw_text, current_q, critic_feedback)
                try:
                    regen_result = await chat_completion(
                        messages=[{"role": "user", "content": regen_prompt}]
                    )
                    regen_content = regen_result["content"].strip()
                    # Parse single object
                    regen_content = re.sub(r"^```(?:json)?\s*", "", regen_content)
                    regen_content = re.sub(r"\s*```$", "", regen_content)
                    obj_start = regen_content.find("{")
                    obj_end = regen_content.rfind("}") + 1
                    if obj_start != -1 and obj_end > 0:
                        current_q = json.loads(regen_content[obj_start:obj_end])
                    stats.total_retries += 1
                except Exception:
                    pass  # keep current_q unchanged, will be flagged
            retry_count += 1

        # Build DraftQuestion
        needs_review = critic_score < CRITIC_PASS_THRESHOLD
        dq = DraftQuestion(
            type=current_q.get("type", "essay"),
            text=current_q.get("text", ""),
            difficulty=current_q.get("difficulty", "Medium"),
            category=current_q.get("category", "General"),
            tags=current_q.get("tags", []),
            options=current_q.get("options"),
            correct_answer=current_q.get("correct_answer"),
            explanation=current_q.get("explanation"),
            rubric=current_q.get("rubric"),
            max_words=current_q.get("max_words"),
            needs_review=needs_review,
            critic_score=round(critic_score, 2),
            critic_feedback=critic_feedback if needs_review else None,
            retry_count=retry_count - 1,
        )
        approved.append(dq)

        if not needs_review:
            stats.approved += 1
        elif critic_score >= CRITIC_FLAG_THRESHOLD:
            stats.flagged += 1
        else:
            stats.rejected += 1

    return approved, stats


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.post("/generate", response_model=ImportResponse)
async def generate_questions(request: GenerateRequest):
    """
    Path A — Generative Import.
    Generate assessment questions from uploaded learning material using Ollama LLM
    with Generator → Critic Agent (HD-Eval + QAG) quality control loop.
    Max 3 retries per failing question; persistent failures are flagged for human review.
    """
    if not request.raw_text.strip():
        raise HTTPException(status_code=422, detail="raw_text must not be empty")

    char_limit = 50_000
    raw_text = request.raw_text[:char_limit]

    try:
        prompt = build_generate_prompt(
            raw_text=raw_text,
            num_questions=request.num_questions,
            context_hint=request.context_hint,
            question_types=request.question_types,
        )
        questions, stats = await generator_critic_pipeline(raw_text, prompt, mode="generate")
        return ImportResponse(questions=questions, critic_stats=stats)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"LLM returned invalid JSON: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Generation failed: {str(e)}")


@router.post("/extract", response_model=ImportResponse)
async def extract_questions(request: ExtractRequest):
    """
    Path B — Deterministic Extraction.
    Extract and structure existing questions from PDFs, Markdown, or plain text.
    Same Generator → Critic Agent pipeline but in extraction mode.
    """
    if not request.raw_text.strip():
        raise HTTPException(status_code=422, detail="raw_text must not be empty")

    raw_text = request.raw_text[:50_000]

    try:
        prompt = build_extract_prompt(raw_text)
        questions, stats = await generator_critic_pipeline(raw_text, prompt, mode="extract")
        return ImportResponse(questions=questions, critic_stats=stats)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"LLM returned invalid JSON: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Extraction failed: {str(e)}")
