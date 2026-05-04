"""
LLM router - endpoints for LLM inference via Ollama Cloud.

Example use cases:
- Interview evaluation (transcript + reference + rubric)
- Generic chat/prompt completion
"""

from pathlib import Path
import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.ollama import chat_completion

router = APIRouter()
logger = logging.getLogger(__name__)

PROMPTS_DIR = Path(__file__).resolve().parents[1] / "prompts" / "llm"


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


SYSTEM_PROMPT = _load_prompt_template("system_prompt.md").strip()


class ChatRequest(BaseModel):
    """Generic chat/prompt request."""

    messages: list[dict]  # [{role: "user", content": "..."}]
    model: str | None = None  # Override default model
    stream: bool = False


class ChatResponse(BaseModel):
    """Chat response."""

    content: str
    model: str


class EvaluateRequest(BaseModel):
    """Evaluate transcript against reference (video interview use case)."""

    transcript: str
    reference_answer: str | None = None
    question: str | None = None
    rubric: str | None = None


class EvaluateResponse(BaseModel):
    """Evaluation result."""

    score: float
    feedback: str
    strengths: list[str] | None = None
    improvements: list[str] | None = None
    key_points: list[str] | None = None


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """Generic LLM chat endpoint using Ollama"""
    try:
        result = await chat_completion(
            messages=request.messages,
            model=request.model,
        )
        return ChatResponse(
            content=result["content"],
            model=result["model"],
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/evaluate", response_model=EvaluateResponse)
async def evaluate(request: EvaluateRequest):
    """
    Evaluate video interview transcript with rubric-based criteria.

    Uses system prompt for expert interviewer persona and rubric for structured evaluation.
    """
    rubric_block = ""
    if request.rubric:
        rubric_block = "\n".join(
            [
                "## Evaluation Rubric (REQUIRED - evaluate strictly against these criteria)",
                request.rubric,
                "",
                "For EACH criterion above:",
                "- Check if addressed in the response",
                "- Assess depth and accuracy",
                "- Note specific examples or lack thereof",
                "",
            ]
        )

    question_block = ""
    if request.question:
        question_block = "\n".join(
            [
                "## Interview Question",
                request.question,
                "",
            ]
        )

    reference_block = ""
    if request.reference_answer:
        reference_block = "\n".join(
            [
                "## Reference/Model Answer",
                request.reference_answer,
                "",
            ]
        )

    prompt = _render_prompt_template(
        "evaluate_rubric.md",
        {
            "SYSTEM_PROMPT": SYSTEM_PROMPT,
            "RUBRIC_BLOCK": rubric_block,
            "QUESTION_BLOCK": question_block,
            "REFERENCE_BLOCK": reference_block,
            "TRANSCRIPT": request.transcript or "[No transcript available]",
        },
    )

    try:
        result = await chat_completion(
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
        )

        content = result["content"]
        score = 50.0
        feedback = content
        strengths = []
        improvements = []

        import re

        for line in content.split("\n"):
            line = line.strip()
            if line.startswith("SCORE:"):
                try:
                    score_text = line.split("SCORE:")[1].strip()
                    match = re.search(r"(\d+\.?\d*)", score_text)
                    if match:
                        score = float(match.group(1))
                except:
                    pass
            elif line.startswith("FEEDBACK:"):
                feedback = line.split("FEEDBACK:")[1].strip()
            elif line.startswith("STRENGTHS:"):
                strengths = [
                    s.strip()
                    for s in line.split("STRENGTHS:")[1].split(",")
                    if s.strip()
                ]
            elif line.startswith("IMPROVEMENTS:"):
                improvements = [
                    s.strip()
                    for s in line.split("IMPROVEMENTS:")[1].split(",")
                    if s.strip()
                ]

        return EvaluateResponse(
            score=max(0, min(100, score)),
            feedback=feedback,
            strengths=strengths,
            improvements=improvements,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/evaluate", response_model=EvaluateResponse)
async def evaluate(request: EvaluateRequest):
    """
    for the ai video based interivew, pairs of q and reference a and prompt fo a model here
    """
    # evaluation prompt for the llm that will judge
    has_reference = bool(request.reference_answer and request.reference_answer.strip())

    prompt = _render_prompt_template(
        "evaluate_simple.md",
        {
            "QUESTION": request.question or "Interview question",
            "REFERENCE_ANSWER": (
                request.reference_answer
                if has_reference
                else "No reference provided - evaluate based on general quality"
            ),
            "TRANSCRIPT": request.transcript,
        },
    )

    try:
        result = await chat_completion(
            messages=[{"role": "user", "content": prompt}],
        )

        # Parse response (simple parsing for now)
        content = result["content"]
        score = 70.0  # Default
        feedback = content

        if "SCORE:" in content:
            try:
                score_part = content.split("SCORE:")[1].split("|")[0].strip()
                score = float(score_part)
            except:
                pass

        if "FEEDBACK:" in content:
            try:
                feedback = content.split("FEEDBACK:")[1].strip()
            except:
                pass

        return EvaluateResponse(
            score=score,
            feedback=feedback,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Smart Candidate Ranking ───────────────────────────────────────────────────


class SmartRankCandidate(BaseModel):
    """Slim candidate profile for ranking."""

    id: str
    name: str
    skills: list[str] = []
    experience: float = 0
    titles: list[str] = []
    location: str = ""
    degrees: list[str] = []


class SmartRankRequest(BaseModel):
    """Request LLM-based candidate ranking from a natural language query."""

    query: str
    candidates: list[SmartRankCandidate]
    max_candidates: int = 100  # Truncate to avoid token limits


class SmartRankIntent(BaseModel):
    """Detected intent from the recruiter query."""

    skills: list[str] = []
    min_years: int | None = None
    location: str | None = None
    seniority: str | None = None  # junior / mid / senior / lead
    summary: str = ""


class SmartRankResponse(BaseModel):
    """LLM ranking result."""

    ranked_ids: list[str]
    reasoning: dict[str, str]  # candidate_id -> reasoning sentence
    intent: SmartRankIntent
    model: str


@router.post("/smart-rank", response_model=SmartRankResponse)
async def smart_rank(request: SmartRankRequest):
    """
    Rank candidates against a natural language recruiter query using the LLM.

    Sends a compact summary of each candidate to the LLM, asks for ranked
    candidate IDs with per-candidate reasoning and detected query intent.
    Falls back gracefully if the LLM fails or returns malformed output.
    """
    import json, re as _re

    if not request.candidates:
        return SmartRankResponse(
            ranked_ids=[],
            reasoning={},
            intent=SmartRankIntent(summary="No candidates to rank."),
            model="none",
        )

    # Build a compact candidate summary (truncated to max_candidates)
    candidates = request.candidates[: request.max_candidates]

    cand_lines = []
    for c in candidates:
        skills_str = ", ".join(c.skills[:8]) if c.skills else "N/A"
        titles_str = ", ".join(c.titles[:3]) if c.titles else "N/A"
        line = (
            f"ID:{c.id} | {c.name} | {c.experience}yrs | "
            f"Skills:{skills_str} | Titles:{titles_str} | Location:{c.location or 'N/A'}"
        )
        cand_lines.append(line)

    candidates_block = "\n".join(cand_lines)

    prompt = _render_prompt_template(
        "smart_rank.md",
        {
            "QUERY": request.query,
            "CANDIDATES_BLOCK": candidates_block,
        },
    )

    try:
        result = await chat_completion(
            messages=[{"role": "user", "content": prompt}],
        )
        content = result["content"].strip()

        # Strip markdown fences if present
        if content.startswith("```"):
            content = _re.sub(r"^```[a-z]*\n?", "", content)
            content = _re.sub(r"\n?```$", "", content.strip())

        # Extract the first JSON object
        json_match = _re.search(r"\{.*\}", content, _re.DOTALL)
        if not json_match:
            raise ValueError("No JSON object found in LLM response")

        parsed = json.loads(json_match.group())

        ranked_ids = [str(x) for x in parsed.get("ranked_ids", [])]
        reasoning: dict[str, str] = {
            str(k): str(v) for k, v in parsed.get("reasoning", {}).items()
        }

        # Ensure all candidate IDs are present (fill missing with fallback)
        all_ids = {c.id for c in candidates}
        for cid in all_ids:
            if cid not in reasoning:
                reasoning[cid] = "No specific match details available."
        # Append any IDs missing from ranked_ids at the end
        ranked_id_set = set(ranked_ids)
        for cid in [c.id for c in candidates]:
            if cid not in ranked_id_set:
                ranked_ids.append(cid)

        intent_raw = parsed.get("intent", {})
        intent = SmartRankIntent(
            skills=[str(s) for s in intent_raw.get("skills", [])],
            min_years=intent_raw.get("min_years"),
            location=intent_raw.get("location"),
            seniority=intent_raw.get("seniority"),
            summary=str(intent_raw.get("summary", request.query)),
        )

        return SmartRankResponse(
            ranked_ids=ranked_ids,
            reasoning=reasoning,
            intent=intent,
            model=result.get("model", "unknown"),
        )

    except Exception as e:
        # Graceful fallback: return candidates in original order, no reasoning
        fallback_ids = [c.id for c in candidates]
        return SmartRankResponse(
            ranked_ids=fallback_ids,
            reasoning={
                c.id: "AI ranking unavailable — showing original order."
                for c in candidates
            },
            intent=SmartRankIntent(summary=f"Fallback: {str(e)[:80]}"),
            model="fallback",
        )


# ── JD Keyword Extraction ─────────────────────────────────────────────────────


class KeywordExtractRequest(BaseModel):
    """Request keyword extraction from a job description."""

    job_title: str
    job_description: str
    required_skills: list[str] = []
    experience_level: str | None = None


class ExtractedKeywords(BaseModel):
    """Structured keywords grouped by semantic category."""

    technical_skills: list[str] = []  # Python, FastAPI, Docker, SQL
    soft_skills: list[str] = []  # leadership, communication
    domain_keywords: list[str] = []  # fintech, healthcare, machine learning
    experience_keywords: list[str] = []  # senior, 5 years, team lead
    education_keywords: list[str] = []  # BSc, Computer Science, MBA
    seniority_signals: list[str] = []  # principal, staff, lead, manager


class KeywordExtractResponse(BaseModel):
    """Response containing structured JD keywords."""

    keywords: ExtractedKeywords
    model: str


@router.post("/extract-keywords", response_model=KeywordExtractResponse)
async def extract_keywords(request: KeywordExtractRequest):
    """
    Extract structured, categorized keywords from a job description using the LLM.

    The recruiter reviews and edits the returned keywords before they are stored
    on the position. These keywords are then used to compute a keyword_match_score
    for each imported candidate.
    """
    import json, re as _re

    jd_text = (request.job_description or "").strip()
    if len(jd_text) > 3000:
        jd_text = jd_text[:3000] + "\n[JD truncated]"

    required_skills_str = (
        ", ".join(request.required_skills) if request.required_skills else "None listed"
    )
    exp_level = request.experience_level or "Not specified"

    prompt = _render_prompt_template(
        "extract_keywords.md",
        {
            "JOB_TITLE": request.job_title,
            "EXPERIENCE_LEVEL": exp_level,
            "REQUIRED_SKILLS": required_skills_str,
            "JOB_DESCRIPTION": jd_text,
        },
    )

    try:
        result = await chat_completion(
            messages=[{"role": "user", "content": prompt}],
        )
        content = result["content"].strip()

        # Strip markdown fences
        if content.startswith("```"):
            content = _re.sub(r"^```[a-z]*\n?", "", content)
            content = _re.sub(r"\n?```$", "", content.strip())

        json_match = _re.search(r"\{.*\}", content, _re.DOTALL)
        if not json_match:
            raise ValueError("No JSON in LLM response")

        parsed = json.loads(json_match.group())

        def _clean_list(lst: object) -> list[str]:
            if not isinstance(lst, list):
                return []
            return [
                str(x).strip().lower()
                for x in lst
                if isinstance(x, str) and str(x).strip()
            ]

        keywords = ExtractedKeywords(
            technical_skills=_clean_list(parsed.get("technical_skills")),
            soft_skills=_clean_list(parsed.get("soft_skills")),
            domain_keywords=_clean_list(parsed.get("domain_keywords")),
            experience_keywords=_clean_list(parsed.get("experience_keywords")),
            education_keywords=_clean_list(parsed.get("education_keywords")),
            seniority_signals=_clean_list(parsed.get("seniority_signals")),
        )

        # Ensure required_skills are always in technical_skills
        required_lower = {
            s.strip().lower() for s in request.required_skills if s.strip()
        }
        existing_lower = {s.lower() for s in keywords.technical_skills}
        for skill in required_lower - existing_lower:
            keywords.technical_skills.append(skill)

        return KeywordExtractResponse(
            keywords=keywords,
            model=result.get("model", "unknown"),
        )

    except Exception as e:
        # Fallback: build keywords directly from required_skills + job title tokens
        import re as _re2

        fallback_technical = [
            s.strip().lower() for s in request.required_skills if s.strip()
        ]
        title_tokens = [
            t.lower() for t in _re2.findall(r"[a-zA-Z]{3,}", request.job_title)
        ]
        fallback_seniority = [
            t
            for t in title_tokens
            if t in {"senior", "lead", "principal", "staff", "manager", "junior", "mid"}
        ]
        return KeywordExtractResponse(
            keywords=ExtractedKeywords(
                technical_skills=fallback_technical,
                soft_skills=[],
                domain_keywords=[],
                experience_keywords=[],
                education_keywords=[],
                seniority_signals=fallback_seniority,
            ),
            model="fallback",
        )


# ── JD-Based Candidate Ranking ────────────────────────────────────────────────


class JDRankCandidate(BaseModel):
    """Rich candidate profile for JD-based ranking."""

    id: str
    name: str
    skills: list[str] = []
    experience: float = 0
    titles: list[str] = []
    companies: list[str] = []
    degrees: list[str] = []
    universities: list[str] = []
    location: str = ""


class JDRankRequest(BaseModel):
    """Request LLM-based candidate ranking from a job description."""

    job_title: str
    job_description: str
    required_skills: list[str] = []
    experience_level: str | None = None
    years_of_experience: int | None = None
    candidates: list[JDRankCandidate]
    max_candidates: int = 100


class JDRankResponse(BaseModel):
    """JD-based LLM ranking result."""

    ranked_ids: list[str]
    reasoning: dict[str, str]  # candidate_id -> 1-sentence reason
    fit_summary: str  # Short summary of what the LLM looked for
    model: str


@router.post("/jd-rank", response_model=JDRankResponse)
async def jd_rank(request: JDRankRequest):
    """
    Rank candidates against a job description using the LLM.

    Unlike /smart-rank (which uses a free-text recruiter query), this endpoint
    uses the structured job description and required skills stored on the position
    to perform a deep, JD-aware ranking of all candidates.

    Sends a compact CV summary of each candidate alongside the full JD to the LLM
    and asks for a ranked list with per-candidate fit reasoning.
    Falls back gracefully if the LLM fails or returns malformed output.
    """
    import json, re as _re

    if not request.candidates:
        return JDRankResponse(
            ranked_ids=[],
            reasoning={},
            fit_summary="No candidates to rank.",
            model="none",
        )

    candidates = request.candidates[: request.max_candidates]

    # Build compact candidate summaries
    cand_lines = []
    for c in candidates:
        skills_str = ", ".join(c.skills[:10]) if c.skills else "N/A"
        titles_str = ", ".join(c.titles[:3]) if c.titles else "N/A"
        companies_str = ", ".join(c.companies[:3]) if c.companies else "N/A"
        edu_str = ", ".join(c.degrees[:2]) if c.degrees else "N/A"
        line = (
            f"ID:{c.id} | {c.name} | {c.experience}yrs | "
            f"Skills:{skills_str} | Titles:{titles_str} | "
            f"Companies:{companies_str} | Education:{edu_str} | Location:{c.location or 'N/A'}"
        )
        cand_lines.append(line)

    candidates_block = "\n".join(cand_lines)

    # Truncate job description to avoid blowing the context window
    jd_text = (request.job_description or "").strip()
    if len(jd_text) > 3000:
        jd_text = jd_text[:3000] + "\n[JD truncated for length]"

    required_skills_str = (
        ", ".join(request.required_skills)
        if request.required_skills
        else "Not specified"
    )
    exp_level = request.experience_level or "Not specified"
    years_req = (
        f"{request.years_of_experience}+"
        if request.years_of_experience
        else "Not specified"
    )

    prompt = _render_prompt_template(
        "jd_rank.md",
        {
            "JOB_TITLE": request.job_title,
            "EXPERIENCE_LEVEL": exp_level,
            "YEARS_REQUIRED": years_req,
            "REQUIRED_SKILLS": required_skills_str,
            "JOB_DESCRIPTION": jd_text,
            "CANDIDATES_BLOCK": candidates_block,
        },
    )

    # ── helper: robust ranked_ids extractor even if full JSON is malformed ──
    def _extract_ranked_ids_regex(text: str, valid_ids: set[str]) -> list[str]:
        """Pull UUIDs from ranked_ids array even if the rest of the JSON is broken."""
        m = _re.search(r'"ranked_ids"\s*:\s*\[([^\]]*)\]', text, _re.DOTALL)
        if not m:
            return []
        raw = m.group(1)
        found = _re.findall(r'"([^"]+)"', raw)
        # Keep only IDs that belong to the actual candidate set
        return [f for f in found if f in valid_ids]

    def _sanitize_json_strings(text: str) -> str:
        """Replace unescaped colons inside JSON string values with a dash."""

        # Only target values (after a key), not keys themselves or structural colons
        # Replace ": " patterns inside string values (naive but effective for reasoning)
        def _fix_value(m: _re.Match) -> str:
            val = m.group(1)
            # Replace colons that are NOT at the start (structural) with em-dash
            val = val.replace(":", " -")
            return f'"{val}"'

        # Match "key": "value" pairs and sanitize the value
        return _re.sub(r'"([^"\\]*(?:\\.[^"\\]*)*)"', _fix_value, text)

    try:
        result = await chat_completion(
            messages=[{"role": "user", "content": prompt}],
        )
        content = result["content"].strip()

        # Strip markdown fences if present
        if content.startswith("```"):
            content = _re.sub(r"^```[a-z]*\n?", "", content)
            content = _re.sub(r"\n?```$", "", content.strip())

        # Extract the first JSON object
        json_match = _re.search(r"\{.*\}", content, _re.DOTALL)
        if not json_match:
            raise ValueError("No JSON object found in LLM response")

        raw_json = json_match.group()

        # ── Layer 1: try clean parse ──────────────────────────────────────
        parsed = None
        parse_error = None
        try:
            parsed = json.loads(raw_json)
        except json.JSONDecodeError as je:
            parse_error = je
            # ── Layer 2: sanitize string values then retry ─────────────────
            try:
                sanitized = _sanitize_json_strings(raw_json)
                parsed = json.loads(sanitized)
                logger.warning(
                    "jd-rank: used sanitized JSON after initial parse failure"
                )
            except json.JSONDecodeError:
                pass

        all_ids = {c.id for c in candidates}

        if parsed:
            ranked_ids = [
                str(x) for x in parsed.get("ranked_ids", []) if str(x) in all_ids
            ]
            reasoning: dict[str, str] = {
                str(k): str(v)
                for k, v in parsed.get("reasoning", {}).items()
                if str(k) in all_ids
            }
            fit_summary = str(parsed.get("fit_summary", request.job_title))
        else:
            # ── Layer 3: regex extraction of ranked_ids only ───────────────
            logger.warning(
                f"jd-rank: JSON parse failed ({parse_error}), falling back to regex extraction"
            )
            ranked_ids = _extract_ranked_ids_regex(raw_json, all_ids)
            reasoning = {}
            fit_summary = request.job_title

        # Ensure all candidate IDs are present
        for cid in all_ids:
            if cid not in reasoning:
                reasoning[cid] = "No specific match details available."
        ranked_id_set = set(ranked_ids)
        for cid in [c.id for c in candidates]:
            if cid not in ranked_id_set:
                ranked_ids.append(cid)

        return JDRankResponse(
            ranked_ids=ranked_ids,
            reasoning=reasoning,
            fit_summary=fit_summary,
            model=result.get("model", "unknown"),
        )

    except Exception as e:
        # Graceful fallback: return candidates in original order
        fallback_ids = [c.id for c in candidates]
        return JDRankResponse(
            ranked_ids=fallback_ids,
            reasoning={
                c.id: "JD ranking unavailable — showing original order."
                for c in candidates
            },
            fit_summary=f"Fallback: {str(e)[:80]}",
            model="fallback",
        )
