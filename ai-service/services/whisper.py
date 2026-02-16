"""
version:
https://github.com/guillaumekln/faster-whisper
"""
import os
import tempfile
import httpx
from pathlib import Path

from config import settings
import base64

# lazy load, remember 
_model = None


def get_model():
    global _model
    if _model is None:
        try:
            from faster_whisper import WhisperModel
            _model = WhisperModel(
                settings.WHISPER_MODEL,
                device=settings.WHISPER_DEVICE,
                compute_type=settings.WHISPER_COMPUTE_TYPE,
            )
        except ImportError:
            print("cant load whisper")
            _model = "mock"
    return _model


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

 #   tanscribe 

    if settings.USE_MOCK:
        return _mock_transcription()
    
    model = get_model()
    
    if model == "mock":
        return _mock_transcription()
    
    try:
        audio_path = await download_audio(audio_url)
        # Transcribe
        segments, info = model.transcribe(
            str(audio_path),
            language=language,
            beam_size=5,
        )
        # Combine segments
        transcript = " ".join([segment.text.strip() for segment in segments])
        
        # Cleanup temp file
        audio_path.unlink(missing_ok=True)
        
        return {
            "transcript": transcript,
            "confidence": 0.95,  # faster-whisper doesn't provide per-segment confidence easily
            "duration": info.duration,
            "language": info.language,
        }
        
    except Exception as e:
        return {
            "transcript": f"[Transcription error: {str(e)}]",
            "confidence": 0.0,
            "duration": None,
            "error": str(e),
        }


def _mock_transcription() -> dict:
    """Mock transcription for development."""
    return {
        "transcript": "This is a mock transcription. In a real scenario, this would contain the candidate's spoken response to the interview question. The response demonstrates good communication skills and relevant experience.",
        "confidence": 0.95,
        "duration": 45.0,
        "language": "en",
    }
