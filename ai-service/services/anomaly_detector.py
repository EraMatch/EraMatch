"""
Anomaly Detection & HITL Router – Era Match v2
Detects statistical anomalies in rubric performance.
Routes high-uncertainty answers to human recruiters.
"""
from typing import List, Dict, Optional
from dataclasses import dataclass
from enum import Enum
import statistics


class RouteType(str, Enum):
    """Where to route an answer."""
    AUTO_APPROVED = "auto_approved"
    AUTO_REJECTED = "auto_rejected"
    HUMAN_REVIEW = "human_review"
    QUALITY_FLAG = "quality_flag"


@dataclass
class AnomalyFlag:
    """Anomaly detection flag."""
    flag_type: str  # "high_failure_rate", "low_confidence", "unusual_score_pattern"
    severity: str   # "low", "medium", "high"
    message: str
    confidence: float


@dataclass
class RoutingDecision:
    """Routing decision for an answer."""
    answer_id: str
    route: RouteType
    confidence: float
    anomalies: List[AnomalyFlag]
    assigned_to: Optional[str] = None  # Recruiter username if human review
    reasoning: str = ""


class AnomalyDetector:
    """
    Detects statistical anomalies in rubric scoring.
    Identifies:
    - Rubrics with anomalous failure rates (e.g., 100% failure on criterion X)
    - Answers with unusually low confidence
    - Score distributions that don't match historical patterns
    """
    
    # Thresholds
    ANOMALY_FAILURE_RATE = 0.9  # Flag if >90% fail a criterion
    LOW_CONFIDENCE_THRESHOLD = 0.5
    SCORE_OUTLIER_THRESHOLD = 2.0  # Standard deviations from mean
    
    @staticmethod
    def analyze_rubric_performance(
        criterion_name: str,
        scores: List[float],
        failures: List[Dict]
    ) -> Optional[AnomalyFlag]:
        """
        Detect if a rubric criterion has anomalous failure rate.
        
        Args:
            criterion_name: Criterion being evaluated
            scores: All scores for this criterion [0.0, 0.5, 1.0, ...]
            failures: Responses that failed this criterion
        
        Returns:
            AnomalyFlag if anomaly detected, else None
        """
        total = len(scores)
        if total == 0:
            return None
        
        failure_count = len(failures)
        failure_rate = failure_count / total
        
        if failure_rate > AnomalyDetector.ANOMALY_FAILURE_RATE:
            return AnomalyFlag(
                flag_type="high_failure_rate",
                severity="high",
                message=f"Criterion '{criterion_name}' has {failure_rate*100:.1f}% failure rate (>90%). May indicate flawed rubric.",
                confidence=0.95
            )
        
        return None
    
    @staticmethod
    def detect_outlier_score(
        score: float,
        historical_scores: List[float]
    ) -> Optional[AnomalyFlag]:
        """
        Detect if a score is a statistical outlier.
        
        Args:
            score: The score to check
            historical_scores: Historical scores for comparison
        
        Returns:
            AnomalyFlag if outlier, else None
        """
        if len(historical_scores) < 3:
            return None
        
        mean = statistics.mean(historical_scores)
        stdev = statistics.stdev(historical_scores)
        
        if stdev == 0:
            return None
        
        z_score = abs((score - mean) / stdev)
        
        if z_score > AnomalyDetector.SCORE_OUTLIER_THRESHOLD:
            return AnomalyFlag(
                flag_type="score_outlier",
                severity="medium",
                message=f"Score {score} is {z_score:.1f} standard deviations from mean ({mean:.2f}). Unusual.",
                confidence=0.8
            )
        
        return None
    
    @staticmethod
    def detect_low_confidence_answer(
        confidence_scores: List[float],
        average_confidence: float
    ) -> Optional[AnomalyFlag]:
        """
        Detect if answer scoring has unusually low confidence.
        
        Args:
            confidence_scores: Per-criterion confidence [0.0-1.0, ...]
            average_confidence: Average across all criteria
        
        Returns:
            AnomalyFlag if low confidence detected
        """
        if average_confidence < AnomalyDetector.LOW_CONFIDENCE_THRESHOLD:
            return AnomalyFlag(
                flag_type="low_confidence",
                severity="medium",
                message=f"Scoring confidence is only {average_confidence*100:.1f}%. Model uncertainty high.",
                confidence=0.9
            )
        
        return None
    
    @staticmethod
    def detect_confidence_disagreement(
        model_a_score: float,
        model_b_score: float,
        threshold: float = 0.3
    ) -> Optional[AnomalyFlag]:
        """
        Detect disagreement between two models
        (e.g., Light vs Heavy scorer).
        
        Args:
            model_a_score: First model's score
            model_b_score: Second model's score
            threshold: Score difference threshold
        
        Returns:
            AnomalyFlag if disagreement
        """
        diff = abs(model_a_score - model_b_score)
        
        if diff > threshold:
            return AnomalyFlag(
                flag_type="model_disagreement",
                severity="high",
                message=f"Model disagreement: Score {model_a_score} vs {model_b_score}. Needs human judgment.",
                confidence=0.85
            )
        
        return None


