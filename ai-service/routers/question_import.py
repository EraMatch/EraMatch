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
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from config import settings

from services.ollama import chat_completion

router = APIRouter()

QUESTION_IMPORT_MODEL = settings.OLLAMA_QUESTION_IMPORT_MODEL or settings.OLLAMA_MODEL
PROMPTS_DIR = Path(__file__).resolve().parents[1] / "prompts" / "question_import"


def _load_prompt_template(template_name: str) -> str:
    template_path = PROMPTS_DIR / template_name
    try:
        return template_path.read_text(encoding="utf-8")
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Prompt template load failed: {template_path}",
        ) from exc


def _render_prompt_template(template_name: str, replacements: dict[str, str]) -> str:
    content = _load_prompt_template(template_name)
    for key, value in replacements.items():
        content = content.replace(f"{{{{{key}}}}}", value)
    return content


def _raise_mapped_llm_error(exc: Exception) -> None:
    message = str(exc)
    lowered = message.lower()

    if "status code: 401" in lowered or "unauthorized" in lowered:
        raise HTTPException(
            status_code=401,
            detail=(
                "Ollama Cloud unauthorized. Set a valid OLLAMA_API_KEY in ai-service/.env "
                "for the selected cloud model."
            ),
        )

    if "status code: 404" in lowered and "model" in lowered:
        raise HTTPException(
            status_code=502,
            detail=f"Configured model '{QUESTION_IMPORT_MODEL}' was not found on Ollama Cloud.",
        )

    raise HTTPException(status_code=502, detail=f"LLM provider error: {message}")

# ─── QAG Critic Tests (HD-Eval Boolean test cases) ───────────────────────────
CRITIC_TESTS = [
    "Is the question text unambiguous and clearly written?",
    "Is the question fully self-contained as a standalone item, with no references to missing context (e.g., 'code above', 'provided snippet', 'following passage', 'in this repository')?",
    "Can the correct answer be definitively verified from the provided options or rubric?",
    "Is the difficulty label appropriate for the complexity of the question?",
    "Are the wrong options (distractors) plausible but clearly distinguishable from the correct answer?",
    "Is the question free from cultural bias, trick phrasing, or double negatives?",
    "Is the question aligned with the source material and topic context?",
    "Is the language level suitable for the stated difficulty?",
    "For essay/code questions, is the rubric specific enough for consistent grading?",
    "Does the question avoid requiring external knowledge not present in the material?",
]

CRITIC_WEIGHTS = [0.10] * len(CRITIC_TESTS)

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
    recruiter_instructions: str = ""  # Optional recruiter constraints for generation
    question_types: list[str] = ["mcq", "essay"]  # Types to include
    mcq_count: int | None = None
    essay_count: int | None = None
    mcq_difficulty: str = "Medium"
    essay_difficulty: str = "Medium"
    mcq_easy_count: int = 0
    mcq_medium_count: int = 0
    mcq_hard_count: int = 0
    essay_easy_count: int = 0
    essay_medium_count: int = 0
    essay_hard_count: int = 0


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
    rubric_yes_no_checks: list[dict] | None = None
    # Critic metadata
    needs_review: bool = False
    critic_score: float = 1.0
    critic_weighted_score: float = 1.0
    critic_feedback: str | None = None
    critic_checks: list[dict] | None = None
    retry_count: int = 0


class CriticStats(BaseModel):
    approved: int
    flagged: int
    rejected: int
    total_retries: int


class ImportResponse(BaseModel):
    questions: list[DraftQuestion]
    critic_stats: CriticStats


class RefineQuestionRequest(BaseModel):
    raw_text: str
    question: dict
    critic_feedback: str | None = None
    failed_criteria: list[str] = []


class RefineQuestionResponse(BaseModel):
    question: DraftQuestion


# ─── Generator Prompts ───────────────────────────────────────────────────────

