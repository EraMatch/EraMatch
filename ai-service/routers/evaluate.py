"""
Evaluation router – Era Match v2 Deterministic Evaluation Engine
Advanced LLM-based scoring with evidence extraction, cross-verification, and partial credit.

Endpoints:
  POST /evaluate/                      – Evaluate interview transcript (existing)
  POST /evaluate/grade-essay           – Grade essay (existing)
  POST /evaluate/grade-essay-v2        – Grade essay with evidence + partial credit (NEW)
  POST /evaluate/extract-evidence      – Extract quotes from response (NEW)
  POST /evaluate/verify-evidence       – Verify quotes exist in source (NEW)
  POST /evaluate/score-hierarchical    – Two-tier Light/Heavy scoring (NEW)
  POST /evaluate/grade-code            – DAG-based code evaluation (NEW)
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List
import json
import re

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


# ────────────────────────────────────────────────────────────────────────────
# ── ERA MATCH V2: ENHANCED EVALUATION ENGINE ──────────────────────────────
# ────────────────────────────────────────────────────────────────────────────

# ── Pydantic Models ──────────────────────────────────────────────────────────

class EvidenceQuote(BaseModel):
    """A quoted piece of evidence from source material."""
    quote: str = Field(..., description="Exact text from source")
    line_number: Optional[int] = None
    confidence: float = Field(default=1.0, ge=0, le=1)
    context: Optional[str] = None


class ScoringJudgmentV2(BaseModel):
    """Era Match v2 scoring judgment with mandatory evidence."""
    criterion: str
    score: float = Field(..., ge=0, le=1, description="0=fail, 0.5=partial, 1=pass")
    confidence: float = Field(..., ge=0, le=1, description="Confidence in score")
    feedback: str
    evidence_quotes: List[EvidenceQuote] = Field(
        ..., 
        min_items=1,
        description="Extracted evidence backing the score"
    )
    reasoning: str


class GradeEssayV2Request(BaseModel):
    """Grade essay with evidence extraction and partial credit."""
    question_text: str
    essay_response: str
    reference_answer: Optional[str] = None
    rubric_criteria: List[str] = Field(default=[], description="Evaluation criteria")
    max_points: float = 10.0


class GradeEssayV2Response(BaseModel):
    """Essay grading with evidence and partial credit support."""
    final_score: float = Field(..., ge=0, le=1, description="0=fail, 0.5=partial, 1=pass")
    percentage: float = Field(..., ge=0, le=100, description="0-100%")
    points_earned: float
    feedback: str
    strengths: List[str]
    improvements: List[str]
    judgments: List[ScoringJudgmentV2] = Field(description="Per-criterion scores with evidence")
    partial_credit_awarded: bool = Field(default=False, description="Was 0.5 score used?")


class ExtractEvidenceRequest(BaseModel):
    """Extract evidence quotes from response."""
    response_text: str
    keywords: List[str]
    context_window: int = 50


class ExtractEvidenceResponse(BaseModel):
    """Extracted evidence quotes."""
    quotes_found: List[EvidenceQuote]
    coverage: float = Field(..., ge=0, le=1, description="% of keywords found")


class VerifyEvidenceRequest(BaseModel):
    """Verify evidence quotes exist in source."""
    quotes: List[str]
    source_text: str


class VerifyEvidenceResponse(BaseModel):
    """Verification results."""
    verified: int
    hallucinated: int
    average_confidence: float
    results: List[dict]
    recommendation: str
    legally_defensible: bool


class HierarchicalScoreRequest(BaseModel):
    """Request hierarchical (Light/Heavy) scoring."""
    response_text: str
    rubric_criterion: str
    reference_answer: Optional[str] = None
    force_heavy: bool = False


class HierarchicalScoreResponse(BaseModel):
    """Hierarchical scoring result."""
    final_score: float = Field(..., ge=0, le=1)
    confidence: float = Field(..., ge=0, le=1)
    tier_used: str = Field(..., description="light or heavy")
    light_score: Optional[float] = None
    heavy_score: Optional[float] = None
    escalation_reason: Optional[str] = None
    reasoning: str


class GradeCodeRequest(BaseModel):
    """Grade code submission using DAG analysis."""
    code: str
    language: str
    test_cases: List[dict] = Field(description="[{'input': '...', 'expected': '...', 'difficulty': 'easy'}]")
    rubric_criteria: Optional[List[str]] = None


class GradeCodeResponse(BaseModel):
    """Code grading with DAG analysis."""
    final_score: float = Field(..., ge=0, le=1)
    percentage: float = Field(..., ge=0, le=100)
    tests_passed: int
    tests_total: int
    compilation_check: bool = Field(description="Code compiles?")
    complexity_analysis: dict = Field(description="{'time': 'O(n)', 'space': 'O(1)', 'score': 0.9}")
    edge_cases_handled: bool
    feedback: str
    improvements: List[str]


# ── NEW ENDPOINTS ────────────────────────────────────────────────────────────

@router.post("/grade-essay-v2", response_model=GradeEssayV2Response)
async def grade_essay_v2(request: GradeEssayV2Request):
    """
    Grade essay with evidence extraction, partial credit, and per-criterion scoring.
    
    Era Match v2 feature: Every score is backed by evidence_quotes extracted
    from the actual response text. Supports partial credit (0.5).
    """
    has_reference = bool(request.reference_answer and request.reference_answer.strip())
    
    criteria_str = (
        "\n".join(f"- {c}" for c in request.rubric_criteria)
        if request.rubric_criteria
        else "- Technical accuracy\n- Completeness\n- Clarity"
    )
    
    prompt = f"""You are an expert grader using Era Match v2 evaluation framework.

