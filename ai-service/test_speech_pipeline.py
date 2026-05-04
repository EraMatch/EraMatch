# Standalone test: LiveKit LLM + TTS — same config as agent_server.py

import os
import asyncio
import sys

# Set env before imports (same as agent_server.py)
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

# Load .env
from pathlib import Path
from dotenv import load_dotenv

_env = Path(__file__).with_name(".env")
if _env.exists():
    load_dotenv(dotenv_path=_env, override=False)

from livekit.plugins.openai import LLM as OpenAI_LLM
from livekit.agents.inference.tts import TTS as Inference_TTS
from livekit.agents import llm as llm_mod


async def test_llm():
    """Test LLM generation with exact agent config."""
    ollama_base = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    model = os.getenv("INTERVIEWER_PRIMARY_MODEL", "gemma3:12b-cloud")
    api_key = os.getenv("OLLAMA_API_KEY", "") or "ollama"

    print(f"\n{'=' * 60}")
    print(f"TEST 1: LLM Generation")
    print(f"  model: {model}")
    print(f"  base_url: {ollama_base}")
    print(f"  api_key: {api_key[:10]}...")
    print(f"{'=' * 60}")

    llm = OpenAI_LLM(
        model=model,
        base_url=ollama_base + "/v1",
        api_key=api_key,
    )

    chat_ctx = llm_mod.ChatContext()
    chat_ctx.add_message(
        role="user",
        content="Say hello in one sentence.",
    )

    chunks = []
    try:
        print("  Calling llm.chat()...")
        async for chunk in llm.chat(chat_ctx=chat_ctx):
            if chunk.choices:
                text = chunk.choices[0].delta.content or ""
                if text:
                    chunks.append(text)
                    print(f"  Chunk: '{text}'")
        full = "".join(chunks)
        print(f"\n  ✅ LLM SUCCESS: '{full}'")
        return full
    except Exception as e:
        print(f"\n  ❌ LLM FAILED: {type(e).__name__}: {e}")
        import traceback

        traceback.print_exc()
        return None


async def test_tts():
    """Test TTS synthesis."""
    voice = os.getenv("DEEPGRAM_INFERENCE_VOICE", "athena")

    print(f"\n{'=' * 60}")
    print(f"TEST 2: TTS Synthesis")
    print(f"  model: deepgram/aura-2")
    print(f"  voice: {voice}")
    print(f"  language: en")
    print(f"{'=' * 60}")

    tts = Inference_TTS(
        model="deepgram/aura-2",
        voice=voice,
        language="en",
    )

    test_text = "Hello, this is a test of the text to speech system."

    try:
        print(f"  Calling tts.synthesize('{test_text}')...")
        frame_count = 0
        async for frame in tts.synthesize(text=test_text):
            frame_count += 1
            if frame_count == 1:
                print(f"  First audio frame received: {len(frame.data)} bytes")
        print(f"\n  ✅ TTS SUCCESS: {frame_count} frames received")
        return True
    except Exception as e:
        print(f"\n  ❌ TTS FAILED: {type(e).__name__}: {e}")
        import traceback

        traceback.print_exc()
        return False


async def main():
    print("=" * 60)
    print("LiveKit Speech Pipeline — Standalone Test")
    print("=" * 60)

    # Test LLM
    llm_text = await test_llm()

    # Test TTS (only if LLM works, but we test it anyway)
    tts_ok = await test_tts()

    # Test combined: LLM → TTS
    if llm_text and tts_ok:
        print(f"\n{'=' * 60}")
        print("TEST 3: Combined LLM → TTS")
        print(f"{'=' * 60}")
        tts = Inference_TTS(
            model="deepgram/aura-2",
            voice=os.getenv("DEEPGRAM_INFERENCE_VOICE", "athena"),
            language="en",
        )
        try:
            frame_count = 0
            async for frame in tts.synthesize(text=llm_text):
                frame_count += 1
                if frame_count == 1:
                    print(f"  First audio frame: {len(frame.data)} bytes")
            print(
                f"\n  ✅ COMBO SUCCESS: {frame_count} frames from '{llm_text[:50]}...'"
            )
        except Exception as e:
            print(f"\n  ❌ COMBO FAILED: {type(e).__name__}: {e}")

    print(f"\n{'=' * 60}")
    print("Summary:")
    print(f"  LLM: {'✅ PASS' if llm_text else '❌ FAIL'}")
    print(f"  TTS: {'✅ PASS' if tts_ok else '❌ FAIL'}")
    print(f"  COMBO: {'✅ PASS' if (llm_text and tts_ok) else '❌ FAIL'}")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    asyncio.run(main())
