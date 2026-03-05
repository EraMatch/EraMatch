"""
Evaluation router – LLM-based scoring of candidate responses.

Endpoints:
  POST /evaluate/          – Evaluate an interview transcript   (existing)
  POST /evaluate/grade-essay – Grade an essay answer vs reference (NEW)
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.ollama import chat_completion

router = APIRouter()


# ── Existing: Transcript evaluation ──────────────────────────────────────────

class EvaluateRequest(BaseModel):
    """Request body for transcript evaluation."""
    transcript: str
    reference_answer: str | None = None
    question_text: str | None = None
    evaluation_criteria: list[str] | None = None


class EvaluateResponse(BaseModel):
    """Response from transcript evaluation."""
    score: float        # 0-100
    feedback: str
    strengths: list[str]
    improvements: list[str]
    key_points_covered: list[str]


@router.post("/", response_model=EvaluateResponse)
async def evaluate_transcript(request: EvaluateRequest):
    """Evaluate an interview transcript against a reference answer."""
    has_reference = bool(request.reference_answer and request.reference_answer.strip())

    prompt = f"""You are an expert interview evaluator.

## Question
{request.question_text or 'Interview question'}

## Reference Answer
{request.reference_answer if has_reference else 'No reference – evaluate on general quality'}

## Candidate Transcript
{request.transcript}

## Scoring Scale
90-100 Excellent | 70-89 Good | 50-69 Acceptable | 30-49 Below average | 0-29 Poor

Respond EXACTLY in this format (no extra text):
SCORE: <number 0-100>
FEEDBACK: <2-3 sentences>
STRENGTHS: <comma-separated list>
IMPROVEMENTS: <comma-separated list>
KEY_POINTS: <comma-separated list>"""

    try:
        result = await chat_completion(messages=[{"role": "user", "content": prompt}])
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


# ── NEW: Essay grading for assessments ───────────────────────────────────────

class GradeEssayRequest(BaseModel):
    """Grade an essay answer for the assessment module."""
    question_text: str
    essay_response: str
    reference_answer: str | None = None
    max_points: float = 10.0


class GradeEssayResponse(BaseModel):
    """Result of essay grading."""
    score: float            # 0-100 percentage
    points_earned: float    # Scaled to max_points
    feedback: str
    strengths: list[str]
    improvements: list[str]


@router.post("/grade-essay", response_model=GradeEssayResponse)
async def grade_essay(request: GradeEssayRequest):
    """
    Grade a candidate's essay answer against a reference answer using LLM.
    Returns a score (0–100) plus qualitative feedback.
    Called by the main backend during assessment submission.
    """
    has_reference = bool(request.reference_answer and request.reference_answer.strip())

    prompt = f"""You are an expert technical assessment grader. Grade the following essay answer.

## Question
{request.question_text}

## Reference / Model Answer
{request.reference_answer if has_reference else 'No reference provided – grade based on technical accuracy, completeness, and clarity.'}

## Candidate's Answer
{request.essay_response}

## Grading Criteria
1. Technical accuracy and correctness
2. Completeness – are key concepts covered?
3. Clarity and coherence of explanation
4. Depth of understanding demonstrated

## Scoring Scale
90-100 Excellent | 70-89 Good | 50-69 Acceptable | 30-49 Below average | 0-29 Poor

Respond EXACTLY in this format (no extra text):
SCORE: <number 0-100>
FEEDBACK: <2-3 sentences explaining the score>
STRENGTHS: <comma-separated list>
IMPROVEMENTS: <comma-separated list>"""

    try:
        result = await chat_completion(messages=[{"role": "user", "content": prompt}])
        content = result["content"]

        score = 50.0
        feedback = content
        strengths = []
        improvements = []

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