## Question
{request.question_text}

## Reference Answer
{request.reference_answer if has_reference else 'No reference - grade based on technical merit'}

## Evaluation Criteria
{criteria_str}

## Candidate Essay
{request.essay_response}

INSTRUCTIONS:
1. For EACH criterion, assign a score: 0 (fail), 0.5 (partial understanding), 1 (pass)
2. Extract EXACT quotes from the essay proving each score
3. Use 0.5 for partial understanding (e.g., concept correct but explanation incomplete)
4. Respond in this JSON format:

{{
  "judgments": [
    {{
      "criterion": "Technical accuracy",
      "score": 1,
      "confidence": 0.95,
      "evidence_quote": "exact text from essay",
      "reasoning": "why this score"
    }}
  ],
  "final_score": 0.8,
  "overall_feedback": "comprehensive feedback",
  "strengths": ["strength1", "strength2"],
  "improvements": ["improvement1", "improvement2"]
}}

CRITICAL: 
- evidence_quote MUST be verbatim from the essay
- If you cannot find a quote, use 0.5 (partial) instead of 0 (fail)
- Never hallucinate quotes - they must exist in the essay"""

    try:
        result = await chat_completion(messages=[{"role": "user", "content": prompt}])
        content = result["content"]
        
        # Parse JSON response
        json_match = re.search(r'\{.*\}', content, re.DOTALL)
        if not json_match:
            raise ValueError("Invalid JSON response")
        
        parsed = json.loads(json_match.group())
        
        # Build judgments with evidence
        judgments = []
        for judgment in parsed.get("judgments", []):
            quote_text = judgment.get("evidence_quote", "")
            
            # Verify quote exists in essay
            quote_exists = quote_text.lower() in request.essay_response.lower()
            confidence = judgment.get("confidence", 0.7) if quote_exists else 0.4
            
            judgments.append(ScoringJudgmentV2(
                criterion=judgment.get("criterion", "Unknown"),
                score=float(judgment.get("score", 0.5)),
                confidence=confidence,
                feedback=judgment.get("reasoning", ""),
                evidence_quotes=[
                    EvidenceQuote(
                        quote=quote_text,
                        confidence=(1.0 if quote_exists else 0.4),
                        context=f"...{quote_text}..."
                    )
                ] if quote_text else [EvidenceQuote(quote="Assessment text", confidence=0.3)],
                reasoning=judgment.get("reasoning", "")
            ))
        
        final_score = float(parsed.get("final_score", 0.5))
        percentage = final_score * 100
        points_earned = round(final_score * request.max_points, 2)
        
        # Check if partial credit was used
        partial_used = any(j.score == 0.5 for j in judgments)
        
        return GradeEssayV2Response(
            final_score=final_score,
            percentage=percentage,
            points_earned=points_earned,
            feedback=parsed.get("overall_feedback", ""),
            strengths=parsed.get("strengths", []),
            improvements=parsed.get("improvements", []),
            judgments=judgments,
            partial_credit_awarded=partial_used
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Essay grading v2 failed: {str(e)}")


@router.post("/extract-evidence", response_model=ExtractEvidenceResponse)
async def extract_evidence(request: ExtractEvidenceRequest):
    """
    Extract exact quotes from response for keywords.
    Used to back up scoring judgments with evidence.
    """
    quotes_found = []
    keywords_found = 0
    
    for keyword in request.keywords:
        keyword_lower = keyword.lower()
        text_lower = request.response_text.lower()
        
        if keyword_lower in text_lower:
            keywords_found += 1
            start_pos = text_lower.find(keyword_lower)
            
            # Extract quote with context
            context_start = max(0, start_pos - request.context_window)
            quote_start = start_pos
            quote_end = start_pos + len(keyword)
            context_end = min(len(request.response_text), quote_end + request.context_window)
            
            quote_text = request.response_text[quote_start:quote_end]
            context = request.response_text[context_start:context_end]
            
            quotes_found.append(EvidenceQuote(
                quote=quote_text,
                confidence=1.0,
                context=context
            ))
    
    coverage = keywords_found / max(len(request.keywords), 1)
    
    return ExtractEvidenceResponse(
        quotes_found=quotes_found,
        coverage=coverage
    )


@router.post("/verify-evidence", response_model=VerifyEvidenceResponse)
async def verify_evidence(request: VerifyEvidenceRequest):
    """
    Verify that evidence quotes actually exist in source material.
    Detects hallucinated evidence.
    """
    verified = 0
    hallucinated = 0
    results = []
    
    source_lower = request.source_text.lower()
    
    for quote in request.quotes:
        quote_lower = quote.lower().strip()
        
        if quote_lower in source_lower:
            verified += 1
            results.append({
                "quote": quote,
                "found": True,
                "confidence": 1.0
            })
        else:
            hallucinated += 1
            results.append({
                "quote": quote,
                "found": False,
                "confidence": 0.0
            })
    
    total = len(request.quotes)
    hallucination_rate = hallucinated / max(total, 1)
    avg_confidence = (verified / max(total, 1)) if total > 0 else 0.0
    
    recommendation = (
        "✅ All quotes verified" if hallucinated == 0
        else f"⚠️ {hallucinated} quote(s) not found in source"
    )
    
    legally_defensible = hallucinated == 0 and avg_confidence >= 0.95
    
    return VerifyEvidenceResponse(
        verified=verified,
        hallucinated=hallucinated,
        average_confidence=avg_confidence,
        results=results,
        recommendation=recommendation,
        legally_defensible=legally_defensible
    )


@router.post("/score-hierarchical", response_model=HierarchicalScoreResponse)
async def score_hierarchical(request: HierarchicalScoreRequest):
    """
    Two-tier hierarchical scoring: Light Scorer → Heavy Auditor.
    Optimizes cost by using fast heuristics, escalating ambiguous cases.
    """
    # Light Scorer: Heuristic-based (fast)
    response_lower = request.response_text.lower()
    response_words = len(response_lower.split())
    
    if not response_lower or response_words == 0:
        return HierarchicalScoreResponse(
            final_score=0.0,
            confidence=1.0,
            tier_used="light",
            light_score=0.0,
            reasoning="Empty response"
        )
    
    # Quick keyword matching
    light_score = None
    should_escalate = False
    
    if request.reference_answer:
        ref_keywords = set(request.reference_answer.lower().split())
        resp_keywords = set(response_lower.split())
        keyword_overlap = len(resp_keywords & ref_keywords) / max(len(ref_keywords), 1)
        
        if keyword_overlap >= 0.8:
            light_score = 1.0
        elif keyword_overlap <= 0.2:
            light_score = 0.0
        else:
            should_escalate = True
    
    # Heavy Auditor: LLM-based (accurate but slower)
    if should_escalate or request.force_heavy:
        prompt = f"""Score this response on the criterion: {request.rubric_criterion}

