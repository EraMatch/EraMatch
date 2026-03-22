import os
from ollama import Client
from config import settings


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
) -> dict:
    """
    Send chat completion request to Ollama Cloud llm 
    
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

    if stream:
        # Streaming response
        full_content = ""
        for part in client.chat(**chat_kwargs):
            full_content += part["message"]["content"]
        return {"content": full_content, "model": model_name}
    else:
        # Non-streaming
        response = client.chat(**chat_kwargs)
        return {
            "content": response["message"]["content"],
            "model": model_name,
        }

