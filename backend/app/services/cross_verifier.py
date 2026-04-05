"""
Cross-Verification Service – Era Match v2
Validates that evidence quotes actually exist in the source material.
Prevents hallucinated evidence and ensures legal defensibility.
"""
from typing import Optional
from pydantic import BaseModel
import difflib


class VerificationResult(BaseModel):
    """Result of cross-verification."""
    is_valid: bool
    verification_confidence: float  # 0.0-1.0
    match_ratio: float  # String similarity 0.0-1.0
    found_in_source: bool
    corrected_quote: Optional[str] = None
    error_message: Optional[str] = None


class CrossVerifierService:
    """
    Cross-verifies that evidence quotes exist in source material.
    Detects hallucinated or misquoted evidence.
    Implements the "Verifier" model from Era Match v2 spec.
    """
    
    @staticmethod
    def verify_quote_exists(
        quote: str,
        source_text: str,
        fuzzy_match: bool = True,
        threshold: float = 0.85
    ) -> VerificationResult:
        """
        Verify that a quote actually exists in the source text.
        
        Args:
            quote: The claimed quote
            source_text: Full source (transcript/essay)
            fuzzy_match: Allow fuzzy matching for minor typos
            threshold: Minimum string similarity for fuzzy match (0.0-1.0)
        
        Returns:
            VerificationResult with validity and confidence
        """
        quote_lower = quote.lower().strip()
        source_lower = source_text.lower()
        
        # 1. Exact match check
        if quote_lower in source_lower:
            return VerificationResult(
                is_valid=True,
                verification_confidence=1.0,
                match_ratio=1.0,
                found_in_source=True
            )
        
        # 2. Fuzzy match check
        if fuzzy_match:
            # Try to find similar substring
            sentences = source_text.split('.')
            best_match = None
            best_ratio = 0.0
            
            for sentence in sentences:
                sentence_lower = sentence.lower().strip()
                ratio = difflib.SequenceMatcher(
                    None,
                    quote_lower,
                    sentence_lower
                ).ratio()
                
                if ratio > best_ratio:
                    best_ratio = ratio
                    best_match = sentence.strip()
            
            if best_ratio >= threshold:
                return VerificationResult(
                    is_valid=True,
                    verification_confidence=best_ratio,
                    match_ratio=best_ratio,
                    found_in_source=True,
                    corrected_quote=best_match if best_ratio < 1.0 else None
                )
        
        # 3. Keyword-based recovery
        keywords = quote_lower.split()[:3]  # First 3 words
        for keyword in keywords:
            if keyword and len(keyword) > 2:  # Skip short words
                if keyword in source_lower:
                    # Partial match - find context
                    idx = source_lower.find(keyword)
                    context_start = max(0, idx - 50)
                    context_end = min(len(source_text), idx + 100)
                    partial_match = source_text[context_start:context_end].strip()
                    
                    return VerificationResult(
                        is_valid=False,
                        verification_confidence=0.4,
                        match_ratio=0.4,
                        found_in_source=False,
                        corrected_quote=partial_match,
                        error_message=f"Quote not found exactly; similar content: '{partial_match}'"
                    )
        
        # 4. Hallucinated evidence detected
        return VerificationResult(
            is_valid=False,
            verification_confidence=0.0,
            match_ratio=0.0,
            found_in_source=False,
            error_message=f"Evidence hallucinated: Quote '{quote[:50]}...' not found in source"
        )
    
    @staticmethod
    def batch_verify_quotes(
        quotes_with_sources: list[tuple[str, str]],
        threshold: float = 0.85
    ) -> list[dict]:
        """
        Verify multiple quotes against their sources.
        
        Args:
            quotes_with_sources: [(quote, source_text), ...]
            threshold: Minimum similarity threshold
        
        Returns:
            List of verification results with quote metadata
        """
        results = []
        
        for quote, source in quotes_with_sources:
            result = CrossVerifierService.verify_quote_exists(
                quote,
                source,
                threshold=threshold
            )
            
            results.append({
                "quote": quote,
                "is_valid": result.is_valid,
                "confidence": result.verification_confidence,
                "match_ratio": result.match_ratio,
                "found": result.found_in_source,
                "corrected": result.corrected_quote,
                "error": result.error_message
            })
        
        return results
    
    @staticmethod
    def get_verification_stats(verification_results: list[dict]) -> dict:
        """
        Get aggregate statistics on verification results.
        Used for detecting patterns of hallucination.
        
        Args:
            verification_results: Output from batch_verify_quotes
        
        Returns:
            {
                "total_quotes": int,
                "valid_quotes": int,
                "hallucinated": int,
                "average_confidence": float,
                "hallucination_rate": float,
                "high_risk_indices": [int]  # Indices of suspicious quotes
            }
        """
        total = len(verification_results)
        valid = sum(1 for r in verification_results if r["is_valid"])
        hallucinated = total - valid
        avg_confidence = sum(r.get("confidence", 0) for r in verification_results) / max(total, 1)
        
        high_risk = [
            i for i, r in enumerate(verification_results)
            if r.get("confidence", 0) < 0.5
        ]
        
        return {
            "total_quotes": total,
            "valid_quotes": valid,
            "hallucinated": hallucinated,
            "average_confidence": avg_confidence,
            "hallucination_rate": hallucinated / max(total, 1),
            "high_risk_indices": high_risk,
            "needs_human_review": hallucinated > 0 or avg_confidence < 0.7
        }
    
    @staticmethod
    def generate_verification_report(
        quotes: list[str],
        source_text: str,
        judgment_id: str
    ) -> dict:
        """
        Generate a verification report for a scoring judgment.
        Produces legally defensible evidence of scoring accuracy.
        
        Args:
            quotes: Evidence quotes from scoring judgment
            source_text: Source material
            judgment_id: ID of the judgment being verified
        
        Returns:
            Verification report with findings
        """
        results = [
            CrossVerifierService.verify_quote_exists(quote, source_text)
            for quote in quotes
        ]
        
        stats = CrossVerifierService.get_verification_stats([
            {
                "is_valid": r.is_valid,
                "confidence": r.verification_confidence,
                "corrected": r.corrected_quote,
                "error": r.error_message
            }
            for r in results
        ])
        
        return {
            "judgment_id": judgment_id,
            "verification_timestamp": None,  # Will be set by caller
            "quote_verifications": [
                {
                    "quote": quote,
                    "valid": result.is_valid,
                    "confidence": result.verification_confidence,
                    "corrected_quote": result.corrected_quote,
                    "error": result.error_message
                }
                for quote, result in zip(quotes, results)
            ],
            "statistics": stats,
            "recommendation": (
                "✅ All quotes verified" if stats["hallucinated"] == 0
                else f"⚠️ {stats['hallucinated']} quote(s) require human review"
            ),
            "legally_defensible": stats["hallucinated"] == 0 and stats["average_confidence"] >= 0.9
        }