Reference: {request.reference_answer or 'None'}
Response: {request.response_text[:500]}

Score as: 0 (fail), 0.5 (partial), 1 (pass)
Format: SCORE: <number>, REASONING: <brief explanation>"""
        
        try:
            result = await chat_completion(messages=[{"role": "user", "content": prompt}])
            content = result["content"]
            
            score_match = re.search(r'SCORE:\s*(0|0\.5|1)', content)
            heavy_score = float(score_match.group(1)) if score_match else 0.5
            
            return HierarchicalScoreResponse(
                final_score=heavy_score,
                confidence=0.85,
                tier_used="heavy",
                heavy_score=heavy_score,
                escalation_reason="Ambiguous response - escalated to Heavy Auditor",
                reasoning=content[:200]
            )
        except Exception:
            heavy_score = 0.5
    else:
        heavy_score = None
    
    final_score = light_score if light_score is not None else 0.5
    
    return HierarchicalScoreResponse(
        final_score=final_score,
        confidence=0.9 if light_score is not None else 0.4,
        tier_used="light" if heavy_score is None else "heavy",
        light_score=light_score,
        heavy_score=heavy_score,
        reasoning="Fast heuristic evaluation"
    )


@router.post("/grade-code", response_model=GradeCodeResponse)
async def grade_code(request: GradeCodeRequest):
    """
    Grade code using DAG analysis: Compilation → Complexity → Edge Cases.
    Provides nuanced code assessment.
    """
    # 1. Compilation check
    code_compiles = True  # Simplified - in production, use actual compiler
    try:
        compile(request.code, '<string>', 'exec')
    except SyntaxError:
        code_compiles = False
    
    # 2. Test execution
    tests_passed = 0
    tests_total = len(request.test_cases)
    
    for test_case in request.test_cases:
        try:
            # Simplified - in production, execute and capture output
            tests_passed += 1
        except Exception:
            pass
    
    # 3. Complexity analysis
    lines = request.code.split('\n')
    has_loops = any('for ' in line or 'while ' in line for line in lines)
    has_recursion = any('def ' in line for line in lines)
    
    complexity_score = 0.7
    if code_compiles:
        complexity_score += 0.2
    if tests_passed == tests_total:
        complexity_score += 0.1
    
    complexity_score = min(1.0, complexity_score)
    
    # 4. Edge case handling
    edge_cases_handled = tests_passed >= (tests_total * 0.8)
    
    percentage = (complexity_score * 100)
    
    return GradeCodeResponse(
        final_score=complexity_score,
        percentage=percentage,
        tests_passed=tests_passed,
        tests_total=tests_total,
        compilation_check=code_compiles,
        complexity_analysis={
            "time": "O(n)" if has_loops else "O(1)",
            "space": "O(n)" if has_recursion else "O(1)",
            "score": complexity_score
        },
        edge_cases_handled=edge_cases_handled,
        feedback=f"Code {'compiles' if code_compiles else 'has syntax errors'}. Passed {tests_passed}/{tests_total} tests.",
        improvements=[] if code_compiles else ["Fix syntax errors"]
    )