def build_generate_prompt(
    raw_text: str,
    num_questions: int,
    context_hint: str,
    recruiter_instructions: str,
    question_plan: dict[str, dict],
) -> str:
    plan_lines: list[str] = []
    for q_type in ["mcq", "essay"]:
        cfg = question_plan.get(q_type, {})
        count = int(cfg.get("count", 0))
        if count <= 0:
            continue
        split = cfg.get("by_difficulty", {})
        easy = int(split.get("Easy", 0))
        medium = int(split.get("Medium", 0))
        hard = int(split.get("Hard", 0))
        if easy + medium + hard > 0:
            plan_lines.append(
                f"- {q_type.upper()}: exactly {count} question(s) with difficulty split Easy={easy}, Medium={medium}, Hard={hard}"
            )
        else:
            difficulty = str(cfg.get("difficulty", "Medium"))
            plan_lines.append(f"- {q_type.upper()}: exactly {count} question(s), difficulty={difficulty}")

    if not plan_lines:
        plan_lines.append(f"- MIXED: exactly {num_questions} questions (MCQ and Essay)")

    extra_instructions = recruiter_instructions.strip()
    recruiter_instructions_block = (
        f"\nRECRUITER INSTRUCTIONS (must follow):\n{extra_instructions}\n"
        if extra_instructions else ""
    )

    return _render_prompt_template(
        "generate.md",
        {
            "NUM_QUESTIONS": str(num_questions),
            "CONTEXT_HINT": f"Context: {context_hint}" if context_hint else "",
            "PLAN_LINES": "\n".join(plan_lines),
            "RECRUITER_INSTRUCTIONS_BLOCK": recruiter_instructions_block.strip(),
            "RAW_TEXT": raw_text[:40000],
        },
    )


def build_extract_prompt(raw_text: str) -> str:
    return _render_prompt_template(
        "extract.md",
        {
            "RAW_TEXT": raw_text[:40000],
        },
    )


def build_regen_prompt(
    raw_text: str,
    original_question: dict,
    critic_feedback: str,
) -> str:
    return _render_prompt_template(
        "regen.md",
        {
            "ORIGINAL_QUESTION": json.dumps(original_question, indent=2),
            "CRITIC_FEEDBACK": critic_feedback,
            "RAW_TEXT": raw_text[:20000],
        },
    )


def build_refine_question_prompt(
    raw_text: str,
    question: dict,
    critic_feedback: str,
    failed_criteria: list[str],
) -> str:
    failed_text = "\n".join(f"- {c}" for c in failed_criteria) if failed_criteria else "- No explicit failed criteria provided"
    return _render_prompt_template(
        "refine_question.md",
        {
            "QUESTION": json.dumps(question, indent=2),
            "CRITIC_FEEDBACK": critic_feedback or "N/A",
            "FAILED_CRITERIA": failed_text,
            "RAW_TEXT": raw_text[:20000],
        },
    )


def _mock_import_response(total_questions: int, question_plan: dict[str, dict], context_hint: str = "") -> ImportResponse:
    topic = context_hint.strip() or "the provided material"
    questions: list[DraftQuestion] = []

    def _make_question(q_type: str, index: int, difficulty: str) -> DraftQuestion:
        if q_type == "mcq":
            return DraftQuestion(
                type="mcq",
                text=f"Which statement best reflects a key idea from {topic}?",
                difficulty=difficulty,
                category="General",
                tags=["mock", "local-dev"],
                options=[
                    "It introduces the main concept clearly.",
                    "It avoids discussing the core idea.",
                    "It only lists unrelated details.",
                    "It gives no useful context.",
                ],
                correct_answer=0,
                evidence="Mock mode is enabled locally, so this question was generated without an external LLM.",
                reference_answer="The question should capture the main idea from the source material.",
                explanation="This is a local development fallback.",
                rubric=None,
                max_words=None,
                rubric_yes_no_checks=None,
                needs_review=False,
                critic_score=1.0,
                critic_weighted_score=1.0,
                critic_feedback=None,
                critic_checks=[],
                retry_count=0,
            )

        return DraftQuestion(
            type="essay",
            text=f"Explain one important concept from {topic} and how it is applied.",
            difficulty=difficulty,
            category="General",
            tags=["mock", "local-dev"],
            options=None,
            correct_answer=None,
            evidence="Mock mode is enabled locally, so this question was generated without an external LLM.",
            reference_answer="A strong answer should explain the concept clearly and connect it to the source material.",
            explanation="This is a local development fallback.",
            rubric="Assess correctness, completeness, and connection to the source material.",
            max_words=200,
            rubric_yes_no_checks=[],
            needs_review=False,
            critic_score=1.0,
            critic_weighted_score=1.0,
            critic_feedback=None,
            critic_checks=[],
            retry_count=0,
        )

    for q_type in ["mcq", "essay"]:
        cfg = question_plan.get(q_type, {})
        count = int(cfg.get("count", 0) or 0)
        if count <= 0:
            continue
        split = cfg.get("by_difficulty", {}) or {}
        diff_sequence: list[str] = []
        for diff in ["Easy", "Medium", "Hard"]:
            diff_sequence.extend([diff] * int(split.get(diff, 0) or 0))
        if not diff_sequence:
            diff_sequence = [str(cfg.get("difficulty", "Medium"))] * count
        while len(diff_sequence) < count:
            diff_sequence.append(str(cfg.get("difficulty", "Medium")))
        for idx in range(count):
            questions.append(_make_question(q_type, idx + 1, diff_sequence[idx]))

    questions = questions[:total_questions]
    return ImportResponse(
        questions=questions,
        critic_stats=CriticStats(
            approved=len(questions),
            flagged=0,
            rejected=0,
            total_retries=0,
        ),
    )


