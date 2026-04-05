"""
Hierarchical Scoring Service – Era Match v2
Two-tier evaluation: Light Scorer (fast, basic) → Heavy Auditor (precise, expensive).
Routes complex cases to DeepEval/QAG for maximum accuracy and cost optimization.
"""
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


class ScoringTier(str, Enum):
    """Scoring complexity tier."""
    LIGHT = "light"      # Basic scoring - likely 0 or 1
    HEAVY = "heavy"      # Complex scoring - nuanced or controversial


class LightScorerResult(BaseModel):
    """Result from Light Scorer (fast pass/fail determination)."""
    score: float = Field(..., ge=0, le=1)
    confidence: float = Field(..., ge=0, le=1, description="0.0-1.0 confidence")
    needs_escalation: bool = Field(..., description="Escalate to Heavy Auditor?")
    escalation_reason: Optional[str] = None
    processing_time_ms: float = Field(default=0)


class HeavyScorerResult(BaseModel):
    """Result from Heavy Auditor (precise, nuanced scoring)."""
    score: float = Field(..., ge=0, le=1)
    confidence: float = Field(..., ge=0, le=1)
    reasoning: str
    evaluation_method: str = Field(default="deepeval_qag")
    processing_time_ms: float = Field(default=0)


class HierarchicalScoringResult(BaseModel):
    """Final result from hierarchical pipeline."""
    final_score: float = Field(..., ge=0, le=1)
    final_confidence: float = Field(..., ge=0, le=1)
    tier_used: ScoringTier
    light_result: Optional[LightScorerResult]
    heavy_result: Optional[HeavyScorerResult]
    total_processing_time_ms: float
    cost_optimized: bool


