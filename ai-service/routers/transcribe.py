"""
Transcription router - audio/video to text using Whisper.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.whisper import transcribe_audio

router = APIRouter()


class TranscribeRequest(BaseModel):
    """Request body for transcription."""
    audio_url: str
    language: str = "en"


class TranscribeResponse(BaseModel):
    """Response from transcription."""
    transcript: str
    confidence: float
    duration: float | None = None
    language: str | None = None


@router.post("/", response_model=TranscribeResponse)
async def transcribe(request: TranscribeRequest):
    """
    Transcribe audio/video to text using Whisper.
    
    Args:
        request: Contains audio_url and optional language
        
    Returns:
        Transcript text with confidence score
    """
    try:
        result = await transcribe_audio(request.audio_url, request.language)
        return TranscribeResponse(
            transcript=result["transcript"],
            confidence=result["confidence"],
            duration=result.get("duration"),
            language=result.get("language"),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")