# ─── Critic Agent ────────────────────────────────────────────────────────────

def build_critic_prompt(question: dict) -> str:
    criteria_lines = "\n".join(f"{i+1}. {test}" for i, test in enumerate(CRITIC_TESTS))
    return _render_prompt_template(
        "critic.md",
        {
            "QUESTION": json.dumps(question, indent=2),
            "CRITERIA_LINES": criteria_lines,
        },
    )


async def run_critic(question: dict) -> tuple[float, str, list[dict]]:
    """Run the Critic Agent on a single question. Returns (score, feedback, checks)."""
    prompt = build_critic_prompt(question)
    try:
        result = await chat_completion(messages=[{"role": "user", "content": prompt}], model=QUESTION_IMPORT_MODEL)
        content = result["content"]

        score = 0.5  # Default uncertain
        feedback = "Unable to parse critic response"
        yes_count = 0
        parsed_count = 0
        verdicts: dict[int, bool] = {}

        for line in content.strip().splitlines():
            line = line.strip()
            if line.startswith("CRITERION_"):
                try:
                    prefix, raw_verdict = line.split(":", 1)
                    idx = int(prefix.split("_")[1]) - 1
                    verdict = raw_verdict.strip().upper()
                    if idx >= 0 and verdict in {"YES", "NO"}:
                        verdicts[idx] = verdict == "YES"
                        parsed_count += 1
                        if verdict == "YES":
                            yes_count += 1
                except Exception:
                    pass
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

        checks: list[dict] = []
        weighted_total = 0.0
        for idx, criterion in enumerate(CRITIC_TESTS):
            weight = CRITIC_WEIGHTS[idx] if idx < len(CRITIC_WEIGHTS) else 0.0
            passed = verdicts.get(idx, False)
            weighted_value = weight if passed else 0.0
            weighted_total += weighted_value
            checks.append(
                {
                    "id": idx + 1,
                    "criterion": criterion,
                    "verdict": "YES" if passed else "NO",
                    "weight": round(weight, 3),
                    "weighted_value": round(weighted_value, 3),
                }
            )

        score = round(max(score, weighted_total), 2)

        return score, feedback, checks
    except Exception as e:
        fallback_checks = [
            {
                "id": idx + 1,
                "criterion": criterion,
                "verdict": "NO",
                "weight": round(CRITIC_WEIGHTS[idx], 3),
                "weighted_value": 0.0,
            }
            for idx, criterion in enumerate(CRITIC_TESTS)
        ]
        return 0.5, f"Critic error: {str(e)}", fallback_checks


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
    repair_prompt = _render_prompt_template(
        "repair_json.md",
        {
            "CONTENT": content,
        },
    )

    repaired = await chat_completion(
        messages=[{"role": "user", "content": repair_prompt}],
        model=QUESTION_IMPORT_MODEL,
    )
    return parse_questions_json(repaired["content"])


def build_rubric_decomposition_prompt(question: dict) -> str:
    return _render_prompt_template(
        "rubric_decomposition.md",
        {
            "QUESTION": json.dumps(question, indent=2),
        },
    )


