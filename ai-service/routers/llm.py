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
            raw_response=content,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
