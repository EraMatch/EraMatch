"""
Transcription router - converts video/audio to text.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.whisper import transcribe_audio

router = APIRouter()


class TranscribeRequest(BaseModel):
    """Request body for transcription."""
    video_url: str
    language: str = "en"


class TranscribeResponse(BaseModel):
    """Response from transcription."""
    transcript: str
    confidence: float
    duration_seconds: float | None = None


@router.post("/", response_model=TranscribeResponse)
async def transcribe_video(request: TranscribeRequest):
    try:
        result = await transcribe_audio(request.video_url, request.language)
        return TranscribeResponse(
            transcript=result["transcript"],
            confidence=result["confidence"],
            duration_seconds=result.get("duration"),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")