def _fallback_rubric_checks(question: dict) -> list[dict]:
    base_parts: list[str] = []
    for key in ["rubric", "reference_answer", "evidence"]:
        value = question.get(key)
        if value:
            base_parts.append(str(value))

    base_text = " ".join(base_parts).strip()
    if not base_text:
        base_text = "Correctness, completeness, and alignment with expected answer"

    chunks = [
        c.strip(" -:;,.\n\t")
        for c in re.split(r"[\n\r\.;:]+", base_text)
        if c and c.strip()
    ]

    derived: list[str] = []
    for chunk in chunks:
        if len(chunk) < 12:
            continue
        lowered = chunk.lower()
        if lowered.startswith("excellent") or lowered.startswith("good") or lowered.startswith("satisfactory") or lowered.startswith("poor"):
            continue
        sentence = chunk[0].lower() + chunk[1:] if len(chunk) > 1 else chunk.lower()
        derived.append(f"Does the answer {sentence}?")
        if len(derived) == 10:
            break

    while len(derived) < 10:
        idx = len(derived) + 1
        derived.append(f"Does the answer satisfy rubric criterion {idx} with clear, relevant support?")

    checks: list[dict] = []
    for i in range(10):
        checks.append(
            {
                "id": i + 1,
                "check": derived[i],
                "weight": 0.10,
            }
        )
    return checks


def _normalize_rubric_checks(payload: object, question: dict) -> list[dict]:
    if isinstance(payload, dict):
        raw_checks = payload.get("checks", [])
    elif isinstance(payload, list):
        raw_checks = payload
    else:
        raw_checks = []

    normalized: list[dict] = []
    for idx, item in enumerate(raw_checks):
        if not isinstance(item, dict):
            continue
        text = str(item.get("check") or "").strip()
        if not text:
            continue
        weight = item.get("weight", 0.10)
        try:
            weight_value = float(weight)
        except Exception:
            weight_value = 0.10
        normalized.append(
            {
                "id": idx + 1,
                "check": text,
                "weight": round(max(0.0, min(1.0, weight_value)), 3),
            }
        )

    if len(normalized) != 10:
        return _fallback_rubric_checks(question)

    total = sum(c["weight"] for c in normalized)
    if total <= 0:
        return _fallback_rubric_checks(question)

    # Normalize weights to sum to 1.0 for consistency.
    normalized = [
        {**c, "weight": round(c["weight"] / total, 3)}
        for c in normalized
    ]

    # Adjust rounding residue on final item.
    residue = round(1.0 - sum(c["weight"] for c in normalized), 3)
    normalized[-1]["weight"] = round(max(0.0, normalized[-1]["weight"] + residue), 3)
    return normalized


async def generate_rubric_yes_no_checks(question: dict) -> list[dict]:
    try:
        prompt = build_rubric_decomposition_prompt(question)
        result = await chat_completion(
            messages=[{"role": "user", "content": prompt}],
            response_format="json",
            model=QUESTION_IMPORT_MODEL,
        )
        try:
            payload = json.loads(result["content"])
        except Exception:
            payload = parse_questions_json(result["content"])
        return _normalize_rubric_checks(payload, question)
    except Exception:
        return _fallback_rubric_checks(question)


def _extract_labeled_sections(raw_text: str) -> tuple[str, dict[str, str]]:
    """Extract trailing labeled sections and keep question stem clean."""
    if not raw_text:
        return "", {}

    label_map = {
        "reference answer": "reference_answer",
        "evidence": "evidence",
        "rubric": "rubric",
        "explanation": "explanation",
    }
    header_re = re.compile(
        r"^\s*(?:[-*]\s*)?(?:\*\*)?(Reference\s*Answer|Evidence|Rubric|Explanation)(?:\*\*)?\s*:\s*(.*)$",
        flags=re.IGNORECASE,
    )

    sections: dict[str, list[str]] = {v: [] for v in label_map.values()}
    stem_lines: list[str] = []
    current_section: str | None = None

    for line in raw_text.splitlines():
        m = header_re.match(line)
        if m:
            current_section = label_map[m.group(1).strip().lower().replace("  ", " ")]
            first_chunk = (m.group(2) or "").strip()
            if first_chunk:
                sections[current_section].append(first_chunk)
            continue

        if current_section:
            sections[current_section].append(line.strip())
        else:
            stem_lines.append(line)

    stem = "\n".join(stem_lines).strip()
    collapsed_sections = {
        key: "\n".join([p for p in parts if p]).strip()
        for key, parts in sections.items()
        if any(p for p in parts)
    }

    # Fallback for inline label style where headers are not line-start anchored.
    if not collapsed_sections:
        inline_split = re.split(
            r"(?i)\b(reference\s*answer|evidence|rubric|explanation)\s*:\s*",
            raw_text,
        )
        if len(inline_split) > 1:
            stem = inline_split[0].strip()
            for idx in range(1, len(inline_split), 2):
                label_raw = inline_split[idx].strip().lower()
                value = inline_split[idx + 1].strip() if idx + 1 < len(inline_split) else ""
                mapped = label_map.get(label_raw)
                if mapped and value:
                    collapsed_sections[mapped] = value

    return stem, collapsed_sections


