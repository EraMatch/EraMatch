"""
Evaluation router – LLM-based scoring of candidate responses.

Endpoints:
  POST /evaluate/            – Evaluate an interview transcript
  POST /evaluate/grade-essay – Grade an essay answer vs reference
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.ollama import chat_completion

router = APIRouter()

SYSTEM_PROMPT = """You are an expert technical interviewer and assessment evaluator with years of experience conducting technical interviews and evaluating candidate responses.

Your evaluations are:
- OBJECTIVE: Score based on factual accuracy and relevance, not opinion
- CONSTRUCTIVE: Provide actionable feedback that helps candidates improve
- BALANCED: Acknowledge strengths AND areas for growth
- SPECIFIC: Give concrete examples rather than generic statements

For technical questions:
- Verify key technical concepts are explained correctly
- Check for practical examples and real-world application
- Look for depth vs surface-level answers
- Evaluate problem-solving approach, not just correctness

Be fair, consistent, and focused on helping identify truly qualified candidates."""

# ── Video Interview Transcript Evaluation ─────────────────────────────────

class EvaluateRequest(BaseModel):
    transcript: str
    reference_answer: str | None = None
    question_text: str | None = None
    rubric: str | None = None
    evaluation_criteria: list[str] | None = None


class EvaluateResponse(BaseModel):
    score: float
    feedback: str
    strengths: list[str]
    improvements: list[str]
    key_points_covered: list[str]


@router.post("/", response_model=EvaluateResponse)
async def evaluate_transcript(request: EvaluateRequest):
    """Evaluate an interview transcript with rubric guidance."""
    
    prompt_parts = [
        SYSTEM_PROMPT,
        "",
        "## Interview Question",
        request.question_text or "Interview question",
        "",
    ]
    
    if request.rubric:
        prompt_parts.extend([
            "## Evaluation Rubric (REQUIRED)",
            "You MUST evaluate based on these criteria:",
            request.rubric,
            "",
        ])
    
    if request.reference_answer:
        prompt_parts.extend([
            "## Reference/Model Answer",
            "Compare the candidate's response to this ideal answer:",
            request.reference_answer,
            "",
        ])
    
    prompt_parts.extend([
        "## Candidate's Transcript",
        request.transcript,
        "",
        "## Evaluation Instructions",
        "1. Score 0-100 based on how well the candidate addresses the rubric criteria",
        "2. Focus on technical accuracy, completeness, and clarity",
        "3. Check if key concepts from the rubric are covered",
        "4. Provide specific examples in your feedback",
        "",
        "## Scoring Scale",
        "90-100: Excellent - Fully addresses all rubric criteria with accurate, detailed explanations",
        "70-89: Good - Addresses most criteria well, minor gaps or shallow areas",
        "50-69: Acceptable - Addresses some criteria, significant gaps or inaccuracies",
        "30-49: Below Average - Few criteria addressed, multiple inaccuracies",
        "0-29: Poor - Does not address criteria or contains major misconceptions",
        "",
        "## Required Response Format (respond EXACTLY):",
        "SCORE: <number between 0-100>",
        "FEEDBACK: <3-4 sentences with specific examples from the response>",
        "STRENGTHS: <what the candidate did well, specific points>",
        "IMPROVEMENTS: <what could be improved, specific suggestions>",
        "KEY_POINTS: <main technical concepts demonstrated>"
    ])

    prompt = "\n".join(prompt_parts)

    try:
        result = await chat_completion(messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt}
        ])
        content = result["content"]

        score = 50.0
        feedback = content
        strengths = []
        improvements = []
        key_points = []

        for line in content.split("\n"):
            line = line.strip()
            if line.startswith("SCORE:"):
                try:
                    score = float(line.split("SCORE:")[1].strip().split()[0])
                except Exception:
                    pass
            elif line.startswith("FEEDBACK:"):
                feedback = line.split("FEEDBACK:")[1].strip()
            elif line.startswith("STRENGTHS:"):
                strengths = [s.strip() for s in line.split("STRENGTHS:")[1].split(",") if s.strip()]
            elif line.startswith("IMPROVEMENTS:"):
                improvements = [s.strip() for s in line.split("IMPROVEMENTS:")[1].split(",") if s.strip()]
            elif line.startswith("KEY_POINTS:"):
                key_points = [s.strip() for s in line.split("KEY_POINTS:")[1].split(",") if s.strip()]

        return EvaluateResponse(
            score=max(0, min(100, score)),
            feedback=feedback,
            strengths=strengths,
            improvements=improvements,
            key_points_covered=key_points,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Evaluation failed: {str(e)}")


# ── Essay Assessment Grading ───────────────────────────────────────────────

class GradeEssayRequest(BaseModel):
    question_text: str
    essay_response: str
    reference_answer: str | None = None
    rubric: str | None = None
    max_points: float = 10.0


class GradeEssayResponse(BaseModel):
    score: float
    points_earned: float
    feedback: str
    strengths: list[str]
    improvements: list[str]


@router.post("/grade-essay", response_model=GradeEssayResponse)
async def grade_essay(request: GradeEssayRequest):
    """
    Grade a candidate's essay answer with rubric-based evaluation.
    
    Uses rubric for structured, consistent grading across all essays.
    """
    
    prompt_parts = [
        SYSTEM_PROMPT,
        "",
        "## Technical Assessment Essay Question",
        request.question_text,
        "",
    ]
    
    if request.rubric:
        prompt_parts.extend([
            "## Rubric-Based Evaluation Criteria (MANDATORY)",
            "You MUST evaluate the essay strictly against these criteria:",
            request.rubric,
            "",
            "For each criterion in the rubric:",
            "- Check if it is addressed in the essay",
            "- Assess depth and accuracy of coverage",
            "- Note specific examples or lack thereof",
        ])
    
    if request.reference_answer:
        prompt_parts.extend([
            "",
            "## Reference Model Answer",
            "Compare essay quality against this ideal response:",
            request.reference_answer,
        ])
    
    prompt_parts.extend([
        "",
        "## Candidate's Essay Response",
        request.essay_response,
        "",
        "## Grading Instructions",
        f"Score out of {request.max_points} points (will be converted to 0-100 scale)",
        "",
        "Evaluate:",
        "1. Technical accuracy - Are facts and concepts correct?",
        "2. Completeness - Are all rubric criteria addressed?",
        "3. Clarity - Is the explanation clear and organized?",
        "4. Depth - Does it show genuine understanding vs memorization?",
        "5. Examples - Are real-world examples provided?",
        "",
        "## Required Response Format:",
        f"SCORE: <percentage 0-100>",
        "FEEDBACK: <4-5 sentences evaluating against rubric criteria with specific examples>",
        "STRENGTHS: <comma-separated points where essay excelled>",
        "IMPROVEMENTS: <comma-separated suggestions for improvement>"
    ])

    prompt = "\n".join(prompt_parts)

    try:
        result = await chat_completion(messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt}
        ])
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
                    # Handle formats like "65", "65/100", "65.0", "65.0/100", "65 (83%)"
                    match = re.search(r'(\d+\.?\d*)', score_text)
                    if match:
                        score = float(match.group(1))
                except Exception:
                    pass
            elif line.startswith("FEEDBACK:"):
                feedback = line.split("FEEDBACK:")[1].strip()
            elif line.startswith("STRENGTHS:"):
                strengths = [s.strip() for s in line.split("STRENGTHS:")[1].split(",") if s.strip()]
            elif line.startswith("IMPROVEMENTS:"):
                improvements = [s.strip() for s in line.split("IMPROVEMENTS:")[1].split(",") if s.strip()]

        score = max(0.0, min(100.0, score))
        points_earned = round(score / 100.0 * request.max_points, 2)

        return GradeEssayResponse(
            score=score,
            points_earned=points_earned,
            feedback=feedback,
            strengths=strengths,
            improvements=improvements,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Essay grading failed: {str(e)}")
