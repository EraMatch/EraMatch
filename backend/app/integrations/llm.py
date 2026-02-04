"""
LLM Providers - LangChain-based wrapper for multiple LLM backends.

Supported providers:
- ollama: Ollama Cloud models (https://ollama.com/blog/cloud-models)
- gemini: Google Gemini via LangChain
- groq: Groq API (placeholder)

Usage:
    from app.integrations.llm import get_llm
    
    llm = get_llm("gemini")  # or "ollama", "groq"
    response = await llm.ainvoke("Hello, world!")
"""

from typing import Literal
from langchain_core.language_models import BaseChatModel

from app.core.config import settings


# =============================================================================
# PROVIDER FACTORY
# =============================================================================

LLMProvider = Literal["ollama", "gemini", "groq", "openai"]


def get_llm(
    provider: LLMProvider = "gemini",
    model: str | None = None,
    temperature: float = 0.7,
) -> BaseChatModel:
    """
    Get LLM instance for the specified provider.
    
    Args:
        provider: LLM provider name
        model: Model name (uses default if not specified)
        temperature: Sampling temperature
        
    Returns:
        LangChain chat model instance
        
    Example:
        llm = get_llm("gemini")
        response = await llm.ainvoke("Summarize this CV...")
    """
    if provider == "ollama":
        return _get_ollama_llm(model, temperature)
    elif provider == "gemini":
        return _get_gemini_llm(model, temperature)
    elif provider == "groq":
        return _get_groq_llm(model, temperature)
    elif provider == "openai":
        return _get_openai_llm(model, temperature)
    else:
        raise ValueError(f"Unknown LLM provider: {provider}")


# =============================================================================
# OLLAMA CLOUD
# =============================================================================

def _get_ollama_llm(model: str | None, temperature: float) -> BaseChatModel:
    """
    Ollama Cloud LLMs.
    
    Models available via Ollama Cloud:
    - deepseek-r1, llama3.3, qwen2.5, etc.
    
    Requires: OLLAMA_API_KEY in .env
    Docs: https://ollama.com/blog/cloud-models
    """
    from langchain_ollama import ChatOllama
    
    return ChatOllama(
        model=model or "llama3.2",
        temperature=temperature,
        base_url=settings.OLLAMA_BASE_URL,
        # api_key loaded from OLLAMA_API_KEY env var automatically
    )


# =============================================================================
# GOOGLE GEMINI
# =============================================================================

def _get_gemini_llm(model: str | None, temperature: float) -> BaseChatModel:
    """
    Google Gemini via LangChain.
    
    Models: gemini-1.5-flash, gemini-1.5-pro, gemini-2.0-flash
    
    Requires: GOOGLE_API_KEY in .env
    """
    from langchain_google_genai import ChatGoogleGenerativeAI
    
    return ChatGoogleGenerativeAI(
        model=model or "gemini-2.0-flash",
        temperature=temperature,
        google_api_key=settings.GOOGLE_API_KEY,
    )


# =============================================================================
# GROQ (Placeholder)
# =============================================================================

def _get_groq_llm(model: str | None, temperature: float) -> BaseChatModel:
    """
    Groq API - Fast inference.
    
    Models: llama-3.3-70b-versatile, mixtral-8x7b-32768
    
    Requires: GROQ_API_KEY in .env
    """
    from langchain_groq import ChatGroq
    
    return ChatGroq(
        model=model or "llama-3.3-70b-versatile",
        temperature=temperature,
        groq_api_key=settings.GROQ_API_KEY,
    )


# =============================================================================
# OPENAI (Placeholder)
# =============================================================================

def _get_openai_llm(model: str | None, temperature: float) -> BaseChatModel:
    """
    OpenAI API.
    
    Models: gpt-4o, gpt-4o-mini
    
    Requires: OPENAI_API_KEY in .env
    """
    from langchain_openai import ChatOpenAI
    
    return ChatOpenAI(
        model=model or "gpt-4o-mini",
        temperature=temperature,
        openai_api_key=settings.OPENAI_API_KEY,
    )