class HierarchicalScoringService:
    """
    Routes evaluation through tiers based on complexity.
    Optimizes cost by using Light Scorer for obvious answers.
    Escalates ambiguous cases to Heavy Auditor (DeepEval).
    """
    
    # Light Scorer thresholds
    ESCALATION_CONFIDENCE_THRESHOLD = 0.65  # Escalate if confidence < 65%
    ESCALATION_SCORE_RANGE = (0.3, 0.7)     # Escalate if 0.3 < score < 0.7
    
    @staticmethod
    def light_score(
        response_text: str,
        rubric_criterion: str,
        reference_answer: Optional[str] = None
    ) -> LightScorerResult:
        """
        Fast, heuristic-based scoring.
        Returns high confidence for obvious answers (0 or 1).
        Flags ambiguous cases for escalation.
        
        Args:
            response_text: Candidate's answer
            rubric_criterion: What we're evaluating
            reference_answer: Expected answer (if available)
        
        Returns:
            LightScorerResult with score and escalation flag
        """
        import time
        start_time = time.time()
        
        # Heuristic 1: Length baseline
        response_lower = response_text.lower().strip()
        response_words = len(response_lower.split())
        criterion_lower = rubric_criterion.lower()
        
        # Empty response = fail
        if not response_lower or response_words == 0:
            return LightScorerResult(
                score=0.0,
                confidence=1.0,
                needs_escalation=False,
                processing_time_ms=time.time() - start_time
            )
        
        # Heuristic 2: Keyword matching
        if reference_answer:
            reference_lower = reference_answer.lower()
            reference_keywords = set(reference_lower.split())
            response_keywords = set(response_lower.split())
            
            # Calculate overlap
            overlap = len(response_keywords & reference_keywords)
            total = len(reference_keywords)
            keyword_match_ratio = overlap / max(total, 1)
            
            # High match confidence
            if keyword_match_ratio >= 0.8:
                return LightScorerResult(
                    score=1.0,
                    confidence=0.95,
                    needs_escalation=False,
                    processing_time_ms=time.time() - start_time
                )
            
            # Low match confidence
            if keyword_match_ratio <= 0.2:
                return LightScorerResult(
                    score=0.0,
                    confidence=0.9,
                    needs_escalation=False,
                    processing_time_ms=time.time() - start_time
                )
        
        # Heuristic 3: Length heuristic for essays
        if response_words < 5:
            return LightScorerResult(
                score=0.0,
                confidence=0.85,
                needs_escalation=False,
                processing_time_ms=time.time() - start_time
            )
        
        # Middle cases require escalation
        return LightScorerResult(
            score=0.5,
            confidence=0.4,
            needs_escalation=True,
            escalation_reason="Ambiguous answer - requires Heavy Auditor",
            processing_time_ms=time.time() - start_time
        )
    
    @staticmethod
    def should_escalate(light_result: LightScorerResult) -> bool:
        """Determine if result should escalate to Heavy Auditor."""
        if light_result.needs_escalation:
            return True
        
        if light_result.confidence < HierarchicalScoringService.ESCALATION_CONFIDENCE_THRESHOLD:
            return True
        
        score_min, score_max = HierarchicalScoringService.ESCALATION_SCORE_RANGE
        if score_min < light_result.score < score_max:
            return True
        
        return False
    
    @staticmethod
    def heavy_score_simulation(
        response_text: str,
        rubric_criterion: str,
        reference_answer: Optional[str] = None,
        evaluation_context: Optional[dict] = None
    ) -> HeavyScorerResult:
        """
        Simulated Heavy Auditor (DeepEval-style evaluation).
        In production, this would call DeepEval QAG library.
        
        Args:
            response_text: Candidate's answer
            rubric_criterion: Evaluation criterion
            reference_answer: Expected answer
            evaluation_context: Additional context (difficulty, importance, etc.)
        
        Returns:
            HeavyScorerResult with nuanced scoring
        """
        import time
        start_time = time.time()
        
        # TODO: Replace with actual DeepEval calls:
        # from deepeval.metrics import AnswerRelevancy, Faithfulness
        # answer_relevancy = AnswerRelevancy(threshold=0.7).measure(...)
        # faithfulness = Faithfulness(threshold=0.7).measure(...)
        
        response_lower = response_text.lower()
        criterion_lower = rubric_criterion.lower()
        
        # Semantic analysis (simplified)
        semantic_score = len(set(response_lower.split()) & set(criterion_lower.split())) / max(
            len(set(criterion_lower.split())), 1
        )
        
        # Length appropriateness
        word_count = len(response_text.split())
        length_score = min(1.0, word_count / 50)  # Good length = 50+ words
        
        # Combined score with nuance
        base_score = (semantic_score * 0.6) + (length_score * 0.4)
        
        # Apply partial credit for partial understanding
        if 0.3 <= base_score < 0.7:
            final_score = 0.5  # Partial credit
            confidence = 0.75
        elif base_score >= 0.7:
            final_score = 1.0
            confidence = 0.9
        else:
            final_score = 0.0
            confidence = 0.85
        
        return HeavyScorerResult(
            score=final_score,
            confidence=confidence,
            reasoning=f"Semantic match: {semantic_score:.1%}, Length: {length_score:.1%}",
            evaluation_method="deepeval_qag",
            processing_time_ms=time.time() - start_time
        )
    
    @staticmethod
    async def score_hierarchical(
        response_text: str,
        rubric_criterion: str,
        reference_answer: Optional[str] = None,
        always_escalate: bool = False
    ) -> HierarchicalScoringResult:
        """
        Main hierarchical scoring pipeline.
        Light → Heavy (if needed) → Final score
        
        Args:
            response_text: Candidate's answer
            rubric_criterion: Evaluation criterion
            reference_answer: Expected answer
            always_escalate: Force escalation for testing
        
        Returns:
            Final hierarchical scoring result
        """
        import time
        start_time = time.time()
        
        # Step 1: Light Scorer
        light_result = HierarchicalScoringService.light_score(
            response_text,
            rubric_criterion,
            reference_answer
        )
        
        # Step 2: Determine escalation
        should_escalate = (
            always_escalate or 
            HierarchicalScoringService.should_escalate(light_result)
        )
        
        # Step 3: Heavy Auditor (if needed)
        if should_escalate:
            heavy_result = HierarchicalScoringService.heavy_score_simulation(
                response_text,
                rubric_criterion,
                reference_answer
            )
            final_score = heavy_result.score
            final_confidence = heavy_result.confidence
            tier_used = ScoringTier.HEAVY
        else:
            heavy_result = None
            final_score = light_result.score
            final_confidence = light_result.confidence
            tier_used = ScoringTier.LIGHT
        
        total_time = (time.time() - start_time) * 1000  # Convert to ms
        
        return HierarchicalScoringResult(
            final_score=final_score,
            final_confidence=final_confidence,
            tier_used=tier_used,
            light_result=light_result,
            heavy_result=heavy_result,
            total_processing_time_ms=total_time,
            cost_optimized=not should_escalate  # Light = cheaper
        )
    
    @staticmethod
    def get_scoring_statistics(results: list[HierarchicalScoringResult]) -> dict:
        """
        Get aggregate statistics on hierarchical scoring.
        
        Returns:
            {
                "total_scored": int,
                "light_only": int,
                "escalated_to_heavy": int,
                "escalation_rate": float,
                "average_confidence": float,
                "cost_savings_percentage": float (% that avoided heavy scoring)
            }
        """
        total = len(results)
        escalated = sum(1 for r in results if r.tier_used == ScoringTier.HEAVY)
        
        return {
            "total_scored": total,
            "light_only": total - escalated,
            "escalated_to_heavy": escalated,
            "escalation_rate": escalated / max(total, 1),
            "average_confidence": sum(r.final_confidence for r in results) / max(total, 1),
            "cost_savings_percentage": ((total - escalated) / max(total, 1)) * 100
        }
