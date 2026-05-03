"""
Role-based LLM provider chain with automatic fallback.

Each role (interviewer, judge, helper, rubric_builder) has a primary,
secondary, and tertiary provider configured via environment variables.
If the primary fails (rate limit, timeout, error), the system
automatically tries the secondary, then the tertiary.

Usage:
    from app.services.live_interview.providers import call_with_fallback

    result = await call_with_fallback(
        role="rubric_builder",
        messages=[{"role": "user", "content": "Generate dimensions..."}],
    )
    print(result.content)
"""

import logging
from typing import Any

from pydantic import BaseModel
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage

from app.core.config import settings
from app.integrations.llm import get_llm, LLMProvider

logger = logging.getLogger(__name__)


# =============================================================================
# RESPONSE MODEL
# =============================================================================

class LLMResponse(BaseModel):
    """Standardized response from any LLM provider."""
    content: str
    model: str
    provider: str
    usage: dict | None = None


# =============================================================================
# EXCEPTIONS
# =============================================================================

class ProviderError(Exception):
    """A single provider failed."""
    def __init__(self, provider: str, model: str, original_error: Exception):
        self.provider = provider
        self.model = model
        self.original_error = original_error
        super().__init__(f"{provider}/{model}: {original_error}")


class AllProvidersFailedError(Exception):
    """All providers in the chain failed."""
    def __init__(self, role: str, last_error: Exception | None):
        self.role = role
        self.last_error = last_error
        super().__init__(
            f"All providers failed for role '{role}'. "
            f"Last error: {last_error}"
        )


# =============================================================================
# ROLE CONFIGURATION
# =============================================================================

# Maps role names to their env var prefixes
ROLE_PREFIXES = {
    "interviewer": "INTERVIEWER",
    "judge": "JUDGE",
    "helper": "HELPER",
    "rubric_builder": "RUBRIC_BUILDER",
}

# Provider tiers in order
TIERS = ["PRIMARY", "SECONDARY", "TERTIARY"]


def _get_setting(prefix: str, tier: str, suffix: str) -> str:
    """Read a provider setting from the Settings object."""
    attr_name = f"{prefix}_{tier}_{suffix}"
    return getattr(settings, attr_name, "")


def get_provider_chain(role: str) -> list[dict[str, str]]:
    """
    Returns the provider chain for a role as a list of
    [{"provider": "gemini", "model": "gemini-2.5-flash-lite"}, ...].
    
    Only includes tiers where both provider and model are set.
    """
    prefix = ROLE_PREFIXES.get(role)
    if not prefix:
        raise ValueError(
            f"Unknown role '{role}'. Valid roles: {list(ROLE_PREFIXES.keys())}"
        )
    
    chain = []
    for tier in TIERS:
        provider = _get_setting(prefix, tier, "PROVIDER")
        model = _get_setting(prefix, tier, "MODEL")
        if provider and model:
            chain.append({"provider": provider, "model": model, "tier": tier})
    
    if not chain:
        raise ValueError(
            f"No providers configured for role '{role}'. "
            f"Set {prefix}_PRIMARY_PROVIDER and {prefix}_PRIMARY_MODEL in .env"
        )
    
    return chain


# =============================================================================
# CORE FUNCTION
# =============================================================================

def _convert_messages(messages: list[dict[str, str]]) -> list:
    """Convert dict messages to LangChain message objects."""
    lc_messages = []
    for msg in messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if role == "system":
            lc_messages.append(SystemMessage(content=content))
        elif role == "assistant":
            lc_messages.append(AIMessage(content=content))
        else:
            lc_messages.append(HumanMessage(content=content))
    return lc_messages


async def call_with_fallback(
    role: str,
    messages: list[dict[str, str]],
    temperature: float = 0.7,
    **kwargs: Any,
) -> LLMResponse:
    """
    Try providers in order until one succeeds.
    
    Args:
        role: One of "interviewer", "judge", "helper", "rubric_builder"
        messages: List of {"role": "system"|"user"|"assistant", "content": "..."}
        temperature: Sampling temperature
        **kwargs: Additional kwargs passed to the LLM
        
    Returns:
        LLMResponse with content, model, provider
        
    Raises:
        AllProvidersFailedError: If all providers in the chain fail
    """
    chain = get_provider_chain(role)
    lc_messages = _convert_messages(messages)
    last_error: Exception | None = None
    
    for entry in chain:
        provider_name = entry["provider"]
        model_name = entry["model"]
        tier = entry["tier"]
        
        try:
            llm = get_llm(
                provider=provider_name,  # type: ignore
                model=model_name,
                temperature=temperature,
            )
            response = await llm.ainvoke(lc_messages, **kwargs)
            
            content = response.content if hasattr(response, "content") else str(response)
            
            logger.info(
                f"[{role}] {tier} succeeded: {provider_name}/{model_name}"
            )
            
            return LLMResponse(
                content=content,
                model=model_name,
                provider=provider_name,
                usage=response.response_metadata.get("usage_metadata")
                if hasattr(response, "response_metadata") and response.response_metadata
                else None,
            )
            
        except Exception as e:
            last_error = e
            logger.warning(
                f"[{role}] {tier} failed ({provider_name}/{model_name}): {e}"
            )
            continue
    
    raise AllProvidersFailedError(role, last_error)


# =============================================================================
# CONVENIENCE FUNCTIONS
# =============================================================================

async def call_interviewer(messages: list[dict], **kwargs) -> LLMResponse:
    """Call LLM with interviewer role settings."""
    return await call_with_fallback("interviewer", messages, **kwargs)


async def call_judge(messages: list[dict], **kwargs) -> LLMResponse:
    """Call LLM with judge role settings (lower temperature for consistency)."""
    return await call_with_fallback("judge", messages, temperature=0.3, **kwargs)


async def call_helper(messages: list[dict], **kwargs) -> LLMResponse:
    """Call LLM with helper role settings."""
    return await call_with_fallback("helper", messages, **kwargs)


async def call_rubric_builder(messages: list[dict], **kwargs) -> LLMResponse:
    """Call LLM with rubric builder role settings."""
    return await call_with_fallback("rubric_builder", messages, temperature=0.5, **kwargs)