class HITLRouter:
    """
    Human-in-the-Loop (HITL) routing.
    Determines when to escalate answers to human recruiters.
    """
    
    # Routing rules
    MIN_CONFIDENCE_FOR_AUTO = 0.75  # Must have 75%+ confidence to auto-approve/reject
    ESCALATION_SCORE_RANGE = (0.3, 0.7)  # Escalate if score is ambiguous
    
    @staticmethod
    def route_answer(
        answer_id: str,
        score: float,
        confidence: float,
        anomalies: Optional[List[AnomalyFlag]] = None,
        force_human: bool = False
    ) -> RoutingDecision:
        """
        Determine routing for an answer.
        
        Args:
            answer_id: ID of the answer
            score: Evaluation score (0.0-1.0)
            confidence: Confidence in score (0.0-1.0)
            anomalies: Detected anomalies
            force_human: Force human review regardless
        
        Returns:
            RoutingDecision with route and reasoning
        """
        if force_human:
            return RoutingDecision(
                answer_id=answer_id,
                route=RouteType.HUMAN_REVIEW,
                confidence=confidence,
                anomalies=anomalies if anomalies else [],
                reasoning="Forced human review by system"
            )
        
        anomalies = anomalies if anomalies else []
        
        # Check for high-severity anomalies
        high_severity_anomalies = [a for a in anomalies if a.severity == "high"]
        if high_severity_anomalies:
            return RoutingDecision(
                answer_id=answer_id,
                route=RouteType.HUMAN_REVIEW,
                confidence=confidence,
                anomalies=anomalies,
                reasoning=f"Anomaly detected: {high_severity_anomalies[0].message}"
            )
        
        # Check confidence threshold
        if confidence < HITLRouter.MIN_CONFIDENCE_FOR_AUTO:
            return RoutingDecision(
                answer_id=answer_id,
                route=RouteType.HUMAN_REVIEW,
                confidence=confidence,
                anomalies=anomalies,
                reasoning=f"Low confidence ({confidence*100:.1f}%) requires human review"
            )
        
        # Check if score is ambiguous
        score_min, score_max = HITLRouter.ESCALATION_SCORE_RANGE
        if score_min < score < score_max and confidence < 0.85:
            return RoutingDecision(
                answer_id=answer_id,
                route=RouteType.HUMAN_REVIEW,
                confidence=confidence,
                anomalies=anomalies,
                reasoning=f"Borderline score ({score}) with moderate confidence"
            )
        
        # Auto-approve (clear pass)
        if score >= 0.95 and confidence >= 0.9:
            return RoutingDecision(
                answer_id=answer_id,
                route=RouteType.AUTO_APPROVED,
                confidence=confidence,
                anomalies=anomalies,
                reasoning="Clear pass with high confidence"
            )
        
        # Auto-reject (clear fail)
        if score <= 0.05 and confidence >= 0.9:
            return RoutingDecision(
                answer_id=answer_id,
                route=RouteType.AUTO_REJECTED,
                confidence=confidence,
                anomalies=anomalies,
                reasoning="Clear fail with high confidence"
            )
        
        # Default: Human review for borderline
        return RoutingDecision(
            answer_id=answer_id,
            route=RouteType.HUMAN_REVIEW,
            confidence=confidence,
            anomalies=anomalies,
            reasoning="Borderline assessment - requires human judgment"
        )
    
    @staticmethod
    def batch_route(
        answers: List[Dict]
    ) -> List[RoutingDecision]:
        """
        Route multiple answers.
        
        Args:
            answers: [{'id': '...', 'score': 0.75, 'confidence': 0.8, 'anomalies': [...]}, ...]
        
        Returns:
            List of RoutingDecision objects
        """
        decisions = []
        
        for answer in answers:
            decision = HITLRouter.route_answer(
                answer_id=answer.get('id', ''),
                score=answer.get('score', 0.5),
                confidence=answer.get('confidence', 0.5),
                anomalies=answer.get('anomalies', [])
            )
            decisions.append(decision)
        
        return decisions
    
    @staticmethod
    def get_routing_statistics(decisions: List[RoutingDecision]) -> dict:
        """
        Get aggregate statistics on routing decisions.
        """
        total = len(decisions)
        
        auto_approved = sum(1 for d in decisions if d.route == RouteType.AUTO_APPROVED)
        auto_rejected = sum(1 for d in decisions if d.route == RouteType.AUTO_REJECTED)
        human_reviews = sum(1 for d in decisions if d.route == RouteType.HUMAN_REVIEW)
        quality_flags = sum(1 for d in decisions if d.route == RouteType.QUALITY_FLAG)
        
        avg_confidence = sum(d.confidence for d in decisions) / max(total, 1)
        
        with_anomalies = sum(1 for d in decisions if len(d.anomalies) > 0)
        
        return {
            "total_routed": total,
            "auto_approved": auto_approved,
            "auto_rejected": auto_rejected,
            "human_review": human_reviews,
            "quality_flags": quality_flags,
            "automation_rate": (auto_approved + auto_rejected) / max(total, 1),
            "human_review_rate": human_reviews / max(total, 1),
            "average_confidence": avg_confidence,
            "answers_with_anomalies": with_anomalies
        }
