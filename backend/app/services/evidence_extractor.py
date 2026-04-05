"""
Evidence Extraction Service – Era Match v2
Extracts exact quotes and evidence from transcripts/essays during evaluation.
Enforces Pydantic models to guarantee evidence_quote extraction.
"""
from typing import Optional
from pydantic import BaseModel, Field
import re


class EvidenceQuote(BaseModel):
    """A single piece of evidence extracted from source material."""
    quote: str = Field(..., description="Exact text from source")
    source_type: str = Field(
        default="transcript",
        description="Source: transcript, essay, code_output"
    )
    line_number: Optional[int] = Field(default=None, description="Line number in source")
    confidence: float = Field(default=1.0, description="0.0-1.0 extraction confidence")
    context_before: Optional[str] = Field(default=None, description="Text before quote")
    context_after: Optional[str] = Field(default=None, description="Text after quote")


class ScoringJudgment(BaseModel):
    """A scoring judgment with mandatory evidence backing."""
    criterion: str = Field(..., description="Rubric criterion evaluated")
    score: float = Field(..., ge=0, le=1, description="0=fail, 0.5=partial, 1=pass")
    feedback: str = Field(..., description="Explanation of score")
    evidence_quotes: list[EvidenceQuote] = Field(
        ..., 
        min_items=1,
        description="Must extract at least 1 quote from source"
    )
    reasoning: str = Field(
        ...,
        description="Why this score given the evidence"
    )


class EvidenceExtractionService:
    """
    Extracts exact quotes from candidate responses.
    Used to back up every scoring judgment with evidence.
    """
    
    @staticmethod
    def extract_quotes(
        text: str,
        keywords: list[str],
        context_window: int = 50
    ) -> list[EvidenceQuote]:
        """
        Extract quotes containing specific keywords from text.
        
        Args:
            text: Full transcript/essay
            keywords: Terms to find evidence for
            context_window: Characters before/after to include
        
        Returns:
            List of EvidenceQuote objects with exact text
        """
        quotes = []
        text_lower = text.lower()
        
        for keyword in keywords:
            keyword_lower = keyword.lower()
            start_pos = 0
            
            while True:
                pos = text_lower.find(keyword_lower, start_pos)
                if pos == -1:
                    break
                
                # Extract quote with context
                context_start = max(0, pos - context_window)
                context_end = min(len(text), pos + len(keyword) + context_window)
                
                quote_text = text[pos:pos + len(keyword)]
                before_text = text[context_start:pos]
                after_text = text[pos + len(keyword):context_end]
                
                # Calculate line number
                line_number = text[:pos].count('\n') + 1
                
                quotes.append(EvidenceQuote(
                    quote=quote_text,
                    source_type="transcript",
                    line_number=line_number,
                    confidence=1.0,
                    context_before=before_text[-20:] if before_text else None,
                    context_after=after_text[:20] if after_text else None
                ))
                
                start_pos = pos + len(keyword)
        
        return quotes
    
    @staticmethod
    def extract_semantic_quotes(
        text: str,
        semantic_phrases: list[str],
        context_window: int = 100
    ) -> list[EvidenceQuote]:
        """
        Extract quotes for semantic phrases (not exact keyword match).
        Splits text into sentences and finds matching sentences.
        
        Args:
            text: Full transcript
            semantic_phrases: Phrases to find (e.g., "explained recursion")
            context_window: Sentences before/after to include
        
        Returns:
            List of EvidenceQuote objects
        """
        quotes = []
        
        # Split into sentences
        sentences = re.split(r'(?<=[.!?])\s+', text)
        sentence_positions = []
        current_pos = 0
        
        for sentence in sentences:
            sentence_positions.append((sentence, current_pos))
            current_pos += len(sentence) + 1
        
        for phrase in semantic_phrases:
            for i, (sentence, pos) in enumerate(sentence_positions):
                if phrase.lower() in sentence.lower():
                    # Get context
                    context_start = max(0, i - context_window)
                    context_end = min(len(sentences), i + 1 + context_window)
                    
                    context_before = ' '.join(
                        sentences[j] for j in range(context_start, i)
                    )
                    context_after = ' '.join(
                        sentences[j] for j in range(i + 1, context_end)
                    )
                    
                    quotes.append(EvidenceQuote(
                        quote=sentence.strip(),
                        source_type="transcript",
                        line_number=i + 1,
                        context_before=context_before[:50] if context_before else None,
                        context_after=context_after[:50] if context_after else None
                    ))
        
        return quotes
    
    @staticmethod
    def build_judgment_with_evidence(
        criterion: str,
        score: float,
        feedback: str,
        source_text: str,
        keywords: list[str],
        reasoning: str = ""
    ) -> ScoringJudgment:
        """
        Build a complete ScoringJudgment with extracted evidence.
        Enforces that every judgment is backed by quotes.
        
        Args:
            criterion: Rubric criterion
            score: 0.0, 0.5, or 1.0
            feedback: Explanation
            source_text: Transcript/essay to extract from
            keywords: Search terms for evidence
            reasoning: Why this score
        
        Returns:
            ScoringJudgment with evidence_quotes populated
        """
        quotes = EvidenceExtractionService.extract_quotes(
            source_text,
            keywords
        )
        
        # If no exact matches, try semantic
        if not quotes:
            quotes = EvidenceExtractionService.extract_semantic_quotes(
                source_text,
                keywords
            )
        
        # Fallback: extract first 150 chars as evidence
        if not quotes:
            quotes = [
                EvidenceQuote(
                    quote=source_text[:150].strip(),
                    source_type="transcript",
                    confidence=0.3,  # Low confidence fallback
                    context_before=None,
                    context_after=None
                )
            ]
        
        return ScoringJudgment(
            criterion=criterion,
            score=score,
            feedback=feedback,
            evidence_quotes=quotes[:3],  # Max 3 quotes per criterion
            reasoning=reasoning or f"Score {score} based on {len(quotes)} evidence(s)"
        )
