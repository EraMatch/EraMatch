"""
LLM router - endpoints for LLM inference via Ollama Cloud.

Example use cases: 
- Interview evaluation (transcript + reference + rubric)
- Generic chat/prompt completion
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.ollama import chat_completion

router = APIRouter()

SYSTEM_PROMPT = """You are an expert technical interviewer with years of experience conducting technical interviews at top tech companies.

Your evaluation approach:
- OBJECTIVE: Score based on factual accuracy and technical merit, not style
- CONSTRUCTIVE: Provide actionable, specific feedback
- BALANCED: Acknowledge both strengths and improvement areas
- THOROUGH: Check for depth, completeness, and practical examples

For behavioral questions, look for STAR method (Situation, Task, Action, Result).
For technical questions, verify concepts, check for examples, assess depth."""


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
    prompt_parts = [SYSTEM_PROMPT, ""]
    
    if request.rubric:
        prompt_parts.extend([
            "## Evaluation Rubric (REQUIRED - evaluate strictly against these criteria)",
            request.rubric,
            "",
            "For EACH criterion above:",
            "- Check if addressed in the response",
            "- Assess depth and accuracy",
            "- Note specific examples or lack thereof",
        ])
    
    if request.question:
        prompt_parts.extend([
            "",
            "## Interview Question",
            request.question,
        ])
    
    if request.reference_answer:
        prompt_parts.extend([
            "",
            "## Reference/Model Answer",
            request.reference_answer,
        ])
    
    prompt_parts.extend([
        "",
        "## Candidate's Transcript",
        request.transcript or "[No transcript available]",
        "",
        "## Scoring Scale",
        "90-100: Excellent - All rubric criteria fully addressed with accurate, detailed explanations",
        "70-89: Good - Most criteria addressed well, minor gaps",
        "50-69: Acceptable - Some criteria met, significant gaps or inaccuracies",
        "30-49: Below Average - Few criteria addressed, multiple issues",
        "0-29: Poor - Major misconceptions or criteria not addressed",
        "",
        "## Required Output Format (respond EXACTLY):",
        "SCORE: <number between 0-100>",
        "FEEDBACK: <3-4 sentences with specific examples from the response>",
        "STRENGTHS: <comma-separated points candidate did well>",
        "IMPROVEMENTS: <comma-separated specific suggestions>"
    ])
    
    prompt = "\n".join(prompt_parts)

    try:
        result = await chat_completion(
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt}
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
                    match = re.search(r'(\d+\.?\d*)', score_text)
                    if match:
                        score = float(match.group(1))
                except:
                    pass
            elif line.startswith("FEEDBACK:"):
                feedback = line.split("FEEDBACK:")[1].strip()
            elif line.startswith("STRENGTHS:"):
                strengths = [s.strip() for s in line.split("STRENGTHS:")[1].split(",") if s.strip()]
            elif line.startswith("IMPROVEMENTS:"):
                improvements = [s.strip() for s in line.split("IMPROVEMENTS:")[1].split(",") if s.strip()]
        
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
    
    prompt = f"""You are an expert interview evaluator. Analyze this candidate response.

## Interview Question
{request.question or 'Interview question'}

## Reference Answer (Key Points)
{request.reference_answer if has_reference else 'No reference provided - evaluate based on general quality'}

## Candidate's Transcribed Response
{request.transcript}

## Evaluation Guidelines
1. If this is a FACTUAL/TECHNICAL question with a reference answer:
   - Check if key concepts are covered
   - Allow variations in wording
   - Partial credit for partial answers

2. If this is a BEHAVIORAL/SITUATIONAL question:
   - Look for STAR method (Situation, Task, Action, Result)
   - Evaluate clarity and communication
   - Check relevance to the question

3. Ignore minor speech transcription errors

## Scoring Scale
- 90-100: Excellent - comprehensive, accurate, well-structured
- 70-89: Good - covers main points with minor gaps
- 50-69: Acceptable - partial answer or lacks depth
- 30-49: Below average - misses key points
- 0-29: Poor - irrelevant or incorrect

## Required Output (EXACTLY this format)
SCORE: [number 0-100]
FEEDBACK: [2-3 sentences explaining the score]"""

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
    candidates = request.candidates[:request.max_candidates]

    cand_lines = []
    for c in candidates:
        skills_str = ", ".join(c.skills[:8]) if c.skills else "N/A"
        titles_str = ", ".join(c.titles[:3]) if c.titles else "N/A"
        line = (
            f'ID:{c.id} | {c.name} | {c.experience}yrs | '
            f'Skills:{skills_str} | Titles:{titles_str} | Location:{c.location or "N/A"}'
        )
        cand_lines.append(line)

    candidates_block = "\n".join(cand_lines)

    prompt = f"""You are an AI recruiter assistant. A recruiter is looking for candidates matching this description:

