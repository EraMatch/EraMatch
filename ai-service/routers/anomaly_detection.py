"""
Anomaly Detection Router – Era Match v2
Endpoints for rubric anomaly detection and HITL routing.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional
from services.anomaly_detector import AnomalyDetector, HITLRouter, RouteType, AnomalyFlag

router = APIRouter()


# ── Pydantic Models ──────────────────────────────────────────────────────────

class AnalyzeRubricRequest(BaseModel):
    """Request to analyze rubric performance."""
    criterion_name: str
    scores: List[float] = Field(..., description="All scores for this criterion")
    failures: List[dict] = Field(default=[], description="Failed responses")


class AnalyzeRubricResponse(BaseModel):
    """Result of rubric analysis."""
    criterion: str
    total_responses: int
    failure_count: int
    failure_rate: float
    has_anomaly: bool
    anomaly: Optional[dict] = None
    recommendation: str


class DetectOutlierRequest(BaseModel):
    """Request to detect score outlier."""
    score: float = Field(..., ge=0, le=1)
    historical_scores: List[float] = Field(..., description="Historical scores")


class DetectOutlierResponse(BaseModel):
    """Outlier detection result."""
    is_outlier: bool
    z_score: float
    mean: float
    std_dev: float
    anomaly: Optional[dict] = None


class RouteAnswerRequest(BaseModel):
    """Request to route an answer."""
    answer_id: str
    score: float = Field(..., ge=0, le=1)
    confidence: float = Field(..., ge=0, le=1)
    anomalies: Optional[List[dict]] = None
    force_human: bool = False


class RouteAnswerResponse(BaseModel):
    """Routing decision."""
    answer_id: str
    route: str = Field(..., description="auto_approved, auto_rejected, human_review")
    confidence: float
    anomalies: List[dict] = Field(default=[])
    reasoning: str


class BatchRouteRequest(BaseModel):
    """Request to route multiple answers."""
    answers: List[dict] = Field(..., description="[{'id': '...', 'score': 0.8, 'confidence': 0.9}, ...]")


class BatchRouteResponse(BaseModel):
    """Batch routing results."""
    total_routed: int
    decisions: List[dict]
    statistics: dict = Field(description="Routing statistics")


# ── ENDPOINTS ────────────────────────────────────────────────────────────────

@router.post("/analyze-rubric", response_model=AnalyzeRubricResponse)
async def analyze_rubric(request: AnalyzeRubricRequest):
    """
    Analyze a rubric criterion for performance anomalies.
    Detects if criterion has unusually high failure rate (>90%).
    """
    total = len(request.scores)
    failure_count = len(request.failures)
    failure_rate = failure_count / max(total, 1)
    
    anomaly = AnomalyDetector.analyze_rubric_performance(
        request.criterion_name,
        request.scores,
        request.failures
    )
    
    has_anomaly = anomaly is not None
    
    recommendation = (
        "✅ Normal performance" if not has_anomaly
        else "⚠️ Review rubric criteria - may be too strict or unclear"
    )
    
    return AnalyzeRubricResponse(
        criterion=request.criterion_name,
        total_responses=total,
        failure_count=failure_count,
        failure_rate=failure_rate,
        has_anomaly=has_anomaly,
        anomaly=anomaly.to_dict() if anomaly else None,
        recommendation=recommendation
    )


@router.post("/detect-outlier", response_model=DetectOutlierResponse)
async def detect_outlier(request: DetectOutlierRequest):
    """
    Detect if a score is a statistical outlier.
    """
    import statistics
    
    if len(request.historical_scores) < 2:
        return DetectOutlierResponse(
            is_outlier=False,
            z_score=0.0,
            mean=request.score,
            std_dev=0.0
        )
    
    mean = statistics.mean(request.historical_scores)
    stdev = statistics.stdev(request.historical_scores) if len(request.historical_scores) > 1 else 0
    
    if stdev == 0:
        return DetectOutlierResponse(
            is_outlier=False,
            z_score=0.0,
            mean=mean,
            std_dev=0.0
        )
    
    z_score = abs((request.score - mean) / stdev)
    
    anomaly = AnomalyDetector.detect_outlier_score(
        request.score,
        request.historical_scores
    )
    
    is_outlier = anomaly is not None
    
    return DetectOutlierResponse(
        is_outlier=is_outlier,
        z_score=z_score,
        mean=mean,
        std_dev=stdev,
        anomaly=anomaly.to_dict() if anomaly else None
    )


@router.post("/route-answer", response_model=RouteAnswerResponse)
async def route_answer(request: RouteAnswerRequest):
    """
    Route a single answer to auto-approval, auto-rejection, or human review.
    
    Routing logic:
    - Auto-approved: High confidence + clear pass
    - Auto-rejected: High confidence + clear fail
    - Human review: Low confidence, ambiguous, or anomalies detected
    """
    # Convert anomaly dicts to AnomalyFlag objects
    anomalies = []
    if request.anomalies:
        for anom in request.anomalies:
            anomalies.append(AnomalyFlag(
                flag_type=anom.get('flag_type', 'unknown'),
                severity=anom.get('severity', 'low'),
                message=anom.get('message', ''),
                confidence=anom.get('confidence', 0.5)
            ))
    
    decision = HITLRouter.route_answer(
        answer_id=request.answer_id,
        score=request.score,
        confidence=request.confidence,
        anomalies=anomalies,
        force_human=request.force_human
    )
    
    return RouteAnswerResponse(
        answer_id=decision.answer_id,
        route=decision.route.value,
        confidence=decision.confidence,
        anomalies=[
            {
                "type": a.flag_type,
                "severity": a.severity,
                "message": a.message,
                "confidence": a.confidence
            }
            for a in decision.anomalies
        ],
        reasoning=decision.reasoning
    )


@router.post("/batch-route", response_model=BatchRouteResponse)
async def batch_route(request: BatchRouteRequest):
    """
    Route multiple answers in batch.
    Returns routing decisions and statistics.
    """
    decisions = HITLRouter.batch_route(request.answers)
    
    stats = HITLRouter.get_routing_statistics(decisions)
    
    decision_dicts = [
        {
            "answer_id": d.answer_id,
            "route": d.route.value,
            "confidence": d.confidence,
            "reasoning": d.reasoning,
            "anomalies": len(d.anomalies)
        }
        for d in decisions
    ]
    
    return BatchRouteResponse(
        total_routed=len(decisions),
        decisions=decision_dicts,
        statistics=stats
    )


@router.get("/routing-patterns")
async def get_routing_patterns():
    """
    Get routing patterns and historical statistics.
    Used for dashboard insights.
    """
    return {
        "auto_approve_threshold": {"confidence": 0.9, "score_range": [0.95, 1.0]},
        "human_review_threshold": {"confidence": 0.75, "score_range": [0.3, 0.7]},
        "auto_reject_threshold": {"confidence": 0.9, "score_range": [0.0, 0.05]},
        "anomaly_flags": {
            "high_failure_rate": {
                "description": "Rubric criterion has >90% failure rate",
                "severity": "high"
            },
            "low_confidence": {
                "description": "Scoring confidence <50%",
                "severity": "medium"
            },
            "score_outlier": {
                "description": "Score is >2 std dev from mean",
                "severity": "medium"
            },
            "model_disagreement": {
                "description": "Two models disagree on score by >0.3",
                "severity": "high"
            }
        }
    }
