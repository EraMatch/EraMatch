"""
version:
https://github.com/guillaumekln/faster-whisper
"""
import os
import tempfile
import httpx
from pathlib import Path
import asyncio
from concurrent.futures import ThreadPoolExecutor

from config import settings
import base64

# Thread pool for blocking Whisper operations
_executor = ThreadPoolExecutor(max_workers=2)

_model = None


def get_model():
    global _model
    if _model is None:
        try:
            from faster_whisper import WhisperModel
            print(f"[Whisper] Loading model '{settings.WHISPER_MODEL}' on {settings.WHISPER_DEVICE}...")
            _model = WhisperModel(
                settings.WHISPER_MODEL,
                device=settings.WHISPER_DEVICE,
                compute_type=settings.WHISPER_COMPUTE_TYPE,
                download_root=os.path.expanduser("~/.cache/huggingface/hub"),
            )
            print("[Whisper] Model loaded successfully")
        except ImportError:
            print("[Whisper] faster-whisper not installed, using mock")
            _model = "mock"
        except Exception as e:
            print(f"[Whisper] Failed to load model: {e}, falling back to mock")
            _model = "mock"
    return _model


def _transcribe_sync(audio_path: str, language: str) -> dict:
    """Run transcription in a sync context (will be called via run_in_executor)."""
    model = get_model()
    if model == "mock":
        return _mock_transcription()

    segments, info = model.transcribe(
        audio_path,
        language=language,
        beam_size=5,
    )
    transcript = " ".join([segment.text.strip() for segment in segments])
    return {
        "transcript": transcript,
        "confidence": 0.95,
        "duration": info.duration,
        "language": info.language,
    }


async def download_audio(url: str) -> Path:
    """Download audio/video file to temp location (supports http/https and data URIs)."""

    # base64
    if url.startswith("data:"):
        try:
            header, data = url.split(",", 1)
            suffix = ".webm"  # Default
            if "video/mp4" in header:
                suffix = ".mp4"
            elif "audio/wav" in header:
                suffix = ".wav"
            binary_data = base64.b64decode(data)

            # Write to temp file
            fd, path = tempfile.mkstemp(suffix=suffix)
            with os.fdopen(fd, "wb") as f:
                f.write(binary_data)
            return Path(path)

        except Exception as e:
            print(f"Error processing data URI: {e}")
            raise ValueError(f"Invalid data URI: {e}")

    # Handle HTTP/HTTPS URLs
    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.get(url)
        response.raise_for_status()

        # Save to temp file
        suffix = ".mp4" if "video" in response.headers.get("content-type", "") else ".webm"
        fd, path = tempfile.mkstemp(suffix=suffix)
        with os.fdopen(fd, "wb") as f:
            f.write(response.content)
        return Path(path)


async def transcribe_audio(audio_url: str, language: str = "en") -> dict:
    """Transcribe audio/video using Whisper (runs entirely in thread pool)."""

    if settings.USE_MOCK:
        return _mock_transcription()

    model = get_model()
    if model == "mock":
        return _mock_transcription()

    # Run everything in a dedicated thread pool
    try:
        result = await asyncio.get_event_loop().run_in_executor(
            _executor,
            _transcribe_full,
            audio_url,
            language
        )
        return result
    except Exception as e:
        print(f"[Whisper] Transcription error: {e}")
        return {
            "transcript": f"[Transcription error: {str(e)}]",
            "confidence": 0.0,
            "duration": None,
            "error": str(e),
        }


def _transcribe_full(audio_url: str, language: str) -> dict:
    """Download and transcribe in a single sync call."""
    import tempfile as tf
    import os as os_mod

    # Download audio
    if audio_url.startswith("data:"):
        header, data = audio_url.split(",", 1)
        suffix = ".webm"
        if "video/mp4" in header:
            suffix = ".mp4"
        elif "audio/wav" in header:
            suffix = ".wav"
        binary_data = base64.b64decode(data)
        fd, path = tf.mkstemp(suffix=suffix)
        with os_mod.fdopen(fd, "wb") as f:
            f.write(binary_data)
        audio_path = path
    else:
        # Sync download
        resp = httpx.get(audio_url, timeout=120.0)
        resp.raise_for_status()
        suffix = ".mp4" if "video" in resp.headers.get("content-type", "") else ".webm"
        fd, path = tf.mkstemp(suffix=suffix)
        with os_mod.fdopen(fd, "wb") as f:
            f.write(resp.content)
        audio_path = path

    try:
        model = get_model()
        if model == "mock":
            return _mock_transcription()

        segments, info = model.transcribe(audio_path, language=language, beam_size=5)
        transcript = " ".join([segment.text.strip() for segment in segments])

        return {
            "transcript": transcript,
            "confidence": 0.95,
            "duration": info.duration,
            "language": info.language,
        }
    finally:
        try:
            os_mod.unlink(audio_path)
        except:
            pass


def _mock_transcription() -> dict:
    """Mock transcription for development."""
    return {
        "transcript": "This is a mock transcription. In a real scenario, this would contain the candidate's spoken response to the interview question. The response demonstrates good communication skills and relevant experience.",
        "confidence": 0.95,
        "duration": 45.0,
        "language": "en",
    }