QUERY: "{request.query}"

CANDIDATES (one per line, format: ID:... | Name | Experience | Skills | Titles | Location):
{candidates_block}

TASK:
1. Rank ALL candidates from most to least suitable for the query.
2. For each candidate provide a 1-sentence reason (max 15 words) explaining why they rank there.
3. Detect the recruiter's intent from the query.

Respond ONLY with valid JSON in this exact schema (no markdown fences, no extra text):
{{
  "ranked_ids": ["id1", "id2", ...],
  "reasoning": {{
    "id1": "Strong Python + FastAPI match, 7 years exceeds requirement.",
    "id2": "Some Python skills but missing backend API experience."
  }},
  "intent": {{
    "skills": ["python", "fastapi"],
    "min_years": 5,
    "location": null,
    "seniority": "senior",
    "summary": "Senior Python/FastAPI backend developer with 5+ years"
  }}
}}

RULES:
- ranked_ids must contain EVERY candidate ID exactly once.
- reasoning must contain an entry for EVERY candidate ID.
- If a field cannot be determined from the query, use null.
- Respond with JSON only, nothing else."""

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
            reasoning={c.id: "AI ranking unavailable — showing original order." for c in candidates},
            intent=SmartRankIntent(summary=f"Fallback: {str(e)[:80]}"),
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
    reasoning: dict[str, str]   # candidate_id -> 1-sentence reason
    fit_summary: str             # Short summary of what the LLM looked for
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

    candidates = request.candidates[:request.max_candidates]

    # Build compact candidate summaries
    cand_lines = []
    for c in candidates:
        skills_str = ", ".join(c.skills[:10]) if c.skills else "N/A"
        titles_str = ", ".join(c.titles[:3]) if c.titles else "N/A"
        companies_str = ", ".join(c.companies[:3]) if c.companies else "N/A"
        edu_str = ", ".join(c.degrees[:2]) if c.degrees else "N/A"
        line = (
            f'ID:{c.id} | {c.name} | {c.experience}yrs | '
            f'Skills:{skills_str} | Titles:{titles_str} | '
            f'Companies:{companies_str} | Education:{edu_str} | Location:{c.location or "N/A"}'
        )
        cand_lines.append(line)

    candidates_block = "\n".join(cand_lines)

    # Truncate job description to avoid blowing the context window
    jd_text = (request.job_description or "").strip()
    if len(jd_text) > 3000:
        jd_text = jd_text[:3000] + "\n[JD truncated for length]"

    required_skills_str = ", ".join(request.required_skills) if request.required_skills else "Not specified"
    exp_level = request.experience_level or "Not specified"
    years_req = f"{request.years_of_experience}+" if request.years_of_experience else "Not specified"

    prompt = f"""You are an expert AI recruiter. Your job is to rank candidates by how well their background fits the following job opening.

=== JOB DESCRIPTION ===
Title: {request.job_title}
Experience Level: {exp_level}
Years Required: {years_req}
Required Skills: {required_skills_str}

{jd_text}

=== CANDIDATES (one per line) ===
Format: ID | Name | Experience | Skills | Past Titles | Past Companies | Education | Location
{candidates_block}

=== YOUR TASK ===
1. Read the JD carefully and identify the key requirements (skills, experience level, domain, seniority).
2. Rank ALL candidates from most to least suitable for this specific role.
3. For each candidate, write 1 sentence (max 15 words) explaining why they rank there.
4. Write a single fit_summary sentence describing what you looked for in an ideal candidate.

Respond ONLY with valid JSON in this exact schema (no markdown fences, no extra text):
{{
  "ranked_ids": ["id1", "id2", ...],
  "reasoning": {{
    "id1": "Strong Python + ML match, 6 years aligns with senior requirement.",
    "id2": "Frontend-focused background does not match backend-heavy JD."
  }},
  "fit_summary": "Senior Python backend engineer with ML and cloud experience."
}}

RULES:
- ranked_ids must contain EVERY candidate ID exactly once.
- reasoning must contain an entry for EVERY candidate ID.
- Base ranking purely on JD fit — ignore candidate location unless the JD requires it.
- Respond with JSON only, nothing else."""

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
        fit_summary = str(parsed.get("fit_summary", request.job_title))

        # Ensure all candidate IDs are present
        all_ids = {c.id for c in candidates}
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
            reasoning={c.id: "JD ranking unavailable — showing original order." for c in candidates},
            fit_summary=f"Fallback: {str(e)[:80]}",
            model="fallback",
        )
