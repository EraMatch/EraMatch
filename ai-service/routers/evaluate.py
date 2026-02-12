"""
Evaluation router - LLM scoring of interview responses.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.llm import evaluate_response

router = APIRouter()


class EvaluateRequest(BaseModel):
    """Request body for evaluation."""
    transcript: str
    reference_answer: str | None = None
    question_text: str | None = None
    evaluation_criteria: list[str] | None = None


class EvaluateResponse(BaseModel):
    """Response from evaluation."""
    score: float  # 0-100
    feedback: str
    strengths: list[str]
    improvements: list[str]
    key_points_covered: list[str]


@router.post("/", response_model=EvaluateResponse)
async def evaluate_transcript(request: EvaluateRequest):
    """
    initial tool to evaluate the transcription of video vs reference answer 
    """
    try:
        result = await evaluate_response(
            transcript=request.transcript,
            reference_answer=request.reference_answer,
            question_text=request.question_text,
            criteria=request.evaluation_criteria,
        )
        return EvaluateResponse(
            score=result["score"],
            feedback=result["feedback"],
            strengths=result.get("strengths", []),
            improvements=result.get("improvements", []),
            key_points_covered=result.get("key_points_covered", []),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Evaluation failed: {str(e)}")
