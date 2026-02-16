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
            raw_response=content,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
