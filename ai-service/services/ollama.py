import os
from ollama import Client
from config import settings


def get_client() -> Client:
    """Get configured Ollama Cloud client."""
    return Client(
        host=settings.OLLAMA_HOST,
        headers={"Authorization": f"Bearer {settings.OLLAMA_API_KEY}"},
    )


async def chat_completion(
    messages: list[dict],
    model: str | None = None,
    stream: bool = False,
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
    
    if stream:
        # Streaming response
        full_content = ""
        for part in client.chat(model_name, messages=messages, stream=True):
            full_content += part["message"]["content"]
        return {"content": full_content, "model": model_name}
    else:
        # Non-streaming
        response = client.chat(model_name, messages=messages, stream=False)
        return {
            "content": response["message"]["content"],
            "model": model_name,
        }
