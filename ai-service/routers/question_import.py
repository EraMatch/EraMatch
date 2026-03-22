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
    "Is the question aligned with the source material and topic context?",
    "Is the language level suitable for the stated difficulty?",
    "Does the question avoid redundant wording and unnecessary complexity?",
    "For essay/code questions, is the rubric specific enough for consistent grading?",
    "Does the question avoid requiring external knowledge not present in the material?",
]

# Partial credit thresholds
CRITIC_PASS_THRESHOLD = 0.7    # Score >= 0.7 → approved
CRITIC_FLAG_THRESHOLD = 0.4    # 0.4 <= score < 0.7 → needs review (flagged)
MAX_TRIALS = 3                 # Max critic trials per question (initial + retries)


# ─── Schemas ─────────────────────────────────────────────────────────────────

class GenerateRequest(BaseModel):
    """Generate questions from raw extracted text material."""
    raw_text: str                  # Extracted text from uploaded file
    num_questions: int = 10        # Legacy fallback when no per-type counts are provided
    context_hint: str = ""         # Optional: "Python programming" or "Data Structures"
    question_types: list[str] = ["mcq", "essay"]  # Types to include
    mcq_count: int | None = None
    essay_count: int | None = None
    mcq_difficulty: str = "Medium"
    essay_difficulty: str = "Medium"


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
    evidence: str | None = None
    reference_answer: str | None = None
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

def build_generate_prompt(raw_text: str, num_questions: int, context_hint: str, question_plan: dict[str, dict]) -> str:
    plan_lines: list[str] = []
    for q_type in ["mcq", "essay"]:
        cfg = question_plan.get(q_type, {})
        count = int(cfg.get("count", 0))
        if count <= 0:
            continue
        difficulty = str(cfg.get("difficulty", "Medium"))
        plan_lines.append(f"- {q_type.upper()}: exactly {count} question(s), difficulty={difficulty}")

    if not plan_lines:
        plan_lines.append(f"- MIXED: exactly {num_questions} questions (MCQ and Essay)")

    return f"""You are an expert assessment designer. Create {num_questions} high-quality assessment questions from the material below.
{f'Context: {context_hint}' if context_hint else ''}
REQUIRED DISTRIBUTION:
{chr(10).join(plan_lines)}

MATERIAL:
{raw_text[:40000]}

INSTRUCTIONS:
- Return EXACTLY {num_questions} questions.
- For MCQ: 4 options, exactly one correct, plausible distractors
- For Essay: include a reference_answer and grading rubric
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
    "evidence": "<short evidence snippet from material supporting the answer>" or null,
    "reference_answer": "<short model answer for recruiter review>" or null,
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
    "evidence": null,
    "reference_answer": null,
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
CRITERION_1: YES|NO
CRITERION_2: YES|NO
CRITERION_3: YES|NO
CRITERION_4: YES|NO
CRITERION_5: YES|NO
CRITERION_6: YES|NO
CRITERION_7: YES|NO
CRITERION_8: YES|NO
CRITERION_9: YES|NO
CRITERION_10: YES|NO
OVERALL_SCORE: <yes_count/10 as decimal between 0.0 and 1.0>
FEEDBACK: <1-2 sentences explaining what to fix, or "Approved" if all passed>"""


async def run_critic(question: dict) -> tuple[float, str]:
    """Run the Critic Agent on a single question. Returns (score, feedback)."""
    prompt = build_critic_prompt(question)
    try:
        result = await chat_completion(messages=[{"role": "user", "content": prompt}])
        content = result["content"]

        score = 0.5  # Default uncertain
        feedback = "Unable to parse critic response"
        yes_count = 0
        parsed_count = 0

        for line in content.strip().splitlines():
            line = line.strip()
            if line.startswith("CRITERION_"):
                verdict = line.split(":", 1)[1].strip().upper()
                if verdict in {"YES", "NO"}:
                    parsed_count += 1
                    if verdict == "YES":
                        yes_count += 1
            if line.startswith("OVERALL_SCORE:"):
                try:
                    score = float(line.split(":", 1)[1].strip())
                    score = max(0.0, min(1.0, score))
                except Exception:
                    pass
            elif line.startswith("FEEDBACK:"):
                feedback = line.split(":", 1)[1].strip()

        if parsed_count == len(CRITIC_TESTS):
            score = round(yes_count / len(CRITIC_TESTS), 2)

        return score, feedback
    except Exception as e:
        return 0.5, f"Critic error: {str(e)}"


