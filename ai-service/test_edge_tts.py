"""
Test script: edge-tts standalone + with LLM-generated text.
Usage: cd EraMatch/ai-service && ./.venv/bin/python test_edge_tts.py
"""

import asyncio
import edge_tts
import os
from pathlib import Path

VOICE = "en-US-AriaNeural"  # Female US voice
OUTPUT_DIR = Path(__file__).parent / ".test_audio"
OUTPUT_DIR.mkdir(exist_ok=True)


async def test_basic():
    """Test basic edge-tts synthesis."""
    text = "Hello, this is a test of the text to speech system from Microsoft Edge."
    output_file = OUTPUT_DIR / "test_basic.mp3"

    print(f"\n{'=' * 50}")
    print("TEST 1: Basic edge-tts synthesis")
    print(f"  Voice: {VOICE}")
    print(f"  Text: {text}")
    print(f"  Output: {output_file}")
    print(f"{'=' * 50}")

    communicate = edge_tts.Communicate(text, VOICE)
    await communicate.save(output_file)

    size = output_file.stat().st_size
    print(f"\n  File created: {size} bytes ({size / 1024:.1f} KB)")
    return size > 0


async def test_agent_dialogue():
    """Test with realistic agent interview dialogue lines."""
    lines = [
        "Hello Maya! Welcome to your Live Interview for the Senior React Developer position.",
        "I'm your AI interviewer today. We'll cover Technical Depth, Problem Solving, and Communication.",
        "Let's start with Technical Depth. Can you explain how React's reconciliation algorithm works?",
    ]

    print(f"\n{'=' * 50}")
    print("TEST 2: Agent dialogue synthesis")
    print(f"  Lines: {len(lines)}")
    print(f"{'=' * 50}")

    total_size = 0
    for i, line in enumerate(lines):
        output_file = OUTPUT_DIR / f"test_dialogue_{i + 1}.mp3"
        communicate = edge_tts.Communicate(line, VOICE)
        await communicate.save(output_file)
        size = output_file.stat().st_size
        total_size += size
        print(f"  Line {i + 1}: {size / 1024:.1f} KB - {line[:50]}...")

    print(f"\n  Total: {total_size} bytes ({total_size / 1024:.1f} KB)")
    return total_size > 0


async def test_voice_list():
    """Show available voices."""
    print(f"\n{'=' * 50}")
    print("TEST 3: Available voices (top 10 English)")
    print(f"{'=' * 50}")

    voices = await edge_tts.list_voices()
    en_voices = [v for v in voices if v["ShortName"].startswith("en-")]

    for v in en_voices[:10]:
        print(f"  {v['ShortName']:<25} | {v['Gender']:<8} | {v['FriendlyName']}")
    print(f"  ... {len(en_voices)} total English voices")
    return len(en_voices) > 0


async def test_streaming():
    """Test streaming audio chunks (simulates real-time TTS)."""
    text = "This is a streaming test for the AI agent interview system."
    print(f"\n{'=' * 50}")
    print("TEST 4: Streaming audio chunks")
    print(f"  Text: {text}")
    print(f"{'=' * 50}")

    communicate = edge_tts.Communicate(text, VOICE)
    chunk_count = 0
    total_bytes = 0

    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            chunk_count += 1
            total_bytes += len(chunk["data"])

    print(f"\n  Audio chunks: {chunk_count}")
    print(f"  Total bytes: {total_bytes} ({total_bytes / 1024:.1f} KB)")
    return chunk_count > 0


async def main():
    print("=" * 50)
    print("Edge-TTS Test Suite")
    print("=" * 50)
    print(f"Library version: {edge_tts.__version__}")
    print(f"Output dir: {OUTPUT_DIR}")

    try:
        results = {
            "Basic synthesis": await test_basic(),
            "Agent dialogue": await test_agent_dialogue(),
            "Voice list": await test_voice_list(),
            "Streaming": await test_streaming(),
        }

        print(f"\n{'=' * 50}")
        print("Results:")
        for name, passed in results.items():
            print(f"  {'PASS' if passed else 'FAIL'} - {name}")

        all_passed = all(results.values())
        print(f"\nOverall: {'ALL TESTS PASSED' if all_passed else 'SOME TESTS FAILED'}")

    except Exception as e:
        print(f"\nERROR: {type(e).__name__}: {e}")
        import traceback

        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())
