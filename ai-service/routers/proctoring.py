"""Production proctoring endpoints for anti-cheating signal adapters.

These endpoints expose stable contracts while model integrations are still
being productionized.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from config import settings

from services.proctoring import (
    REGISTRY,
    evaluate_face_signal,
    evaluate_voice_signal,
    evaluate_gaze_signal,
    evaluate_emotion_signal,
    inference_readiness,
)

router = APIRouter()


class ProctoringSignalResponse(BaseModel):
    signal_type: str
    event_type: str
    severity: str
    risk_score: float = Field(..., ge=0.0, le=1.0)
    confidence: float = Field(..., ge=0.0, le=1.0)
    adapter_mode: str = "production"
    recommendation: str
    metadata: dict = Field(default_factory=dict)


def _enforce_model_and_proof(signal_type: str, result: dict, request_used_raw: bool) -> dict:
    adapter_mode = result.get("adapter_mode", "weighted_rules_fallback")
    resolved_inputs = result.get("resolved_inputs", {}) or {}
    model_wiring = result.get("model_wiring", {}) or {}

    proof = {
        "signal_type": signal_type,
        "model_required": bool(settings.PROCTORING_REQUIRE_MODEL),
        "request_used_raw_payload": request_used_raw,
        "adapter_mode": adapter_mode,
        "model_backed": adapter_mode == "weighted_local_v1",
        "resolved_inputs": resolved_inputs,
        "model_wiring": model_wiring,
    }

    if settings.PROCTORING_REQUIRE_MODEL and request_used_raw and adapter_mode != "weighted_local_v1":
        raise HTTPException(
            status_code=422,
            detail={
                "message": "Model-required mode rejected fallback inference.",
                "proof": proof,
            },
        )
    return proof


class FaceSignalRequest(BaseModel):
    session_id: str
    faces_detected: int = 1
    multiple_faces: bool = False
    face_match_score: float | None = Field(default=None, ge=0.0, le=1.0)
    liveness_score: float | None = Field(default=None, ge=0.0, le=1.0)
    face_model_score: float | None = Field(default=None, ge=0.0, le=1.0)
    frame_b64: str | None = None


class VoiceSignalRequest(BaseModel):
    session_id: str
    speaker_match_score: float | None = Field(default=None, ge=0.0, le=1.0)
    voice_switch_detected: bool = False
    silence_ratio: float = Field(default=0.0, ge=0.0, le=1.0)
    background_speaker_count: int = Field(default=0, ge=0)
    voice_embedding: list[float] | None = None
    speaker_profile_id: str | None = None
    audio_waveform: list[float] | None = None
    audio_sample_rate: int | None = Field(default=None, ge=8000, le=96000)


class GazeSignalRequest(BaseModel):
    session_id: str
    off_screen_ratio: float = Field(default=0.0, ge=0.0, le=1.0)
    away_duration_seconds: float = Field(default=0.0, ge=0.0)
    rapid_shift_count: int = Field(default=0, ge=0)
    gaze_model_score: float | None = Field(default=None, ge=0.0, le=1.0)
    frame_b64: str | None = None


class EmotionSignalRequest(BaseModel):
    session_id: str
    dominant_emotion: str | None = None
    stress_score: float = Field(default=0.0, ge=0.0, le=1.0)
    negative_ratio: float = Field(default=0.0, ge=0.0, le=1.0)
    emotion_model_score: float | None = Field(default=None, ge=0.0, le=1.0)
    frame_b64: str | None = None


@router.get("/wiring-status")
async def proctoring_wiring_status():
    return {
        "adapter_mode": "weighted_local_v1",
        "wiring": REGISTRY.wired_status(),
    }


@router.get("/inference-readiness")
async def proctoring_inference_readiness():
    return inference_readiness()


@router.post("/face", response_model=ProctoringSignalResponse)
async def face_signal(request: FaceSignalRequest):
    result = evaluate_face_signal(
        faces_detected=request.faces_detected,
        multiple_faces=request.multiple_faces,
        face_match_score=request.face_match_score,
        liveness_score=request.liveness_score,
        face_model_score=request.face_model_score,
        frame_b64=request.frame_b64,
    )
    proof = _enforce_model_and_proof("face", result, request.frame_b64 is not None)
    return ProctoringSignalResponse(
        signal_type="face",
        event_type=result["event_type"],
        severity=result["severity"],
        risk_score=result["risk_score"],
        confidence=result["confidence"],
        adapter_mode=result.get("adapter_mode", "weighted_rules_fallback"),
        recommendation="Escalate to recruiter review if event repeats within short window.",
        metadata={
            "session_id": request.session_id,
            "faces_detected": request.faces_detected,
            "multiple_faces": request.multiple_faces,
            "face_match_score": request.face_match_score,
            "liveness_score": request.liveness_score,
            "face_model_score": request.face_model_score,
            "used_raw_frame": request.frame_b64 is not None,
            "model_wiring": result.get("model_wiring", {}),
            "resolved_inputs": result.get("resolved_inputs", {}),
            "proof": proof,
        },
    )


@router.post("/voice", response_model=ProctoringSignalResponse)
async def voice_signal(request: VoiceSignalRequest):
    result = evaluate_voice_signal(
        speaker_match_score=request.speaker_match_score,
        voice_switch_detected=request.voice_switch_detected,
        silence_ratio=request.silence_ratio,
        background_speaker_count=request.background_speaker_count,
        voice_embedding=request.voice_embedding,
        speaker_profile_id=request.speaker_profile_id,
        audio_waveform=request.audio_waveform,
        audio_sample_rate=request.audio_sample_rate,
    )
    proof = _enforce_model_and_proof("voice", result, request.audio_waveform is not None or request.voice_embedding is not None)
    return ProctoringSignalResponse(
        signal_type="voice",
        event_type=result["event_type"],
        severity=result["severity"],
        risk_score=result["risk_score"],
        confidence=result["confidence"],
        adapter_mode=result.get("adapter_mode", "weighted_rules_fallback"),
        recommendation="Combine with face and browser signals before auto-high-risk judgment.",
        metadata={
            "session_id": request.session_id,
            "speaker_match_score": request.speaker_match_score,
            "voice_switch_detected": request.voice_switch_detected,
            "silence_ratio": request.silence_ratio,
            "background_speaker_count": request.background_speaker_count,
            "speaker_profile_id": request.speaker_profile_id,
            "used_voice_embedding": request.voice_embedding is not None,
            "used_raw_audio": request.audio_waveform is not None,
            "audio_sample_rate": request.audio_sample_rate,
            "model_wiring": result.get("model_wiring", {}),
            "resolved_inputs": result.get("resolved_inputs", {}),
            "proof": proof,
        },
    )


@router.post("/gaze", response_model=ProctoringSignalResponse)
async def gaze_signal(request: GazeSignalRequest):
    result = evaluate_gaze_signal(
        off_screen_ratio=request.off_screen_ratio,
        away_duration_seconds=request.away_duration_seconds,
        rapid_shift_count=request.rapid_shift_count,
        gaze_model_score=request.gaze_model_score,
        frame_b64=request.frame_b64,
    )
    proof = _enforce_model_and_proof("gaze", result, request.frame_b64 is not None)
    return ProctoringSignalResponse(
        signal_type="gaze",
        event_type=result["event_type"],
        severity=result["severity"],
        risk_score=result["risk_score"],
        confidence=result["confidence"],
        adapter_mode=result.get("adapter_mode", "weighted_rules_fallback"),
        recommendation="Treat sustained off-screen behavior as suspicious only with repeated evidence.",
        metadata={
            "session_id": request.session_id,
            "off_screen_ratio": request.off_screen_ratio,
            "away_duration_seconds": request.away_duration_seconds,
            "rapid_shift_count": request.rapid_shift_count,
            "gaze_model_score": request.gaze_model_score,
            "used_raw_frame": request.frame_b64 is not None,
            "model_wiring": result.get("model_wiring", {}),
            "resolved_inputs": result.get("resolved_inputs", {}),
            "proof": proof,
        },
    )


@router.post("/emotion", response_model=ProctoringSignalResponse)
async def emotion_signal(request: EmotionSignalRequest):
    result = evaluate_emotion_signal(
        stress_score=request.stress_score,
        negative_ratio=request.negative_ratio,
        dominant_emotion=request.dominant_emotion,
        emotion_model_score=request.emotion_model_score,
        frame_b64=request.frame_b64,
    )
    proof = _enforce_model_and_proof("emotion", result, request.frame_b64 is not None)
    return ProctoringSignalResponse(
        signal_type="emotion",
        event_type=result["event_type"],
        severity=result["severity"],
        risk_score=result["risk_score"],
        confidence=result["confidence"],
        adapter_mode=result.get("adapter_mode", "weighted_rules_fallback"),
        recommendation="Use emotion only as a secondary signal due false-positive sensitivity.",
        metadata={
            "session_id": request.session_id,
            "dominant_emotion": request.dominant_emotion,
            "stress_score": request.stress_score,
            "negative_ratio": request.negative_ratio,
            "emotion_model_score": request.emotion_model_score,
            "used_raw_frame": request.frame_b64 is not None,
            "model_wiring": result.get("model_wiring", {}),
            "resolved_inputs": result.get("resolved_inputs", {}),
            "proof": proof,
        },
    )