def parse_questions_json(content: str) -> list[dict]:
    """Extract and parse JSON array from LLM response, handling markdown fences."""
    # Strip markdown code fences if present
    content = content.strip()
    content = re.sub(r"^```(?:json)?\s*", "", content)
    content = re.sub(r"\s*```$", "", content)

    def _coerce_to_questions(obj: object) -> list[dict]:
        if isinstance(obj, list):
            return obj
        if isinstance(obj, dict):
            q = obj.get("questions")
            if isinstance(q, list):
                return q
            # Some models ignore array instruction and return a single question object.
            return [obj]
        raise ValueError("No questions array in JSON payload")

    # 1) Try parsing full content directly first.
    try:
        parsed = json.loads(content)
        return _coerce_to_questions(parsed)
    except Exception:
        pass

    # 2) Fallback: parse extracted bracket range (legacy model behavior).
    start = content.find("[")
    end = content.rfind("]") + 1
    if start == -1 or end == 0:
        raise ValueError("No JSON array found in LLM response")

    payload = content[start:end]
    try:
        return json.loads(payload)
    except json.JSONDecodeError:
        # Common LLM glitches: invalid escape sequences and trailing commas.
        payload = re.sub(r"\\(?![\"\\/bfnrtu])", r"\\\\", payload)
        payload = re.sub(r",\s*([}\]])", r"\1", payload)
        return json.loads(payload)


async def repair_questions_json(content: str) -> list[dict]:
    """Ask the model to repair malformed JSON into a valid question array."""
    repair_prompt = f"""You are a strict JSON repair assistant.
The following content should represent a JSON array of question objects but is malformed.
Fix it and return ONLY a valid JSON array.

CONTENT TO REPAIR:
{content}

RULES:
- Return only JSON
- Top-level must be an array
- Preserve original meaning as much as possible
- Do not add markdown fences"""

    repaired = await chat_completion(messages=[{"role": "user", "content": repair_prompt}], response_format="json")
    return parse_questions_json(repaired["content"])


def normalize_question_payload(q: dict) -> dict:
    """Coerce model output into DraftQuestion-compatible types."""
    if not isinstance(q, dict):
        return {}

    out = dict(q)

    # Tags should be list[str]
    tags = out.get("tags", [])
    if isinstance(tags, str):
        out["tags"] = [t.strip() for t in tags.split(",") if t.strip()]
    elif isinstance(tags, list):
        out["tags"] = [str(t) for t in tags]
    else:
        out["tags"] = []

    # Options should be list[str] or None
    options = out.get("options")
    if options is None:
        out["options"] = None
    elif isinstance(options, list):
        out["options"] = [str(o) for o in options]
    else:
        out["options"] = [str(options)]

    # Correct answer should be int or None
    ca = out.get("correct_answer")
    try:
        out["correct_answer"] = int(ca) if ca is not None else None
    except Exception:
        out["correct_answer"] = None

    # Reference answer should be string or None
    evidence = out.get("evidence")
    if evidence is None:
        out["evidence"] = None
    else:
        out["evidence"] = str(evidence)

    # Reference answer should be string or None
    ref = out.get("reference_answer")
    if ref is None:
        out["reference_answer"] = None
    else:
        out["reference_answer"] = str(ref)

    # Rubric should be string or None
    rubric = out.get("rubric")
    if rubric is None:
        out["rubric"] = None
    elif isinstance(rubric, str):
        out["rubric"] = rubric
    else:
        out["rubric"] = json.dumps(rubric, ensure_ascii=False)

    # Max words should be int or None
    mw = out.get("max_words")
    try:
        out["max_words"] = int(mw) if mw is not None else None
    except Exception:
        out["max_words"] = None

    # String-ish fields
    for field in ["type", "text", "difficulty", "category", "explanation", "evidence"]:
        if field in out and out[field] is not None:
            out[field] = str(out[field])

    return out


# ─── Core pipeline ───────────────────────────────────────────────────────────

