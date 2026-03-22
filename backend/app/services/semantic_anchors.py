"""
Semantic Anchor Mapping Service – Era Match v2
Generates and matches embedding vectors for rubric concepts to enable
synonym recognition and semantic flexibility in evaluation.
"""
from typing import Optional
import json
from functools import lru_cache

try:
    from sentence_transformers import SentenceTransformer
    EMBEDDINGS_AVAILABLE = True
except ImportError:
    EMBEDDINGS_AVAILABLE = False


class SemanticAnchorService:
    """
    Pre-calculates embedding vectors for rubric concepts.
    Enables recognition of synonyms and non-standard terminology.
    
    Example:
        "Recursion" concept can be matched against:
        - "function calling itself"
        - "self-referential logic"
        - "call stack pattern"
    """
    
    def __init__(self, model_name: str = "all-MiniLM-L6-v2"):
        """Initialize embedding model."""
        self.model_name = model_name
        self.model = None
        self.anchor_cache = {}
        
        if EMBEDDINGS_AVAILABLE:
            try:
                self.model = SentenceTransformer(model_name)
            except Exception as e:
                print(f"⚠️ Failed to load embedding model: {e}")
    
    def generate_rubric_anchors(self, rubric: dict) -> dict:
        """
        Pre-calculate embeddings for all rubric criteria and key terms.
        
        Args:
            rubric: {
                "criteria": [
                    {
                        "name": "Accuracy",
                        "description": "Answer matches requirements",
                        "key_terms": ["correct", "accurate", "precise"]
                    }
                ]
            }
        
        Returns:
            {
                "criteria_anchors": {
                    "Accuracy": {
                        "description_vector": [...],
                        "key_terms_vectors": {...},
                        "reference_phrases": [...]
                    }
                },
                "metadata": {"model": "all-MiniLM-L6-v2", "dimension": 384}
            }
        """
        if not EMBEDDINGS_AVAILABLE or not self.model:
            return self._fallback_anchors(rubric)
        
        anchors = {"criteria_anchors": {}, "metadata": {}}
        
        for criterion in rubric.get("criteria", []):
            name = criterion.get("name", "Unknown")
            description = criterion.get("description", "")
            key_terms = criterion.get("key_terms", [])
            
            criterion_anchors = {}
            
            # Embed description
            if description:
                criterion_anchors["description_vector"] = self.model.encode(
                    description
                ).tolist()
            
            # Embed key terms
            if key_terms:
                criterion_anchors["key_terms_vectors"] = {
                    term: self.model.encode(term).tolist() 
                    for term in key_terms
                }
            
            # Generate semantic variations
            criterion_anchors["reference_phrases"] = self._generate_synonyms(
                name, key_terms
            )
            
            anchors["criteria_anchors"][name] = criterion_anchors
        
        anchors["metadata"] = {
            "model": self.model_name,
            "dimension": 384 if "MiniLM" in self.model_name else 768
        }
        
        return anchors
    
    def semantic_similarity_score(
        self, 
        candidate_text: str, 
        rubric_criterion: str,
        threshold: float = 0.6
    ) -> tuple[float, bool]:
        """
        Score candidate text against rubric criterion using semantic similarity.
        
        Args:
            candidate_text: What the candidate wrote
            rubric_criterion: The rubric criterion (e.g., "Recursion explained")
            threshold: Similarity threshold (0.0-1.0)
        
        Returns:
            (similarity_score, matches_criterion)
        """
        if not EMBEDDINGS_AVAILABLE or not self.model:
            return (0.0, False)
        
        try:
            candidate_embedding = self.model.encode(candidate_text)
            criterion_embedding = self.model.encode(rubric_criterion)
            
            # Cosine similarity (embedding models already normalized)
            similarity = (candidate_embedding @ criterion_embedding) / (
                (candidate_embedding @ candidate_embedding) ** 0.5 *
                (criterion_embedding @ criterion_embedding) ** 0.5
            )
            
            return (float(similarity), similarity >= threshold)
        except Exception as e:
            print(f"⚠️ Similarity computation failed: {e}")
            return (0.0, False)
    
    def find_semantic_matches(
        self,
        candidate_text: str,
        possible_answers: list[str],
        top_k: int = 3
    ) -> list[tuple[str, float]]:
        """
        Find top-k semantically similar answers from a list.
        
        Args:
            candidate_text: Candidate's response
            possible_answers: List of reference/expected answers
            top_k: Number of matches to return
        
        Returns:
            [(answer, similarity_score), ...] sorted by score
        """
        if not EMBEDDINGS_AVAILABLE or not self.model:
            return []
        
        try:
            candidate_emb = self.model.encode(candidate_text)
            scores = []
            
            for answer in possible_answers:
                answer_emb = self.model.encode(answer)
                similarity = (candidate_emb @ answer_emb) / (
                    (candidate_emb @ candidate_emb) ** 0.5 *
                    (answer_emb @ answer_emb) ** 0.5
                )
                scores.append((answer, float(similarity)))
            
            return sorted(scores, key=lambda x: x[1], reverse=True)[:top_k]
        except Exception:
            return []
    
    @staticmethod
    def _generate_synonyms(concept: str, key_terms: list[str]) -> list[str]:
        """Generate semantic variations for a concept."""
        variations = [concept]
        variations.extend(key_terms)
        
        # Add common paraphrases
        paraphrases = {
            "recursion": ["self-calling", "function calls itself", "call stack"],
            "algorithm": ["step-by-step procedure", "computational method"],
            "optimization": ["improvement", "efficiency gain", "performance boost"],
            "complexity": ["time cost", "computational burden"],
        }
        
        for key, phrases in paraphrases.items():
            if key.lower() in concept.lower():
                variations.extend(phrases)
        
        return list(set(variations))
    
    @staticmethod
    def _fallback_anchors(rubric: dict) -> dict:
        """Fallback when embeddings not available."""
        return {
            "criteria_anchors": {
                criterion.get("name"): {
                    "description_vector": None,
                    "key_terms_vectors": {},
                    "reference_phrases": SemanticAnchorService._generate_synonyms(
                        criterion.get("name", ""),
                        criterion.get("key_terms", [])
                    )
                }
                for criterion in rubric.get("criteria", [])
            },
            "metadata": {"model": "fallback", "dimension": 0}
        }