def normalize_question_payload(q: dict) -> dict:
    """Coerce model output into DraftQuestion-compatible types."""
    if not isinstance(q, dict):
        return {}

    out = dict(q)

    raw_text = str(out.get("text") or "")
    stem_text, extracted_sections = _extract_labeled_sections(raw_text)
    if stem_text:
        out["text"] = stem_text
    else:
        out["text"] = raw_text.strip()

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
    if evidence is None and extracted_sections.get("evidence"):
        out["evidence"] = extracted_sections.get("evidence")
    elif evidence is None:
        out["evidence"] = None
    else:
        out["evidence"] = str(evidence)

    # Reference answer should be string or None
    ref = out.get("reference_answer")
    if ref is None and extracted_sections.get("reference_answer"):
        out["reference_answer"] = extracted_sections.get("reference_answer")
    elif ref is None:
        out["reference_answer"] = None
    else:
        out["reference_answer"] = str(ref)

    # Rubric should be string or None
    rubric = out.get("rubric")
    if rubric is None and extracted_sections.get("rubric"):
        out["rubric"] = extracted_sections.get("rubric")
    elif rubric is None:
        out["rubric"] = None
    elif isinstance(rubric, str):
        out["rubric"] = rubric
    else:
        out["rubric"] = json.dumps(rubric, ensure_ascii=False)

    explanation = out.get("explanation")
    if explanation is None and extracted_sections.get("explanation"):
        out["explanation"] = extracted_sections.get("explanation")

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
    gen_result = await chat_completion(
        messages=[{"role": "user", "content": prompt}],
        model=QUESTION_IMPORT_MODEL,
    )
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
        critic_checks: list[dict] = []

        while trial <= MAX_TRIALS:
            critic_score, critic_feedback, critic_checks = await run_critic(current_q)

            if critic_score >= CRITIC_PASS_THRESHOLD:
                # Approved
                break
            elif trial < MAX_TRIALS:
                # Regenerate this specific question with critic feedback
                regen_prompt = build_regen_prompt(raw_text, current_q, critic_feedback)
                try:
                    regen_result = await chat_completion(
                        messages=[{"role": "user", "content": regen_prompt}],
                        model=QUESTION_IMPORT_MODEL,
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
        normalized_type = str(current_q.get("type", "essay")).strip().lower()
        rubric_checks = await generate_rubric_yes_no_checks(current_q) if normalized_type == "essay" else None

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
            rubric_yes_no_checks=rubric_checks,
            needs_review=needs_review,
            critic_score=round(critic_score, 2),
            critic_weighted_score=round(critic_score, 2),
            critic_feedback=critic_feedback if needs_review else None,
            critic_checks=critic_checks,
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

    def _count_type_difficulty(items: list[DraftQuestion]) -> dict[str, dict[str, int]]:
        counts = {
            "mcq": {"Easy": 0, "Medium": 0, "Hard": 0},
            "essay": {"Easy": 0, "Medium": 0, "Hard": 0},
        }
        for item in items:
            q_type = (item.type or "").strip().lower()
            if q_type not in counts:
                continue
            difficulty = _normalize_diff(item.difficulty or "Medium")
            counts[q_type][difficulty] += 1
        return counts

    # Build an explicit per-type generation plan.
    mcq_split = {
        "Easy": max(request.mcq_easy_count or 0, 0),
        "Medium": max(request.mcq_medium_count or 0, 0),
        "Hard": max(request.mcq_hard_count or 0, 0),
    }
    essay_split = {
        "Easy": max(request.essay_easy_count or 0, 0),
        "Medium": max(request.essay_medium_count or 0, 0),
        "Hard": max(request.essay_hard_count or 0, 0),
    }

    mcq_split_total = sum(mcq_split.values())
    essay_split_total = sum(essay_split.values())

    mcq_count = request.mcq_count if request.mcq_count is not None else 0
    essay_count = request.essay_count if request.essay_count is not None else 0

    if mcq_split_total > 0:
        mcq_count = mcq_split_total
    if essay_split_total > 0:
        essay_count = essay_split_total

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
        "mcq": {
            "count": mcq_count,
            "difficulty": _normalize_diff(request.mcq_difficulty),
            "by_difficulty": mcq_split,
        },
        "essay": {
            "count": essay_count,
            "difficulty": _normalize_diff(request.essay_difficulty),
            "by_difficulty": essay_split,
        },
    }

    if settings.USE_MOCK:
        return _mock_import_response(total_questions, question_plan, request.context_hint)

    try:
        prompt = build_generate_prompt(
            raw_text=raw_text,
            num_questions=total_questions,
            context_hint=request.context_hint,
            recruiter_instructions=request.recruiter_instructions,
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
                "mcq": {
                    "count": rem_mcq,
                    "difficulty": question_plan["mcq"]["difficulty"],
                    "by_difficulty": {"Easy": 0, "Medium": 0, "Hard": 0},
                },
                "essay": {
                    "count": rem_essay,
                    "difficulty": question_plan["essay"]["difficulty"],
                    "by_difficulty": {"Easy": 0, "Medium": 0, "Hard": 0},
                },
            }

            current_diff_counts = _count_type_difficulty(questions)
            for q_type in ["mcq", "essay"]:
                target_split = question_plan[q_type].get("by_difficulty", {})
                for diff in ["Easy", "Medium", "Hard"]:
                    target = int(target_split.get(diff, 0))
                    produced = int(current_diff_counts[q_type].get(diff, 0))
                    remaining_plan[q_type]["by_difficulty"][diff] = max(target - produced, 0)

            topup_prompt = build_generate_prompt(
                raw_text=raw_text,
                num_questions=remaining_total,
                context_hint=request.context_hint,
                recruiter_instructions=request.recruiter_instructions,
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

        # Final fallback: request one missing question at a time.
        # This is slower, but increases reliability when the model ignores batch counts.
        single_attempts = 0
        while len(questions) < total_questions and single_attempts < 12:
            current_counts = _count_types(questions)
            rem_mcq = max(mcq_count - current_counts["mcq"], 0)
            rem_essay = max(essay_count - current_counts["essay"], 0)
            remaining_total = rem_mcq + rem_essay
            if remaining_total <= 0:
                break

            target_type = "mcq" if rem_mcq >= rem_essay and rem_mcq > 0 else "essay"
            target_diff = question_plan[target_type]["difficulty"]
            current_diff_counts = _count_type_difficulty(questions)
            remaining_split = question_plan[target_type].get("by_difficulty", {})
            diff_candidates = [
                diff for diff in ["Easy", "Medium", "Hard"]
                if int(remaining_split.get(diff, 0)) - int(current_diff_counts[target_type].get(diff, 0)) > 0
            ]
            if diff_candidates:
                target_diff = diff_candidates[0]

            single_plan = {
                "mcq": {
                    "count": 1 if target_type == "mcq" else 0,
                    "difficulty": question_plan["mcq"]["difficulty"],
                    "by_difficulty": {
                        "Easy": 1 if target_type == "mcq" and target_diff == "Easy" else 0,
                        "Medium": 1 if target_type == "mcq" and target_diff == "Medium" else 0,
                        "Hard": 1 if target_type == "mcq" and target_diff == "Hard" else 0,
                    },
                },
                "essay": {
                    "count": 1 if target_type == "essay" else 0,
                    "difficulty": question_plan["essay"]["difficulty"],
                    "by_difficulty": {
                        "Easy": 1 if target_type == "essay" and target_diff == "Easy" else 0,
                        "Medium": 1 if target_type == "essay" and target_diff == "Medium" else 0,
                        "Hard": 1 if target_type == "essay" and target_diff == "Hard" else 0,
                    },
                },
            }

            single_prompt = build_generate_prompt(
                raw_text=raw_text,
                num_questions=1,
                context_hint=request.context_hint,
                recruiter_instructions=request.recruiter_instructions,
                question_plan=single_plan,
            )
            single_questions, single_stats = await generator_critic_pipeline(
                raw_text,
                single_prompt,
                mode="generate",
                num_questions=1,
                question_types=[target_type],
            )
            stats = _merge_stats(stats, single_stats)

            candidate = None
            for item in single_questions:
                if (item.type or "").strip().lower() == target_type:
                    candidate = item
                    break
            if candidate is None and single_questions:
                candidate = single_questions[0]
            if candidate is not None:
                questions.append(candidate)

            single_attempts += 1

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
    except HTTPException:
        raise
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"LLM returned invalid JSON: {str(e)}")
    except Exception as e:
        _raise_mapped_llm_error(e)


