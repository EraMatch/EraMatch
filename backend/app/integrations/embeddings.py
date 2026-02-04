"""
Embedding Models - LangChain-based wrapper for text embeddings. """

from typing import Literal
from langchain_core.embeddings import Embeddings
from app.core.config import settings
from langchain_ollama import OllamaEmbeddings
from langchain_google_genai import GoogleGenerativeAIEmbeddings




EmbeddingProvider = Literal["gemini", "openai", "ollama"]


def get_embeddings(
    provider: EmbeddingProvider = "gemini",
    model: str | None = None,
) -> Embeddings:
    """
    Get embedding model instance for the specified provider.
    
    Args:
        provider: Embedding provider name
        model: Model name (uses default if not specified)
        
    Returns:
        LangChain embeddings instance
        
    Example:
        embedder = get_embeddings("gemini")
        vector = await embedder.aembed_query("Software Engineer with Python")
    """
    if provider == "gemini":
        return _get_gemini_embeddings(model)
    elif provider == "openai":
        return _get_openai_embeddings(model)
    elif provider == "ollama":
        return _get_ollama_embeddings(model)
    else:
        raise ValueError(f"Unknown embedding provider: {provider}")

# =============================================



''' ----------- gemini embeddings --------------'''

def _get_gemini_embeddings(model: str | None) -> Embeddings:
    """
    Google text embeddings.
    
    Models: text-embedding-004, embedding-001
    
    Requires: GOOGLE_API_KEY in .env
    """

    
    return GoogleGenerativeAIEmbeddings(
        model=model or "models/text-embedding-004",
        google_api_key=settings.GOOGLE_API_KEY,
    )


# =============================================================================





def _get_ollama_embeddings(model: str | None) -> Embeddings:

    
    return OllamaEmbeddings(
        model=model or "nomic-embed-text",
        base_url=settings.OLLAMA_BASE_URL,
    )