async def generator_critic_pipeline(
    raw_text: str,
    prompt: str,
    mode: str = "generate",
    num_questions: int = 10,
    question_types: list[str] | None = None,
) -> tuple[list[DraftQuestion], CriticStats]:
    """
    Run the full Generator → Critic Agent pipeline.
    For regeneration, individual questions are re-prompted with critic feedback.
    """
    # Step 1: Generate all questions at once
    gen_result = await chat_completion(messages=[{"role": "user", "content": prompt}], response_format="json")
    try:
        raw_questions = parse_questions_json(gen_result["content"])
    except Exception:
        raw_questions = await repair_questions_json(gen_result["content"])

    approved: list[DraftQuestion] = []
    stats = CriticStats(approved=0, flagged=0, rejected=0, total_retries=0)

    for q in raw_questions:
        trial = 1
        retry_count = 0
        current_q = normalize_question_payload(q)
        critic_score = 0.0
        critic_feedback = ""

        while trial <= MAX_TRIALS:
            critic_score, critic_feedback = await run_critic(current_q)

            if critic_score >= CRITIC_PASS_THRESHOLD:
                # Approved
                break
            elif trial < MAX_TRIALS:
                # Regenerate this specific question with critic feedback
                regen_prompt = build_regen_prompt(raw_text, current_q, critic_feedback)
                try:
                    regen_result = await chat_completion(
                        messages=[{"role": "user", "content": regen_prompt}],
                        response_format="json",
                    )
                    regen_content = regen_result["content"].strip()
                    # Parse single object
                    regen_content = re.sub(r"^```(?:json)?\s*", "", regen_content)
                    regen_content = re.sub(r"\s*```$", "", regen_content)
                    obj_start = regen_content.find("{")
                    obj_end = regen_content.rfind("}") + 1
                    if obj_start != -1 and obj_end > 0:
                        current_q = normalize_question_payload(json.loads(regen_content[obj_start:obj_end]))
                    stats.total_retries += 1
                except Exception:
                    pass  # keep current_q unchanged, will be flagged
            trial += 1

        retry_count = max(trial - 1, 0)

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
            evidence=current_q.get("evidence"),
            reference_answer=current_q.get("reference_answer"),
            explanation=current_q.get("explanation"),
            rubric=current_q.get("rubric"),
            max_words=current_q.get("max_words"),
            needs_review=needs_review,
            critic_score=round(critic_score, 2),
            critic_feedback=critic_feedback if needs_review else None,
            retry_count=retry_count,
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

    def _normalize_diff(value: str) -> str:
        candidate = (value or "Medium").strip().capitalize()
        return candidate if candidate in {"Easy", "Medium", "Hard"} else "Medium"

    def _merge_stats(base: CriticStats, inc: CriticStats) -> CriticStats:
        return CriticStats(
            approved=base.approved + inc.approved,
            flagged=base.flagged + inc.flagged,
            rejected=base.rejected + inc.rejected,
            total_retries=base.total_retries + inc.total_retries,
        )

    def _count_types(items: list[DraftQuestion]) -> dict[str, int]:
        counts = {"mcq": 0, "essay": 0}
        for item in items:
            q_type = (item.type or "").strip().lower()
            if q_type in counts:
                counts[q_type] += 1
        return counts

    # Build an explicit per-type generation plan.
    mcq_count = request.mcq_count if request.mcq_count is not None else 0
    essay_count = request.essay_count if request.essay_count is not None else 0

    if mcq_count == 0 and essay_count == 0:
        enabled_types = [t for t in request.question_types if t in {"mcq", "essay"}] or ["mcq", "essay"]
        if len(enabled_types) == 1:
            if enabled_types[0] == "mcq":
                mcq_count = request.num_questions
            else:
                essay_count = request.num_questions
        else:
            mcq_count = request.num_questions // 2
            essay_count = request.num_questions - mcq_count

    if mcq_count < 0 or essay_count < 0:
        raise HTTPException(status_code=422, detail="mcq_count and essay_count must be >= 0")

    total_questions = mcq_count + essay_count
    if total_questions <= 0:
        raise HTTPException(status_code=422, detail="At least one question must be requested")

    question_plan = {
        "mcq": {"count": mcq_count, "difficulty": _normalize_diff(request.mcq_difficulty)},
        "essay": {"count": essay_count, "difficulty": _normalize_diff(request.essay_difficulty)},
    }

    try:
        prompt = build_generate_prompt(
            raw_text=raw_text,
            num_questions=total_questions,
            context_hint=request.context_hint,
            question_plan=question_plan,
        )
        questions, stats = await generator_critic_pipeline(
            raw_text,
            prompt,
            mode="generate",
            num_questions=total_questions,
            question_types=[q for q, cfg in question_plan.items() if int(cfg.get("count", 0)) > 0],
        )

        # Some model runs under-produce items despite instructions.
        # Retry generation for the missing type counts so recruiter gets requested volume.
        topup_attempts = 0
        while len(questions) < total_questions and topup_attempts < 3:
            current_counts = _count_types(questions)
            rem_mcq = max(mcq_count - current_counts["mcq"], 0)
            rem_essay = max(essay_count - current_counts["essay"], 0)
            remaining_total = rem_mcq + rem_essay
            if remaining_total <= 0:
                break

            remaining_plan = {
                "mcq": {"count": rem_mcq, "difficulty": question_plan["mcq"]["difficulty"]},
                "essay": {"count": rem_essay, "difficulty": question_plan["essay"]["difficulty"]},
            }

            topup_prompt = build_generate_prompt(
                raw_text=raw_text,
                num_questions=remaining_total,
                context_hint=request.context_hint,
                question_plan=remaining_plan,
            )
            extra_questions, extra_stats = await generator_critic_pipeline(
                raw_text,
                topup_prompt,
                mode="generate",
                num_questions=remaining_total,
                question_types=[q for q, cfg in remaining_plan.items() if int(cfg.get("count", 0)) > 0],
            )
            questions.extend(extra_questions)
            stats = _merge_stats(stats, extra_stats)
            topup_attempts += 1

        questions = questions[:total_questions]
        if len(questions) < total_questions:
            raise HTTPException(
                status_code=502,
                detail=(
                    f"Model produced only {len(questions)} of {total_questions} requested questions. "
                    "Please retry with the same settings."
                ),
            )
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
        questions, stats = await generator_critic_pipeline(
            raw_text,
            prompt,
            mode="extract",
            num_questions=10,
            question_types=["mcq", "essay"],
        )
        return ImportResponse(questions=questions, critic_stats=stats)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"LLM returned invalid JSON: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Extraction failed: {str(e)}")
