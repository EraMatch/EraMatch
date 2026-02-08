"""
LLM router - endpoints for LLM inference via Ollama Cloud.

Example use case: Interview evaluation (transcript + reference + prompt)
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.ollama import chat_completion

router = APIRouter()


class ChatRequest(BaseModel):
    """Generic chat/prompt request."""
    messages: list[dict]  # [{role: "user", content: "..."}]
    model: str | None = None  # Override default model
    stream: bool = False


class ChatResponse(BaseModel):
    """Chat response."""
    content: str
    model: str


class EvaluateRequest(BaseModel):
    """Evaluate transcript against reference (video interview use case)."""
    transcript: str
    reference_answer: str
    question: str | None = None
    custom_prompt: str | None = None


class EvaluateResponse(BaseModel):
    """Evaluation result."""
    score: float
    feedback: str
    raw_response: str | None = None


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
    for the ai video based interivew, pairs of q and reference a and prompt fo a model here 
    """
    # Build evaluation prompt
    prompt = request.custom_prompt or f"""Evaluate this interview response.

Question: {request.question or 'Interview question'}

Reference Answer (key points):
{request.reference_answer}

Candidate Response:
{request.transcript}

Provide:
1. Score (0-100)
2. Brief feedback (2-3 sentences)

Format: SCORE: [number] | FEEDBACK: [text]"""

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
            raw_response=content,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
