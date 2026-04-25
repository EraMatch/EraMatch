import os
from dotenv import load_dotenv
from pathlib import Path

_env = Path(__file__).with_name(".env")
if _env.exists():
    load_dotenv(dotenv_path=_env, override=False)

import asyncio
from openai import AsyncOpenAI


async def test():
    client = AsyncOpenAI(
        base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434") + "/v1",
        api_key=os.getenv("OLLAMA_API_KEY") or "ollama",
    )
    model = os.getenv("INTERVIEWER_PRIMARY_MODEL", "gemma3:12b-cloud")

    print(f"Model: {model}")
    print("Testing completion...")

    resp = await client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": "Say hello in one sentence."}],
        stream=True,
    )

    chunks = []
    async for chunk in resp:
        content = chunk.choices[0].delta.content or ""
        if content:
            chunks.append(content)
            print(content, end="", flush=True)

    full = "".join(chunks)
    print(f"\nResult: '{full}'")


asyncio.run(test())