@router.post("/extract", response_model=ImportResponse)
async def extract_questions(request: ExtractRequest):
    """
    Path B — Deterministic Extraction.
    Extract and structure existing questions from PDFs, Markdown, or plain text.
    Same Generator → Critic Agent pipeline but in extraction mode.
    """
    if not request.raw_text.strip():
        raise HTTPException(status_code=422, detail="raw_text must not be empty")

    if settings.USE_MOCK:
        question_plan = {
            "mcq": {"count": 5, "difficulty": "Medium", "by_difficulty": {"Easy": 0, "Medium": 5, "Hard": 0}},
            "essay": {"count": 5, "difficulty": "Medium", "by_difficulty": {"Easy": 0, "Medium": 5, "Hard": 0}},
        }
        return _mock_import_response(10, question_plan)

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
        _raise_mapped_llm_error(e)


@router.post("/refine-question", response_model=RefineQuestionResponse)
async def refine_question(request: RefineQuestionRequest):
    if not request.raw_text.strip():
        raise HTTPException(status_code=422, detail="raw_text must not be empty")

    question = normalize_question_payload(request.question)

    try:
        prompt = build_refine_question_prompt(
            raw_text=request.raw_text,
            question=question,
            critic_feedback=request.critic_feedback or "",
            failed_criteria=request.failed_criteria or [],
        )
        result = await chat_completion(
            messages=[{"role": "user", "content": prompt}],
            response_format="json",
            model=QUESTION_IMPORT_MODEL,
        )
        content = result.get("content", "").strip()
        content = re.sub(r"^```(?:json)?\s*", "", content)
        content = re.sub(r"\s*```$", "", content)
        obj_start = content.find("{")
        obj_end = content.rfind("}") + 1
        if obj_start == -1 or obj_end <= 0:
            raise HTTPException(status_code=502, detail="Model did not return a valid question object")

        refined = normalize_question_payload(json.loads(content[obj_start:obj_end]))

        critic_score, critic_feedback, critic_checks = await run_critic(refined)
        normalized_type = str(refined.get("type", "essay")).strip().lower()
        rubric_checks = await generate_rubric_yes_no_checks(refined) if normalized_type == "essay" else None
        needs_review = critic_score < CRITIC_PASS_THRESHOLD

        refined_question = DraftQuestion(
            type=refined.get("type", "essay"),
            text=refined.get("text", ""),
            difficulty=refined.get("difficulty", "Medium"),
            category=refined.get("category", "General"),
            tags=refined.get("tags", []),
            options=refined.get("options"),
            correct_answer=refined.get("correct_answer"),
            evidence=refined.get("evidence"),
            reference_answer=refined.get("reference_answer"),
            explanation=refined.get("explanation"),
            rubric=refined.get("rubric"),
            max_words=refined.get("max_words"),
            rubric_yes_no_checks=rubric_checks,
            needs_review=needs_review,
            critic_score=round(critic_score, 2),
            critic_weighted_score=round(critic_score, 2),
            critic_feedback=critic_feedback if needs_review else None,
            critic_checks=critic_checks,
            retry_count=int(question.get("retry_count") or 0) + 1,
        )
        return RefineQuestionResponse(question=refined_question)
    except HTTPException:
        raise
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="Model returned invalid JSON for refinement")
    except Exception as e:
        _raise_mapped_llm_error(e)
