"""
AI/ML Integrations for EraMatch.

This package contains clients for external AI services:
- llm: LLM providers (Ollama Cloud, Gemini, Groq, etc.)
- embeddings: Text embedding models
- models: Local ML models
"""

from app.integrations.llm import get_llm
from app.integrations.embeddings import get_embeddings

__all__ = ["get_llm", "get_embeddings"]
