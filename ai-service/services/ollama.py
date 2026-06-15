import asyncio
import logging
from ollama import Client, ResponseError
from config import settings

logger = logging.getLogger(__name__)

# Asyncio semaphore to limit concurrent Ollama calls cooperatively (avoids thread-blocking timeout issues)
_ollama_semaphore = None


def get_ollama_semaphore() -> asyncio.Semaphore:
    """Lazy initializing semaphore to ensure it attaches to the right event loop."""
    global _ollama_semaphore
    if _ollama_semaphore is None:
        _ollama_semaphore = asyncio.Semaphore(settings.OLLAMA_MAX_CONCURRENT_CALLS)
    return _ollama_semaphore


def get_client(host: str | None = None, timeout: float | None = None) -> Client:
    """Get configured Ollama client (cloud or local)."""
    target_host = host or settings.OLLAMA_HOST
    headers = None
    # Only attach API key for cloud host
    if settings.OLLAMA_API_KEY and target_host == settings.OLLAMA_HOST:
        headers = {"Authorization": f"Bearer {settings.OLLAMA_API_KEY}"}
    return Client(host=target_host, headers=headers, timeout=timeout)


async def chat_completion(
    messages: list[dict],
    model: str | None = None,
    stream: bool = False,
    response_format: str | dict | None = None,
    timeout_seconds: float | None = None,
    host: str | None = None,
) -> dict:
    """
    Send chat completion request to Ollama (cloud or local) with concurrency limits.

    Args:
        messages: List of message dicts [{role: "user", content: "..."}]
        model: Model to use (default from settings)
        stream: Whether to stream response
        host: Override Ollama host (e.g. settings.OLLAMA_LOCAL_HOST for local models)

    Returns:
        dict with content and model
    """
    model_name = model or settings.OLLAMA_MODEL
    effective_host = host or settings.OLLAMA_HOST
    logger.debug("[Ollama] chat_completion — model=%s host=%s stream=%s", model_name, effective_host, stream)

    chat_kwargs = {
        "model": model_name,
        "messages": messages,
        "stream": stream,
        "options": {"num_ctx": 8192, "num_predict": 8192},
    }
    if response_format is not None:
        chat_kwargs["format"] = response_format

    async def _run_chat() -> dict:
        client = get_client(host=host, timeout=timeout_seconds)
        max_retries = 5
        base_delay = 1.0

        for attempt in range(max_retries):
            try:
                if stream:

                    def _stream_call() -> dict:
                        full_content = ""
                        for part in client.chat(**chat_kwargs):
                            full_content += part["message"]["content"]
                        return {"content": full_content, "model": model_name}

                    return await asyncio.to_thread(_stream_call)

                def _sync_call() -> dict:
                    return client.chat(**chat_kwargs)

                response = await asyncio.to_thread(_sync_call)
                return {
                    "content": response["message"]["content"],
                    "model": model_name,
                }
            except ResponseError as e:
                logger.error(
                    "[Ollama] ResponseError — model=%s host=%s status=%s body=%s",
                    model_name, effective_host, e.status_code, str(e)[:300],
                )
                if e.status_code == 429 and attempt < max_retries - 1:
                    delay = base_delay * (2**attempt)
                    logger.warning(
                        "[Ollama] Rate limit (429). Retrying in %.1fs (attempt %d/%d)...",
                        delay, attempt + 1, max_retries - 1,
                    )
                    await asyncio.sleep(delay)
                else:
                    raise
            except Exception as e:
                logger.error(
                    "[Ollama] Exception — model=%s host=%s type=%s msg=%s",
                    model_name, effective_host, type(e).__name__, str(e)[:300],
                )
                if "429" in str(e) and attempt < max_retries - 1:
                    delay = base_delay * (2**attempt)
                    logger.warning(
                        "[Ollama] Rate limit (429). Retrying in %.1fs (attempt %d/%d)...",
                        delay, attempt + 1, max_retries - 1,
                    )
                    await asyncio.sleep(delay)
                else:
                    raise

    semaphore = get_ollama_semaphore()

    async def _run_with_semaphore():
        async with semaphore:
            return await _run_chat()

    return await _run_with_semaphore()
