import os
import asyncio
from ollama import Client
from config import settings

_ollama_semaphore = None

def get_ollama_semaphore() -> asyncio.Semaphore:
    """Lazy initializing semaphore to ensure it attaches to the right event loop."""
    global _ollama_semaphore
    if _ollama_semaphore is None:
        _ollama_semaphore = asyncio.Semaphore(settings.OLLAMA_MAX_CONCURRENT_CALLS)
    return _ollama_semaphore

def get_client() -> Client:
    """Get configured Ollama client (cloud or local)."""
    headers = None
    if settings.OLLAMA_API_KEY:
        headers = {"Authorization": f"Bearer {settings.OLLAMA_API_KEY}"}
    return Client(host=settings.OLLAMA_HOST, headers=headers)


async def chat_completion(  
    messages: list[dict],
    model: str | None = None,
    stream: bool = False,
    response_format: str | dict | None = None,
    timeout_seconds: float | None = None,
) -> dict:
    """
    Send chat completion request to Ollama Cloud llm with concurrency limits
    
    Args:
        messages: List of message dicts [{role: "user", content: "..."}]
        model: Model to use (default from settings)
        stream: Whether to stream response
        
    Returns:
        dict with content and model
    """
    client = get_client()
    model_name = model or settings.OLLAMA_MODEL
    
    chat_kwargs = {
        "model": model_name,
        "messages": messages,
        "stream": stream,
    }
    if response_format is not None:
        chat_kwargs["format"] = response_format

    async def _run_chat() -> dict:
        if stream:
            def _stream_call() -> dict:
                full_content = ""
                for part in client.chat(**chat_kwargs):
                    full_content += part["message"]["content"]
                return {"content": full_content, "model": model_name}

            return await asyncio.to_thread(_stream_call)

        response = await asyncio.to_thread(client.chat, **chat_kwargs)
        return {
            "content": response["message"]["content"],
            "model": model_name,
        }

    semaphore = get_ollama_semaphore()

    async def _run_with_semaphore():
        async with semaphore:
            return await _run_chat()

    if timeout_seconds and timeout_seconds > 0:
        return await asyncio.wait_for(_run_with_semaphore(), timeout=timeout_seconds)
    return await _run_with_semaphore()

